// Persists the trading Lesson of the Day (Learning AI, Phase 5) — same
// writeJsonAtomic/readJsonSafe pattern as every other store this session.
// Keeps a small recent-titles history (capped at 20, same cap ai-lesson's
// Arabic/Quran lesson generator already uses) so the AI doesn't repeat
// itself, plus today's lesson keyed by ET date so it only generates once
// per day unless the user forces a refresh.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "trading-lesson.json");
const MAX_RECENT = 20;

function load() {
  return readJsonSafe(STORE_PATH, { today: null, todayDate: null, recent: [] });
}

function loadRecentTitles() {
  return load().recent || [];
}

function saveLesson(lesson, etDate) {
  const store = load();
  store.today = lesson;
  store.todayDate = etDate;
  store.recent = [lesson.title, ...(store.recent || [])].filter(Boolean).slice(0, MAX_RECENT);
  writeJsonAtomic(STORE_PATH, store);
  return store;
}

module.exports = { load, loadRecentTitles, saveLesson };
