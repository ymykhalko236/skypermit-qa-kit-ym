#!/usr/bin/env node
// Checks a <spec>.design.json produced by the test-design skill.
// Usage: node check_design.mjs <design.json> [--spec <spec-file>]
// Exit code 0 = no errors (warnings may still be printed), 1 = errors.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const designPath = args.find((a) => !a.startsWith("--"));
const specFlag = args.indexOf("--spec");
if (!designPath) {
  console.error("Usage: node check_design.mjs <design.json> [--spec <spec-file>]");
  process.exit(2);
}

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

let d;
try {
  d = JSON.parse(fs.readFileSync(designPath, "utf8"));
} catch (e) {
  console.error(`ERROR: cannot read or parse ${designPath}: ${e.message}`);
  process.exit(1);
}

// Resolve the spec: --spec, then as written, then relative to the design file, then same folder by base name.
function resolveSpec() {
  const tries = [];
  if (specFlag >= 0 && args[specFlag + 1]) tries.push(args[specFlag + 1]);
  if (typeof d.spec === "string") {
    tries.push(d.spec, path.resolve(path.dirname(designPath), d.spec));
    tries.push(path.join(path.dirname(designPath), path.basename(d.spec)));
  }
  return tries.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
}
const specPath = resolveSpec();
let lines = null;
if (!specPath) err(`spec file not found (spec: ${JSON.stringify(d.spec)})`);
else lines = fs.readFileSync(specPath, "utf8").replace(/^﻿/, "").split(/\r?\n/);

for (const k of ["spec", "focus", "equivalence_classes", "boundary_values", "state_transitions", "tests", "unknowns"]) {
  if (!(k in d)) err(`missing top-level field "${k}"`);
}
const ep = Array.isArray(d.equivalence_classes) ? d.equivalence_classes : [];
const bv = Array.isArray(d.boundary_values) ? d.boundary_values : [];
const st = d.state_transitions || {};
const matrix = Array.isArray(st.matrix) ? st.matrix : [];
const tests = Array.isArray(d.tests) ? d.tests : [];
const unknowns = Array.isArray(d.unknowns) ? d.unknowns : [];

function checkQuote(q, where) {
  if (!q || typeof q !== "object") return err(`${where}: missing quote`);
  if (!Number.isInteger(q.line) || q.line < 1) return err(`${where}: quote.line must be a positive integer`);
  if (typeof q.text !== "string" || !q.text.trim()) return err(`${where}: quote.text is empty`);
  if (!lines) return;
  if (q.line > lines.length) return err(`${where}: quote.line ${q.line} is past the end of the spec (${lines.length} lines)`);
  if (!lines[q.line - 1].includes(q.text)) {
    const at = lines.findIndex((l) => l.includes(q.text));
    err(
      `${where}: quote is not an exact substring of line ${q.line}` +
        (at >= 0 ? ` (it appears on line ${at + 1})` : " (not found on any single line: check every character)")
    );
  }
}
function checkResponse(r, where) {
  if (r === undefined) return;
  if (!r || typeof r !== "object" || !("value" in r)) return err(`${where}: response must be {value, quote}`);
  checkQuote(r.quote, `${where}.response`);
}

const allIds = new Map();
function registerId(id, prefix, where) {
  if (typeof id !== "string" || !new RegExp(`^${prefix}-\\d{2,}$`).test(id)) err(`${where}: id ${JSON.stringify(id)} should look like ${prefix}-01`);
  if (allIds.has(id)) err(`${where}: duplicate id ${id}`);
  allIds.set(id, where);
}
const EXPECTED = new Set(["valid", "invalid", "unknown"]);

ep.forEach((c, i) => {
  const w = c.id || `equivalence_classes[${i}]`;
  registerId(c.id, "EP", w);
  for (const k of ["parameter", "class", "representative"]) if (c[k] === undefined || c[k] === "") err(`${w}: missing ${k}`);
  if (typeof c.valid !== "boolean" && c.valid !== null) err(`${w}: valid must be true, false or null`);
  checkQuote(c.quote, w);
  checkResponse(c.response, w);
});

bv.forEach((b, i) => {
  const w = b.id || `boundary_values[${i}]`;
  registerId(b.id, "BV", w);
  for (const k of ["parameter", "boundary", "step"]) if (b[k] === undefined || b[k] === "") err(`${w}: missing ${k}`);
  if (![true, false, null].includes(b.inclusive)) err(`${w}: inclusive must be true, false or null`);
  checkQuote(b.quote, w);
  checkResponse(b.response, w);
  if (!Array.isArray(b.values) || b.values.length !== 3) {
    err(`${w}: values must have exactly 3 entries (step below, boundary, step above)`);
    return;
  }
  b.values.forEach((v, j) => {
    if (!EXPECTED.has(v.expected)) err(`${w}.values[${j}]: expected must be valid, invalid or unknown (got ${JSON.stringify(v.expected)})`);
    checkResponse(v.response, `${w}.values[${j}]`);
  });
  if (b.inclusive === null && b.values[1].expected !== "unknown")
    err(`${w}: inclusivity is null, so the boundary value itself must be expected "unknown"`);
  if (b.inclusive !== null && b.values.every((v) => v.expected === b.values[0].expected) && b.values[0].expected !== "unknown")
    warn(`${w}: all three values expect "${b.values[0].expected}"; is this really a boundary?`);
});

if (st && "not_applicable" in st) {
  if (typeof st.not_applicable !== "string" || !st.not_applicable.trim()) err(`state_transitions.not_applicable needs a reason`);
} else {
  const states = Array.isArray(st.states) ? st.states : [];
  const actions = Array.isArray(st.actions) ? st.actions : [];
  if (!states.length || !actions.length) err(`state_transitions: give states and actions, or {"not_applicable": "<why>"}`);
  const seen = new Map();
  matrix.forEach((c, i) => {
    const w = c.id || `matrix[${i}]`;
    registerId(c.id, "ST", w);
    if (!states.includes(c.from)) err(`${w}: from ${JSON.stringify(c.from)} is not in states`);
    if (!actions.includes(c.action)) err(`${w}: action ${JSON.stringify(c.action)} is not in actions`);
    if (!["legal", "illegal", "unknown"].includes(c.result)) err(`${w}: result must be legal, illegal or unknown`);
    if (c.result === "legal" && !states.includes(c.to)) err(`${w}: a legal cell needs a target state from states in "to"`);
    if (c.result !== "legal" && c.to !== null) err(`${w}: "to" must be null for a ${c.result} cell`);
    checkQuote(c.quote, w);
    checkResponse(c.response, w);
    const key = `${c.from} × ${c.action}`;
    if (seen.has(key)) err(`${w}: duplicate cell ${key} (also ${seen.get(key)})`);
    seen.set(key, w);
  });
  for (const s of states) for (const a of actions) if (!seen.has(`${s} × ${a}`)) err(`matrix: missing cell ${s} × ${a}`);
}

tests.forEach((t, i) => {
  const w = t.id || `tests[${i}]`;
  registerId(t.id, "T", w);
  if (!Array.isArray(t.covers) || !t.covers.length) err(`${w}: covers is empty`);
});
unknowns.forEach((u, i) => {
  const w = u.id || `unknowns[${i}]`;
  registerId(u.id, "U", w);
  if (typeof u.question !== "string" || !u.question.trim()) err(`${w}: missing question`);
  if (!Array.isArray(u.affects)) err(`${w}: affects must be a list`);
});

const covered = new Set(tests.flatMap((t) => t.covers || []));
for (const t of tests) for (const id of t.covers || []) if (!allIds.has(id) || /^(T|U)-/.test(id)) err(`${t.id}: covers unknown element ${id}`);
for (const u of unknowns) for (const id of u.affects || []) if (!allIds.has(id) || /^(T|U)-/.test(id)) err(`${u.id}: affects unknown element ${id}`);
for (const id of allIds.keys()) if (/^(EP|BV|ST)-/.test(id) && !covered.has(id)) err(`${id} is not covered by any test`);

// A boundary can't be both decided and asked about.
const bvById = new Map(bv.map((b) => [b.id, b]));
for (const u of unknowns) {
  const q = String(u.question || "");
  for (const id of u.affects || []) {
    const b = bvById.get(id);
    if (!b || b.inclusive === null) continue;
    if (/inclusiv|exclusiv/i.test(q))
      err(`${u.id} asks about inclusivity but ${id} has inclusive: ${b.inclusive}; set it to null and the boundary value to "unknown", or drop the question if the text settles it`);
  }
}

// Anything expected "unknown" should be explained by an unknown.
const affected = new Set(unknowns.flatMap((u) => u.affects || []));
for (const b of bv) if ((b.values || []).some((v) => v.expected === "unknown") && !affected.has(b.id)) warn(`${b.id} has an "unknown" value but no unknowns entry affects it`);
for (const c of matrix) if (c.result === "unknown" && !affected.has(c.id)) warn(`${c.id} is "unknown" but no unknowns entry affects it`);

const cells = matrix.reduce((m, c) => ((m[c.result] = (m[c.result] || 0) + 1), m), {});
console.log(
  `spec: ${specPath || "(not found)"}\n` +
    `classes: ${ep.length}, boundaries: ${bv.length}, matrix cells: ${matrix.length} ${JSON.stringify(cells)}, tests: ${tests.length}, unknowns: ${unknowns.length}`
);
for (const w of warnings) console.log(`WARNING: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
console.log(errors.length ? `FAILED with ${errors.length} error(s)` : "OK");
process.exit(errors.length ? 1 : 0);
