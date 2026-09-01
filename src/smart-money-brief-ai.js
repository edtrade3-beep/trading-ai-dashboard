// smart-money-brief-ai.js — reads across dark pool, options flow, insider
// buys, COT institutional positioning, and short-interest changes to
// synthesize what the "smart money" is actually doing versus the
// mainstream headline narrative. Extracted from routes/market.js
// (2026-09-01 audit fix #5b).
"use strict";
const { withTimeout, fetchJsonSafe } = require("./utils");
const { PORT } = require("./config");
const { callAnthropicApi, MODELS } = require("./anthropic");

async function buildSmartMoneyBrief(symbols, key) {
  const base = `http://127.0.0.1:${PORT}`;
  const q = symbols.map(encodeURIComponent).join(",");

  const [cot, flow, insider, dp, shortChg] = await Promise.all([
    withTimeout(fetchJsonSafe(`${base}/api/cot/status`), 8000, null),
    withTimeout(fetchJsonSafe(`${base}/api/market/options-flow?symbols=${q}`), 8000, null),
    withTimeout(fetchJsonSafe(`${base}/api/scanner/insider`), 8000, null),
    withTimeout(fetchJsonSafe(`${base}/api/market/darkpool`), 8000, null),
    withTimeout(fetchJsonSafe(`${base}/api/market/short-changes`), 8000, null),
  ]);

  const lines = [];
  const bias = cot?.summary || cot?.ok ? cot.summary : null;
  if (bias) {
    lines.push(`COT institutional positioning (${bias.reportDate || "latest"}): equities ${bias.equityBias || "?"}, bonds ${bias.bondBias || "?"}, dollar ${bias.dollarBias || "?"}, gold ${bias.goldBias || "?"}, oil ${bias.oilBias || "?"}, VIX ${bias.vixBias || "?"}.`);
  } else lines.push("COT positioning: unavailable this run.");

  if (flow?.summary) {
    const f = flow.summary;
    const topFlow = (flow.bySymbol || []).slice(0, 5).map(s => `${s.symbol} C/P ${s.callPutRatio}`).join(", ");
    lines.push(`Options flow (${symbols.join(",")}): $${Math.round((f.callNotional || 0) / 1000)}K call vs $${Math.round((f.putNotional || 0) / 1000)}K put notional. Per-symbol call/put ratio: ${topFlow || "n/a"}.${flow.source?.includes("estimated") ? " (estimated from price/volume, not live options tape)" : ""}`);
  } else lines.push("Options flow: unavailable this run.");

  if (insider?.ok && insider.results?.length) {
    const top = insider.results.slice(0, 8).map(r => r.ticker || r.symbol).filter(Boolean).join(", ");
    // The scanner covers 3 days (see routes/insider.js — a real SEC
    // rate-limit constraint, not an arbitrary choice), not 14. This line
    // said "14 days" until now, a stale claim from before that fix —
    // wrong on a feature whose whole pitch is "not what the headlines say."
    lines.push(`Insider buying (Form 4, last 3 days) — active names: ${top}.`);
  } else lines.push("Insider buying: no notable Form 4 buys scanned this run.");

  if (dp?.ok && dp.prints?.length) {
    // GET /api/market/darkpool's prints are shaped { ticker, ... }, not
    // { symbol, ... } — same bug class as the short-interest fix above,
    // just masked locally since this branch only fires with a real
    // Unusual Whales key configured.
    const biggest = dp.prints.slice(0, 5).map(p => `${p.ticker} $${Math.round((p.value || 0) / 1e6)}M`).join(", ");
    lines.push(`Dark pool prints: ${biggest}.`);
  } else lines.push("Dark pool: unavailable this run (no data provider configured).");

  if (shortChg?.ok && (shortChg.increasing?.length || shortChg.covering?.length)) {
    // /api/market/short-changes returns { sym, ... } not { symbol, ... } —
    // reading .symbol here silently produced "" for every entry, so this
    // line rendered as "increasing short bets in , , ,": commas with
    // nothing between them, joined from an array of undefined.
    const inc = (shortChg.increasing || []).slice(0, 4).map(s => s.sym).join(", ");
    const cov = (shortChg.covering || []).slice(0, 4).map(s => s.sym).join(", ");
    lines.push(`Short interest changes: increasing short bets in ${inc || "none notable"}; short covering in ${cov || "none notable"}.`);
  } else lines.push("Short interest changes: unavailable this run.");

  const system = `You are a skeptical institutional strategist who ignores financial-media narratives and reads only positioning data — dark pool prints, options flow, insider Form 4 buys, CFTC Commitments of Traders, and short interest. Your job: tell the trader what the SMART MONEY is actually doing right now, and where that likely CONTRADICTS or gets ahead of the mainstream headline story. Be specific and honest — if the data is thin or mixed, say so plainly rather than forcing a narrative. Format:\nWHAT'S REALLY HAPPENING: 2-3 tight sentences on the actual positioning picture.\nVS. THE HEADLINES: one sentence on how this differs from (or confirms) what mainstream financial media is likely saying today.\nWATCH: 1-2 specific names or signals worth tracking from this data.\nUnder 140 words total. No preamble, no disclaimers, no "consult a financial advisor." Plain text only — no markdown, no asterisks, no bullet symbols, no headers.`;
  const prompt = `Today's cross-market positioning data:\n${lines.join("\n")}\n\nWhat is smart money actually doing, and how does that compare to what the headlines are probably saying?`;

  const brief = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 260, system, cache: true });
  return { brief: (brief || "").trim(), sources: lines };
}

module.exports = { buildSmartMoneyBrief };
