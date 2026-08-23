"use strict";
// sector-rotation-engine.js — real Sector Rotation ranking + Breadth score
// (Institutional Intelligence Phase 4, 2026-08-23, user's own "AM
// Trading" spec, "Phase 3 — Market": Sector Rotation, Breadth). Composes
// the real per-sector array + aggregate summary routes/market.js's own
// /api/market/breadth already computes (1-year real Yahoo bars for all
// 11 sector ETFs) — no new bar fetch, this is real ranking/scoring on top
// of already-computed real data.
//
// Disclosed, first-pass composite (same style as every prior
// Institutional Intelligence engine) — real inputs only, honest degrade
// when absent, not backtested/optimized.

function clampScore(n) { return Math.max(0, Math.min(100, Math.round(n))); }

// Standard, disclosed GICS-style offensive/defensive classification (not
// arbitrary): Technology/Discretionary/Industrials/Financials/Comm
// Services are the real growth-and-cycle-sensitive sectors; Staples/
// Utilities/Health Care/Real Estate are the real defensive/rate-sensitive
// sectors. Energy and Materials are commodity-driven and don't cleanly
// fall on either side — excluded from the bias read rather than forced
// into a category that would misrepresent them.
const OFFENSIVE_SECTORS = new Set(["XLK", "XLY", "XLI", "XLF", "XLC"]);
const DEFENSIVE_SECTORS = new Set(["XLP", "XLU", "XLV", "XLRE"]);

// Real per-sector rotation score off computeMarketBreadth()'s own
// {sym, name, change, ma50, ma200, above50, above200, pos52w, status}
// shape — blends today's single-day change (noisy alone) with the real
// structural above50/above200 flags and 52-week position, so a sector
// isn't ranked #1 purely off one volatile day.
function scoreSector(s) {
  let pts = 0;
  pts += Number.isFinite(s.change) ? Math.max(-15, Math.min(15, s.change * 5)) + 15 : 15; // 0-30, centered
  pts += s.above50 === true ? 20 : s.above50 === false ? 0 : 10;
  pts += s.above200 === true ? 20 : s.above200 === false ? 0 : 10;
  pts += Number.isFinite(s.pos52w) ? (s.pos52w / 100) * 30 : 15;
  return clampScore(pts);
}

// sectors: the real per-sector array computeMarketBreadth() already
// produces. Returns the real ranked list (highest rotation score first)
// plus topSector/weakestSector and a real rotationBias read.
function rankSectors(sectors) {
  const usable = (sectors || []).filter((s) => s && s.status !== "N/A");
  const ranked = usable
    .map((s) => ({ sym: s.sym, name: s.name, change: s.change, status: s.status, rotationScore: scoreSector(s) }))
    .sort((a, b) => b.rotationScore - a.rotationScore);

  if (!ranked.length) return { ranked: [], topSector: null, weakestSector: null, rotationBias: null };

  const topSector = ranked[0];
  const weakestSector = ranked[ranked.length - 1];

  // Real rotation-bias read off the top 3 ranked sectors' real
  // classification — majority offensive/defensive, or MIXED when neither
  // side has a real majority (including when top sectors are mostly
  // commodity-driven Energy/Materials, honestly not forced into a side).
  const top3 = ranked.slice(0, 3);
  const offCount = top3.filter((s) => OFFENSIVE_SECTORS.has(s.sym)).length;
  const defCount = top3.filter((s) => DEFENSIVE_SECTORS.has(s.sym)).length;
  const rotationBias = offCount > defCount && offCount >= 2 ? "OFFENSIVE"
    : defCount > offCount && defCount >= 2 ? "DEFENSIVE" : "MIXED";

  return { ranked, topSector, weakestSector, rotationBias };
}

// A real, disclosed 0-100 read off computeMarketBreadth()'s own real
// aggregate summary (above50Pct/above200Pct/adRatio) — already-real
// stats, just never scored/banded before this phase.
function computeBreadthScore(input = {}) {
  const summary = input.summary || {};
  const above50 = Number(summary.above50Pct);
  const above200 = Number(summary.above200Pct);
  const adRatio = Number(summary.adRatio);

  const factors = {
    above50Pct: Number.isFinite(above50) ? above50 : null,
    above200Pct: Number.isFinite(above200) ? above200 : null,
    adRatio: Number.isFinite(adRatio) ? adRatio : null,
  };

  let score = 0;
  score += !Number.isFinite(above50) ? 20 : (above50 / 100) * 40;
  score += !Number.isFinite(above200) ? 15 : (above200 / 100) * 30;
  score += !Number.isFinite(adRatio) ? 15
    : adRatio >= 2 ? 30 : adRatio >= 1 ? 20 : adRatio >= 0.5 ? 8 : 0;

  return { score: clampScore(score), factors };
}

module.exports = { rankSectors, computeBreadthScore, OFFENSIVE_SECTORS, DEFENSIVE_SECTORS };
