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
// request): `signal`/`quality`/`grade` now come from the real weighted,
// un-gated daytrade-console-engine.js (the same engine the Day Trade
// Console page uses) instead of a hard passed>=4/3 count over 5 equally-
// weighted checks — the exact "too strict, blocks valid setups" problem
// the spec describes. `checks`/`passed` stay as a real, honest informational
// checklist (still genuinely computed, still shown in GreenLightTab's
// Day Trade Mode UI) — they just no longer gate `signal`. This function's
// call signature and return shape are UNCHANGED so every existing
// consumer (Light Box, the Telegram alert, GreenLightTab) needs zero
// changes — see the plan's "keep exact same return shape" requirement.
"use strict";

const engine = require("./daytrade-console-engine");

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
  const signal = mixed.verdict === "BULLISH" ? "GREEN" : mixed.verdict === "BEARISH" ? "RED" : "YELLOW";

  const stop = +(Math.min(vwap, px) * 0.999).toFixed(2);
  const riskDist = Math.max(0.01, px - stop);
  const target = +(px + riskDist * 1.5).toFixed(2);
  const rr = +((target - px) / riskDist).toFixed(1);

  const bestEntry = orBreakout ? px : (Number(row?.orHigh) || px);
  const entryNote = orBreakout ? "at breakout ✅" : "wait for OR breakout";
  const atEntry = orBreakout;

  const quality = master.score != null ? master.score : Math.max(0, Math.min(100, Math.round(Number(row?.score) || 0)));
  const grade = quality >= 90 ? "ELITE" : quality >= 75 ? "A+" : quality >= 60 ? "GOOD" : quality >= 45 ? "WATCH" : "IGNORE";
  const marketPass = spyChg > -0.5;
  const qualifiesAPlus = signal === "GREEN" && marketPass && atEntry;

  return {
    symbol: row.symbol, px, chg: Number(row?.chgPct || 0), checks, passed, signal,
    tradeable: signal === "GREEN", bestEntry: +bestEntry.toFixed(2), entryNote, atEntry,
    stop, target, rr, rrPass: rr >= 1.2, quality, grade, qualifiesAPlus, marketPass,
    vwap, rvol, orHigh: row?.orHigh ?? null, orLow: row?.orLow ?? null, orBreakout, bull15, closeStrong,
    ema9: row?.ema9 ?? null, ema21: row?.ema21 ?? null, ema50: row?.ema50 ?? null, aboveVwap,
    timeStop: "Flatten by 3:55 PM ET",
  };
}

module.exports = { computeDayTradeSignal };
