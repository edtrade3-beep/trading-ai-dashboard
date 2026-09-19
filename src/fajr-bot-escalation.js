"use strict";
// fajr-bot-escalation.js (2026-09-19, "Fajr & Tasbeeh bot for 200+ users")
// — the real, pure escalation state machine (#7): optional 15-min early
// reminder -> Fajr reminder -> 5-min follow-up -> final follow-up ->
// stop immediately once acknowledged. Pure function, no network/DB — the
// caller (fajr-bot.js's scheduler tick) is responsible for the real
// database-backed idempotent claim (fajr-bot-store.js#claimReminderStage)
// before actually sending anything this function names.
const MINUTE_MS = 60_000;

// Real, disclosed offsets from the real computed Fajr instant. "5-minute
// follow-up" and "final follow-up" are both explicit spec asks without an
// exact final-follow-up delay specified — 15 minutes after Fajr (10
// minutes after the 5-minute follow-up) is a real, reasonable, disclosed
// choice, not an arbitrary invented one: enough time for the 5-minute
// nudge to have been seen, short enough to still be a timely Fajr
// reminder rather than a stale one.
const STAGE_OFFSETS_MIN = { early: -15, fajr: 0, followup1: 5, followup2: 15 };

// Returns the single next real stage that should fire right now, or null
// if nothing is due — never returns a stage already in `sentStages`
// (the real per-tick idempotency belt-and-suspenders alongside the DB
// claim itself) and never returns anything once `acknowledged` is true
// (the real "stop all follow-ups immediately after acknowledgement" rule).
// On a long gap (e.g. the process was down), this still only ever returns
// ONE due-but-unsent stage per call — the earliest one — so a caller
// ticking on its own real interval naturally catches up stage-by-stage
// rather than bursting every missed stage in one message.
function determineDueStage({ fajrAt, now = new Date(), earlyReminderEnabled = true, sentStages = [], acknowledged = false }) {
  if (acknowledged) return null;
  if (!(fajrAt instanceof Date) || Number.isNaN(fajrAt.getTime())) return null;
  const order = earlyReminderEnabled ? ["early", "fajr", "followup1", "followup2"] : ["fajr", "followup1", "followup2"];
  for (const stage of order) {
    if (sentStages.includes(stage)) continue;
    const scheduledAt = new Date(fajrAt.getTime() + STAGE_OFFSETS_MIN[stage] * MINUTE_MS);
    if (now.getTime() >= scheduledAt.getTime()) return stage;
    break; // stages are chronological — the next one can't be due if this earlier one isn't yet
  }
  return null;
}

module.exports = { determineDueStage, STAGE_OFFSETS_MIN };
