// Keeps pricing.json in sync with the official pricing page.
//
// Page facts this relies on (checked against the real page):
// - "## Model pricing" is followed by a table with the columns
//   Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens,
//   and cells like "$0.20 / MTok<sup>2</sup>".
// - Model names look like "Claude Opus 5.5", sometimes followed by a link or a note in brackets.
//   Haiku 5.5 has two rows, "(for prompts up to 100,000 tokens)" and "(for prompts over 100,000 tokens)".
// - "### Fast mode pricing" has a table Model | Input | Output, where one row can name several
//   models ("Claude Opus 5 / Claude Opus 4.8"). Cache multipliers apply on top of fast prices.
// - Web search is "$10 USD per 1,000 searches"; US-only inference "incurs a 1.1x multiplier".
//
// Run directly (`node pricing.mjs`) to force a refresh.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PRICING_URL = "https://platform.claude.com/docs/en/about-claude/pricing.md";
export const PRICING_FILE = path.join(here, "pricing.json");
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const COLUMNS = {
  input: /base input/i,
  cache_write_5m: /5m cache write/i,
  cache_write_1h: /1h cache write/i,
  cache_read: /cache hits/i,
  output: /output/i,
};

const modelId = (name) => name.trim().toLowerCase().replace(/[\s.]+/g, "-");
const price = (cell) => {
  const m = cell.replace(/<sup>.*?<\/sup>/g, "").match(/\$\s*([\d.,]+)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};

// Returns the rows of the first Markdown table after the given heading, as arrays of cells.
function tableAfter(md, heading) {
  const lines = md.split(/\r?\n/);
  let i = lines.findIndex((l) => heading.test(l));
  if (i < 0) return null;
  while (i < lines.length && !lines[i].trim().startsWith("|")) i++;
  const rows = [];
  for (; i < lines.length && lines[i].trim().startsWith("|"); i++) {
    rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  }
  return rows.length > 2 ? { header: rows[0], body: rows.slice(2) } : null;
}

function round(x) {
  return Math.round(x * 1e6) / 1e6;
}

export function parsePricingPage(md) {
  const t = tableAfter(md, /^##\s+Model pricing/i);
  if (!t) throw new Error("model pricing table not found");
  const col = {};
  for (const [key, re] of Object.entries(COLUMNS)) {
    col[key] = t.header.findIndex((h) => re.test(h));
    if (col[key] < 0) throw new Error(`column for ${key} not found in: ${t.header.join(" | ")}`);
  }

  const models = {};
  for (const row of t.body) {
    const nameCell = row[0].replace(/\[[^\]]*\]\([^)]*\)/g, "");
    const name = nameCell.match(/^Claude [A-Za-z]+ [\d.]+/);
    if (!name) continue;
    const rates = {};
    for (const key of Object.keys(COLUMNS)) rates[key] = price(row[col[key]]);
    if (Object.values(rates).some((v) => v == null)) continue;
    const id = modelId(name[0]);
    const tier = nameCell.match(/prompts (up to|over) ([\d,]+) tokens/i);
    if (tier && /over/i.test(tier[1])) {
      models[id] = models[id] || {};
      models[id].long_context = { threshold_prompt_tokens: Number(tier[2].replace(/,/g, "")), ...rates };
    } else {
      models[id] = { ...rates, ...(models[id] || {}) };
    }
  }
  if (!Object.keys(models).length) throw new Error("no model rows parsed");

  const fast = tableAfter(md, /^###\s+Fast mode pricing/i);
  if (fast) {
    const inCol = fast.header.findIndex((h) => /input/i.test(h));
    const outCol = fast.header.findIndex((h) => /output/i.test(h));
    for (const row of fast.body) {
      for (const name of row[0].split("/")) {
        const base = models[modelId(name)];
        const input = price(row[inCol]);
        const output = price(row[outCol]);
        if (!base || input == null || output == null) continue;
        // The page gives only input/output; cache prices keep the model's own multipliers.
        base.fast = {
          input,
          output,
          cache_write_5m: round((input * base.cache_write_5m) / base.input),
          cache_write_1h: round((input * base.cache_write_1h) / base.input),
          cache_read: round((input * base.cache_read) / base.input),
          derived: ["cache_write_5m", "cache_write_1h", "cache_read"],
        };
      }
    }
  }

  const search = md.match(/\$\s*([\d.]+)\s*USD per 1,000 searches/i);
  const geo = md.match(/US-only inference[^.]*?incurs a ([\d.]+)x multiplier/i);
  return {
    currency: "USD",
    unit: "per 1M tokens",
    source: PRICING_URL,
    web_search_per_1k_requests: search ? Number(search[1]) : null,
    us_only_inference_multiplier: geo ? Number(geo[1]) : null,
    models,
  };
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(PRICING_FILE, "utf8"));
  } catch {
    return null;
  }
}

// Returns { pricing, status } where status says whether prices are fresh, refreshed or stale.
export async function loadPricing({ force = false, timeoutMs = 5000 } = {}) {
  const cached = readCache();
  const age = cached?.fetched_at ? Date.now() - Date.parse(cached.fetched_at) : Infinity;
  if (!force && age < MAX_AGE_MS) return { pricing: cached, status: { kind: "cached" } };
  try {
    const res = await fetch(PRICING_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pricing = { fetched_at: new Date().toISOString(), ...parsePricingPage(await res.text()) };
    fs.writeFileSync(PRICING_FILE, JSON.stringify(pricing, null, 2) + "\n", "utf8");
    return { pricing, status: { kind: "refreshed" } };
  } catch (e) {
    if (!cached) throw new Error(`cannot fetch prices and no cache: ${e.message}`);
    return { pricing: cached, status: { kind: "stale", error: e.message } };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { pricing, status } = await loadPricing({ force: true });
  console.log(status.kind, status.error || "", `${Object.keys(pricing.models).length} models, fetched_at ${pricing.fetched_at}`);
}
