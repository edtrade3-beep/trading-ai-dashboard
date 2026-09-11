"use strict";

// story-ai-critic-agent.js — AI Story Critic (Story AI 2.0, §33/34 of the
// user's explicit revised spec, 2026-09-11). A real, adversarial second
// pass over the humanized, verified narration — deliberately does NOT
// automatically praise the first draft (the spec's own words: "Do not
// automatically praise the first draft. Look for weaknesses."). Finds
// real, specific story-craft weaknesses a viewer would actually notice
// (weak hook, unclear motivation, a flat middle with no escalation,
// redundant beats, an unearned/predictable ending, real contradictions,
// unnatural spoken Arabic, wrong length for the requested duration) and,
// only when it finds a genuine issue, produces ONE revision addressing
// it — never a cosmetic rewrite of an already-solid story. The pre-critic
// version is always kept (never silently lost, same discipline as the
// Humanizer's own narration_ar_original), and the critique itself is
// always disclosed on the project, whether or not a revision happened.
const { callStoryAiJson } = require("./story-ai-claude");

function buildSystemPrompt() {
  return [
    "You are a skeptical, experienced Arabic story editor reviewing a colleague's draft before it goes into production. Your job is NOT to praise it — find real, specific weaknesses a viewer would actually notice, or honestly say there are none. A story with no real issues should come back unchanged; do not invent a problem just to have something to fix.",
    "",
    "Check specifically:",
    "- Does the opening (hook) create real curiosity in the first few seconds, or is it a slow, generic opening?",
    "- Is the central problem/want clear, and does the character's motivation make sense?",
    "- Does the story escalate (something real changes, a real stake gets higher), or does the middle stay flat?",
    "- Are there redundant sentences or beats that repeat an earlier point without adding anything new?",
    "- Does the ending actually resolve the central problem, or does it feel unearned, abrupt, or predictable?",
    "- Are there any real contradictions (a fact or detail that conflicts with an earlier part of the same story)?",
    "- Does the Arabic sound natural when spoken aloud, or does any part read like formal writing rather than speech?",
    "- Is the narration roughly the right length for the requested spoken duration (too short leaves dead air, too long forces rushing)?",
    "",
    "If you find one or more REAL issues: rewrite the fields needed to fix them, keeping everything that already works. If you find no real issues, return the original text completely unchanged.",
    "",
    "Return ONLY one JSON object, no prose outside it:",
    '{"weaknesses":["short, specific findings — empty array if genuinely none"],"revised":true|false,"revisionNotes":"one sentence on what changed and why, or empty string if revised is false","title_ar":"","hook_ar":"","narration_ar":"","lesson_ar":"","ending_question_ar":""}',
    "When revised is false, still return the ORIGINAL title_ar/hook_ar/narration_ar/lesson_ar/ending_question_ar verbatim — never leave them blank.",
  ].join("\n");
}

async function critiqueAndRevise({ story, durationSeconds, style, apiKey }) {
  if (!story?.narration_ar) throw new Error("A humanized story is required for the Story Critic.");
  const prompt = [
    `Story style: ${style || "inspirational"}`,
    `Target spoken duration: ${durationSeconds || 120} seconds`,
    `Title: ${story.title_ar || ""}`,
    `Hook: ${story.hook_ar || ""}`,
    `Narration:\n${story.narration_ar}`,
    `Lesson: ${story.lesson_ar || ""}`,
    `Ending question: ${story.ending_question_ar || ""}`,
  ].join("\n\n");

  const { json, costUSD, model } = await callStoryAiJson({
    system: buildSystemPrompt(),
    prompt,
    apiKey,
    tier: "sonnet",
    maxTokens: 3000,
    feature: "story-ai-critic",
    timeoutMs: 90000,
  });

  const weaknesses = Array.isArray(json.weaknesses) ? json.weaknesses.filter((w) => typeof w === "string" && w.trim()).slice(0, 10) : [];
  // Real, disclosed guard: only ever treat this as a genuine revision when
  // BOTH the model said revised:true AND it actually found a real
  // weakness to justify it — never a silent rewrite with an empty
  // findings list (that would be exactly the "cosmetic rewrite for no
  // reason" this agent exists to avoid).
  const revised = !!json.revised && weaknesses.length > 0;
  return {
    weaknesses,
    revised,
    revisionNotes: revised ? String(json.revisionNotes || "").trim().slice(0, 500) : "",
    story: {
      title_ar: json.title_ar || story.title_ar,
      hook_ar: json.hook_ar || story.hook_ar,
      narration_ar: json.narration_ar || story.narration_ar,
      lesson_ar: json.lesson_ar || story.lesson_ar,
      ending_question_ar: json.ending_question_ar || story.ending_question_ar,
    },
    costUSD, model,
  };
}

module.exports = { critiqueAndRevise, buildSystemPrompt };
