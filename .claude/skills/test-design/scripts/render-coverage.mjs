#!/usr/bin/env node
// Renders a <spec>.design.json produced by the test-design skill as <spec>.coverage.html next to it.
// Usage: node render-coverage.mjs <design.json> [--out <file.html>]
// Plain Node, no dependencies, no network. The page is self-contained (inline CSS and SVG).
//
// Sections:
//   1. Number lines: one per numeric parameter, with its equivalence classes as bands,
//      its boundaries (filled = inclusive, open = exclusive, dashed "?" = not settled)
//      and the three boundary values of each boundary as coloured dots.
//   2. State × action matrix.
//   3. Traceability: quote → element → tests (and the unknowns that touch each element).
//   4. Unknowns.
// Values are free text in the design, so numbers are read heuristically. Anything that
// can't be placed on a line is listed under it instead of being guessed.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const designPath = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
const outFlag = args.indexOf("--out");
if (!designPath) {
  console.error("Usage: node render-coverage.mjs <design.json> [--out <file.html>]");
  process.exit(2);
}
let d;
try {
  d = JSON.parse(fs.readFileSync(designPath, "utf8").replace(/^﻿/, ""));
} catch (e) {
  console.error(`ERROR: cannot read or parse ${designPath}: ${e.message}`);
  process.exit(1);
}
const outPath =
  outFlag >= 0 && args[outFlag + 1]
    ? args[outFlag + 1]
    : /\.design\.json$/i.test(designPath)
      ? designPath.replace(/\.design\.json$/i, ".coverage.html")
      : designPath.replace(/(\.json)?$/i, ".coverage.html");

const arr = (x) => (Array.isArray(x) ? x : []);
const ep = arr(d.equivalence_classes);
const bv = arr(d.boundary_values);
const st = d.state_transitions || {};
const matrix = arr(st.matrix);
const tests = arr(d.tests);
const unknowns = arr(d.unknowns);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- cross references ----------
const testsFor = new Map(); // element id -> [test ids]
for (const t of tests) for (const id of arr(t.covers)) testsFor.set(id, [...(testsFor.get(id) || []), t.id]);
const unknownsFor = new Map(); // element id -> [unknown ids]
for (const u of unknowns) for (const id of arr(u.affects)) unknownsFor.set(id, [...(unknownsFor.get(id) || []), u.id]);
const known = new Set([...ep, ...bv, ...matrix].map((x) => x.id));
const idLink = (id) => (known.has(id) ? `<a href="#${esc(id)}">${esc(id)}</a>` : `<span class="bad">${esc(id)}</span>`);
const testList = (id) => {
  const t = testsFor.get(id) || [];
  return t.length ? t.map(esc).join(", ") : `<span class="bad">none</span>`;
};
const unknownList = (id) => (unknownsFor.get(id) || []).map((u) => `<a href="#${esc(u)}">${esc(u)}</a>`).join(", ");

// ---------- number parsing ----------
const NUM = String.raw`([-−]?\d+(?:[.,]\d+)?)`;
const toNum = (s) => Number(String(s).replace("−", "-").replace(",", "."));
function firstNumber(text) {
  const m = String(text ?? "").match(new RegExp(NUM));
  return m ? toNum(m[1]) : null;
}
// Returns {lo, hi, loIn, hiIn} or null when the class text has no readable range.
// lo/hi may be ±Infinity. loIn/hiIn say whether the class contains that end value, read
// from the wording: true ("15–240", "at least 12", "up to 5", "or more"), false ("below 15",
// "more than 0", "exceeds 5"), or null when the wording leaves it open ("between 7 and 28").
function classRange(text) {
  const t = String(text ?? "").toLowerCase();
  const R = (lo, hi, loIn, hiIn) => ({ lo, hi, loIn: Number.isFinite(lo) ? loIn : false, hiIn: Number.isFinite(hi) ? hiIn : false });
  let m;
  const OPEN_LOW = "(?:above|more than|over|greater than|longer than|higher than|older than|after|exceeds?|exceeding)";
  const OPEN_HIGH = "(?:below|less than|fewer than|under|shorter than|lower than|younger than|before)";
  const CLOSED_LOW = "(?:at least|minimum of|no less than|from)";
  const CLOSED_HIGH = "(?:up to|at most|no more than|maximum of)";
  // Two-sided with words: "more than 0 and less than 15", "at least 15 and at most 240".
  const two = new RegExp(`(${OPEN_LOW}|${CLOSED_LOW})\\s+${NUM}\\D{0,15}?\\s+and\\s+(${OPEN_HIGH}|${CLOSED_HIGH})\\s+${NUM}`);
  if ((m = t.match(two)))
    return R(toNum(m[2]), toNum(m[4]), new RegExp(`^${CLOSED_LOW}$`).test(m[1]), new RegExp(`^${CLOSED_HIGH}$`).test(m[3]));
  if ((m = t.match(new RegExp(`between\\s+${NUM}\\D{0,15}?\\s+and\\s+${NUM}`)))) return R(toNum(m[1]), toNum(m[2]), null, null);
  if ((m = t.match(new RegExp(`${NUM}\\s*(?:[a-z.]+\\s*)?(?:–|—|-|to)\\s*${NUM}`)))) return R(toNum(m[1]), toNum(m[2]), true, true);
  if ((m = t.match(new RegExp(`${NUM}\\s*(?:[a-z.]+\\s+){0,3}or\\s+(?:more|older|above|greater|higher|longer|later)`))))
    return R(toNum(m[1]), Infinity, true, false);
  if ((m = t.match(new RegExp(`${NUM}\\s*(?:[a-z.]+\\s+){0,3}or\\s+(?:less|fewer|younger|below|lower|shorter|earlier)`))))
    return R(-Infinity, toNum(m[1]), false, true);
  if ((m = t.match(new RegExp(`${CLOSED_HIGH}\\s+${NUM}`)))) return R(-Infinity, toNum(m[1]), false, true);
  if ((m = t.match(new RegExp(`${OPEN_HIGH}\\s+${NUM}`)))) return R(-Infinity, toNum(m[1]), false, false);
  if ((m = t.match(new RegExp(`${CLOSED_LOW}\\s+${NUM}`)))) return R(toNum(m[1]), Infinity, true, false);
  if ((m = t.match(new RegExp(`${OPEN_LOW}\\s+${NUM}`)))) return R(toNum(m[1]), Infinity, false, false);
  // A single value: "exactly 0 minutes", or text that starts with its only number ("0 minutes (end = start)").
  if ((m = t.match(new RegExp(`exactly\\s+${NUM}`)))) return R(toNum(m[1]), toNum(m[1]), true, true);
  if ((m = t.match(new RegExp(`^\\s*${NUM}\\b`))) && (t.match(/\d+(?:[.,]\d+)?/g) || []).length === 1)
    return R(toNum(m[1]), toNum(m[1]), true, true);
  return null;
}
// A boundary is placeable when its boundary and all three values have numbers, in strict order, middle = boundary.
function bvNumbers(b) {
  const vals = arr(b.values).map((v) => firstNumber(v.value));
  const bound = firstNumber(b.boundary);
  if (vals.length !== 3 || vals.some((v) => v === null) || bound === null) return null;
  const up = vals[0] < vals[1] && vals[1] < vals[2];
  const down = vals[0] > vals[1] && vals[1] > vals[2];
  if (!(up || down) || vals[1] !== bound) return null;
  return { bound, vals };
}

// ---------- 1. number lines ----------
const params = [];
for (const x of [...ep, ...bv]) if (!params.includes(x.parameter)) params.push(x.parameter);

function numberLine(param) {
  const classes = ep.filter((c) => c.parameter === param);
  const bounds = bv.filter((b) => b.parameter === param);
  const placedC = [], unplaced = [];
  for (const c of classes) {
    const r = classRange(c.class);
    if (r) placedC.push({ c, r });
    else unplaced.push(`${c.id} ${c.class}`);
  }
  const placedB = [];
  for (const b of bounds) {
    const n = bvNumbers(b);
    if (n) placedB.push({ b, ...n });
    else unplaced.push(`${b.id} ${b.boundary}`);
  }
  if (!placedB.length && !placedC.some(({ r }) => Number.isFinite(r.lo) || Number.isFinite(r.hi))) return null;

  // Points to place, then a compressed scale: equal-ish room for close points, extra room
  // (log-scaled) for big gaps, so 14/15/16 and 239/240/241 stay readable on one line.
  const pts = new Set();
  for (const { r } of placedC) for (const v of [r.lo, r.hi]) if (Number.isFinite(v)) pts.add(v);
  for (const { vals } of placedB) vals.forEach((v) => pts.add(v));
  const sorted = [...pts].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((v, i) => v - sorted[i]);
  const minGap = Math.min(...gaps.filter((g) => g > 0), Infinity);
  const weights = gaps.map((g) => 1 + Math.log2(1 + g / (isFinite(minGap) ? minGap : 1)));
  const PAD = 1.6; // room for ±∞ ends
  const total = PAD * 2 + weights.reduce((a, b) => a + b, 0);
  const W = 900, L = 30, R = 30, span = W - L - R;
  const xOf = new Map();
  let acc = PAD;
  sorted.forEach((v, i) => {
    if (i) acc += weights[i - 1];
    xOf.set(v, L + (acc / total) * span);
  });
  const x = (v) => (v === -Infinity ? L : v === Infinity ? W - R : xOf.get(v));
  const fmt = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(4)));
  const breaks = gaps.map((g, i) => (isFinite(minGap) && g > minGap * 5 ? (x(sorted[i]) + x(sorted[i + 1])) / 2 : null)).filter((v) => v !== null);

  const rowH = 26;
  let y = 16;
  const svg = [];
  // class bands
  for (const { c, r } of placedC) {
    const x1 = x(r.lo), x2 = x(r.hi);
    const cls = c.valid ? "valid" : "invalid";
    const tip = `<title>${esc(`${c.id} (${cls}): ${c.class}\nRepresentative: ${c.representative}`)}</title>`;
    // Class ends use interval notation, so they never look like boundary-value dots:
    // "[" / "]" = the class contains this value, "(" / ")" = it doesn't, dashed amber bracket = the wording doesn't say.
    const end = (cx, inc, side) => {
      const t = y, b = y + 16, m = y + 8, d = side === "lo" ? 1 : -1;
      const path = inc === false
        ? `M${cx + 6 * d} ${t} Q${cx - 2 * d} ${m} ${cx + 6 * d} ${b}`
        : `M${cx + 5 * d} ${t} H${cx} V${b} H${cx + 5 * d}`;
      return `<path class="end ${inc === null ? "unk" : cls}" d="${path}"/>`;
    };
    if (r.lo === r.hi) {
      // a single-value class: a diamond on its value, labelled beside it
      svg.push(
        `<g>${tip}<path class="point ${cls}" d="M${x1} ${y + 1} L${x1 + 7} ${y + 8} L${x1} ${y + 15} L${x1 - 7} ${y + 8} Z"/>` +
          `<text class="bandlabel" x="${x1 + 12}" y="${y + 12}">${esc(c.id)}</text></g>`
      );
      y += rowH - 4;
      continue;
    }
    svg.push(
      `<g>${tip}` +
        `<rect class="band ${cls}" x="${x1}" y="${y + 3}" width="${Math.max(x2 - x1, 3)}" height="10" rx="2"/>` +
        (r.lo === -Infinity ? `<text class="inf" x="${x1 + 4}" y="${y + 12}">←</text>` : end(x1, r.loIn, "lo")) +
        (r.hi === Infinity ? `<text class="inf" x="${x2 - 4}" y="${y + 12}" text-anchor="end">→</text>` : end(x2, r.hiIn, "hi")) +
        `<text class="bandlabel" x="${(x1 + x2) / 2}" y="${y}" text-anchor="middle">${esc(c.id)}</text></g>`
    );
    y += rowH + 4;
  }
  // axis
  y += 10;
  const axisY = y;
  svg.push(`<line class="axis" x1="${L}" y1="${axisY}" x2="${W - R}" y2="${axisY}"/>`);
  svg.push(`<text class="inf" x="${L - 4}" y="${axisY + 4}" text-anchor="end">−∞</text><text class="inf" x="${W - R + 4}" y="${axisY + 4}">+∞</text>`);
  for (const bx of breaks) svg.push(`<text class="break" x="${bx}" y="${axisY + 5}" text-anchor="middle">≈</text>`);
  for (const v of sorted) svg.push(`<line class="tick" x1="${x(v)}" y1="${axisY - 4}" x2="${x(v)}" y2="${axisY + 4}"/>`);
  // tick labels, staggered when neighbours are close
  let lastX = -1e9, lvl = 0;
  for (const v of sorted) {
    lvl = x(v) - lastX < 28 ? (lvl + 1) % 2 : 0;
    lastX = x(v);
    svg.push(`<text class="ticklabel" x="${x(v)}" y="${axisY + 18 + lvl * 11}" text-anchor="middle">${esc(fmt(v))}</text>`);
  }
  y = axisY + 44;
  // boundary rows
  for (const { b, bound, vals } of placedB) {
    const inc = b.inclusive === true ? "inc" : b.inclusive === false ? "exc" : "unk";
    const incText = b.inclusive === true ? "inclusive" : b.inclusive === false ? "exclusive" : "inclusivity not settled";
    svg.push(`<line class="bvline" x1="${Math.min(...vals.map(x))}" y1="${y}" x2="${Math.max(...vals.map(x))}" y2="${y}"/>`);
    svg.push(`<line class="guide" x1="${x(bound)}" y1="${axisY}" x2="${x(bound)}" y2="${y}"/>`);
    arr(b.values).forEach((v, i) => {
      const cx = x(vals[i]);
      if (i === 1) {
        svg.push(
          `<g><title>${esc(`${b.id} boundary ${b.boundary} (${incText}): ${v.value} → ${v.expected}`)}</title>` +
            (inc === "exc"
              ? `<rect class="bmark exc" x="${cx - 9}" y="${y - 9}" width="18" height="18" rx="2"/>`
              : `<circle class="bmark ${inc}" cx="${cx}" cy="${y}" r="9"/>`) +
            `<circle class="dot ${esc(v.expected)}" cx="${cx}" cy="${y}" r="5"/>` +
            (inc === "unk" ? `<text class="q" x="${cx}" y="${y - 12}" text-anchor="middle">?</text>` : "") +
            `</g>`
        );
      } else {
        svg.push(`<g><title>${esc(`${b.id}: ${v.value} → ${v.expected}`)}</title><circle class="dot ${esc(v.expected)}" cx="${cx}" cy="${y}" r="5"/></g>`);
      }
    });
    const labelLeft = Math.max(...vals.map(x)) < W - 160;
    svg.push(
      `<text class="bvlabel" x="${labelLeft ? Math.max(...vals.map(x)) + 14 : Math.min(...vals.map(x)) - 14}" y="${y + 4}" text-anchor="${labelLeft ? "start" : "end"}">${esc(b.id)}</text>`
    );
    y += rowH;
  }
  const H = y + 4;
  return `<section class="param">
  <h3>${esc(param)}</h3>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Number line for ${param}`)}">${svg.join("")}</svg>
  ${breaks.length ? `<p class="note">Not to scale: ≈ marks a compressed gap.</p>` : ""}
  ${unplaced.length ? `<p class="note">Not placed on the line (no readable number): ${unplaced.map(esc).join("; ")}</p>` : ""}
</section>`;
}
const rendered = params.map((p) => [p, numberLine(p)]);
const lines = rendered.map(([, h]) => h).filter(Boolean);
const nonNumeric = rendered.filter(([, h]) => !h).map(([p]) => p);

const legend = `<div class="legend">
  <span><svg width="18" height="12"><rect class="band valid" width="18" height="12" rx="2"/></svg> valid class</span>
  <span><svg width="18" height="12"><rect class="band invalid" width="18" height="12" rx="2"/></svg> invalid class</span>
  <span><svg width="22" height="18"><path class="end valid" d="M7 1 H2 V17 H7 M15 1 H20 V17 H15"/></svg> class includes its end</span>
  <span><svg width="22" height="18"><path class="end valid" d="M8 1 Q0 9 8 17 M14 1 Q22 9 14 17"/></svg> class excludes its end</span>
  <span><svg width="22" height="18"><path class="end unk" d="M7 1 H2 V17 H7 M15 1 H20 V17 H15"/></svg> end not settled</span>
  <span><svg width="18" height="18"><path class="point valid" d="M9 2 L16 9 L9 16 L2 9 Z"/></svg> single-value class</span>
  <span><svg width="14" height="14"><circle class="dot valid" cx="7" cy="7" r="5"/></svg> boundary value: valid</span>
  <span><svg width="14" height="14"><circle class="dot invalid" cx="7" cy="7" r="5"/></svg> boundary value: invalid</span>
  <span><svg width="14" height="14"><circle class="dot unknown" cx="7" cy="7" r="5"/></svg> boundary value: unknown</span>
  <span><svg width="22" height="22"><circle class="bmark inc" cx="11" cy="11" r="9"/></svg> boundary, inclusive</span>
  <span><svg width="22" height="22"><rect class="bmark exc" x="2" y="2" width="18" height="18" rx="2"/></svg> boundary, exclusive</span>
  <span><svg width="22" height="22"><circle class="bmark unk" cx="11" cy="11" r="9"/></svg> boundary, not settled</span>
</div>`;

// Category (non-numeric) parameters: one card ("chip") per class, side by side, with the
// spec lines they quote listed once underneath. Boundaries of such parameters get a neutral
// card listing their three values.
const chipMeta = (id) => {
  const u = unknownList(id);
  return `<div class="meta">Tests: ${testList(id)}${u ? ` · Unknowns: ${u}` : ""}</div>`;
};
const chipsFor = (p) => {
  const cs = ep.filter((c) => c.parameter === p);
  const bs = bv.filter((b) => b.parameter === p);
  const cards = [
    ...cs.map((c) => {
      const cls = c.valid ? "valid" : "invalid";
      return `<div class="chip ${cls}"><div class="top"><a class="id" href="#${esc(c.id)}">${esc(c.id)}</a><span class="tag">${cls}</span></div><div class="cls">${esc(c.class)}</div>${c.response ? `<div class="meta">Response: ${esc(c.response.value)}</div>` : ""}${chipMeta(c.id)}</div>`;
    }),
    ...bs.map(
      (b) =>
        `<div class="chip boundary"><div class="top"><a class="id" href="#${esc(b.id)}">${esc(b.id)}</a><span class="tag">boundary: ${esc(b.boundary)}</span></div><div class="cls">${arr(b.values)
          .map((v) => `<span class="pill ${esc(v.expected)}">${esc(v.expected)}</span> ${esc(v.value)}`)
          .join("<br>")}</div>${chipMeta(b.id)}</div>`
    ),
  ];
  const quotes = [];
  for (const e of [...cs, ...bs]) if (e.quote && !quotes.some((q) => q.line === e.quote.line && q.text === e.quote.text)) quotes.push(e.quote);
  quotes.sort((a, b) => a.line - b.line);
  return `<section class="param"><h3>${esc(p)}</h3><div class="chips">${cards.join("")}</div><p class="quotes">${quotes
    .map((q) => `Line ${esc(q.line)}: <code>${esc(q.text)}</code>`)
    .join("<br>")}</p></section>`;
};
const nonNumericBlock = nonNumeric.length ? `<h3>Category parameters</h3>${nonNumeric.map(chipsFor).join("\n")}` : "";

// ---------- 2. state × action ----------
let stateBlock;
if ("not_applicable" in st) {
  stateBlock = `<p class="note">Not applicable: ${esc(st.not_applicable)}</p>`;
} else {
  const states = arr(st.states), actions = arr(st.actions);
  const cell = new Map(matrix.map((c) => [`${c.from}\u0000${c.action}`, c]));
  stateBlock = `<div class="scroll"><table class="matrix"><thead><tr><th>State \\ action</th>${actions.map((a) => `<th>${esc(a)}</th>`).join("")}</tr></thead><tbody>${states
    .map(
      (s) =>
        `<tr><th>${esc(s)}</th>${actions
          .map((a) => {
            const c = cell.get(`${s}\u0000${a}`);
            if (!c) return `<td class="missing">missing</td>`;
            const tip = `${c.id}: line ${c.quote?.line}: ${c.quote?.text ?? ""}${c.response ? `\nResponse: ${c.response.value}` : ""}`;
            return `<td class="${esc(c.result)}" title="${esc(tip)}"><a href="#${esc(c.id)}">${esc(c.id)}</a><br><b>${esc(c.result)}</b>${c.result === "legal" ? ` → ${esc(c.to)}` : ""}${c.response ? `<br><span class="resp">${esc(c.response.value)}</span>` : ""}${unknownsFor.has(c.id) ? `<br><span class="u">${unknownList(c.id)}</span>` : ""}</td>`;
          })
          .join("")}</tr>`
    )
    .join("")}</tbody></table></div>`;
}

// ---------- 3. quote → element → test ----------
const elements = [
  ...ep.map((c) => ({ id: c.id, kind: "class", what: `${c.parameter}: ${c.class} (${c.valid ? "valid" : "invalid"})`, quote: c.quote })),
  ...bv.map((b) => ({ id: b.id, kind: "boundary", what: `${b.parameter}: ${b.boundary} (${b.inclusive === null ? "inclusivity not settled" : b.inclusive ? "inclusive" : "exclusive"})`, quote: b.quote })),
  ...matrix.map((c) => ({ id: c.id, kind: "transition", what: `${c.from} × ${c.action}: ${c.result}${c.result === "legal" ? ` → ${c.to}` : ""}`, quote: c.quote })),
];
const groups = new Map();
for (const e of elements) {
  const k = `${e.quote?.line ?? "?"}\u0000${e.quote?.text ?? ""}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}
const traceRows = [...groups.entries()]
  .sort((a, b) => (Number(a[0].split("\u0000")[0]) || 0) - (Number(b[0].split("\u0000")[0]) || 0))
  .map(([k, es]) => {
    const [line, text] = k.split("\u0000");
    return es
      .map(
        (e, i) =>
          `<tr id="${esc(e.id)}"${testsFor.has(e.id) ? "" : ` class="uncovered"`}>${i === 0 ? `<td rowspan="${es.length}" class="ln">${esc(line)}</td><td rowspan="${es.length}" class="quote">${esc(text)}</td>` : ""}<td><b>${esc(e.id)}</b> <span class="kind">${e.kind}</span><br>${esc(e.what)}</td><td>${testList(e.id)}</td><td>${unknownList(e.id)}</td></tr>`
      )
      .join("");
  })
  .join("");
const uncovered = elements.filter((e) => !testsFor.has(e.id)).map((e) => e.id);

// ---------- 4. unknowns ----------
const unknownBlock = unknowns.length
  ? `<ol class="unknowns">${unknowns
      .map((u) => `<li id="${esc(u.id)}"><b>${esc(u.id)}</b> ${esc(u.question)}<div class="aff">Affects: ${arr(u.affects).map(idLink).join(", ") || "—"}</div></li>`)
      .join("")}</ol>`
  : `<p class="note">None.</p>`;

// ---------- page ----------
const counts = matrix.reduce((m, c) => ((m[c.result] = (m[c.result] || 0) + 1), m), {});
const title = `Coverage: ${path.basename(designPath).replace(/\.design\.json$/i, "")}`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fff;--fg:#1d1d1f;--muted:#6b6b70;--line:#d6d6db;--card:#f6f6f8;--valid:#2e8b57;--valid-bg:#e3f3ea;--invalid:#c0392b;--invalid-bg:#fbe5e2;--unknown:#b7791f;--unknown-bg:#fdf1d8;--link:#2457c5}
@media (prefers-color-scheme:dark){:root{--bg:#161618;--fg:#e8e8ea;--muted:#9a9aa0;--line:#3a3a40;--card:#202024;--valid:#4fbf80;--valid-bg:#1d3327;--invalid:#ef6b5b;--invalid-bg:#3a1f1c;--unknown:#e0a73c;--unknown-bg:#3a2e16;--link:#7aa2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:36px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}h3{font-size:14px;margin:18px 0 6px}
a{color:var(--link)}.meta{color:var(--muted)}.note{color:var(--muted);font-size:12px;margin:4px 0}.bad{color:var(--invalid);font-weight:600}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.stats div{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 12px}.stats b{font-size:16px;margin-right:4px}
.param{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:4px 12px 8px;margin:10px 0}svg{width:100%;height:auto;display:block}
.band.valid{fill:var(--valid-bg);stroke:var(--valid)}.band.invalid{fill:var(--invalid-bg);stroke:var(--invalid)}.bandlabel,.bvlabel{font-size:11px;fill:var(--fg);font-weight:600}
.axis{stroke:var(--fg);stroke-width:1.5}.tick{stroke:var(--fg)}.ticklabel{font-size:10px;fill:var(--fg)}.inf,.break{font-size:12px;fill:var(--muted)}.break{font-size:16px;font-weight:700;fill:var(--bg);stroke:var(--fg);stroke-width:.6;paint-order:stroke}
.guide{stroke:var(--muted);stroke-dasharray:2 3}.bvline{stroke:var(--line);stroke-width:2}
.end{fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.end.valid{stroke:var(--valid)}.end.invalid{stroke:var(--invalid)}.end.unk{stroke:var(--unknown);stroke-dasharray:3 2}
.point{stroke-width:2}.point.valid{fill:var(--valid-bg);stroke:var(--valid)}.point.invalid{fill:var(--invalid-bg);stroke:var(--invalid)}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0}.chip{border:1.5px solid;border-radius:10px;padding:6px 12px;min-width:220px;max-width:100%;flex:0 1 320px}
.chip.valid{border-color:var(--valid);background:var(--valid-bg)}.chip.invalid{border-color:var(--invalid);background:var(--invalid-bg)}.chip.boundary{border-color:var(--line);background:var(--bg)}
.chip .top{display:flex;gap:8px;align-items:baseline}.chip .id{font-weight:700}.chip .tag{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
.chip.valid .tag{color:var(--valid)}.chip.invalid .tag{color:var(--invalid)}.chip .cls{margin:2px 0}.chip .meta{font-size:12px;color:var(--muted)}.chip .meta a{color:var(--unknown)}
.chip:target{outline:2px solid var(--link)}.quotes{font-size:12px;color:var(--muted);margin:4px 0 0}.quotes code{font-size:12px}
.dot.valid{fill:var(--valid)}.dot.invalid{fill:var(--invalid)}.dot.unknown{fill:var(--unknown)}
.bmark{fill:none;stroke-width:2}.bmark.inc{stroke:var(--fg)}.bmark.exc{stroke:var(--fg)}.bmark.unk{stroke:var(--unknown);stroke-dasharray:3 2}.q{font-size:11px;font-weight:700;fill:var(--unknown)}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--muted);align-items:center}.legend span{display:inline-flex;gap:5px;align-items:center}.legend svg{width:auto;display:inline}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}thead th{background:var(--card)}
.matrix td{text-align:center;min-width:110px}.matrix td.legal{background:var(--valid-bg)}.matrix td.illegal{background:var(--invalid-bg)}.matrix td.unknown{background:var(--unknown-bg)}.matrix td.missing{color:var(--invalid);font-weight:700}
.resp{font-size:11px;color:var(--muted)}.u a{font-size:11px;color:var(--unknown)}
.pill{display:inline-block;font-size:11px;padding:0 6px;border-radius:9px}.pill.valid{background:var(--valid-bg);color:var(--valid)}.pill.invalid{background:var(--invalid-bg);color:var(--invalid)}.pill.unknown{background:var(--unknown-bg);color:var(--unknown)}
.ln{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}.quote{font-family:ui-monospace,Consolas,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;max-width:380px}.kind{font-size:11px;color:var(--muted)}
tr.uncovered td{background:var(--invalid-bg)}tr:target td,li:target{outline:2px solid var(--link)}
.unknowns li{margin:8px 0}.aff{font-size:12px;color:var(--muted)}
</style></head><body><main>
<h1>${esc(title)}</h1>
<div class="meta">Spec: <code>${esc(d.spec)}</code>${d.focus ? ` · Focus: ${esc(d.focus)}` : ""}</div>
<div class="meta">Rendered from <code>${esc(path.basename(designPath))}</code> by render-coverage.mjs</div>
<div class="stats">
  <div><b>${ep.length}</b>classes</div><div><b>${bv.length}</b>boundaries</div>
  <div><b>${matrix.length}</b>matrix cells${matrix.length ? ` (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")})` : ""}</div>
  <div><b>${tests.length}</b>tests</div><div><b>${unknowns.length}</b>unknowns</div>
  <div${uncovered.length ? ` class="bad"` : ""}><b>${uncovered.length}</b>uncovered</div>
</div>

<h2>1. Classes and boundaries</h2>
${lines.length ? legend + lines.join("\n") : `<p class="note">No numeric parameters.</p>`}
${nonNumericBlock}

<h2>2. State × action</h2>
${stateBlock}

<h2>3. Quote → element → test</h2>
<div class="scroll"><table><thead><tr><th>Line</th><th>Quote</th><th>Element</th><th>Tests</th><th>Unknowns</th></tr></thead><tbody>${traceRows}</tbody></table></div>
${uncovered.length ? `<p class="bad">Not covered by any test: ${uncovered.map(esc).join(", ")}</p>` : ""}

<h2>4. Unknowns</h2>
${unknownBlock}
</main></body></html>
`;
fs.writeFileSync(outPath, html, "utf8");
console.log(`wrote ${outPath} (number lines: ${lines.length}, matrix cells: ${matrix.length}, trace rows: ${elements.length}, unknowns: ${unknowns.length}, uncovered: ${uncovered.length})`);
