#!/usr/bin/env node
// SessionEnd hook: reads { session_id, transcript_path } from stdin and writes
// reports/ws2/<date>-<session-id>.md with the session's cost per model.
//
// Two independent numbers are reported and reconciled:
// 1. Claude Code's own cost: the last line with type "cost-state" in the main transcript.
//    It has totalCostUSD and modelUsage.<model>.{inputTokens, outputTokens, cacheReadInputTokens,
//    cacheCreationInputTokens, webSearchRequests, costUSD}, and also covers calls that are never
//    written as assistant lines (for example background Haiku calls).
// 2. A recomputation from the assistant lines, priced with pricing.json, which pricing.mjs keeps
//    in sync with the official pricing page. Transcript facts this relies on:
//    - Usage lives on lines with type "assistant", in message.usage; the model is message.model.
//    - One API response is split into several lines (one per content block) that repeat the
//      same message.id and the same usage, so lines are deduplicated by message.id.
//    - Subagent usage is not in the main file; it is in <session-id>/subagents/agent-*.jsonl
//      next to the main transcript, with a matching .meta.json (agentType).
//    - usage.cache_creation splits writes into ephemeral_5m_input_tokens / ephemeral_1h_input_tokens.
//    - usage.speed is "standard" or "fast"; usage.inference_geo is "global" by default.

import fs from "node:fs";
import path from "node:path";
import { loadPricing } from "./pricing.mjs";

const MISMATCH_THRESHOLD = 0.02;

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // A partially written last line is possible; skip it.
    }
  }
  return out;
}

function subagentFiles(transcriptPath, sessionId) {
  const dir = path.join(path.dirname(transcriptPath), sessionId, "subagents");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const file = path.join(dir, f);
      let agentType = null;
      try {
        agentType = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, ".meta.json"), "utf8")).agentType ?? null;
      } catch {}
      return { file, agentType };
    });
}

// Collects one usage record per API response (deduplicated by message.id; the last line wins).
function collectResponses(sources) {
  const byId = new Map();
  for (const { file, origin } of sources) {
    for (const o of readJsonl(file)) {
      if (o.type !== "assistant" || !o.message?.usage) continue;
      const m = o.message;
      const key = m.id || o.requestId || o.uuid;
      byId.set(key, { model: m.model || "unknown", usage: m.usage, origin, timestamp: o.timestamp });
    }
  }
  return [...byId.values()];
}

function lastCostState(lines, sessionId) {
  let last = null;
  for (const o of lines) if (o.type === "cost-state" && (!o.sessionId || o.sessionId === sessionId)) last = o;
  return last;
}

function tokensOf(u) {
  const cc = u.cache_creation;
  const write1h = cc?.ephemeral_1h_input_tokens ?? 0;
  // Without a TTL breakdown, the API default (5m) is assumed.
  const write5m = cc ? cc.ephemeral_5m_input_tokens ?? 0 : u.cache_creation_input_tokens ?? 0;
  return {
    input: u.input_tokens ?? 0,
    cache_write_5m: write5m,
    cache_write_1h: write1h,
    cache_read: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    thinking: u.output_tokens_details?.thinking_tokens ?? 0,
    web_search: u.server_tool_use?.web_search_requests ?? 0,
    web_fetch: u.server_tool_use?.web_fetch_requests ?? 0,
  };
}

const PRICED = ["input", "cache_write_5m", "cache_write_1h", "cache_read", "output"];

function ratesFor(pricing, model, usage, t) {
  const base = pricing.models[model];
  if (!base) return null;
  if (usage.speed === "fast") return base.fast ?? null;
  const lc = base.long_context;
  if (lc && t.input + t.cache_read + t.cache_write_5m + t.cache_write_1h > lc.threshold_prompt_tokens) return lc;
  return base;
}

function emptyRow() {
  return {
    requests: 0, input: 0, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, output: 0,
    thinking: 0, web_search: 0, web_fetch: 0, fast: 0,
    cost: { input: 0, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, output: 0, web_search: 0 },
    unpriced: 0,
  };
}

function add(row, t, rates, usage, pricing) {
  row.requests++;
  for (const k of Object.keys(t)) row[k] += t[k];
  if (usage.speed === "fast") row.fast++;
  if (!rates) {
    row.unpriced++;
    return;
  }
  const geo = usage.inference_geo && usage.inference_geo !== "global" ? pricing.us_only_inference_multiplier ?? 1 : 1;
  for (const k of PRICED) row.cost[k] += (t[k] * rates[k] * geo) / 1e6;
  if (pricing.web_search_per_1k_requests != null) row.cost.web_search += (t.web_search * pricing.web_search_per_1k_requests) / 1000;
}

const sum = (c) => Object.values(c).reduce((a, b) => a + b, 0);
const n = (x) => (x ?? 0).toLocaleString("en-US");
const usd = (x) => (x == null ? "—" : `$${x.toFixed(4)}`);

function claudeCodeTable(cs) {
  const lines = [
    "| Model | Input | Cache write | Cache read | Output | Web search | **Cost** |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const [model, u] of Object.entries(cs.modelUsage || {})) {
    lines.push(
      `| ${model} | ${n(u.inputTokens)} | ${n(u.cacheCreationInputTokens)} | ${n(u.cacheReadInputTokens)} | ${n(u.outputTokens)} | ${n(u.webSearchRequests)} | **${usd(u.costUSD)}** |`
    );
  }
  lines.push(`| **Total** | | | | | | **${usd(cs.totalCostUSD)}** |`);
  return lines.join("\n");
}

function usageTable(rows) {
  const lines = [
    "| Model | Origin | Requests | Input | Cache write 5m | Cache write 1h | Cache read | Output | (of which thinking) | Web search | Fast |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const [key, r] of rows) {
    const [model, origin] = key.split("\u0000");
    lines.push(
      `| ${model} | ${origin} | ${r.requests} | ${n(r.input)} | ${n(r.cache_write_5m)} | ${n(r.cache_write_1h)} | ${n(r.cache_read)} | ${n(r.output)} | ${n(r.thinking)} | ${r.web_search} | ${r.fast} |`
    );
  }
  return lines.join("\n");
}

function costTable(rows, total) {
  const lines = [
    "| Model | Input | Cache write 5m | Cache write 1h | Cache read | Output | Web search | **Total** |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const [model, r] of rows) {
    const c = r.cost;
    const flag = r.unpriced ? ` ⚠ ${r.unpriced} unpriced request(s)` : "";
    lines.push(
      `| ${model}${flag} | ${usd(c.input)} | ${usd(c.cache_write_5m)} | ${usd(c.cache_write_1h)} | ${usd(c.cache_read)} | ${usd(c.output)} | ${usd(c.web_search)} | **${usd(sum(c))}** |`
    );
  }
  lines.push(`| **Total** | | | | | | | **${usd(total)}** |`);
  return lines.join("\n");
}

function reconciliation(cs, byModel, recomputedTotal) {
  const models = new Set([...Object.keys(cs?.modelUsage || {}), ...byModel.keys()]);
  const lines = [
    "| Model | Claude Code | Recomputed | Difference | |",
    "|---|---:|---:|---:|---|",
  ];
  const mismatches = [];
  const row = (label, a, b) => {
    const diff = a != null && b != null ? b - a : null;
    const rel = diff != null && a > 0 ? diff / a : null;
    const bad = a == null || b == null || (rel != null && Math.abs(rel) > MISMATCH_THRESHOLD);
    if (bad) mismatches.push(label);
    const pct = rel != null ? ` (${rel >= 0 ? "+" : ""}${(rel * 100).toFixed(1)}%)` : "";
    lines.push(`| ${label} | ${usd(a)} | ${usd(b)} | ${diff != null ? usd(diff) + pct : "—"} | ${bad ? "⚠" : "✓"} |`);
  };
  for (const m of models) row(m, cs?.modelUsage?.[m]?.costUSD ?? null, byModel.has(m) ? sum(byModel.get(m).cost) : null);
  row("**Total**", cs?.totalCostUSD ?? null, recomputedTotal);
  return { table: lines.join("\n"), mismatches };
}

function priceTable(pricing, models) {
  const lines = [
    `| Model | Tier | Input | Cache write 5m | Cache write 1h | Cache read | Output |`,
    "|---|---|---:|---:|---:|---:|---:|",
  ];
  const cell = (r, k) => `$${r[k]}${(r.derived || []).includes(k) ? "*" : ""}`;
  for (const model of models) {
    const p = pricing.models[model];
    if (!p) {
      lines.push(`| ${model} | — | not on the pricing page | | | | |`);
      continue;
    }
    const tiers = [["standard", p], ["fast", p.fast], [`prompt > ${n(p.long_context?.threshold_prompt_tokens)}`, p.long_context]];
    for (const [tier, r] of tiers) {
      if (r) lines.push(`| ${model} | ${tier} | ${PRICED.map((k) => cell(r, k)).join(" | ")} |`);
    }
  }
  return lines.join("\n");
}

function priceStatusLine(pricing, status) {
  const when = pricing.fetched_at;
  if (status.kind === "refreshed") return `fetched from ${pricing.source} at ${when}`;
  if (status.kind === "cached") return `from ${pricing.source}, cached at ${when} (refreshed when older than 24 h)`;
  return `⚠ **stale**: refresh failed (${status.error}); using the copy fetched at ${when}`;
}

async function main() {
  const input = JSON.parse(readStdin() || "{}");
  const sessionId = input.session_id;
  const transcriptPath = input.transcript_path;
  if (!sessionId || !transcriptPath) {
    console.error("session-cost-report: stdin must contain session_id and transcript_path");
    return;
  }

  let pricing, status;
  try {
    ({ pricing, status } = await loadPricing());
  } catch (e) {
    pricing = { models: {}, source: "—", fetched_at: "—" };
    status = { kind: "stale", error: e.message };
  }

  const mainLines = readJsonl(transcriptPath);
  const costState = lastCostState(mainLines, sessionId);
  const subs = subagentFiles(transcriptPath, sessionId);
  const sources = [
    { file: transcriptPath, origin: "main" },
    ...subs.map((s) => ({ file: s.file, origin: `subagent${s.agentType ? `: ${s.agentType}` : ""}` })),
  ];

  const byModelOrigin = new Map();
  const byModel = new Map();
  let first = null;
  let last = null;
  for (const r of collectResponses(sources)) {
    const t = tokensOf(r.usage);
    const rates = ratesFor(pricing, r.model, r.usage, t);
    const k = `${r.model}\u0000${r.origin}`;
    if (!byModelOrigin.has(k)) byModelOrigin.set(k, emptyRow());
    if (!byModel.has(r.model)) byModel.set(r.model, emptyRow());
    add(byModelOrigin.get(k), t, rates, r.usage, pricing);
    add(byModel.get(r.model), t, rates, r.usage, pricing);
    if (r.timestamp) {
      if (!first || r.timestamp < first) first = r.timestamp;
      if (!last || r.timestamp > last) last = r.timestamp;
    }
  }

  const recomputed = [...byModel.values()].reduce((a, r) => a + sum(r.cost), 0);
  const unpriced = [...byModel.entries()].filter(([, r]) => r.unpriced).map(([m]) => m);
  const rec = reconciliation(costState, byModel, recomputed);
  const headline = costState?.totalCostUSD ?? recomputed;

  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const outDir = path.join(projectDir, "reports", "ws2");
  const outFile = path.join(outDir, `${date}-${sessionId}.md`);

  const md = [
    `# Session cost report`,
    "",
    `- **Session:** \`${sessionId}\``,
    `- **Ended:** ${now.toISOString()}${input.reason ? ` (reason: ${input.reason})` : ""}`,
    `- **First / last response:** ${first ?? "—"} / ${last ?? "—"}`,
    `- **Transcripts read:** main + ${subs.length} subagent file(s)`,
    `- **Total cost:** **${usd(headline)}** ${costState ? "(Claude Code's own calculation)" : "(recomputed; no cost-state line in the transcript)"}`,
    `- **Prices:** ${priceStatusLine(pricing, status)}`,
    "",
    "> On a subscription plan these are API list-price equivalents, not amounts billed.",
    "",
    "## Cost per model, as calculated by Claude Code",
    "",
    costState
      ? claudeCodeTable(costState) +
        (costState.hasUnknownModelCost ? "\n\n> ⚠ Claude Code reports a model it has no price for (hasUnknownModelCost)." : "")
      : "No `cost-state` line found in the transcript, so only the recomputation below is available.",
    "",
    "## Recomputed from the transcript",
    "",
    "### Usage per model",
    "",
    usageTable(byModelOrigin),
    "",
    "Thinking tokens are already included in Output. Requests are counted once per API response (message.id).",
    "",
    "### Cost per model (USD)",
    "",
    costTable(byModel, recomputed),
    "",
    ...(unpriced.length ? [`> ⚠ No price on the pricing page for: ${unpriced.join(", ")}. Their cost is not included.`, ""] : []),
    "## Reconciliation",
    "",
    rec.table,
    "",
    rec.mismatches.length
      ? `⚠ Differs by more than ${MISMATCH_THRESHOLD * 100}% (or missing on one side): ${rec.mismatches.join(", ")}. ` +
        "Claude Code also counts calls that are not written to the transcript as assistant lines, so the recomputation can be lower."
      : `✓ Both calculations agree within ${MISMATCH_THRESHOLD * 100}%.`,
    "",
    "## Prices used (USD per 1M tokens)",
    "",
    priceTable(pricing, [...new Set([...byModel.keys(), ...Object.keys(costState?.modelUsage || {})])]),
    "",
    `\\* derived: fast-mode cache prices keep the model's own cache multipliers, as the pricing page states. ` +
      `Web search: ${pricing.web_search_per_1k_requests != null ? `$${pricing.web_search_per_1k_requests} per 1,000 searches` : "unknown"}. ` +
      `US-only inference multiplier: ${pricing.us_only_inference_multiplier ?? "unknown"}.`,
    "",
  ].join("\n");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, md, "utf8");
}

try {
  await main();
} catch (e) {
  // Never block session shutdown.
  console.error(`session-cost-report: ${e.stack || e}`);
}
