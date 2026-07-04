// Setup-tagged trade journal. Every autopilot BUY is logged with the setup tags
// (tier, passCount, RS, entry/stop/target). Joined with Alpaca closed-trade P&L,
// this tells us which setups actually make money — so we can cut the ones that don't.
const fs = require("node:fs");
const path = require("node:path");

const JOURNAL_PATH = path.join(__dirname, "..", "data", "autopilot-journal.json");

function readJournal() {
  try { return JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8")) || []; } catch { return []; }
}
function appendJournal(entry) {
  try {
    const arr = readJournal();
    arr.push(entry);
    const trimmed = arr.slice(-800);   // keep the most recent 800 entries
    fs.mkdirSync(path.dirname(JOURNAL_PATH), { recursive: true });
    fs.writeFileSync(JOURNAL_PATH, JSON.stringify(trimmed), "utf8");
  } catch {}
}

// Join journal entries (by symbol, most recent before close) with closed-trade P&L
// and roll up win rate + avg R per TIER.
function tierStats(closedTrades) {
  const journal = readJournal();
  const byTier = {};   // tier -> { n, wins, pnl, rSum }
  for (const t of (closedTrades || [])) {
    const closeTs = new Date(t.closedAt).getTime();
    // find the latest journal buy for this symbol at/before the close
    const cand = journal
      .filter(j => j.symbol === t.symbol && j.ts <= closeTs + 6 * 3600_000)
      .sort((a, b) => b.ts - a.ts)[0];
    const tier = cand ? cand.tier : "?";
    const risk = cand && cand.entry > cand.stop ? (cand.entry - cand.stop) : null;
    const r = (risk && cand.qty) ? (Number(t.pnl) / (risk * cand.qty)) : null;
    const s = byTier[tier] || { n: 0, wins: 0, pnl: 0, rSum: 0, rN: 0 };
    s.n++; if (Number(t.pnl) > 0) s.wins++; s.pnl += Number(t.pnl) || 0;
    if (r != null && isFinite(r)) { s.rSum += r; s.rN++; }
    byTier[tier] = s;
  }
  return byTier;
}

function tierStatsLine(closedTrades) {
  const st = tierStats(closedTrades);
  const tiers = Object.keys(st).sort();
  if (!tiers.length) return "";
  return tiers.map(k => {
    const s = st[k];
    const wr = Math.round(s.wins / s.n * 100);
    const avgR = s.rN ? (s.rSum / s.rN).toFixed(2) : "?";
    return `Tier ${k}: ${s.n} trades · ${wr}% win · ${avgR}R · $${Math.round(s.pnl)}`;
  }).join("\n");
}

module.exports = { readJournal, appendJournal, tierStats, tierStatsLine };
