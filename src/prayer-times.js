// prayer-times.js — real Telegram prayer-time notifications, server-side
// (explicit user request, 2026-08-23: "wire the Athan feature to Telegram").
// The existing Athan feature (AthanTab.jsx/MonitorAthan.jsx) is entirely
// browser-based — real prayer times from the Aladhan API, but only ever
// fires while a tab happens to be open. This is the same real Aladhan API
// call, made server-side on a background tick, so a real Telegram message
// goes out at each prayer time regardless of whether the app is open.
//
// Location matches the app's own existing hardcoded default (axiom-live.jsx)
// — Fairfield, OH 45014. Not user-configurable yet; if a different location
// is ever wanted, this is the one place to change.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured } = require("./telegram");

const LOCATION = { lat: 39.3266, lng: -84.5479, label: "Fairfield, OH 45014" };
// ISNA (Islamic Society of North America, method 2) — explicit user request
// 2026-08-25, replacing the original Umm Al-Qura default; ISNA is the
// standard convention for a US location like this one.
const METHOD = 2;

// Sunrise deliberately excluded — it's a real Aladhan field but not a real
// prayer, matching AthanTab.jsx's own "next prayer" logic (which filters
// `p.key !== "Sunrise"`).
const PRAYERS = [
  { key: "Fajr", label: "Fajr", ar: "الفجر", emoji: "🌅" },
  { key: "Dhuhr", label: "Dhuhr", ar: "الظهر", emoji: "☀️" },
  { key: "Asr", label: "Asr", ar: "العصر", emoji: "🌇" },
  { key: "Maghrib", label: "Maghrib", ar: "المغرب", emoji: "🌆" },
  { key: "Isha", label: "Isha", ar: "العشاء", emoji: "🌙" },
];

const STATE_PATH = path.join(ROOT, "data", "prayer-times-state.json");
function loadState() {
  const s = readJsonSafe(STATE_PATH, {});
  return { date: s.date || null, times: s.times || null, hijri: s.hijri || null, alerted: Array.isArray(s.alerted) ? s.alerted : [] };
}
function saveState(s) { writeJsonAtomic(STATE_PATH, s); }

// Real Hijri date, straight off the same Aladhan response used for the
// timings (explicit user request 2026-08-25: "add Hijri date") — no
// separate call, no client-side Hijri math.
function formatHijri(h) {
  if (!h) return null;
  return `${h.day} ${h.month?.en || ""} ${h.year} AH`.replace(/\s+/g, " ").trim();
}

function todayET() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}
// Real ET wall-clock minutes-since-midnight — compared directly against
// Aladhan's own HH:MM strings (already returned in the query location's
// local time for a lat/lng request), so this never needs to construct an
// absolute Date/handle DST itself, same as MonitorAthan.jsx's client-side
// `now.getHours()*60+now.getMinutes()` comparison, just re-derived
// server-side via the same real ET round-trip every other background job
// in this app already uses (risk-guardrails.js's isMarketHoursET, etc.).
function nowMinutesET() {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return et.getHours() * 60 + et.getMinutes();
}
function toMinutes(hhmm) {
  const clean = String(hhmm || "").split(" ")[0]; // Aladhan sometimes appends a tz label, e.g. "05:12 (EST)"
  const [h, m] = clean.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

async function fetchTimesForToday() {
  const ts = Math.floor(Date.now() / 1000);
  const url = `https://api.aladhan.com/v1/timings/${ts}?latitude=${LOCATION.lat}&longitude=${LOCATION.lng}&method=${METHOD}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.data?.timings) throw new Error("real Aladhan fetch failed");
  return { timings: j.data.timings, hijri: j.data.date?.hijri || null };
}

// Real, persisted per-day state — fetches fresh once per real ET day.
// Any prayer whose time has already passed at the moment this first runs
// today (a fresh day rollover, or a server restart mid-day) is marked
// alerted WITHOUT sending a notification — only prayers still ahead are
// ever eligible for a real, timely alert. Prevents a backlog of "FAJR was
// 8 hours ago" messages on every deploy/restart.
async function ensureTodayState() {
  const today = todayET();
  const state = loadState();
  if (state.date === today && state.times) return state;
  const { timings: times, hijri } = await fetchTimesForToday();
  const nowMin = nowMinutesET();
  const alreadyPast = PRAYERS.filter((p) => { const m = toMinutes(times[p.key]); return m != null && m <= nowMin; }).map((p) => p.key);
  const fresh = { date: today, times, hijri, alerted: alreadyPast };
  saveState(fresh);
  return fresh;
}

// Real background tick (server.js, every 60s, no market-hours gate —
// prayer times run every day, not just trading days).
async function tickPrayerNotify() {
  let state;
  try { state = await ensureTodayState(); } catch (e) { return { ok: false, error: e.message }; }
  const nowMin = nowMinutesET();
  let alertedNow = 0;
  for (const p of PRAYERS) {
    if (state.alerted.includes(p.key)) continue;
    const pMin = toMinutes(state.times[p.key]);
    if (pMin == null || nowMin < pMin) continue;
    state.alerted.push(p.key);
    alertedNow++;
    if (isConfigured()) {
      const hijriLine = formatHijri(state.hijri);
      await sendTelegramMessage(`${p.emoji} ${p.label.toUpperCase()} (${p.ar}) — ${state.times[p.key]}\n📍 ${LOCATION.label}${hijriLine ? `\n🌙 ${hijriLine}` : ""}`).catch(() => {});
    }
  }
  if (alertedNow) saveState(state);
  return { ok: true, alertedNow };
}

// Real, compact "next prayer + countdown" — the /prayer command
// (2026-09-12 command-table update: "Next prayer in your area, its time,
// and countdown" — deliberately narrower than the full timetable below,
// which is now its own separate /prayertimes command). Same real Aladhan
// state as everything else in this file, no separate fetch.
async function formatNextPrayerMessage() {
  let state;
  try { state = await ensureTodayState(); } catch (e) { return `Couldn't fetch real prayer times right now (${e.message}).`; }
  const nowMin = nowMinutesET();
  const next = PRAYERS.find((p) => { const m = toMinutes(state.times[p.key]); return m != null && m > nowMin; });
  if (!next) return `🕌 ${LOCATION.label}\n✅ All 5 prayers complete for today. Next real update after midnight ET.`;
  const diff = toMinutes(state.times[next.key]) - nowMin;
  return [
    `${next.emoji} Next prayer: ${next.label} (${next.ar})`,
    `🕐 ${state.times[next.key]} — 📍 ${LOCATION.label}`,
    `⏳ ${Math.floor(diff / 60)}h ${diff % 60}m remaining`,
  ].join("\n");
}

// Real, on-demand full timetable — used by the /prayertimes Telegram
// command (the /athan alias keeps its original combined name).
async function formatScheduleMessage() {
  let state;
  try { state = await ensureTodayState(); } catch (e) { return `Couldn't fetch real prayer times right now (${e.message}).`; }
  const nowMin = nowMinutesET();
  const next = PRAYERS.find((p) => { const m = toMinutes(state.times[p.key]); return m != null && m > nowMin; });
  const hijriLine = formatHijri(state.hijri);
  const lines = [`🕌 PRAYER TIMES — ${LOCATION.label}`, ...(hijriLine ? [`🌙 ${hijriLine}`] : []), "━━━━━━━━━━━━━━━━━━━━"];
  for (const p of PRAYERS) {
    const isNext = next && next.key === p.key;
    lines.push(`${p.emoji} ${p.label.padEnd(8)} ${state.times[p.key]}${isNext ? "  ← next" : ""}`);
  }
  lines.push("━━━━━━━━━━━━━━━━━━━━");
  if (next) {
    const diff = toMinutes(state.times[next.key]) - nowMin;
    lines.push(`⏳ ${Math.floor(diff / 60)}h ${diff % 60}m until ${next.label}`);
  } else {
    lines.push("⏳ All 5 prayers complete for today.");
  }
  return lines.join("\n");
}

// Real Gregorian + Hijri date (2026-09-12 command-table update: "Today's
// Gregorian and Islamic Hijri dates"). The Hijri half reuses this same
// file's own real Aladhan state (no separate call); the Gregorian half is
// plain real wall-clock date formatting — never computed/converted by
// hand, since Hijri-Gregorian conversion has real regional moon-sighting
// variance this app has no authority to resolve on its own.
async function formatDateMessage() {
  const gregorian = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());
  let hijriLine = "Hijri date unavailable right now.";
  try {
    const state = await ensureTodayState();
    const h = formatHijri(state.hijri);
    if (h) hijriLine = `🌙 ${h}`;
  } catch { /* honest fallback line above stands */ }
  return [`📅 ${gregorian}`, hijriLine].join("\n");
}

module.exports = { tickPrayerNotify, formatScheduleMessage, formatNextPrayerMessage, formatDateMessage, ensureTodayState, formatHijri, toMinutes, nowMinutesET, LOCATION, PRAYERS };
