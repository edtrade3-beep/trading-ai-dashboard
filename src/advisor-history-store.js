// advisor-history-store.js — rolling daily snapshots for ADVISOR AI's
// "What Changed?" section. ai-coach-store.js only ever keeps the LATEST
// output per report type (overwritten each run), so there was no real
// history anywhere in this app to diff a brief against — this is the
// dedicated store that makes real day/week/month/quarter comparisons
// possible instead of the AI having to guess or the section being omitted
// entirely. Same writeJsonAtomic/readJsonSafe pattern as every other store.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "advisor-history.json");
const MAX_DAYS = 100; // comfortably covers a rolling quarter of daily snapshots

const etDateStr = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

function loadHistory() {
  const data = readJsonSafe(STORE_PATH, { days: [] });
  return Array.isArray(data.days) ? data.days : [];
}

// Replaces today's entry if buildAdvisorBrief runs more than once in a day
// (e.g. repeated manual refreshes) rather than appending duplicates — each
// calendar day (ET) keeps exactly one, most-recent snapshot.
function appendSnapshot(snapshot) {
  const days = loadHistory();
  const today = etDateStr();
  const filtered = days.filter((d) => d.date !== today);
  filtered.push({ ...snapshot, date: today });
  filtered.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const trimmed = filtered.slice(-MAX_DAYS);
  writeJsonAtomic(STORE_PATH, { days: trimmed });
  return trimmed;
}

// Latest snapshot at or before `daysAgo` days back from today (ET) — not an
// exact-N-days-ago lookup, since snapshots only exist for days the brief
// was actually generated (weekends/holidays/days it wasn't run have gaps).
function snapshotDaysAgo(days, daysAgo) {
  const target = new Date();
  target.setDate(target.getDate() - daysAgo);
  const targetStr = etDateStr(target);
  let best = null;
  for (const d of days) {
    if (d.date <= targetStr) best = d;
    else break;
  }
  return best;
}

module.exports = { loadHistory, appendSnapshot, snapshotDaysAgo, etDateStr };
