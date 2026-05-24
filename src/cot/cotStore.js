"use strict";
/**
 * cotStore.js
 * File-based persistence for parsed COT data.
 * Stores per-market history and a top-level index in data/cot/.
 */

const fs   = require("node:fs");
const path = require("node:path");
const { ROOT } = require("../config");

const COT_DIR = path.join(ROOT, "data", "cot");

function ensureDir() {
  if (!fs.existsSync(COT_DIR)) fs.mkdirSync(COT_DIR, { recursive: true });
}

// ── Per-market history ────────────────────────────────────────────────────────

function marketFile(biasKey) {
  return path.join(COT_DIR, `${biasKey}.json`);
}

function loadMarketHistory(biasKey) {
  try {
    const f = marketFile(biasKey);
    if (!fs.existsSync(f)) return [];
    return JSON.parse(fs.readFileSync(f, "utf8")) || [];
  } catch { return []; }
}

/**
 * Upsert records for a market by date (keeps last 52 weeks).
 */
function saveMarketHistory(biasKey, records) {
  ensureDir();
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

  fs.writeFileSync(marketFile(biasKey), JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

// ── Top-level bias index ──────────────────────────────────────────────────────

const INDEX_FILE = path.join(COT_DIR, "index.json");

function loadIndex() {
  try {
    if (!fs.existsSync(INDEX_FILE)) return {};
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")) || {};
  } catch { return {}; }
}

/**
 * Save a computed bias result to the index keyed by biasKey.
 */
function saveBias(biasKey, biasResult) {
  ensureDir();
  const idx = loadIndex();
  idx[biasKey] = { ...biasResult, updatedAt: new Date().toISOString() };
  fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2), "utf8");
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
  try {
    if (!fs.existsSync(META_FILE)) return {};
    return JSON.parse(fs.readFileSync(META_FILE, "utf8")) || {};
  } catch { return {}; }
}

function saveMeta(updates) {
  ensureDir();
  const meta = { ...loadMeta(), ...updates, savedAt: new Date().toISOString() };
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), "utf8");
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
