// horse-opportunity-crossover.js — Horse Hunter upgrade (2026-08-26): the
// spec's "⭐ BEST OF BOTH WORLDS" — a symbol that's simultaneously a real
// long-term Horse (high fw_scores.future_wealth_score) AND a real
// short-term Light Box opportunity right now (high attentionScore from
// /api/market/lightbox, this session's earlier Opportunity Hunter work).
// Pure real join over two already-real, already-computed datasets — no new
// fetch, no fabrication. A symbol only appears here if it genuinely clears
// BOTH disclosed thresholds on BOTH sides.
"use strict";

const { withTimeout } = require("./utils");

const DEFAULT_THRESHOLDS = { horseScore: 65, attentionScore: 70 };

// Pure — exported for unit testing with hand-built rows.
function computeCrossover(horseRows, lightboxRows, thresholds = DEFAULT_THRESHOLDS) {
  const horseBySymbol = new Map();
  for (const h of horseRows || []) {
    const symbol = String(h.symbol || "").toUpperCase();
    if (symbol) horseBySymbol.set(symbol, h);
  }
  const out = [];
  for (const lb of lightboxRows || []) {
    const symbol = String(lb.symbol || "").toUpperCase();
    if (!symbol) continue;
    const horse = horseBySymbol.get(symbol);
    if (!horse) continue;
    const horseScore = horse.future_wealth_score != null ? Number(horse.future_wealth_score) : null;
    const attentionScore = lb.attentionScore != null ? Number(lb.attentionScore) : null;
    if (horseScore == null || attentionScore == null) continue;
    if (horseScore < thresholds.horseScore || attentionScore < thresholds.attentionScore) continue;
    out.push({
      symbol, horseScore, attentionScore,
      horseStage: horse.stageLabel || horse.status || null,
      lifecycle: lb.lifecycle || null,
      ev: lb.ev ?? null,
    });
  }
  return out.sort((a, b) => (b.horseScore + b.attentionScore) - (a.horseScore + a.attentionScore));
}

// Real orchestration: pulls the real latest Horse scores+stages and the
// real live Light Box opportunity rows, joins them. Self-loopback fetch to
// /api/market/lightbox wrapped in withTimeout — same real lesson from the
// Light Box tick-freeze incident earlier this session (an unbounded hang
// in a recurring/background-adjacent call must never be allowed to hang
// forever with no thrown error).
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
async function getBestOfBothWorlds(thresholds = DEFAULT_THRESHOLDS) {
  const { getLatestScores, getLatestStages } = require("./future-wallet-synthesis");
  const [scores, stages, lightboxRes] = await Promise.all([
    getLatestScores().catch(() => []),
    getLatestStages().catch(() => []),
    withTimeout(fetch(`${BASE()}/api/market/lightbox`), 8000, null).then((r) => (r ? withTimeout(r.json(), 8000, null) : null)).catch(() => null),
  ]);
  const stageBySymbol = new Map(stages.map((s) => [s.symbol, s.status]));
  const horseRows = scores.map((s) => ({ ...s, stageLabel: stageBySymbol.get(s.symbol) || null }));
  const lightboxRows = Array.isArray(lightboxRes?.rows) ? lightboxRes.rows : [];
  return computeCrossover(horseRows, lightboxRows, thresholds);
}

module.exports = { DEFAULT_THRESHOLDS, computeCrossover, getBestOfBothWorlds };
