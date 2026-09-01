// refresh-cooldown.js — real, in-memory cost-control gate for on-demand
// AI "refresh" routes (2026-09-01 platform audit finding: research-intel,
// market-wrap, money-ideas, command-center, curbline-intel, and
// car-business's reprice/facebook-ad/facebook-strategy all trigger a real,
// expensive Anthropic call with zero protection against a double-click or
// a client-side retry loop firing the same real call twice).
//
// This is a personal, single-user platform (not a public multi-tenant
// API) — the real threat model here is an accidental repeat click or a
// retry, not abuse from other users, so a simple in-process lock is the
// right scale, not a per-IP rate limiter (checkRateLimit in rate-limit.js
// already covers that different, public-abuse-shaped concern for
// /api/autoexec).
//
// Two real protections in one small gate:
// 1. In-flight lock — a second call for the same real key while the
//    first hasn't finished yet is refused outright, regardless of how
//    long the first call's real Anthropic request takes (car-business's
//    real calls can run up to ~280s).
// 2. Minimum interval between call STARTS — even after the first call
//    finishes, a rapid re-click within minIntervalMs is refused.
"use strict";

const inFlight = new Set();
const lastStart = new Map();

// Returns { ok: true, release } if the caller may proceed (release() MUST
// be called, in a finally, once the real work finishes either way), or
// { ok: false, retryAfterMs } if refused.
function acquireRefreshLock(key, minIntervalMs = 15000) {
  if (inFlight.has(key)) {
    return { ok: false, retryAfterMs: minIntervalMs };
  }
  const last = lastStart.get(key) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < minIntervalMs) {
    return { ok: false, retryAfterMs: minIntervalMs - elapsed };
  }
  inFlight.add(key);
  lastStart.set(key, Date.now());
  return { ok: true, release: () => inFlight.delete(key) };
}

module.exports = { acquireRefreshLock };
