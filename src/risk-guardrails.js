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

function sectorCapExceeded({ positions, symbol, maxPerSector }) {
  const sec = sectorOf(symbol);
  const count = (positions || []).filter(p => sectorOf(p.symbol) === sec).length;
  return count >= maxPerSector;
}

// Risk-based share count: risk riskPct of equity on (entry − stop) per share,
// capped by available cash (no margin) and by maxNamePct of equity in one name.
// Returns 0 if the setup can't be sized safely (invalid stop, no cash, etc.) —
// callers should skip the trade rather than fall back to flat/blind sizing.
function sizePositionByRisk({ equity, riskPct, entry, stop, availCash, maxNamePct = 20 }) {
  if (!(equity > 0) || !(entry > 0) || !(stop > 0) || !(entry > stop)) return 0;
  const riskPerShare = entry - stop;
  let qty = Math.floor((equity * (riskPct / 100)) / riskPerShare);
  qty = Math.min(qty, Math.floor((availCash || 0) / entry));
  qty = Math.min(qty, Math.floor((equity * (maxNamePct / 100)) / entry));
  return Math.max(0, qty);
}

module.exports = {
  SECTORS, sectorOf, isMarketHoursET, checkAccountHealth,
  dailyLossBreakerTripped, openRiskPct, sectorCapExceeded, sizePositionByRisk,
};
