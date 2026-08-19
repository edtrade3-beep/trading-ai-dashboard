// src/news/sentiment.js — 5-tier sentiment (spec §5), built on the same
// real deterministic keyword scorer already used elsewhere in this app
// (src/routes/agent.js's scoreSentiment/BULL_WORDS/BEAR_WORDS) rather than
// inventing a third divergent word list (there are already two — this
// file's own header exists specifically to point future edits back at the
// one canonical source instead of a fourth). No AI call — same "use AI
// classification only when necessary" discipline as the rest of this app's
// scoring engines.
"use strict";

const { scoreSentiment } = require("../routes/agent");

// Contextual-override rule (spec §5's explicit example: "Revenue increased
// 40%, but guidance was reduced" must NOT auto-classify bullish). Forward-
// looking guidance/outlook language is weighted as the thing that actually
// moves forward expectations — a real backward-looking beat co-occurring
// with a real forward-looking cut caps the read at NEUTRAL, never bullish.
// Proximity match, not exact phrases — real headlines vary word order/tense
// ("guidance was reduced" vs "reduced guidance" vs "guidance cut") more than
// a fixed phrase list can cover; this catches a forward-looking noun
// (guidance/outlook/forecast) within ~25 characters of a real reduction verb
// in either direction.
const GUIDANCE_CUT_RE = /\b(guidance|outlook|forecast)\b[\s\S]{0,25}\b(cut|cuts|cutting|lower|lowers|lowered|reduce|reduces|reduced|below|miss|missed|weak|soft|disappointing)\w*|\b(cut|cuts|cutting|lower|lowers|lowered|reduce|reduces|reduced)\w*[\s\S]{0,25}\b(guidance|outlook|forecast)\b/i;
const BACKWARD_BEAT_PHRASES = [
  "revenue increased", "revenue grew", "revenue rose", "revenue up", "revenue jumped",
  "earnings beat", "profit rose", "profit increased", "record revenue", "record profit",
  "beat expectations", "topped estimates", "exceeded estimates",
];

function containsAny(text, phrases) {
  const t = text.toLowerCase();
  return phrases.some((p) => t.includes(p));
}

const TIER_LABELS = ["STRONGLY_BEARISH", "BEARISH", "NEUTRAL", "BULLISH", "STRONGLY_BULLISH"];

function tierFromScore(score) {
  if (score <= -4) return "STRONGLY_BEARISH";
  if (score <= -1) return "BEARISH";
  if (score >= 4) return "STRONGLY_BULLISH";
  if (score >= 1) return "BULLISH";
  return "NEUTRAL";
}

/**
 * @param {{headline: string, summary?: string}} item
 * @returns {{sentiment: string, score: number, contextualOverride: boolean, reasons: string[]}}
 */
function classifySentiment(item) {
  const text = `${item.headline || ""}. ${item.summary || ""}`;
  const { score } = scoreSentiment(text);
  const reasons = [];

  const hasGuidanceCut = GUIDANCE_CUT_RE.test(text);
  const hasBackwardBeat = containsAny(text, BACKWARD_BEAT_PHRASES);
  const contextualOverride = hasGuidanceCut && hasBackwardBeat && score > 0;

  let sentiment = tierFromScore(score);
  if (contextualOverride) {
    sentiment = "NEUTRAL";
    reasons.push("Backward-looking growth language co-occurs with a real forward-looking guidance cut — capped at NEUTRAL rather than reading the beat alone as bullish.");
  } else {
    reasons.push(`Keyword sentiment score ${score >= 0 ? "+" : ""}${score} (same real BULL_WORDS/BEAR_WORDS scorer used across this app).`);
  }

  return { sentiment, score, contextualOverride, reasons };
}

module.exports = { classifySentiment, tierFromScore, TIER_LABELS };
