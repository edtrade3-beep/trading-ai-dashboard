"use strict";
// autopilot-order-store.js — Unified Autopilot merge, Stage 3 (see
// .claude/plans/proud-yawning-unicorn.md). One persisted, append-only
// transition log per order/position — same real Postgres-backed
// atomic-write.js primitive and {records:[]}/MAX_RECORDS-cap shape
// trade-gps-audit-store.js already established, so this gets the same
// real durability (transparently Postgres-backed when DATABASE_URL is
// set) without inventing a new persistence mechanism.
//
// Stage 3 is SHADOW MODE ONLY — server-autopilot.js and lightbox-
// autopilot-execute.js write real transition records here ALONGSIDE
// their existing real order placement, purely observational. Nothing
// reads this store to gate a decision yet; that starts in a later stage,
// once a full trading day's worth of real records has been checked
// against Alpaca's own order history by hand.
const path = require("path");
const { readJsonSafe, writeJsonAtomic } = require("./atomic-write");
const { createRecord, applyTransition } = require("./autopilot-state-machine");

const STORE_PATH = path.join(__dirname, "..", "data", "autopilot-order-log.json");
const MAX_RECORDS = 5000; // real, disclosed cap — oldest pruned first, never silently unbounded

function readStore() {
  const data = readJsonSafe(STORE_PATH, { records: [] });
  return Array.isArray(data.records) ? data.records : [];
}
function writeStore(records) {
  const trimmed = records.length > MAX_RECORDS ? records.slice(records.length - MAX_RECORDS) : records;
  writeJsonAtomic(STORE_PATH, { records: trimmed });
}

// Starts a new real transition log at RECEIVED and persists it. Returns
// the created record (with its real id, generated here if not supplied).
function startOrder({ id, symbol, decisionCorrelationId = null, source, meta = null }) {
  const realId = id || `${source || "autopilot"}-${symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record = createRecord({ id: realId, symbol, decisionCorrelationId, source, meta });
  const records = readStore();
  records.push(record);
  writeStore(records);
  return record;
}

// Appends a real, validated transition to an existing record by id.
// Throws (via applyTransition's own assertTransition) on an invalid
// transition rather than silently recording a wrong state — same fail-
// loud discipline as the state machine itself. Returns the updated
// record, or null if no record with that id exists (an honest no-op,
// never fabricating a record that was never started).
function transition(id, to, opts = {}) {
  const records = readStore();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated = applyTransition(records[idx], to, opts);
  records[idx] = updated;
  writeStore(records);
  return updated;
}

function getOrder(id) {
  return readStore().find((r) => r.id === id) || null;
}

function getRecentOrders({ window = 100, symbol = null, source = null } = {}) {
  let records = readStore();
  if (symbol) records = records.filter((r) => r.symbol === symbol);
  if (source) records = records.filter((r) => r.source === source);
  return records.slice(-Math.max(1, Number(window) || 100));
}

module.exports = { startOrder, transition, getOrder, getRecentOrders, STORE_PATH, MAX_RECORDS };
