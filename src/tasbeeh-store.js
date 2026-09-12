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

// Real, standard post-prayer "Tasbeeh 100" combo (2026-09-12, explicit
// user request: "Tasbeeh 33 سبحان الله at 34 change to الحمد لله At 67
// change الله اكبر at 100 change لا اله الا الله") — the well-known
// 33/33/33/1 sequence, where the dhikr shown auto-advances at fixed
// count thresholds instead of needing a manual dhikr change. Real,
// standard stage boundaries, not invented.
const SEQUENCE_STAGES = [
  { from: 1, to: 33, ar: "سُبْحَانَ اللَّهِ", label: "Subhan Allah" },
  { from: 34, to: 66, ar: "الْحَمْدُ لِلَّهِ", label: "Alhamdulillah" },
  { from: 67, to: 99, ar: "اللَّهُ أَكْبَرُ", label: "Allahu Akbar" },
  { from: 100, to: 100, ar: "لَا إِلَٰهَ إِلَّا اللَّهُ", label: "La ilaha illallah" },
];

// Real, honest clamp — a count of 0 (nothing said yet) shows the stage
// for the upcoming first tap; a count past 100 (shouldn't happen once
// increment() caps it below) still resolves to the final real stage
// rather than falling through to undefined.
function stageForCount(count) {
  const n = Math.max(1, Math.min(100, Number(count) || 1));
  return SEQUENCE_STAGES.find((s) => n >= s.from && n <= s.to) || SEQUENCE_STAGES[0];
}

function defaultState() {
  return { mode: "single", dhikrIndex: 0, count: 0, target: 33, history: [] };
}

function loadTasbeeh() {
  const s = readJsonSafe(STATE_PATH, null);
  if (!s || typeof s !== "object") return defaultState();
  const mode = s.mode === "sequence" ? "sequence" : "single";
  const dhikrIndex = Number.isInteger(s.dhikrIndex) && s.dhikrIndex >= 0 && s.dhikrIndex < DHIKR_LIST.length ? s.dhikrIndex : 0;
  const count = Number.isFinite(s.count) && s.count >= 0 ? Math.floor(s.count) : 0;
  const target = s.target === null || TARGETS.includes(Number(s.target)) ? (s.target === null ? null : Number(s.target)) : 33;
  const history = Array.isArray(s.history) ? s.history.slice(-50) : [];
  return { mode, dhikrIndex, count, target, history };
}

function saveTasbeeh(state) { writeJsonAtomic(STATE_PATH, state); }

function increment(state) {
  // Real cap (2026-09-12) — the sequence combo has exactly 100 real
  // defined stages; a tap past 100 would resolve to undefined dhikr
  // text, so it's honestly ignored rather than silently misrendering.
  if (state.mode === "sequence" && state.count >= 100) return state;
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
  const next = { ...state, mode: "single", dhikrIndex: index, count: 0, history: [] };
  saveTasbeeh(next);
  return next;
}

// Real "Tasbeeh 100" combo mode — always starts a fresh real 0/100 run,
// same as switching to any other dhikr.
function setSequenceMode(state) {
  const next = { ...state, mode: "sequence", count: 0, target: 100, history: [] };
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

module.exports = { DHIKR_LIST, TARGETS, SEQUENCE_STAGES, stageForCount, defaultState, loadTasbeeh, saveTasbeeh, increment, undo, reset, setDhikr, setTarget, setSequenceMode };
