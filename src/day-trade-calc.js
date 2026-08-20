// day-trade-calc.js — server-side port of trading-utils.js's
// computeDayTradeSignal (client-side only until now), so a real background
// Telegram alert can know when a watchlist symbol's Day Trade Mode signal
// crosses into GREEN, even when the app tab isn't open. Same real math,
// same real thresholds as the client version — verified identical (on
// every field this port returns) by a parity smoke test (test/smoke.js).
// Keep this in sync with computeDayTradeSignal in
// axiom-runner/components/trading-utils.js if the client version's real
// logic ever changes. Same "hand-ported, parity-tested" pattern already
// established by greenlight-calc.js for the swing entry alert.
//
// 2026-08-19 ("AM Trading — Final Trading Logic Redesign", explicit user
// request): `quality`/`grade` come from the real weighted
// daytrade-console-engine.js (the same engine the Day Trade Console page
// uses) instead of a hard passed>=4/3 count over 5 equally-weighted
// checks. `checks`/`passed` stay as a real, honest informational
// checklist (still genuinely computed, still shown in GreenLightTab's
// Day Trade Mode UI) — they don't gate `signal` either.
//
// 2026-08-19 ("Fix Trading Signal Logic — A+ Score vs Entry Trigger",
// explicit user request, real live bug found: AMZN showed BUY at quality
// 60 while MA showed WAIT at quality 100, and separately a bearish/SELL
// setup could show an un-inverted "ELITE 99" quality badge): `signal` is
// no longer `mixed.verdict` alone. It's now Setup Quality (direction-
// corrected `quality`, gated on a real configurable `minBuyScore`) +
// Entry Trigger (`entryTriggerStatus`, a new real classification of the
// existing breakout/breakdown/retest/failedBreakout data) + Risk
// (`rrPass`) + Market Filter (`marketPass`), combined so a high score
// alone can never produce GREEN without a confirmed trigger, and a
// confirmed trigger on a too-weak setup can never produce GREEN either.
// `signalReason` is a new field explaining which of those actually
// decided the verdict. This function's call signature is unchanged
// (`extra.minBuyScore` is a new optional field, defaults to
// DAY_TRADE_DEFAULTS.minBuyScore if omitted) — every existing consumer
// (Light Box, the Telegram alert, GreenLightTab) keeps working
// unchanged, they just now also receive the new fields.
"use strict";

const engine = require("./daytrade-console-engine");
const { DAY_TRADE_DEFAULTS } = require("./day-trade-config");

// Entry Trigger classifier (2026-08-19, "Fix Trading Signal Logic — A+
// Score vs Entry Trigger", explicit user request) — CONFIRMED/APPROACHING/
// NOT_READY/INVALIDATED, built entirely from real data already flowing
// through this function: orBreakout/aboveVwap/rvol (already on every row)
// and row.priceAction's real breakout/breakdown/retest/failedBreakout/
// failedBreakdown flags (detectPriceAction, daytrade-console-engine.js —
// already computed server-side, no new fetch). Direction-aware so a
// bearish setup is judged against a real breakdown, not a breakout.
// Honest by construction: when `bars` were too short for detectPriceAction
// to run, `pa`'s fields are null and this falls back cleanly to the
// simpler orBreakout/aboveVwap/rvol booleans alone — never a fabricated
// status.
function classifyEntryTrigger({ orBreakout, aboveVwap, rvol, priceAction, direction }) {
  const pa = priceAction || {};
  if (direction === "BEARISH") {
    if (pa.failedBreakdown) return "INVALIDATED";
    if (pa.breakdown && !aboveVwap && rvol >= 1) return "CONFIRMED";
    if (pa.retest || (!aboveVwap && rvol >= 0.8)) return "APPROACHING";
    return "NOT_READY";
  }
  if (pa.failedBreakout) return "INVALIDATED";
  if (orBreakout && aboveVwap && rvol >= 1.5) return "CONFIRMED";
  if (pa.retest || pa.breakout || (aboveVwap && rvol >= 0.8)) return "APPROACHING";
  return "NOT_READY";
}

// Market dimension: this call site only ever has real SPY data (no QQQ/
// VIX — those come from lightbox-state-store.js's own macro fetch, a
// separate concern from this pure function). Running the full 5-factor
// computeRegime with only SPY would let 3 real-missing factors silently
// default to "fail," dragging an honestly flat/mildly-positive tape down
// into a false "bearish" market reading — confirmed as a real bug during
// testing (a genuine 5/5 breakout setup read YELLOW instead of GREEN
// purely because of this, not real evidence). A direct, honest SPY-only
// proxy instead — same real -0.1/-0.5 thresholds dotFromChg already uses
// for its own SPY dot (green-ish/amber-ish/red-ish), just expressed as a
// continuous 0-100 score rather than 3 buckets.
function marketScoreFromSpy(spyChg) {
  if (spyChg == null || !Number.isFinite(spyChg)) return null;
  return Math.max(0, Math.min(100, 50 + spyChg * 30));
}

// `extra` (optional, defaults identically on both server/client so the
// strict 2-arg parity test in test/smoke.js is unaffected): richer
// real context ONLY lightbox-state-store.js's tick can cheaply supply —
// { qqqChg, sectorChg, trendLabel, vcpVerdict } from its own extended
// macro fetch + trend-quality-store's per-symbol cache. Every field
// defaults to null (honest — Relative Strength/Minervini/VCP just fall
// back to their existing neutral-default behavior when omitted), so
// GreenLightTab's simpler 2-arg client call keeps working unchanged.
function computeDayTradeSignal(row, spyChg, extra = {}) {
  const px = Number(row?.price || 0);
  if (!(px > 0)) return null;
  const vwap = Number(row?.vwap || 0) || px;
  const rvol = Number(row?.rvol || 0);
  const aboveVwap = !!row?.aboveVwap;
  const orBreakout = !!row?.orBreakout;
  const bull15 = !!row?.bull15;
  const closeStrong = !!row?.closeStrong;

  const checks = [
    { label: "Market safe", pass: spyChg > -0.5,
      tip: `SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}% — buy only when the tape is safe` },
    { label: "Above VWAP", pass: aboveVwap,
      tip: `VWAP $${vwap.toFixed(2)} — ${aboveVwap ? "price is above the session's volume-weighted average" : "price is below VWAP, the intraday bulls/bears line"}` },
    { label: "OR Breakout", pass: orBreakout,
      tip: row?.orHigh ? `Opening range high $${Number(row.orHigh).toFixed(2)} — ${orBreakout ? "broke out" : "still inside the first 30 min range"}` : "Opening range not available yet" },
    { label: rvol > 0 ? `RVOL ${rvol.toFixed(1)}x` : "Volume active", pass: rvol >= 1.5,
      tip: rvol > 0 ? `RVOL ${rvol.toFixed(1)}x (≥1.5x = real interest today)` : "No volume data" },
    { label: "9>21 EMA (15m)", pass: bull15,
      tip: "Price above 9EMA above 21EMA on the 15-minute chart — momentum stack intact" },
  ];
  const passed = checks.filter((c) => c.pass).length;

  // Real weighted scoring — same 9-dimension engine as the Day Trade
  // Console. Minervini/VCP/QQQ/sector use `extra` when the caller supplied
  // it (lightbox-state-store.js's tick), else fall back to their existing
  // honest neutral defaults — identical to the old always-null behavior.
  const marketScore = marketScoreFromSpy(spyChg);
  const trendStackScore = engine.computeTrendScore(px, vwap, row?.ema9 ?? null, row?.ema21 ?? null, row?.ema50 ?? null);
  const orb = engine.computeOrbScore({ price: px, orHigh: row?.orHigh ?? null, orLow: row?.orLow ?? null, rvol, aboveVwap, bull15, marketBullish: spyChg != null ? spyChg > -0.1 : null });
  const vwapScore = engine.computeVwapScore(px, vwap, null);
  const momentumScore = engine.computeMomentumScore({ rsi: row?.rsi15m ?? null, roc: row?.roc15m ?? null, macdHistogram: row?.macdHistogram15m ?? null, priceMomentumPct: null, rvol, trendStackScore });
  const volumeScore = engine.computeVolumeScore(rvol);
  const rs = engine.computeRelativeStrength(Number(row?.chgPct || 0), spyChg, extra?.qqqChg ?? null, extra?.sectorChg ?? null);
  const priceActionScore = engine.computePriceActionScore(row?.priceAction || {});
  const minerviniScore = engine.computeMinerviniScore(extra?.trendLabel ?? null);
  const vcpScore = engine.computeVcpScore(extra?.vcpVerdict ?? null);

  const subscores = { orb: orb.score, vwap: vwapScore, momentum: momentumScore, volume: volumeScore, relativeStrength: rs.score, market: marketScore, priceAction: priceActionScore, minervini: minerviniScore, vcp: vcpScore };
  const mixed = engine.computeMixedSignals(subscores);
  const master = engine.computeMasterScore(subscores);
  // Real setup direction — BULLISH/BEARISH/MIXED, from the same real
  // 7-of-9-subscore vote that already drove the old `signal` directly.
  // Now feeds two separate things below: direction-correcting quality
  // (§2 of the plan) and classifying the entry trigger (§1) — it no
  // longer becomes `signal` on its own.
  const direction = mixed.verdict;

  // Direction-corrected Setup Quality (2026-08-19, "Fix Trading Signal
  // Logic — A+ Score vs Entry Trigger", explicit user request). Real bug
  // fixed here: a bearish (RED/SELL) setup used to show its raw bullish-
  // scaled master score untouched — a strong short could read "ELITE 99"
  // like a screaming buy. Same inversion formula
  // classifyMasterScore/classifySignalQuality already use elsewhere in
  // daytrade-console-engine.js, just applied at the one place it was
  // missing. quality now always answers "how good is THIS setup, in the
  // direction it's actually pointing" — never contradicts its own signal.
  const rawQuality = master.score != null ? master.score : Math.max(0, Math.min(100, Math.round(Number(row?.score) || 0)));
  const quality = direction === "BEARISH" ? Math.max(0, Math.min(100, 100 - rawQuality)) : rawQuality;
  const grade = quality >= 90 ? "ELITE" : quality >= 75 ? "A+" : quality >= 60 ? "GOOD" : quality >= 45 ? "WATCH" : "IGNORE";

  const stop = +(Math.min(vwap, px) * 0.999).toFixed(2);
  const riskDist = Math.max(0.01, px - stop);
  const target = +(px + riskDist * 1.5).toFixed(2);
  const rr = +((target - px) / riskDist).toFixed(1);
  const rrPass = rr >= 1.2;
  const marketPass = spyChg > -0.5;

  const bestEntry = orBreakout ? px : (Number(row?.orHigh) || px);
  const entryNote = orBreakout ? "at breakout ✅" : "wait for OR breakout";
  const atEntry = orBreakout;

  // Entry Trigger (spec §1-2) — real breakout/breakdown/retest/failed-
  // breakout state (row.priceAction, already computed by
  // fetchDayTradeScanRows before this function ever runs), direction-aware.
  const entryTriggerStatus = classifyEntryTrigger({ orBreakout, aboveVwap, rvol, priceAction: row?.priceAction, direction });

  // Final Signal (spec §3, §6, §10) — Setup Quality + Entry Trigger + Risk
  // + Market Filter, combined in the exact precedence the spec's own
  // contradiction-prevention table requires (verified by hand against all
  // 6 of its examples before writing this). A high score alone can no
  // longer produce GREEN, and a confirmed breakout on a too-weak setup
  // can no longer produce GREEN either — both gates must pass.
  const minBuyScore = Number.isFinite(extra?.minBuyScore) ? extra.minBuyScore : DAY_TRADE_DEFAULTS.minBuyScore;
  let signal, signalReason;
  if (direction === "MIXED") {
    signal = "YELLOW";
    signalReason = "No clear directional edge yet — signals are mixed.";
  } else if (quality < minBuyScore) {
    signal = "RED";
    signalReason = `Setup quality ${quality}/100 is below the minimum bar (${minBuyScore}) to trade.`;
  } else if (entryTriggerStatus === "INVALIDATED") {
    signal = "RED";
    signalReason = "Setup invalidated — the breakout/breakdown failed.";
  } else if (entryTriggerStatus === "CONFIRMED" && rrPass && marketPass) {
    signal = "GREEN";
    signalReason = direction === "BEARISH" ? "Breakdown confirmed and entry conditions are active." : "Opening-range breakout confirmed and entry conditions are active.";
  } else if (entryTriggerStatus === "CONFIRMED") {
    signal = "YELLOW";
    signalReason = !marketPass ? "Entry confirmed, but the broader market isn't supportive right now." : "Entry confirmed, but risk/reward isn't favorable enough yet.";
  } else {
    signal = "YELLOW";
    signalReason = `Strong setup — waiting for ${direction === "BEARISH" ? "breakdown" : "breakout"} confirmation.`;
  }

  const qualifiesAPlus = signal === "GREEN" && marketPass && entryTriggerStatus === "CONFIRMED";

  return {
    symbol: row.symbol, px, chg: Number(row?.chgPct || 0), checks, passed, signal,
    tradeable: signal === "GREEN", bestEntry: +bestEntry.toFixed(2), entryNote, atEntry,
    stop, target, rr, rrPass, quality, grade, qualifiesAPlus, marketPass,
    direction, entryTriggerStatus, signalReason, minBuyScore,
    vwap, rvol, orHigh: row?.orHigh ?? null, orLow: row?.orLow ?? null, orBreakout, bull15, closeStrong,
    ema9: row?.ema9 ?? null, ema21: row?.ema21 ?? null, ema50: row?.ema50 ?? null, aboveVwap,
    timeStop: "Flatten by 3:55 PM ET",
  };
}

module.exports = { computeDayTradeSignal, classifyEntryTrigger };
