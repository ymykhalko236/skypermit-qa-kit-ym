#!/usr/bin/env node
// List SkyPermit business rules that no test case covers yet.
// Rules come from 06-business-rules.md §6 (the rule_reference table) plus §5 (cancellation
// deadline), with the corrections from 07-clarifications.md applied on top. A test case covers a
// rule when its header table has a "Business Rule" row naming the rule's ID.
// No npm dependencies.
//
// Usage: node find_gaps.mjs [--max N] [--gate PILOT|AIRCRAFT|ZONE|TIME_WINDOW]
//                           [--docs <path to SkyPermit docs/>] [--test-cases <path to test-cases/>]
// Prints JSON to stdout. Exits 1 on bad arguments or unreadable sources.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const GATES = ["PILOT", "AIRCRAFT", "ZONE", "TIME_WINDOW"];

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const maxArg = opt("--max");
const max = maxArg === undefined ? Infinity : Number(maxArg);
if (!(max === Infinity || (Number.isInteger(max) && max > 0))) fail(`--max must be a positive integer, got "${maxArg}"`);
const gate = opt("--gate")?.toUpperCase();
if (gate && !GATES.includes(gate)) fail(`--gate must be one of ${GATES.join(", ")}, got "${gate}"`);
const docsDir = resolve(opt("--docs") ?? join(repoRoot, "../ct-gen-ai-skypermit/docs"));
const testCasesDir = resolve(opt("--test-cases") ?? join(repoRoot, "test-cases"));

const rulesFile = join(docsDir, "06-business-rules.md");
if (!existsSync(rulesFile)) fail(`Cannot find ${rulesFile}`);
const rulesMd = readFileSync(rulesFile, "utf8");

// Stable IDs for the §6 rows, keyed by gate and a pattern on the condition text.
// A row that matches nothing still gets listed, with an auto ID and "unmapped": true,
// so a new rule in the docs is never silently dropped.
const ID_MAP = [
  { gate: "PILOT", re: /rating/i, id: "BR-PILOT-RATING" },
  { gate: "PILOT", re: /certification|current/i, id: "BR-PILOT-CURRENCY" },
  { gate: "AIRCRAFT", re: /weight band/i, id: "BR-AIRCRAFT-WEIGHT-BAND" },
  { gate: "ZONE", re: /altitude/i, id: "BR-ZONE-ALTITUDE" },
  { gate: "ZONE", re: /authorisation/i, id: "BR-ZONE-AUTH-LEVEL" },
  { gate: "ZONE", re: /inactive/i, id: "BR-ZONE-ACTIVE" },
  { gate: "TIME_WINDOW", re: /lead time/i, id: "BR-TIME-LEAD-TIME" },
  { gate: "TIME_WINDOW", re: /advance/i, id: "BR-TIME-MAX-ADVANCE" },
  { gate: "TIME_WINDOW", re: /duration/i, id: "BR-TIME-DURATION" },
  { gate: "TIME_WINDOW", re: /curfew.*other/i, id: "BR-TIME-CURFEW-BASE" },
  { gate: "TIME_WINDOW", re: /curfew/i, id: "BR-TIME-CURFEW-A7" },
  { gate: "TIME_WINDOW", re: /overlap/i, id: "BR-TIME-OVERLAP" },
  { gate: null, re: /mtom|30,000/i, id: "BR-REG-MTOM-CEILING" },
];

// Corrections and caveats from 07-clarifications.md and 05-open-questions.md. 07 wins over 06.
const OVERRIDES = {
  "BR-AIRCRAFT-WEIGHT-BAND": {
    gate: "AIRCRAFT",
    note: "07-clarifications.md §1: belongs to AIRCRAFT although ZC-2026.1 §2 says 'zone gate'. rule_reference is shared with BR-ZONE-ALTITUDE; failing_gate disambiguates.",
  },
  "BR-ZONE-ALTITUDE": { note: "rule_reference ZC-2026.1 §2 is shared with BR-AIRCRAFT-WEIGHT-BAND; failing_gate disambiguates." },
  "BR-ZONE-ACTIVE": {
    open_question: "05-open-questions.md row 5 / 07-clarifications.md §4: rule_reference citation not confirmed. Mark the rule_reference expected result TBC; don't invent one.",
  },
};

const DEFAULT_AREA = { PILOT: "checks", AIRCRAFT: "checks", ZONE: "checks", TIME_WINDOW: "checks" };

const strip = (s) => s.replace(/`/g, "").replace(/\*\([^)]*\)\*/g, "").replace(/\*/g, "").trim();

function section(md, headingRe) {
  const start = md.search(headingRe);
  if (start === -1) return null;
  const rest = md.slice(start);
  const next = rest.slice(1).search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function parseRuleTable() {
  const sec = section(rulesMd, /^## 6\. /m);
  if (!sec) fail("06-business-rules.md has no '## 6.' section (rule_reference values)");
  const rows = sec
    .split("\n")
    .filter((l) => l.startsWith("|"))
    .slice(2) // header + separator
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  if (rows.length === 0) fail("06-business-rules.md §6 table has no rows");
  return rows.map(([g, condition, ref]) => {
    const gateName = GATES.find((x) => strip(g) === x) ?? null;
    const cond = strip(condition);
    const hit = ID_MAP.find((m) => m.gate === gateName && m.re.test(cond));
    const id = hit?.id ?? `BR-${gateName ?? "OTHER"}-${cond.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    return {
      id,
      gate: gateName,
      condition: cond,
      rule_reference: strip(ref),
      source: `06-business-rules.md §6${gateName ? "" : " (registration, not a gate)"}`,
      area: gateName ? DEFAULT_AREA[gateName] : "registry",
      ...(hit ? {} : { unmapped: true }),
    };
  });
}

function cancellationRule() {
  const sec = section(rulesMd, /^## 5\. /m);
  if (!sec) return [];
  const ref = sec.match(/Source:\s*`([^`]+)`\s*(§\d+(?:\.\d+)*)/);
  return [
    {
      id: "BR-CANCEL-DEADLINE",
      gate: null,
      condition: "APPROVED request can be cancelled only up to 2 hours before window_start",
      rule_reference: ref ? `${ref[1]} ${ref[2]}` : "TSD-4 §6",
      source: "06-business-rules.md §5 (not a gate)",
      area: "flight-requests",
    },
  ];
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : name.endsWith(".md") ? [p] : [];
  });
}

function coverage() {
  const map = new Map();
  for (const file of walk(testCasesDir)) {
    const md = readFileSync(file, "utf8");
    const row = md.match(/^\|\s*Business Rule\s*\|([^|\n]*)\|/m);
    if (!row) continue;
    const tcId = md.match(/^\|\s*ID\s*\|\s*([^|\s]+)\s*\|/m)?.[1] ?? null;
    for (const ruleId of row[1].match(/BR-[A-Z0-9-]+/g) ?? []) {
      if (!map.has(ruleId)) map.set(ruleId, []);
      map.get(ruleId).push({ id: tcId, file: relative(repoRoot, file).replace(/\\/g, "/") });
    }
  }
  return map;
}

const order = (r) => (r.gate ? GATES.indexOf(r.gate) : GATES.length);
const rules = [...parseRuleTable(), ...cancellationRule()]
  .map((r) => ({ ...r, ...OVERRIDES[r.id] }))
  .map((r, i) => ({ ...r, _i: i }))
  .sort((a, b) => order(a) - order(b) || a._i - b._i)
  .map(({ _i, ...r }) => r);

const covered = coverage();
const inScope = rules.filter((r) => !gate || r.gate === gate);
const gaps = inScope.filter((r) => !covered.has(r.id));

console.log(
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      filters: { gate: gate ?? null, max: max === Infinity ? null : max },
      totals: { rules_in_scope: inScope.length, covered: inScope.length - gaps.length, gaps: gaps.length },
      covered: inScope.filter((r) => covered.has(r.id)).map((r) => ({ id: r.id, test_cases: covered.get(r.id) })),
      gaps: gaps.slice(0, max),
      gaps_not_returned: Math.max(0, gaps.length - max),
    },
    null,
    2,
  ),
);
