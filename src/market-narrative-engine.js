"use strict";

// market-narrative-engine.js — Master Agent, Market Narrative (2026-09-11,
// explicit user request in Arabic: "كيف داير السوق اليوم" — "how's the
// market doing today" — asking for macro context, what's moving up/down
// with real momentum, breakout/BOS/CHoCH structure reads, and real
// buy/sell points). Also the direct answer to the user's separate,
// explicit instruction: "I dont want to use anthropic api. Just use data
// from my platform for master agent" — this file makes ZERO Claude calls.
// Every field is a real, already-computed platform read:
//   - Macro quotes: /api/market/quote (real SPY/QQQ/IWM/DIA/VIX prices)
//   - Regime: /api/market/opportunities' canonical marketRegime
//   - Movers + real intraday momentum (gap/RVOL/VWAP/opening-range
//     breakout): /api/market/daytrade-scan (src/routes/market.js's
//     fetchDayTradeScanRows — real Alpaca 15-min bars, not a guess)
//   - Real structure breaks: /api/market/smc?symbol=X (src/smc-engine.js's
//     detectBOSChoCh — real swing-high/low detection on real daily bars)
//   - Real buy point / stop / targets / verdict: /api/market/trend-
//     screen?withDecision=1's canonical AssetDecision — the SAME one
//     Morning Mode and Deep Scan use, never a second, independently
//     computed number.
const { getJson } = require("./morning-mode-engine");

// Real, disclosed scope limit: this platform's own short-side scoring has
// documented risk-model gaps (see docs/ARCHITECTURE_MIGRATION.md's "Known
// constraints") — there is no real, validated short-entry price system to
// report. A "sell point" below is always the real stop-loss level for an
// existing long (protect capital), or the real AVOID/EXIT/REDUCE verdict
// with its real reasons — never a fabricated short-entry price.
const TOP_MOVER_LIMIT = 3; // per direction — real BOS/CHoCH + entry/stop fetched for this many, keeps this bounded

async function buildMarketNarrative() {
  const [quotes, opp, daytrade] = await Promise.all([
    getJson(`/api/market/quote?symbols=${encodeURIComponent("SPY,QQQ,IWM,DIA,^VIX")}`),
    getJson("/api/market/opportunities"),
    getJson("/api/market/daytrade-scan"),
  ]);

  const macro = Array.isArray(quotes) ? quotes.filter((q) => q && q.symbol) : [];
  const marketRegime = opp && opp.ok ? opp.marketRegime : null;

  const rows = Array.isArray(daytrade?.rows) ? daytrade.rows : [];
  const moversUpRaw = [...rows].filter((r) => Number(r.chgPct) > 0).sort((a, b) => b.chgPct - a.chgPct).slice(0, TOP_MOVER_LIMIT);
  const moversDownRaw = [...rows].filter((r) => Number(r.chgPct) < 0).sort((a, b) => a.chgPct - b.chgPct).slice(0, TOP_MOVER_LIMIT);
  const breakouts = rows.filter((r) => r.orBreakout).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5)
    .map((r) => ({ symbol: r.symbol, price: r.price, chgPct: r.chgPct, rvol: r.rvol }));

  const focusSymbols = [...new Set([...moversUpRaw.map((r) => r.symbol), ...moversDownRaw.map((r) => r.symbol)])];

  let decisionRows = [];
  if (focusSymbols.length) {
    const screen = await getJson(`/api/market/trend-screen?symbols=${encodeURIComponent(focusSymbols.join(","))}&withDecision=1`);
    decisionRows = Array.isArray(screen?.results) ? screen.results : [];
  }

  const structureRows = await Promise.all(focusSymbols.map(async (sym) => {
    const smc = await getJson(`/api/market/smc?symbol=${encodeURIComponent(sym)}`);
    return { symbol: sym, bos: (smc && smc.ok !== false && smc.bos) || null, choch: (smc && smc.ok !== false && smc.choch) || null };
  }));

  const enrich = (mover) => {
    const decision = decisionRows.find((r) => r.symbol === mover.symbol);
    const ad = decision?.assetDecision || null;
    const structure = structureRows.find((s) => s.symbol === mover.symbol);
    return {
      symbol: mover.symbol,
      price: mover.price,
      chgPct: mover.chgPct,
      gapPct: mover.gapPct,
      rvol: mover.rvol,
      aboveVwap: mover.aboveVwap,
      orBreakout: mover.orBreakout,
      verdict: ad?.verdict || null,
      buyPoint: ad?.entry ?? null,
      stop: ad?.stop ?? null,
      targets: Array.isArray(ad?.targets) ? ad.targets : [],
      reasons: Array.isArray(ad?.reasons) ? ad.reasons.slice(0, 2) : [],
      bos: structure?.bos || null,
      choch: structure?.choch || null,
    };
  };

  return {
    generatedAt: new Date().toISOString(),
    macro,
    marketRegime,
    moversUp: moversUpRaw.map(enrich),
    moversDown: moversDownRaw.map(enrich),
    breakouts,
    universeSize: rows.length,
  };
}

const BUY_FAMILY = new Set(["STRONG_BUY", "BUY"]);
const SELL_FAMILY = new Set(["EXIT", "REDUCE", "AVOID"]);

function renderMoverBlock(m) {
  const lines = [];
  const dir = m.chgPct >= 0 ? "🟢" : "🔴";
  lines.push(`${dir} ${m.symbol} — ${m.chgPct >= 0 ? "+" : ""}${m.chgPct}% @ ${m.price}${m.rvol != null ? ` · RVOL ${m.rvol}x` : ""}${m.aboveVwap ? " · فوق VWAP" : " · تحت VWAP"}${m.orBreakout ? " · اختراق نطاق الافتتاح (Breakout) ✅" : ""}`);
  if (m.bos) lines.push(`   Structure: ${m.bos.label} (مستوى ${m.bos.level})`);
  if (m.choch) lines.push(`   ChoCh: ${m.choch.label}`);
  if (m.verdict) {
    const isBuy = BUY_FAMILY.has(m.verdict);
    const isSell = SELL_FAMILY.has(m.verdict);
    lines.push(`   الفيردكت: ${m.verdict}${isBuy ? " (شراء)" : isSell ? " (بيع/تجنب)" : ""}`);
    if (isBuy && m.buyPoint != null) lines.push(`   نقطة الشراء: ${m.buyPoint} · وقف الخسارة: ${m.stop ?? "?"} · الهدف: ${m.targets?.[0] ?? "?"}`);
    else if (isSell && m.stop != null) lines.push(`   إذا كنت حاملها: وقف الخسارة الحقيقي ${m.stop} (لا توجد نقطة بيع على المكشوف حقيقية بعد — المنصة لا تدعم ذلك رسمياً)`);
    if (m.reasons.length) lines.push(`   السبب: ${m.reasons.join("؛ ")}`);
  } else {
    lines.push("   لا يوجد فيردكت حقيقي متاح لهذا السهم الآن.");
  }
  return lines.join("\n");
}

function renderMarketNarrativeText(n) {
  const lines = ["📊 نظرة عامة على السوق اليوم (Market Narrative)"];

  if (n.marketRegime) {
    lines.push("", `الوضع العام: ${n.marketRegime.regime || "?"} (score ${n.marketRegime.score ?? "?"}, confidence ${n.marketRegime.confidence ?? "?"}%)`);
    if (Array.isArray(n.marketRegime.reasons) && n.marketRegime.reasons.length) lines.push(`السبب: ${n.marketRegime.reasons.join("؛ ")}`);
  } else {
    lines.push("", "الوضع العام: غير متوفر حالياً.");
  }

  if (n.macro.length) {
    lines.push("", "المؤشرات الكبرى (Macro):");
    n.macro.forEach((q) => lines.push(`${q.symbol}: ${q.price} (${q.changesPercentage >= 0 ? "+" : ""}${q.changesPercentage}%)`));
  }

  lines.push("", `📈 الأسهم الصاعدة اليوم بزخم حقيقي (من أصل ${n.universeSize} سهم تمت مراقبتها):`);
  if (n.moversUp.length) n.moversUp.forEach((m) => lines.push(renderMoverBlock(m)));
  else lines.push("لا توجد حركة صاعدة قوية حقيقية الآن.");

  lines.push("", "📉 الأسهم الهابطة اليوم:");
  if (n.moversDown.length) n.moversDown.forEach((m) => lines.push(renderMoverBlock(m)));
  else lines.push("لا توجد حركة هابطة قوية حقيقية الآن.");

  if (n.breakouts.length) {
    lines.push("", "🚀 اختراقات حقيقية لنطاق الافتتاح (Opening Range Breakouts) اليوم:");
    n.breakouts.forEach((b) => lines.push(`${b.symbol} @ ${b.price} (${b.chgPct >= 0 ? "+" : ""}${b.chgPct}%, RVOL ${b.rvol ?? "?"}x)`));
  }

  return lines.join("\n");
}

module.exports = { buildMarketNarrative, renderMarketNarrativeText };
