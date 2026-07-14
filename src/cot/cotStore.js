"use strict";
/**
 * cotStore.js
 * File-based persistence for parsed COT data.
 * Stores per-market history and a top-level index in data/cot/.
 */

const path = require("node:path");
const { ROOT } = require("../config");
const { writeJsonAtomic, readJsonSafe } = require("../atomic-write");

const COT_DIR = path.join(ROOT, "data", "cot");

// ── Per-market history ────────────────────────────────────────────────────────

function marketFile(biasKey) {
  return path.join(COT_DIR, `${biasKey}.json`);
}

function loadMarketHistory(biasKey) {
  return readJsonSafe(marketFile(biasKey), []) || [];
}

/**
 * Upsert records for a market by date (keeps last 52 weeks).
 */
function saveMarketHistory(biasKey, records) {
  const existing = loadMarketHistory(biasKey);

  // Merge: index by reportDate
  const byDate = new Map(existing.map(r => [r.reportDate, r]));
  for (const r of records) {
    if (r.reportDate) byDate.set(r.reportDate, r);
  }

  // Keep sorted, max 52 weeks
  const merged = Array.from(byDate.values())
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
    .slice(-52);

  writeJsonAtomic(marketFile(biasKey), merged);
  return merged;
}

// ── Top-level bias index ──────────────────────────────────────────────────────

const INDEX_FILE = path.join(COT_DIR, "index.json");

function loadIndex() {
  return readJsonSafe(INDEX_FILE, {}) || {};
}

/**
 * Save a computed bias result to the index keyed by biasKey.
 */
function saveBias(biasKey, biasResult) {
  const idx = loadIndex();
  idx[biasKey] = { ...biasResult, updatedAt: new Date().toISOString() };
  writeJsonAtomic(INDEX_FILE, idx);
}

function getAllBiases() {
  return loadIndex();
}

function getMarketBias(biasKey) {
  const idx = loadIndex();
  return idx[biasKey] || null;
}

// ── Meta / freshness ──────────────────────────────────────────────────────────

const META_FILE = path.join(COT_DIR, "meta.json");

function loadMeta() {
  return readJsonSafe(META_FILE, {}) || {};
}

function saveMeta(updates) {
  const meta = { ...loadMeta(), ...updates, savedAt: new Date().toISOString() };
  writeJsonAtomic(META_FILE, meta);
  return meta;
}

/**
 * Returns whether the stored COT data is fresh (≤ 8 days old).
 * CFTC releases Fridays; data is "stale" if we haven't refreshed in >8 days.
 */
function isFresh() {
  const meta = loadMeta();
  if (!meta.lastFetchAt) return false;
  const age = Date.now() - new Date(meta.lastFetchAt).getTime();
  return age < 8 * 24 * 3600_000;
}

/**
 * Return the latest COT report date across all stored markets.
 */
function latestReportDate() {
  const idx = loadIndex();
  const dates = Object.values(idx).map(b => b.reportDate).filter(Boolean);
  if (!dates.length) return null;
  return dates.sort().pop();
}

module.exports = {
  loadMarketHistory, saveMarketHistory,
  saveBias, getAllBiases, getMarketBias,
  loadMeta, saveMeta, isFresh, latestReportDate,
};
