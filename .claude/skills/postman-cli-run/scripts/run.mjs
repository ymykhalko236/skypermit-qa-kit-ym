#!/usr/bin/env node
// Runs one Postman collection with Postman CLI, redacts the report and returns
// per-case results in the testomat-sync `report` input format.
//
// Usage:
//   node .claude/skills/postman-cli-run/scripts/run.mjs --record <collection record JSON>
//        [--run-id <testomat run id>] [--test-map CASE-ID=testId,CASE-ID=testId]
//        [--out-root api-automation/runs]
//
// Secret values never reach stdout, the log or the report: they are read from
// OS environment variables (or generated) inside this process, passed to the
// CLI as --env-var, and replaced with *** in everything written to disk.
//
// Exit codes: 0 run finished (tests may have failed), 2 bad input or missing
// secret, 3 the CLI produced no report, 4 a secret survived redaction.

import { spawnSync, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MASK = '***';
const SENSITIVE_KEY = /pass(word)?|token|secret|api[-_]?key|authori[sz]ation|cookie|session|credential/i;
const SENSITIVE_HEADER = /^(cookie|set-cookie|authorization|proxy-authorization|x-api-key)$/i;

function fail(code, obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  process.exit(code);
}

function parseArgs(argv) {
  const args = { outRoot: 'api-automation/runs', testMap: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(2, { error: 'bad_arguments', message: `${a} needs a value` });
      return v;
    };
    if (a === '--record') args.record = next();
    else if (a === '--run-id') args.runId = next();
    else if (a === '--out-root') args.outRoot = next();
    else if (a === '--test-map') {
      for (const pair of next().split(',').filter(Boolean)) {
        const [caseId, testId] = pair.split('=').map((s) => s && s.trim());
        if (!caseId || !testId) fail(2, { error: 'bad_arguments', message: `bad --test-map entry "${pair}"` });
        args.testMap[caseId] = testId;
      }
    } else fail(2, { error: 'bad_arguments', message: `unknown argument ${a}` });
  }
  if (!args.record) fail(2, { error: 'bad_arguments', message: '--record is required' });
  return args;
}

function readRecord(file) {
  let rec;
  try {
    rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(2, { error: 'bad_record', message: `cannot read ${file}: ${e.message}` });
  }
  const missing = ['task_key', 'collection_uid', 'environment_uid', 'cases'].filter((k) => !rec[k]);
  if (missing.length) fail(2, { error: 'bad_record', message: `record is missing ${missing.join(', ')}` });
  if (!Array.isArray(rec.cases) || rec.cases.length === 0) fail(2, { error: 'bad_record', message: 'record has no cases' });
  return rec;
}

function resolveSecrets(rec) {
  const values = [];
  const envVars = [];
  const missing = [];
  for (const s of rec.secrets || []) {
    let value;
    if (s.source === 'generate') {
      value = randomBytes(12).toString('base64url'); // 16 chars, letters, digits, - and _
    } else if (s.source === 'env') {
      value = process.env[s.env];
      if (!value) {
        missing.push({ variable: s.variable, env: s.env });
        continue;
      }
    } else {
      fail(2, { error: 'bad_record', message: `secret ${s.variable} has unknown source "${s.source}"` });
    }
    values.push(value);
    envVars.push(`${s.variable}=${value}`);
  }
  if (missing.length) {
    fail(2, {
      error: 'missing_secret',
      message: 'Set these OS environment variables in the shell that starts Claude Code, then launch again. Values are never read from the chat.',
      missing,
    });
  }
  return { values: values.filter((v) => v.length >= 4), envVars };
}

function findPostmanCli() {
  try {
    const cmd = process.platform === 'win32' ? 'where postman' : 'command -v postman';
    const first = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).find(Boolean);
    if (first) {
      const dir = path.dirname(first);
      const js = path.join(dir, 'node_modules', 'postman-cli', 'bin', 'postman.js');
      if (fs.existsSync(js)) return { bin: process.execPath, pre: [js] };
      const real = fs.realpathSync(first);
      if (real.endsWith('.js')) return { bin: process.execPath, pre: [real] };
      if (process.platform !== 'win32') return { bin: real, pre: [] };
    }
  } catch {
    /* fall through */
  }
  fail(2, { error: 'postman_cli_not_found', message: 'Postman CLI is not installed or not on PATH.' });
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function makeRunFolder(outRoot, key) {
  let dir = path.join(outRoot, `${key}-${stamp()}`);
  if (fs.existsSync(dir)) dir += `-${String(new Date().getSeconds()).padStart(2, '0')}`;
  let n = 2;
  const base = dir;
  while (fs.existsSync(dir)) dir = `${base}-${n++}`;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------- redaction ----------

function maskValues(text, values) {
  let out = text;
  for (const v of values) out = out.split(v).join(MASK);
  return out;
}

function redactString(str, values) {
  let s = maskValues(str, values);
  const t = s.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.stringify(redact(JSON.parse(t), values));
    } catch {
      /* not JSON */
    }
  }
  return s;
}

function redact(node, values) {
  if (typeof node === 'string') return redactString(node, values);
  if (Array.isArray(node)) return node.map((n) => redact(n, values));
  if (!node || typeof node !== 'object') return node;

  // Buffer-like response stream: decode so the log is readable, then redact.
  if (node.type === 'Buffer' && Array.isArray(node.data)) {
    return { type: 'text', text: redactString(Buffer.from(node.data).toString('utf8'), values) };
  }
  // Header entry {key, value}
  if (typeof node.key === 'string' && 'value' in node && SENSITIVE_HEADER.test(node.key)) {
    return { ...node, value: MASK };
  }
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'cookies' && Array.isArray(v)) {
      out[k] = v.map((c) => (c && typeof c === 'object' ? { ...c, value: MASK } : MASK));
    } else if (SENSITIVE_KEY.test(k) && (typeof v === 'string' || typeof v === 'number')) {
      out[k] = MASK;
    } else {
      out[k] = redact(v, values);
    }
  }
  return out;
}

// ---------- summary ----------

function execName(e) {
  return e?.requestExecuted?.name ?? e?.item?.name ?? '';
}

function belongsTo(name, caseId) {
  if (name === caseId) return true;
  if (!name.startsWith(caseId)) return false;
  return /[^A-Za-z0-9-]/.test(name.charAt(caseId.length));
}

function summarise(report, rec, args, values) {
  const execs = report?.run?.executions || [];
  const notes = [];
  const clip = (s) => maskValues(String(s), values).slice(0, 500);

  const describe = (e) => {
    const tests = e.tests || [];
    const failedTests = tests.filter((t) => t.status === 'failed');
    const errors = (e.errors || []).filter(Boolean);
    return {
      name: execName(e),
      code: e.response?.code ?? null,
      time: e.response?.responseTime ?? 0,
      passed: tests.filter((t) => t.status === 'passed').length,
      failed: failedTests.length,
      noTests: tests.length === 0,
      firstFailure: failedTests[0]
        ? `${failedTests[0].name}: ${failedTests[0].error?.message ?? 'failed'}`
        : errors[0]
          ? `request error: ${errors[0].message ?? JSON.stringify(errors[0])}`
          : null,
      hasError: errors.length > 0,
    };
  };

  const all = execs.map(describe);
  const setup = all.filter((x) => /^SETUP\b/.test(x.name));
  const brokenSetup = setup.find((x) => x.failed > 0 || x.hasError);

  const caseIds = rec.cases.map((c) => c.case_id);
  const unmatched = all.filter((x) => !/^SETUP\b/.test(x.name) && !caseIds.some((id) => belongsTo(x.name, id)));
  if (unmatched.length) notes.push(`Requests not named after a case or SETUP: ${unmatched.map((x) => x.name).join('; ')}`);

  const cases = rec.cases.map((c) => {
    const ran = all.filter((x) => belongsTo(x.name, c.case_id));
    const expected = c.requests || [];
    const notRun = expected.filter((n) => !ran.some((x) => x.name === n));
    let message = null;
    for (const x of ran) {
      if (x.failed > 0 || x.hasError) {
        message = `${x.name}: ${x.firstFailure} (HTTP ${x.code ?? 'none'})`;
        break;
      }
      if (x.noTests) {
        message = `${x.name}: no assertions ran (HTTP ${x.code ?? 'none'})`;
        break;
      }
    }
    if (!message && ran.length === 0) message = 'no request for this case was executed';
    if (!message && notRun.length) message = `not executed: ${notRun.join('; ')}`;
    if (message && brokenSetup) {
      message = `setup failed: ${brokenSetup.name} (HTTP ${brokenSetup.code ?? 'none'}); then ${message}`;
    }
    const status = message ? 'failed' : 'passed';
    return {
      case_id: c.case_id,
      status,
      message: message ? clip(message) : null,
      run_time_ms: ran.reduce((s, x) => s + (x.time || 0), 0),
      requests: ran.map((x) => ({ name: x.name, http_status: x.code, assertions_passed: x.passed, assertions_failed: x.failed })),
    };
  });

  const caseMap = Object.fromEntries(caseIds.map((id) => [id, args.testMap[id] ?? null]));
  const unmapped = caseIds.filter((id) => !caseMap[id]);
  if (unmapped.length) notes.push(`No Testomat test_id for: ${unmapped.join(', ')}. Fill test_id before passing testomat_report to testomat-sync.`);
  if (!args.runId) notes.push('No Testomat run_id given: run_id is null in testomat_report.');
  if (report?.run?.runError) notes.push(`CLI run error: ${clip(JSON.stringify(report.run.runError))}`);

  const t = report?.run?.summary?.tests || {};
  return {
    cases,
    caseMap,
    notes,
    totals: {
      cases_passed: cases.filter((c) => c.status === 'passed').length,
      cases_failed: cases.filter((c) => c.status === 'failed').length,
      requests_executed: all.length,
      assertions_executed: t.executed ?? null,
      assertions_failed: t.failed ?? null,
    },
  };
}

// ---------- main ----------

export { redact, summarise, belongsTo };

function main() {
const args = parseArgs(process.argv.slice(2));
const rec = readRecord(args.record);
const { values, envVars } = resolveSecrets(rec);
const cli = findPostmanCli();
const runDir = makeRunFolder(args.outRoot, rec.task_key);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postman-cli-run-'));
const rawReport = path.join(tmpDir, 'report.json');

const cliArgs = [
  ...cli.pre,
  'collection', 'run', rec.collection_uid,
  '-e', rec.environment_uid,
  ...envVars.flatMap((v) => ['--env-var', v]),
  '--reporters', 'cli,json',
  '--reporter-json-export', rawReport,
];

const started = new Date().toISOString();
const res = spawnSync(cli.bin, cliArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
const finished = new Date().toISOString();
const cliOut = maskValues(`${res.stdout || ''}${res.stderr ? `\n--- stderr ---\n${res.stderr}` : ''}`, values);
fs.writeFileSync(path.join(runDir, 'cli.log'), cliOut, 'utf8');

let report = null;
if (fs.existsSync(rawReport)) {
  try {
    report = redact(JSON.parse(fs.readFileSync(rawReport, 'utf8')), values);
  } catch (e) {
    report = null;
  }
}
fs.rmSync(tmpDir, { recursive: true, force: true });

if (!report) {
  fail(3, {
    error: 'no_report',
    message: 'Postman CLI did not produce a JSON report. See cli.log.',
    cli_exit_code: res.status,
    run_folder: runDir.replace(/\\/g, '/'),
    cli_log_tail: cliOut.split(/\r?\n/).slice(-15).join('\n'),
  });
}
fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

const sum = summarise(report, rec, args, values);
const postmanUrl = (cliOut.match(/View on Postman:\s*(\S+)/) || [])[1] ?? null;

const result = {
  task_key: rec.task_key,
  collection: { uid: rec.collection_uid, name: rec.collection_name ?? null },
  environment: { uid: rec.environment_uid, name: rec.environment_name ?? null },
  started_at: started,
  finished_at: finished,
  cli_exit_code: res.status,
  run_folder: runDir.replace(/\\/g, '/'),
  postman_run_url: postmanUrl,
  totals: sum.totals,
  cases: sum.cases,
  case_map: sum.caseMap,
  testomat_report: {
    run_id: args.runId ?? null,
    results: sum.cases.map((c) => ({
      case_id: c.case_id,
      test_id: sum.caseMap[c.case_id],
      status: c.status,
      ...(c.message ? { message: c.message } : {}),
      run_time_ms: c.run_time_ms,
    })),
  },
  notes: sum.notes,
};
fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(result, null, 2), 'utf8');

// Final guard: no secret value may remain in anything written.
const leaked = ['cli.log', 'report.json', 'results.json'].filter((f) => {
  const text = fs.readFileSync(path.join(runDir, f), 'utf8');
  return values.some((v) => text.includes(v));
});
if (leaked.length) {
  for (const f of leaked) fs.rmSync(path.join(runDir, f), { force: true });
  fail(4, { error: 'secret_in_output', message: `A secret value survived redaction in ${leaked.join(', ')}; those files were deleted.`, run_folder: result.run_folder });
}

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
