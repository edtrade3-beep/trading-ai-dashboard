"use strict";

// prayer-query-engine.js — Master Agent, single-prayer time query (2026-09-11,
// explicit user request: "معاش صلاة الظهر أو العصر أو الصبح أو المغرب أو
// العشاء the system will answer me with the exact time of the prayer").
// Reuses the exact same real Aladhan-backed daily state src/prayer-times.js
// already fetches for the /athan Telegram command and the background
// notification tick — never a second, independently-fetched prayer-time
// source. Zero AI calls.
const { PRAYERS, LOCATION, ensureTodayState, formatHijri, toMinutes, nowMinutesET } = require("./prayer-times");

// "الصبح" (colloquial "morning prayer") is a real, common everyday
// alternative to "الفجر" (Fajr) in Maghrebi/Gulf dialects — both resolve to
// the same real prayer, never treated as a separate one.
const PRAYER_NAME_TO_KEY = {
  "الفجر": "Fajr", "الصبح": "Fajr",
  "الظهر": "Dhuhr",
  "العصر": "Asr",
  "المغرب": "Maghrib",
  "العشاء": "Isha",
};

function resolvePrayerKey(text) {
  const clean = String(text || "");
  for (const [name, key] of Object.entries(PRAYER_NAME_TO_KEY)) {
    if (clean.includes(name)) return key;
  }
  return null;
}

async function answerPrayerTimeQuery(text) {
  const key = resolvePrayerKey(text);
  if (!key) return null; // not a real prayer-time question — caller falls through to its own handling
  const prayer = PRAYERS.find((p) => p.key === key);
  const state = await ensureTodayState();
  const time = state.times?.[key] || null;
  if (!time) return `Couldn't get a real prayer time right now.`;
  const nowMin = nowMinutesET();
  const pMin = toMinutes(time);
  const hijriLine = formatHijri(state.hijri);
  const lines = [`${prayer.emoji} ${prayer.label} (${prayer.ar}) — ${time}`, `📍 ${LOCATION.label}`];
  if (pMin != null) {
    const diff = pMin - nowMin;
    if (diff > 0) lines.push(`⏳ in ${Math.floor(diff / 60)}h ${diff % 60}m`);
    else lines.push(`✅ already passed today (${Math.floor(-diff / 60)}h ${-diff % 60}m ago)`);
  }
  if (hijriLine) lines.push(`🌙 ${hijriLine}`);
  return lines.join("\n");
}

module.exports = { resolvePrayerKey, answerPrayerTimeQuery, PRAYER_NAME_TO_KEY };
