"use strict";
// autopilot-idempotency.js — Unified Autopilot merge, Stage 5 (see
// .claude/plans/proud-yawning-unicorn.md). Real, atomic duplicate-order
// protection shared by server-autopilot.js and lightbox-autopilot-
// execute.js, which both trade the SAME real Alpaca paper account on
// different triggers (a 5-min timer vs. a human HTTP tap) — a genuine
// race is possible if both ever try to enter the same symbol at nearly
// the same real moment. Same promise-chain mutex pattern autopilot2-
// account.js's own withWriteLock already proved out (added 2026-09-01
// after a real reproduced duplicate-order bug), keyed per-symbol here
// instead of one single global lock so two DIFFERENT symbols can still
// proceed concurrently — only a genuine same-symbol race serializes.
const _locks = new Map(); // symbol -> current tail promise

// Runs fn() only after every prior call for the SAME symbol has settled
// (success or failure) — a real, atomic critical section, not a check-
// then-act race. Different symbols never block each other.
function withSymbolLock(symbol, fn) {
  const key = String(symbol || "").toUpperCase();
  const prior = _locks.get(key) || Promise.resolve();
  const run = prior.then(fn, fn);
  _locks.set(key, run.then(() => {}, () => {}));
  return run;
}

// One canonical idempotency-key convention for any NEW order-placement
// path — existing per-system prefixes (sap-, lba-) stay valid on their
// own historical orders; this doesn't rename or migrate anything already
// placed, it just gives new code one shared scheme instead of a fourth
// ad hoc prefix.
function buildIdempotencyKey({ source, symbol, dateET, correlationId = null }) {
  const base = `uap-${source}-${String(symbol || "").toUpperCase()}-${dateET}`;
  return correlationId ? `${base}-${correlationId}` : base;
}

module.exports = { withSymbolLock, buildIdempotencyKey };
