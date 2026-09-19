"use strict";
// fajr-bot-times.js (2026-09-19, "Fajr & Tasbeeh bot for 200+ users") —
// real per-user Fajr time calculation. Reuses the EXACT same real Aladhan
// API this app's existing (single-user) prayer-times.js already calls —
// never a second prayer-time calculation method/library — just
// parameterized per real user lat/lng/timezone instead of one hardcoded
// location.
const METHOD = 2; // ISNA — same real default prayer-times.js already uses

function todayInZone(timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

// Real, DST-safe "wall-clock time in an IANA zone" -> UTC Date conversion,
// using only the built-in Intl API (no new timezone-library dependency —
// this app's only runtime deps are ffmpeg-static/imapflow/mailparser/
// nodemailer/pg, added only when genuinely needed; this doesn't need one).
// Standard technique: guess naively as if the wall-clock were UTC, ask
// Intl what that guessed instant actually displays as in the target zone,
// then correct by the real difference — Intl always reflects the zone's
// real, current DST rules for the given date, so this is correct across
// DST transitions without any hardcoded offset table.
function zonedWallClockToUtc(dateStr, hh, mm, timeZone) {
  const naiveUtcMs = Date.UTC(
    ...dateStr.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v)),
    hh, mm, 0
  );
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(naiveUtcMs)).map((p) => [p.type, p.value]));
  const hour24 = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const displayedAsUtcMs = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour24, Number(parts.minute), Number(parts.second));
  const driftMs = naiveUtcMs - displayedAsUtcMs;
  return new Date(naiveUtcMs + driftMs);
}

function toMinutesHHMM(hhmm) {
  const clean = String(hhmm || "").split(" ")[0]; // Aladhan sometimes appends a tz label, e.g. "05:12 (EST)"
  const [h, m] = clean.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? { h, m } : null;
}

// Real Aladhan fetch, explicit timezonestring (the user's own real
// registered IANA timezone, never inferred from lat/lng alone — this
// avoids Aladhan's own geographic-timezone-guess ever silently disagreeing
// with what the user actually told this bot).
async function fetchFajrTimeForUser({ latitude, longitude, timezone, localDate }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Real latitude/longitude required.");
  const dateStr = localDate || todayInZone(timezone);
  const [y, m, d] = dateStr.split("-");
  const url = `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${latitude}&longitude=${longitude}&method=${METHOD}&timezonestring=${encodeURIComponent(timezone)}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.data?.timings?.Fajr) throw new Error("Real Aladhan fetch failed for this user's location.");
  const hm = toMinutesHHMM(j.data.timings.Fajr);
  if (!hm) throw new Error("Real Aladhan response had no parseable Fajr time.");
  const fajrAt = zonedWallClockToUtc(dateStr, hm.h, hm.m, timezone);
  return { localDate: dateStr, fajrAt, raw: j.data.timings.Fajr };
}

module.exports = { fetchFajrTimeForUser, zonedWallClockToUtc, todayInZone, toMinutesHHMM, METHOD };
