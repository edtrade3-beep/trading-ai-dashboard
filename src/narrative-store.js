"use strict";

// narrative-store.js — persistence + shift-detection for the Narrative
// Shift Detector (see narrative-engine.js for the real classification
// logic). Unlike what-changed-store.js this is deliberately NOT day-scoped
// — a real macro narrative ("Soft Landing") can hold for weeks, so it
// would be wrong to reset it at midnight ET. Same file-backed-locally/
// Postgres-backed-in-production storage as every other store in this app
// (src/atomic-write.js's writeJsonAtomic/readJsonSafe).

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "narrative-history.json");
const MAX_HISTORY = 30; // real bound — 30 shifts is months of real narrative history for a macro cycle

const EMPTY = () => ({ current: null, since: null, evidence: [], history: [] });

function loadStore() { return readJsonSafe(STORE_PATH, EMPTY()); }
function saveStore(store) { writeJsonAtomic(STORE_PATH, store); }

// Records one real classification (narrative-engine.js's classifyNarrative
// output) and returns whether the DOMINANT LABEL itself changed. Evidence
// is always refreshed to the latest real read even when the label hasn't
// shifted, so a caller can always show "why this narrative still holds."
function recordNarrative({ narrative, evidence }) {
  const store = loadStore();
  const now = Date.now();

  if (!store.current) {
    store.current = narrative; store.since = now; store.evidence = evidence || [];
    saveStore(store);
    return { narrative, shifted: false, firstEverClassification: true, since: now, evidence: evidence || [], previous: null, history: store.history };
  }

  if (store.current === narrative) {
    store.evidence = evidence || [];
    saveStore(store);
    return { narrative, shifted: false, since: store.since, evidence: store.evidence, previous: null, history: store.history };
  }

  // Real shift — the dominant narrative label itself changed.
  const previous = store.current;
  const previousSince = store.since;
  store.history = [{ narrative: previous, since: previousSince, until: now }, ...store.history].slice(0, MAX_HISTORY);
  store.current = narrative;
  store.since = now;
  store.evidence = evidence || [];
  saveStore(store);
  return { narrative, shifted: true, since: now, evidence: evidence || [], previous, previousSince, history: store.history };
}

// Cheap, synchronous read — never recomputes, just returns whatever the
// most recent real tick already recorded. Honest null current when
// nothing has been classified yet.
function getCurrentNarrative() {
  const store = loadStore();
  return { narrative: store.current, since: store.since, evidence: store.evidence, history: store.history };
}

module.exports = { recordNarrative, getCurrentNarrative, loadStore, saveStore };
