// Shared risk-management math for every engine that can autonomously place
// real orders (currently: server-autopilot.js → Alpaca paper, and
// routes/autoexec.js → Tradier paper-or-LIVE). Broker-agnostic — callers
// normalize their own account/position shape into the plain {symbol, qty,
// avgEntryPrice} / {equity, cash, ...} objects these functions expect, so
// both engines enforce the exact same daily-loss breaker, open-risk ceiling,
// sizing, and concentration caps instead of each hand-rolling its own.

// Sector map for correlation control — don't load up on highly-correlated names.
// Sourced from sector-theme-map.js, the one canonical symbol->sector table
// (previously this file, routes/market.js, and advisor-ai.js each hand-rolled
// their own, inconsistent copy). BA/RTX now correctly bucket as "defense"
// rather than the old generic "industrial" — a real correlation-model
// improvement, not just a rename, since defense primes move together more
// tightly with each other than with GE/CAT-style industrials.
const { SYMBOL_SECTOR: SECTORS, sectorOf } = require("./sector-theme-map");

function isMarketHoursET() {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); if (day < 1 || day > 5) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 9 * 60 + 35 && mins <= 15 * 60 + 55;   // 9:35–15:55 ET
}

// ET calendar date (YYYY-MM-DD) of the current week's Monday — the one
// shared "new week" anchor both real order-placing engines
// (server-autopilot.js/Alpaca, routes/autoexec.js/Tradier) compare their
// own persisted weekAnchorDate against to know when to reset
// weekStartEquity (Master Build Spec §16-17, 2026-08-23). Mirrors
// routes/autoexec.js's existing todayET() ET-date convention so both
// callers detect a new week identically instead of each reimplementing it.
function weekAnchorET() {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  et.setDate(et.getDate() + diffToMonday);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(et);
}

// Never trade a blown, debit, restricted, or too-small account.
function checkAccountHealth({ equity, cash, tradingBlocked, accountBlocked, minEquity = 500 }) {
  if (!(equity > 0)) return { ok: false, reason: "zero/negative equity" };
  if (cash != null && cash < 0) return { ok: false, reason: "margin debit" };
  if (equity < minEquity) return { ok: false, reason: "equity below minimum" };
  if (tradingBlocked || accountBlocked) return { ok: false, reason: "account restricted" };
  return { ok: true, reason: null };
}

// Stop opening new trades once the day's loss crosses either threshold
// (whichever the caller supplies — Alpaca callers pass maxLossPct off
// last_equity, Tradier callers pass maxLossAbs off a persisted start-of-day
// equity snapshot since the broker doesn't expose one).
function dailyLossBreakerTripped({ equity, startOfDayEquity, maxLossPct, maxLossAbs }) {
  if (!(startOfDayEquity > 0)) return false;
  const pnl = equity - startOfDayEquity;
  if (maxLossAbs != null && -pnl >= maxLossAbs) return true;
  if (maxLossPct != null && (pnl / startOfDayEquity) * 100 <= -maxLossPct) return true;
  return false;
}

// Σ |qty| × avgEntryPrice × assumedStopPct, as a % of equity — a cheap proxy
// for open risk when per-position stop distance isn't tracked by the broker.
function openRiskPct({ positions, equity, assumedStopPct = 0.05 }) {
  if (!(equity > 0)) return 100; // unknown equity → treat as maxed out, refuse new risk
  const risk = (positions || []).reduce((s, p) => s + Math.abs(Number(p.qty) || 0) * (Number(p.avgEntryPrice) || 0) * assumedStopPct, 0);
  return (risk / equity) * 100;
}

// Weekly drawdown breaker (Master Build Spec §16-17, 2026-08-23) — stops
// opening new automated trades once the CURRENT trading week's loss
// crosses maxLossPct, off a real persisted weekStartEquity snapshot
// (taken at the first check of each new ET week — see weekAnchorET()
// above). Same shape/discipline as dailyLossBreakerTripped: honest false
// when no real snapshot exists yet, never a fabricated trip.
function weeklyLossBreakerTripped({ equity, weekStartEquity, maxLossPct }) {
  if (!(weekStartEquity > 0)) return false;
  return ((equity - weekStartEquity) / weekStartEquity) * 100 <= -maxLossPct;
}

// Total (all-time) drawdown breaker — stops opening new automated trades
// once real equity has fallen maxDrawdownPct below the account's real,
// persisted all-time peak equity (a continuously-updated high-water mark,
// never reset). Distinct from the daily/weekly breakers, which measure
// loss from a periodic starting point, not from the real historical peak.
function totalDrawdownBreakerTripped({ equity, peakEquity, maxDrawdownPct }) {
  if (!(peakEquity > 0)) return false;
  return ((equity - peakEquity) / peakEquity) * 100 <= -maxDrawdownPct;
}

// Weekly/drawdown breaker bookkeeping (2026-08-24, Execution Bot
// Architecture Audit Phase 2) — extracted from 3 real, independently-
// maintained copies of this exact same block (server-autopilot.js,
// routes/autoexec.js, lightbox-autopilot-execute.js — all three literally
// carry the identical "Master Build Spec §16-17, 2026-08-23" comment,
// confirming they were copy-pasted from one another rather than each
// independently derived). Real new-week rollover of weekStartEquity, real
// continuously-updated all-time peakEquity high-water mark.
//
// Deliberately does NOT touch persistence — each of the 3 systems keeps
// its own separate risk-state file/config (a real, earlier, deliberate
// design choice — see autopilot-store.js's own header comment on why the
// systems stay separate) and is still the one that reads/writes it; this
// only removes the duplicated in-memory bookkeeping sequence sitting in
// between that read and that write. Mutates and returns the same
// `riskState` object passed in.
function updateWeeklyDrawdownState(riskState, equity) {
  const anchor = weekAnchorET();
  if (riskState.weekAnchorDate !== anchor) { riskState.weekAnchorDate = anchor; riskState.weekStartEquity = equity; }
  if (equity > (riskState.peakEquity || 0)) riskState.peakEquity = equity;
  return riskState;
}

// Consecutive-loss breaker (Trade Navigator, 2026-09-03) — stops opening
// new automated trades after maxConsecutiveLosses real losing trades in a
// row, distinct from the three breakers above (all cumulative-$/%-based,
// never streak-based). recentTrades: real closed outcomes ordered
// OLDEST-first (same order trade-gps-audit-store.js's own records
// naturally accumulate in) — only the trailing N are inspected. A single
// real winning/breakeven trade (pnl >= 0) anywhere in that trailing
// window resets the streak. Honest false on fewer than
// maxConsecutiveLosses real trades — never trips on an incomplete sample.
function consecutiveLossBreakerTripped({ recentTrades, maxConsecutiveLosses = 3 }) {
  const trades = Array.isArray(recentTrades) ? recentTrades : [];
  if (trades.length < maxConsecutiveLosses) return false;
  const trailing = trades.slice(-maxConsecutiveLosses);
  return trailing.every((t) => Number(t?.pnl) < 0);
}

// Event-based position-size reduction (Trade Navigator, 2026-09-03) — a
// real, disclosed multiplier applied to riskPct near a real imminent
// macro/earnings event, rather than event-risk-engine.js's existing
// binary blocksNewExposure (which fully blocks within blockWithinDays,
// not a graded reduction). nearEventScale is the multiplier applied when
// a real event is imminent but NOT yet inside the hard-block window —
// event-risk-engine.js's own score=45 band (real earnings 3-10 days out,
// see its own computeEventRisk) is the real signal this reads; a
// blocksNewExposure:true event is already fully blocked upstream and
// never reaches sizing at all.
function eventRiskSizeMultiplier({ eventRisk, nearEventScale = 0.5 } = {}) {
  if (!eventRisk || eventRisk.blocksNewExposure) return 1;
  const score = Number(eventRisk.score);
  return Number.isFinite(score) && score > 0 ? nearEventScale : 1;
}

function sectorCapExceeded({ positions, symbol, maxPerSector }) {
  const sec = sectorOf(symbol);
  const count = (positions || []).filter(p => sectorOf(p.symbol) === sec).length;
  return count >= maxPerSector;
}

// Risk-based share count: risk riskPct of equity on the real per-share risk
// distance, capped by available cash (no margin) and by maxNamePct of equity
// in one name. Returns 0 if the setup can't be sized safely (invalid stop, no
// cash, etc.) — callers should skip the trade rather than fall back to flat/
// blind sizing.
//
// direction defaults to "LONG" (entry − stop, stop below entry) — every
// existing caller (server-autopilot.js, routes/autoexec.js) is long-only and
// omits it, so this default preserves their exact prior behavior unchanged.
// direction: "SHORT" (2026-08-23, real Light Box SHORT ASSIST execution)
// flips the risk distance to stop − entry (stop above entry, the real short
// invalidation level) — the same formula, just measuring risk on the other
// side of entry.
function sizePositionByRisk({ equity, riskPct, entry, stop, availCash, maxNamePct = 20, direction = "LONG" }) {
  if (!(equity > 0) || !(entry > 0) || !(stop > 0)) return 0;
  const riskPerShare = direction === "SHORT" ? stop - entry : entry - stop;
  if (!(riskPerShare > 0)) return 0;
  let qty = Math.floor((equity * (riskPct / 100)) / riskPerShare);
  qty = Math.min(qty, Math.floor((availCash || 0) / entry));
  qty = Math.min(qty, Math.floor((equity * (maxNamePct / 100)) / entry));
  return Math.max(0, qty);
}

module.exports = {
  SECTORS, sectorOf, isMarketHoursET, weekAnchorET, checkAccountHealth,
  dailyLossBreakerTripped, weeklyLossBreakerTripped, totalDrawdownBreakerTripped,
  consecutiveLossBreakerTripped, eventRiskSizeMultiplier,
  openRiskPct, sectorCapExceeded, sizePositionByRisk, updateWeeklyDrawdownState,
};
