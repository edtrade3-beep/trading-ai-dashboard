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
const { getFeed: getNewsFeed, isReady: newsStoreReady } = require("./news/store");
const { getUpcomingMacroEvents } = require("./macro-calendar");

// Real, disclosed scope limit: this platform's own short-side scoring has
// documented risk-model gaps (see docs/ARCHITECTURE_MIGRATION.md's "Known
// constraints") — there is no real, validated short-entry price system to
// report. A "sell point" below is always the real stop-loss level for an
// existing long (protect capital), or the real AVOID/EXIT/REDUCE verdict
// with its real reasons — never a fabricated short-entry price.
const TOP_MOVER_LIMIT = 3; // per direction — real BOS/CHoCH + entry/stop fetched for this many, keeps this bounded

// Real regime -> plain BULLISH/BEARISH/NEUTRAL wording (2026-09-12 command-
// table update: "bullish, bearish, or neutral — and why"). market-regime-
// engine.js's own 5-value REGIMES enum already carries the real "why"
// (reasons array) — this only relabels the enum itself into the three
// words the user actually asked for, never invents a new judgment.
function stanceFor(regimeLabel) {
  if (regimeLabel === "RISK_ON" || regimeLabel === "SELECTIVE_RISK_ON") return "BULLISH";
  if (regimeLabel === "RISK_OFF" || regimeLabel === "CRISIS") return "BEARISH";
  if (regimeLabel === "NEUTRAL") return "NEUTRAL";
  return null; // an unrecognized/absent regime is left honestly unlabeled, never guessed
}

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

  // Real major company/macro news (2026-09-12 command-table update) — the
  // same real, scored Postgres-backed feed /majornews already serves on
  // Telegram (src/news/store.js). Honestly empty (never fabricated) when
  // the news store isn't configured/reachable, exactly like /majornews's
  // own real degraded-state message.
  let news = [];
  let newsAvailable = false;
  try {
    newsAvailable = newsStoreReady();
    if (newsAvailable) {
      const feed = await getNewsFeed({ minImpact: 70, sinceMinutes: 240, limit: 8 });
      news = feed?.ok ? feed.rows : [];
    }
  } catch { /* honestly empty on any real failure — never fabricated */ }

  // Real, hand-maintained economic-calendar entries (2026-09-12) — see
  // macro-calendar.js's own header: no live economic-calendar provider
  // exists in this app, so this is a real, git-tracked, honestly-empty-
  // by-default seed file, never an invented release date.
  const economicReleases = getUpcomingMacroEvents({ windowHours: 72 });

  return {
    generatedAt: new Date().toISOString(),
    macro,
    marketRegime,
    stance: marketRegime ? stanceFor(marketRegime.regime) : null,
    news,
    newsAvailable,
    economicReleases,
    moversUp: moversUpRaw.map(enrich),
    moversDown: moversDownRaw.map(enrich),
    breakouts,
    universeSize: rows.length,
  };
}

const BUY_FAMILY = new Set(["STRONG_BUY", "BUY"]);
const SELL_FAMILY = new Set(["EXIT", "REDUCE", "AVOID"]);

// Rendered in English (explicit user request, 2026-09-11: "For Market,
// answer me with English no Arabic") even though the trigger phrase itself
// stays Arabic ("كيف داير السوق اليوم") — only the reply language changed.
function renderMoverBlock(m) {
  const lines = [];
  const dir = m.chgPct >= 0 ? "🟢" : "🔴";
  lines.push(`${dir} ${m.symbol} — ${m.chgPct >= 0 ? "+" : ""}${m.chgPct}% @ ${m.price}${m.rvol != null ? ` · RVOL ${m.rvol}x` : ""}${m.aboveVwap ? " · above VWAP" : " · below VWAP"}${m.orBreakout ? " · Opening Range Breakout ✅" : ""}`);
  if (m.bos) lines.push(`   Structure: ${m.bos.label} (level ${m.bos.level})`);
  if (m.choch) lines.push(`   ChoCh: ${m.choch.label}`);
  if (m.verdict) {
    const isBuy = BUY_FAMILY.has(m.verdict);
    const isSell = SELL_FAMILY.has(m.verdict);
    lines.push(`   Verdict: ${m.verdict}${isBuy ? " (BUY)" : isSell ? " (SELL/AVOID)" : ""}`);
    if (isBuy && m.buyPoint != null) lines.push(`   Buy point: ${m.buyPoint} · Stop: ${m.stop ?? "?"} · Target: ${m.targets?.[0] ?? "?"}`);
    else if (isSell && m.stop != null) lines.push(`   If holding: real stop-loss ${m.stop} (no real short-entry price yet — the platform doesn't officially support that)`);
    if (m.reasons.length) lines.push(`   Why: ${m.reasons.join("; ")}`);
  } else {
    lines.push("   No real verdict available for this symbol right now.");
  }
  return lines.join("\n");
}

function renderMarketNarrativeText(n) {
  const lines = ["📊 Today's Market Narrative"];

  if (n.marketRegime) {
    const stanceLine = n.stance ? `${n.stance} — ` : "";
    lines.push("", `${stanceLine}Regime: ${n.marketRegime.regime || "?"} (score ${n.marketRegime.score ?? "?"}, confidence ${n.marketRegime.confidence ?? "?"}%)`);
    if (Array.isArray(n.marketRegime.reasons) && n.marketRegime.reasons.length) lines.push(`Why: ${n.marketRegime.reasons.join("; ")}`);
  } else {
    lines.push("", "Regime: unavailable right now.");
  }

  if (n.macro.length) {
    lines.push("", "Macro:");
    n.macro.forEach((q) => lines.push(`${q.symbol}: ${q.price} (${q.changesPercentage >= 0 ? "+" : ""}${q.changesPercentage}%)`));
  }

  lines.push("", "📰 Major company/macro news:");
  if (!n.newsAvailable) lines.push("Real news store isn't configured right now — no fabricated headlines shown.");
  else if (n.news.length) {
    n.news.forEach((r) => {
      const when = r.published_at ? new Date(r.published_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
      lines.push(`[${r.impact_score >= 90 ? "EXTREME" : "HIGH"}] ${r.ticker || "MACRO"} — ${r.headline} (${[r.source, when].filter(Boolean).join(" · ")})`);
    });
  } else {
    lines.push("No real HIGH/EXTREME-impact headlines in the last 4h.");
  }

  lines.push("", "🗓 Upcoming economic releases (next 72h):");
  if (n.economicReleases.length) {
    n.economicReleases.forEach((e) => lines.push(`${e.type} — ${e.label} (${new Date(e.atMs).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })})`));
  } else {
    lines.push("None on the real, hand-maintained calendar right now.");
  }

  lines.push("", `📈 Today's real momentum leaders — up (out of ${n.universeSize} symbols scanned):`);
  if (n.moversUp.length) n.moversUp.forEach((m) => lines.push(renderMoverBlock(m)));
  else lines.push("No strong real upside movers right now.");

  lines.push("", "📉 Today's decliners:");
  if (n.moversDown.length) n.moversDown.forEach((m) => lines.push(renderMoverBlock(m)));
  else lines.push("No strong real downside movers right now.");

  if (n.breakouts.length) {
    lines.push("", "🚀 Real opening-range breakouts today:");
    n.breakouts.forEach((b) => lines.push(`${b.symbol} @ ${b.price} (${b.chgPct >= 0 ? "+" : ""}${b.chgPct}%, RVOL ${b.rvol ?? "?"}x)`));
  }

  lines.push("", `⏱ Data as of ${new Date(n.generatedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} ET`);

  return lines.join("\n");
}

module.exports = { buildMarketNarrative, renderMarketNarrativeText, stanceFor };
