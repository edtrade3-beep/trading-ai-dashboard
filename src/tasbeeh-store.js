"use strict";

// tasbeeh-store.js — real, persisted state for the Telegram /tasbeeh
// interactive counter (2026-09-12 command-table update). This bot is
// single-user (one fixed TELEGRAM_CHAT_ID — see telegram-bot.js's own
// header), so one real global state object is enough — same convention
// prayer-times.js already uses for its own per-day state file.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STATE_PATH = path.join(ROOT, "data", "tasbeeh-state.json");

// Real, standard dhikr phrases — same "static, hand-verified religious
// text, never AI-generated" discipline as azkar-content.js.
const DHIKR_LIST = [
  { ar: "سُبْحَانَ اللَّهِ", label: "Subhan Allah" },
  { ar: "الْحَمْدُ لِلَّهِ", label: "Alhamdulillah" },
  { ar: "اللَّهُ أَكْبَرُ", label: "Allahu Akbar" },
  { ar: "لَا إِلَٰهَ إِلَّا اللَّهُ", label: "La ilaha illallah" },
  { ar: "أَسْتَغْفِرُ اللَّهَ", label: "Astaghfirullah" },
  { ar: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ", label: "Subhan Allahi wa bihamdih" },
  { ar: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ", label: "La hawla wala quwwata illa billah" },
];

const TARGETS = [33, 100, 300, 1000];

function defaultState() {
  return { dhikrIndex: 0, count: 0, target: 33, history: [] };
}

function loadTasbeeh() {
  const s = readJsonSafe(STATE_PATH, null);
  if (!s || typeof s !== "object") return defaultState();
  const dhikrIndex = Number.isInteger(s.dhikrIndex) && s.dhikrIndex >= 0 && s.dhikrIndex < DHIKR_LIST.length ? s.dhikrIndex : 0;
  const count = Number.isFinite(s.count) && s.count >= 0 ? Math.floor(s.count) : 0;
  const target = s.target === null || TARGETS.includes(Number(s.target)) ? (s.target === null ? null : Number(s.target)) : 33;
  const history = Array.isArray(s.history) ? s.history.slice(-50) : [];
  return { dhikrIndex, count, target, history };
}

function saveTasbeeh(state) { writeJsonAtomic(STATE_PATH, state); }

function increment(state) {
  const next = { ...state, count: state.count + 1, history: [...state.history, state.count] };
  saveTasbeeh(next);
  return next;
}

function undo(state) {
  if (!state.history.length) return state;
  const history = state.history.slice(0, -1);
  const count = state.history[state.history.length - 1];
  const next = { ...state, count, history };
  saveTasbeeh(next);
  return next;
}

function reset(state) {
  const next = { ...state, count: 0, history: [] };
  saveTasbeeh(next);
  return next;
}

function setDhikr(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= DHIKR_LIST.length) return state;
  const next = { ...state, dhikrIndex: index, count: 0, history: [] };
  saveTasbeeh(next);
  return next;
}

function setTarget(state, target) {
  const t = target === null ? null : Number(target);
  if (t !== null && !TARGETS.includes(t)) return state;
  const next = { ...state, target: t };
  saveTasbeeh(next);
  return next;
}

module.exports = { DHIKR_LIST, TARGETS, defaultState, loadTasbeeh, saveTasbeeh, increment, undo, reset, setDhikr, setTarget };
