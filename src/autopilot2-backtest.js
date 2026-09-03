"use strict";

// autopilot2-backtest.js — real historical backtest of Autopilot 2.0's
// actual entry engine (explicit user request, 2026-08-31: "you tell me i
// want to make money trading" -> agreed to build "a real backtest of
// Autopilot 2.0's exact engine"). Reuses the SAME real functions the live
// engine calls, unmodified, per this codebase's "one canonical engine,
// don't duplicate" discipline:
//   - computeTrendTemplateAt (backtest-trend-template.js) — the same
//     point-in-time, no-lookahead port of buildTrendTemplate's real
//     Minervini 8-criteria/pivot/stop math the existing Sniper Decision
//     backtest (backtest-engine.js) already uses.
//   - computeOpportunity (opportunity-engine.js) — the EXACT real
//     function computeAllOpportunities() feeds Autopilot 2.0's own real
//     candidate pool (src/routes/market.js), completely unmodified here.
//   - isBullishCandidate / sizeEntry (autopilot2-engine.js) — the EXACT
//     real candidate-acceptance gate and risk-based position-sizing math
//     Autopilot 2.0's own tryEnter() uses, same risk constants.
//   - computeRegime / regimeToEntryVocabulary (trade-planner-scoring.js) —
//     the EXACT real regime classifier, fed real historical SPY/QQQ/VIX
//     day-over-day changes instead of a live quote.
//   - sectorCapExceeded / dailyLossBreakerTripped / weeklyLossBreakerTripped
//     / totalDrawdownBreakerTripped (risk-guardrails.js) — the EXACT real
//     portfolio risk gates, unmodified.
//
// Honest, disclosed scope limits (same category as backtest-engine.js's
// own documented VCP/SMC gap — real omissions, never silently faked):
//   1. LONG STOCK entries only. Crypto (a genuinely different sizing/
//      24-7 path) and options (no real historical options-chain data
//      exists to replay) are not backtested here.
//   2. sectorInfo/adx/optionsFlow/trackReport are passed as null to
//      computeOpportunity — computeCoreScore's own real code already
//      degrades each of those buckets to an honest neutral midpoint
//      when null (verified: am-core-engine.js's Number.isFinite(x) ? … :
//      midpoint pattern throughout), not a crash or a fabricated value.
//      This means the real backtest score is missing whatever edge those
//      three real signals would have added or subtracted live.
//   3. Fill price is the REAL next trading day's open (no lookahead —
//      the signal is evaluated on bars[idx], filled on bars[idx+1]).
//      If a stop AND target are both hit on the same real bar, the stop
//      is assumed to have hit first — the standard conservative backtest
//      convention, never the target-first (performance-flattering) read.
"use strict";

const { fetchYahooBarsLong } = require("./providers/yahoo");
const { computeTrendTemplateAt } = require("./backtest-trend-template");
const { computeOpportunity } = require("./opportunity-engine");
const { computeRegime, regimeToEntryVocabulary } = require("./trade-planner-scoring");
const { ttWeightedMomentum } = require("./routes/market");
const {
  isBullishCandidate, sizeEntry, MAX_OPEN_POSITIONS, MAX_PER_SECTOR, MAX_OPEN_RISK_PCT,
} = require("./autopilot2-engine");
const {
  sectorCapExceeded, dailyLossBreakerTripped, weeklyLossBreakerTripped, totalDrawdownBreakerTripped,
} = require("./risk-guardrails");
const { round2, average } = require("./utils");
const { buildStats, maxDrawdownPct } = require("./backtest-stats");

const STARTING_EQUITY = 100_000; // matches Autopilot 2.0's real paper account starting equity
const MIN_GAP_DAYS = 10; // same real anti-re-fire precedent as backtest-engine.js's Sniper Decision backtest
const MAX_ENTRIES_PER_DAY = 5; // daily-bar analog of autopilot2-engine.js's MAX_ENTRIES_PER_TICK
const DAILY_LOSS_PCT = 2, WEEKLY_LOSS_PCT = 5, TOTAL_DRAWDOWN_PCT = 15; // same real defaults as autopilot2-engine.js

const RANGE_BY_YEARS = { 1: "2y", 2: "3y", 3: "5y" }; // fetch 1 extra year of real history so the FIRST backtested day already has a real 200-day lookback
function rangeFor(years) {
  const y = Math.max(1, Math.min(3, Number(years) || 1));
  return RANGE_BY_YEARS[y];
}

function isoWeekAnchor(timeMs) {
  const d = new Date(timeMs);
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}

// Builds a time -> index map for O(1) real-bar lookup per symbol.
function indexByTime(bars) {
  const m = new Map();
  bars.forEach((b, i) => m.set(b.time, i));
  return m;
}

async function runAutopilot2Backtest(symbols, opts = {}) {
  const years = Math.max(1, Math.min(3, Number(opts.years) || 1));
  const range = rangeFor(years);
  const cutYears = years; // how much of the fetched range is real backtest window (rest is warm-up lookback)

  const [spyBars, qqqBars, vixBars] = await Promise.all([
    fetchYahooBarsLong("SPY", range, "1d"),
    fetchYahooBarsLong("QQQ", range, "1d"),
    fetchYahooBarsLong("^VIX", range, "1d").catch(() => []),
  ]);
  if (!spyBars.length) return { ok: false, error: "Could not fetch real SPY history for the backtest calendar." };

  const spyByTime = indexByTime(spyBars);
  const qqqByTime = indexByTime(qqqBars);
  const vixByTime = indexByTime(vixBars);
  const spyCloses = spyBars.map((b) => b.close);

  function realMacroDataAsOf(i) {
    const t = spyBars[i].time;
    const spyPrev = i > 0 ? spyBars[i - 1].close : spyBars[i].close;
    const spyChgPct = spyPrev ? ((spyBars[i].close - spyPrev) / spyPrev) * 100 : 0;
    const qi = qqqByTime.get(t);
    const qqqChgPct = qi != null && qi > 0 ? ((qqqBars[qi].close - qqqBars[qi - 1].close) / qqqBars[qi - 1].close) * 100 : 0;
    const vi = vixByTime.get(t);
    const vixPrice = vi != null ? vixBars[vi].close : null;
    return [
      { symbol: "SPY", changesPercentage: round2(spyChgPct) },
      { symbol: "QQQ", changesPercentage: round2(qqqChgPct) },
      { symbol: "VIX", price: vixPrice },
    ];
  }

  const symbolBars = {};
  const symbolTimeIdx = {};
  await Promise.all(symbols.map(async (sym) => {
    try {
      const bars = await fetchYahooBarsLong(sym, range, "1d");
      symbolBars[sym] = bars;
      symbolTimeIdx[sym] = indexByTime(bars);
    } catch {
      symbolBars[sym] = [];
      symbolTimeIdx[sym] = new Map();
    }
  }));

  const skipped = symbols.filter((s) => (symbolBars[s] || []).length < 220)
    .map((s) => ({ symbol: s, reason: `Not enough real daily history (need ~220+ trading days, got ${(symbolBars[s] || []).length}).` }));
  const activeSymbols = symbols.filter((s) => (symbolBars[s] || []).length >= 220);

  // Real backtest window: skip enough of the fetched range as pure warm-up
  // lookback so every evaluated day already has a genuine ~200-day MA.
  const startIdx = Math.max(200, spyBars.length - Math.round(cutYears * 252));

  let cash = STARTING_EQUITY;
  let equity = STARTING_EQUITY;
  let peakEquity = STARTING_EQUITY;
  let dailyStartEquity = STARTING_EQUITY;
  let weekStartEquity = STARTING_EQUITY;
  let weekAnchor = isoWeekAnchor(spyBars[startIdx].time);
  const openPositions = []; // { symbol, qty, entry, stop, target, entryIdx, entryTime, riskDollars, score, verdict }
  const closedTrades = [];
  const equityCurve = [];
  const lastSignalIdx = {}; // symbol -> spyBars index of last real signal (MIN_GAP_DAYS gate)
  let breakerTrippedDays = 0;

  for (let i = startIdx; i < spyBars.length; i += 1) {
    const time = spyBars[i].time;
    const newWeek = isoWeekAnchor(time);
    if (newWeek !== weekAnchor) { weekAnchor = newWeek; weekStartEquity = equity; }

    // 1) Manage open positions — real subsequent-bar stop/target check, no lookahead.
    for (const pos of [...openPositions]) {
      const idx = symbolTimeIdx[pos.symbol]?.get(time);
      if (idx == null) continue; // no real bar today for this symbol (holiday mismatch) — stays open
      const bar = symbolBars[pos.symbol][idx];
      let exitPrice = null, reason = null;
      if (bar.low <= pos.stop) { exitPrice = pos.stop; reason = "STOP"; } // conservative: stop checked before target
      else if (bar.high >= pos.target) { exitPrice = pos.target; reason = "TARGET"; }
      if (exitPrice != null) {
        cash += pos.qty * exitPrice;
        const pnl = round2((exitPrice - pos.entry) * pos.qty);
        closedTrades.push({
          symbol: pos.symbol, entry: pos.entry, exit: exitPrice, qty: pos.qty, pnl,
          pnlPct: round2((exitPrice / pos.entry - 1) * 100), reason,
          entryTime: pos.entryTime, exitTime: time, holdingDays: idx - pos.entryIdx,
          score: pos.score, verdict: pos.verdict,
        });
        openPositions.splice(openPositions.indexOf(pos), 1);
      }
    }

    // 2) Real mark-to-market equity for today (cash + open positions at today's real close, entry price if no real bar yet).
    let marketValue = 0;
    for (const pos of openPositions) {
      const idx = symbolTimeIdx[pos.symbol]?.get(time);
      const px = idx != null ? symbolBars[pos.symbol][idx].close : pos.entry;
      marketValue += pos.qty * px;
    }
    equity = round2(cash + marketValue);
    if (equity > peakEquity) peakEquity = equity;

    // 3) Real risk breakers — reuse the exact live functions, unmodified.
    const breakerTripped =
      dailyLossBreakerTripped({ equity, startOfDayEquity: dailyStartEquity, maxLossPct: DAILY_LOSS_PCT }) ||
      weeklyLossBreakerTripped({ equity, weekStartEquity, maxLossPct: WEEKLY_LOSS_PCT }) ||
      totalDrawdownBreakerTripped({ equity, peakEquity, maxDrawdownPct: TOTAL_DRAWDOWN_PCT });
    if (breakerTripped) breakerTrippedDays += 1;

    // 4) New entries — same real candidate pipeline Autopilot 2.0's tick() uses.
    if (!breakerTripped && openPositions.length < MAX_OPEN_POSITIONS) {
      const regime = computeRegime(realMacroDataAsOf(i));
      const marketRegime = regimeToEntryVocabulary(regime.label);
      const spyMom = i >= 200 ? ttWeightedMomentum(spyCloses.slice(0, i + 1)) : null;
      let enteredToday = 0;
      for (const sym of activeSymbols) {
        if (enteredToday >= MAX_ENTRIES_PER_DAY || openPositions.length >= MAX_OPEN_POSITIONS) break;
        if (openPositions.some((p) => p.symbol === sym)) continue;
        const bars = symbolBars[sym];
        const idx = symbolTimeIdx[sym].get(time);
        if (idx == null || idx < 200 || idx + 1 >= bars.length) continue; // not enough real history, or no real next-bar fill available yet
        if (lastSignalIdx[sym] != null && idx - lastSignalIdx[sym] < MIN_GAP_DAYS) continue;

        const tt = computeTrendTemplateAt(bars, idx, { spyMom });
        if (!tt) continue;
        const row = { ...tt, dollarVolume: tt.price * (bars[idx].volume || 0) };
        const opp = computeOpportunity({ symbol: sym, row, regime, marketRegime, sectorInfo: null, adx: null, optionsFlow: null, trackReport: null, spreadPct: null });
        if (!opp || !isBullishCandidate(opp)) continue;
        lastSignalIdx[sym] = idx;

        const fillBar = bars[idx + 1];
        const entry = fillBar.open;
        const stop = opp.stop;
        const target = opp.target;
        if (!(entry > 0) || !(stop > 0) || !(stop < entry) || !(target > entry)) continue;
        if (sectorCapExceeded({ positions: openPositions, symbol: sym, maxPerSector: MAX_PER_SECTOR })) continue;

        const { qty, riskPerShare } = sizeEntry({ equity, cash, entry, stop });
        if (!(qty > 0)) continue;
        const riskDollars = round2(qty * riskPerShare);
        const openRiskDollars = openPositions.reduce((s, p) => s + p.riskDollars, 0) + riskDollars;
        if (equity > 0 && (openRiskDollars / equity) * 100 >= MAX_OPEN_RISK_PCT) continue;
        const cost = qty * entry;
        if (cost > cash) continue;

        cash -= cost;
        openPositions.push({
          symbol: sym, qty, entry: round2(entry), stop: round2(stop), target: round2(target),
          entryIdx: idx + 1, entryTime: fillBar.time, riskDollars, score: opp.score, verdict: opp.verdict,
        });
        enteredToday += 1;
      }
    }

    equityCurve.push({ time, equity });
    dailyStartEquity = equity;
  }

  // Real still-open positions at the end of the window — marked-to-market,
  // disclosed separately, never counted as a completed (won/lost) trade.
  const stillOpen = openPositions.map((pos) => {
    const lastIdx = symbolTimeIdx[pos.symbol]?.get(spyBars[spyBars.length - 1].time);
    const bars = symbolBars[pos.symbol];
    const lastClose = lastIdx != null ? bars[lastIdx].close : (bars.length ? bars[bars.length - 1].close : pos.entry);
    return { symbol: pos.symbol, entry: pos.entry, currentPrice: round2(lastClose), qty: pos.qty, unrealizedPnl: round2((lastClose - pos.entry) * pos.qty), entryTime: pos.entryTime, score: pos.score, verdict: pos.verdict };
  });

  const stats = buildStats(closedTrades, equityCurve, STARTING_EQUITY);

  return {
    ok: true,
    startingEquity: STARTING_EQUITY,
    finalEquity: equityCurve.length ? equityCurve[equityCurve.length - 1].equity : STARTING_EQUITY,
    years, range,
    symbolsRequested: symbols.length, symbolsUsed: activeSymbols.length, skipped,
    tradingDaysSimulated: equityCurve.length,
    breakerTrippedDays,
    closedTrades: closedTrades.length,
    stillOpen,
    trades: closedTrades,
    equityCurve,
    stats,
    scopeNote: "Long stock entries only (no crypto, no options simulated). sectorInfo/adx/optionsFlow/trackReport passed as null to the real scoring engine — those buckets honestly degrade to a neutral midpoint rather than being faked. Fill price is the real next trading day's open; a same-bar stop+target hit assumes the stop hit first.",
  };
}

// buildStats/maxDrawdownPct moved to backtest-stats.js (2026-09-03,
// Trade GPS Stage 8) — re-exported below unchanged so every existing
// caller of autopilot2-backtest.js's buildStats/maxDrawdownPct keeps
// working exactly as before. See backtest-stats.js's own header for why
// (breaking a real circular require with trade-gps-audit-store.js).

module.exports = { runAutopilot2Backtest, buildStats, maxDrawdownPct };
