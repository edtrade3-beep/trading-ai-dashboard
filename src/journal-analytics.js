// AI-Memory pattern mining — real aggregate stats over closed trades, beyond
// the tier-only grouping tierStats() already does in autopilot-journal.js.
// Every function is honest about small samples: below MIN_SAMPLE trades for
// a given bucket, it returns null instead of presenting a noisy 1-2-trade
// "pattern" as if it were real — same standard already used elsewhere in
// this app (e.g. MyTradesTab's "⏳ N/20 trades — keep going" treatment).
//
// As of this writing, real trade history in this environment is ~zero
// (data/autopilot-journal.json and data/journal.json don't exist yet) — this
// module is the data pipeline + math, not a claim that patterns exist today.
// It gets more useful as real trades accumulate.
const { readJournal } = require("./autopilot-journal");

const MIN_SAMPLE_DAY = 10;    // per-weekday bucket
const MIN_SAMPLE_HOUR = 10;   // per-hour bucket
const MIN_SAMPLE_SECTOR = 5;  // per-sector bucket
const MIN_SAMPLE_HOLD = 5;    // overall avg-hold-time

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Find the journal entry (setup tags) matching a closed trade, same join
// tierStats() already uses — symbol match, most recent journal buy at/before
// the close (within a 6h grace window for same-day exits).
function journalMatchFor(trade, journal) {
  const closeTs = new Date(trade.closedAt).getTime();
  return journal
    .filter(j => j.symbol === trade.symbol && j.ts <= closeTs + 6 * 3600_000)
    .sort((a, b) => b.ts - a.ts)[0] || null;
}

// Win rate grouped by the weekday the trade was OPENED (the day the decision
// was made, not the exit day) — never computed anywhere in the app before.
function winRateByDayOfWeek(closedTrades) {
  const buckets = {}; // day name -> { n, wins, pnl }
  for (const t of (closedTrades || [])) {
    if (!t.openedAt) continue;
    const day = DAY_NAMES[new Date(t.openedAt).getDay()];
    const b = buckets[day] || { n: 0, wins: 0, pnl: 0 };
    b.n++; if (Number(t.pnl) > 0) b.wins++; b.pnl += Number(t.pnl) || 0;
    buckets[day] = b;
  }
  const out = {};
  for (const day of DAY_NAMES) {
    const b = buckets[day];
    out[day] = (b && b.n >= MIN_SAMPLE_DAY)
      ? { n: b.n, winRate: Math.round((b.wins / b.n) * 100), pnl: Math.round(b.pnl) }
      : null;
  }
  return out;
}

// Win rate grouped by the ET hour the trade was opened — never computed
// anywhere in the app before.
function winRateByHour(closedTrades) {
  const buckets = {}; // hour (0-23, ET) -> { n, wins, pnl }
  for (const t of (closedTrades || [])) {
    if (!t.openedAt) continue;
    const etStr = new Date(t.openedAt).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false });
    const hour = parseInt(etStr, 10);
    if (!Number.isFinite(hour)) continue;
    const b = buckets[hour] || { n: 0, wins: 0, pnl: 0 };
    b.n++; if (Number(t.pnl) > 0) b.wins++; b.pnl += Number(t.pnl) || 0;
    buckets[hour] = b;
  }
  const out = {};
  for (const [hour, b] of Object.entries(buckets)) {
    out[hour] = b.n >= MIN_SAMPLE_HOUR
      ? { n: b.n, winRate: Math.round((b.wins / b.n) * 100), pnl: Math.round(b.pnl) }
      : null;
  }
  return out;
}

// Average hold time (minutes) — openedAt/closedAt are already on every
// closed-trade object (routes/alpaca.js's FIFO matching) but nothing in the
// app ever actually computed hold duration from them before.
function avgHoldTime(closedTrades) {
  const holds = (closedTrades || [])
    .filter(t => t.openedAt && t.closedAt)
    .map(t => (new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()) / 60000)
    .filter(m => Number.isFinite(m) && m >= 0);
  if (holds.length < MIN_SAMPLE_HOLD) return null;
  const avgMin = holds.reduce((s, m) => s + m, 0) / holds.length;
  return {
    n: holds.length,
    avgMinutes: Math.round(avgMin),
    label: avgMin < 60 ? `${Math.round(avgMin)}m` : avgMin < 1440 ? `${(avgMin / 60).toFixed(1)}h` : `${(avgMin / 1440).toFixed(1)}d`,
  };
}

// Win rate / P&L grouped by sector — requires the sector tag added to
// autopilot-journal.js entries; trades with no matching tagged sector are
// excluded (not bucketed as a fake "unknown" pattern).
function sectorPerformance(closedTrades) {
  const journal = readJournal();
  const buckets = {}; // sector -> { n, wins, pnl }
  for (const t of (closedTrades || [])) {
    const cand = journalMatchFor(t, journal);
    if (!cand || !cand.sector) continue;
    const b = buckets[cand.sector] || { n: 0, wins: 0, pnl: 0 };
    b.n++; if (Number(t.pnl) > 0) b.wins++; b.pnl += Number(t.pnl) || 0;
    buckets[cand.sector] = b;
  }
  const out = {};
  for (const [sector, b] of Object.entries(buckets)) {
    out[sector] = b.n >= MIN_SAMPLE_SECTOR
      ? { n: b.n, winRate: Math.round((b.wins / b.n) * 100), pnl: Math.round(b.pnl) }
      : null;
  }
  return out;
}

// Best/worst single trades by P&L — same simple pattern already used in
// routes/journal.js's /api/journal/stats, applied here to the real Alpaca
// closed-trade set instead of the (currently empty) manual journal.
function bestWorstTrades(closedTrades, n = 3) {
  const sorted = [...(closedTrades || [])].filter(t => t.pnl != null).sort((a, b) => Number(b.pnl) - Number(a.pnl));
  if (!sorted.length) return { best: [], worst: [] };
  return {
    best: sorted.slice(0, n).map(t => ({ symbol: t.symbol, pnl: Math.round(t.pnl), closedAt: t.closedAt })),
    worst: sorted.slice(-n).reverse().map(t => ({ symbol: t.symbol, pnl: Math.round(t.pnl), closedAt: t.closedAt })),
  };
}

// One-line human-readable summary of whichever patterns currently have
// enough sample size — for wiring into ai-coach.js's weekly/monthly reviews.
// Returns "" (not a placeholder string) when nothing has enough data yet, so
// callers can cleanly omit an empty section rather than showing "N/A" noise.
function patternSummaryLine(closedTrades) {
  const lines = [];
  const byDay = winRateByDayOfWeek(closedTrades);
  const bestDay = Object.entries(byDay).filter(([, v]) => v).sort((a, b) => b[1].winRate - a[1].winRate)[0];
  if (bestDay) lines.push(`Best day: ${bestDay[0]} (${bestDay[1].winRate}% win, ${bestDay[1].n} trades)`);
  const hold = avgHoldTime(closedTrades);
  if (hold) lines.push(`Avg hold: ${hold.label} (${hold.n} trades)`);
  const bySector = sectorPerformance(closedTrades);
  const bestSector = Object.entries(bySector).filter(([, v]) => v).sort((a, b) => b[1].winRate - a[1].winRate)[0];
  if (bestSector) lines.push(`Best sector: ${bestSector[0]} (${bestSector[1].winRate}% win, ${bestSector[1].n} trades)`);
  return lines.join("\n");
}

module.exports = { winRateByDayOfWeek, winRateByHour, avgHoldTime, sectorPerformance, bestWorstTrades, patternSummaryLine };
