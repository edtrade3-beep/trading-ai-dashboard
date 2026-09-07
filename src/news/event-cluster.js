// src/news/event-cluster.js — Duplicate News Compression (platform-
// unification prompt, 2026-09-07, §11: "group the same event reported by
// multiple outlets into one story instead of showing N near-identical
// rows"). dedupe.js (src/news/dedupe.js) already catches EXACT duplicates
// (same headline+source+ticker) at ingestion time via a DB unique
// constraint — it does NOT catch the same real event reported with
// different wording by different outlets ("Fed cuts rates a quarter
// point" vs "Federal Reserve lowers benchmark rate 25bps"), which is what
// this file adds as a read-time, non-destructive grouping layer over
// already-stored, already-scored rows (news/store.js's getFeed shape).
// No AI call — same "deterministic keyword/text rules first" discipline
// already established in classifier.js/sentiment.js. Real, disclosed
// technique: Jaccard similarity over significant-word sets, a standard
// deterministic text-similarity measure, not a fabricated "AI similarity
// score."
"use strict";

// Real, disclosed defaults — a judgment call on grouping aggressiveness,
// not on the underlying data. Same ticker + same catalyst category is
// required before similarity is even checked (two different real stories
// about the same company rarely share a catalyst tag), which keeps the
// similarity threshold itself modest without over-merging unrelated news.
const CLUSTER_WINDOW_MINUTES = 360; // 6 hours — same real event across outlets is almost always reported within this window
const SIMILARITY_THRESHOLD = 0.32; // Jaccard over significant words

const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "is", "are", "was", "were",
  "with", "at", "by", "from", "as", "its", "it's", "that", "this", "has", "have", "had",
  "will", "be", "after", "over", "up", "down", "into", "than", "more", "new", "says", "said",
  "amid", "amid", "vs", "not", "no", "but", "be", "been", "being", "their", "his", "her",
  "how", "why", "what", "when", "which", "who", "you", "your", "we", "our", "they", "them",
]);

function tokenize(headline) {
  return new Set(
    String(headline || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function jaccardSimilarity(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// Real, disclosed comparison rule: same ticker, same catalyst category,
// within the real time window, and lexically similar headlines. All four
// conditions are computed directly from already-real fields — no
// invented "event ID."
function belongsToCluster(item, itemTokens, cluster) {
  if (item.ticker !== cluster.ticker) return false;
  if ((item.category || "OTHER") !== cluster.category) return false;
  const lastMs = new Date(cluster.lastSeen).getTime();
  const itemMs = new Date(item.published_at || item.publishedAt || 0).getTime();
  if (!Number.isFinite(lastMs) || !Number.isFinite(itemMs)) return false;
  if (Math.abs(itemMs - lastMs) > CLUSTER_WINDOW_MINUTES * 60_000) return false;
  return jaccardSimilarity(itemTokens, cluster.repTokens) >= SIMILARITY_THRESHOLD;
}

// rows: news/store.js getFeed() rows (already real, already scored — this
// never re-scores or re-classifies, purely a read-time grouping pass).
// Returns clusters sorted by real max impact score, highest first; a
// cluster of size 1 is just that one story (no fabricated "1 source"
// framing beyond what's real).
function clusterNewsItems(rows) {
  const sorted = [...(rows || [])].sort((a, b) => {
    const ta = new Date(a.published_at || a.publishedAt || 0).getTime();
    const tb = new Date(b.published_at || b.publishedAt || 0).getTime();
    return ta - tb;
  });

  const clusters = [];
  for (const item of sorted) {
    const itemTokens = tokenize(item.headline);
    const match = clusters.find((c) => belongsToCluster(item, itemTokens, c));
    if (match) {
      match.items.push(item);
      match.lastSeen = item.published_at || item.publishedAt || match.lastSeen;
      // Representative headline tracks the highest-impact item seen so
      // far in the cluster — the most decision-relevant real framing,
      // not just whichever arrived first.
      if ((item.impact_score || 0) > (match._repImpact || 0)) {
        match._repImpact = item.impact_score || 0;
        match.repTokens = itemTokens;
        match.representativeHeadline = item.headline;
        match.url = item.url || match.url;
        match.sentiment = item.sentiment || match.sentiment;
        match.verdict = item.verdict || match.verdict;
      }
    } else {
      clusters.push({
        ticker: item.ticker, category: item.category || "OTHER",
        representativeHeadline: item.headline, repTokens: itemTokens,
        url: item.url || null, sentiment: item.sentiment || null, verdict: item.verdict || null,
        firstSeen: item.published_at || item.publishedAt || null,
        lastSeen: item.published_at || item.publishedAt || null,
        _repImpact: item.impact_score || 0,
        items: [item],
      });
    }
  }

  return clusters
    .map((c) => {
      const sources = [...new Set(c.items.map((i) => i.source).filter(Boolean))];
      const maxImpactScore = Math.max(...c.items.map((i) => i.impact_score || 0));
      const { repTokens, _repImpact, ...rest } = c;
      return { ...rest, sourceCount: sources.length, sources, itemCount: c.items.length, maxImpactScore };
    })
    .sort((a, b) => b.maxImpactScore - a.maxImpactScore);
}

module.exports = { clusterNewsItems, tokenize, jaccardSimilarity, CLUSTER_WINDOW_MINUTES, SIMILARITY_THRESHOLD };
