// src/paper-positions-store.js — server-side paper option position store,
// options platform redesign Phase 11 (Position Manager / AI Exit Engine).
// Mirrors src/portfolio-store.js's exact pattern (one JSON blob via the
// shared Postgres-backed atomic-write.js, not per-record files).
//
// Confirmed decision (Phase 11 architecture note): today's only prior
// paper-option concept (axiom-runner/components/trading-utils.js) is
// entirely client-side/localStorage with a fabricated `underlying×0.04`
// premium and a hand-rolled fake Greeks-decay model — used live in
// AutoPilotEngine.jsx/GreenLightTab.jsx/MyTradesTab.jsx. This store is a
// separate, new, 100%-real-data paper-position system (per the user's
// confirmed decision: "Position Manager tracks simulated positions fed by
// 100% real chain/Greeks data"). It does NOT touch or migrate those 3
// existing surfaces' fabricated model — that's a distinct, larger,
// separately-flagged refactor risk, not bundled into this phase.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "paper-positions.json");
const DEFAULT_STORE = { positions: [], updatedAt: null };

function loadStore() {
  const parsed = readJsonSafe(STORE_PATH, DEFAULT_STORE);
  return parsed && typeof parsed === "object" && Array.isArray(parsed.positions) ? parsed : DEFAULT_STORE;
}

function saveStore(positions) {
  try {
    writeJsonAtomic(STORE_PATH, { positions, updatedAt: new Date().toISOString() });
  } catch {}
}

function loadPositions() {
  return loadStore().positions;
}

// `symbol/type/strike/expiry` — real contract identity from a real chain
// fetch (GET /api/market/options). `entryPremium/entryUnderlying` — real
// prices at the moment of open, never estimated. `entryAiScore/
// entryStrategy/entryMarketBias` — real snapshots of whatever real
// engine (Phase 3/9/1) triggered the open, for later journal auto-log.
function openPosition({ symbol, type, strike, expiry, contractSymbol, qty, entryPremium, entryUnderlying, entryAiScore, entryStrategy, entryMarketBias }) {
  const positions = loadPositions();
  const position = {
    id: `pp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    symbol: String(symbol || "").toUpperCase(),
    type: type === "put" ? "put" : "call",
    strike: Number(strike) || 0,
    expiry: expiry || null,
    contractSymbol: contractSymbol || null,
    qty: Math.max(1, Math.round(Number(qty) || 1)),
    entryPremium: Number(entryPremium) || 0,
    entryUnderlying: Number(entryUnderlying) || null,
    entryDate: new Date().toISOString(),
    entryAiScore: entryAiScore ?? null,
    entryStrategy: entryStrategy ?? null,
    entryMarketBias: entryMarketBias ?? null,
    status: "open",
    currentPremium: Number(entryPremium) || 0,
    currentUnderlying: Number(entryUnderlying) || null,
    lastPriced: new Date().toISOString(),
    exitSignals: null,
    exitPremium: null,
    exitDate: null,
    exitReason: null,
  };
  positions.push(position);
  saveStore(positions);
  return position;
}

function closePosition(id, { exitPremium, exitReason } = {}) {
  const positions = loadPositions();
  const idx = positions.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const p = positions[idx];
  if (p.status === "closed") return p;
  const closed = {
    ...p,
    status: "closed",
    exitPremium: Number(exitPremium) || p.currentPremium,
    exitDate: new Date().toISOString(),
    exitReason: exitReason || "manual",
  };
  positions[idx] = closed;
  saveStore(positions);
  return closed;
}

// Real re-pricing snapshot — called by the periodic exit-signal job (or
// on-demand from the route) with a freshly-fetched real premium/exit
// signals. Never invents a price when the real fetch failed — callers
// simply skip the update for that position rather than call this with a
// guessed value.
function updatePositionPricing(id, { currentPremium, currentUnderlying, exitSignals } = {}) {
  const positions = loadPositions();
  const idx = positions.findIndex(p => p.id === id);
  if (idx === -1) return null;
  positions[idx] = {
    ...positions[idx],
    currentPremium: currentPremium != null ? Number(currentPremium) : positions[idx].currentPremium,
    currentUnderlying: currentUnderlying != null ? Number(currentUnderlying) : positions[idx].currentUnderlying,
    exitSignals: exitSignals ?? positions[idx].exitSignals,
    lastPriced: new Date().toISOString(),
  };
  saveStore(positions);
  return positions[idx];
}

function getPosition(id) {
  return loadPositions().find(p => p.id === id) || null;
}

function listOpenPositions() {
  return loadPositions().filter(p => p.status === "open");
}

function listClosedPositions() {
  return loadPositions().filter(p => p.status === "closed");
}

module.exports = {
  loadPositions, openPosition, closePosition, updatePositionPricing,
  getPosition, listOpenPositions, listClosedPositions,
};
