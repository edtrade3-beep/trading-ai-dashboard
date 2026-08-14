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
"use strict";

function computeDayTradeSignal(row, spyChg) {
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
  const signal = passed >= 4 ? "GREEN" : passed >= 3 ? "YELLOW" : "RED";

  const stop = +(Math.min(vwap, px) * 0.999).toFixed(2);
  const riskDist = Math.max(0.01, px - stop);
  const target = +(px + riskDist * 1.5).toFixed(2);
  const rr = +((target - px) / riskDist).toFixed(1);

  const bestEntry = orBreakout ? px : (Number(row?.orHigh) || px);
  const entryNote = orBreakout ? "at breakout ✅" : "wait for OR breakout";
  const atEntry = orBreakout;

  const quality = Math.max(0, Math.min(100, Math.round(Number(row?.score) || 0)));
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
