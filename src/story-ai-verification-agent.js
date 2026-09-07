"use strict";

// story-ai-verification-agent.js — Verification Agent (spec §"2.
// VERIFICATION AGENT" — "This is mandatory"). Classifies a generated
// story and flags weak-provenance claims (viral pseudo-science, invented
// religious attribution) BEFORE it's allowed downstream.
//
// Real, disclosed scope limit: this is an LLM safety review, not a
// lookup against a verified Quran/Hadith/citation database (no such
// database exists in this codebase or is in scope here). It cannot
// GUARANTEE a citation is real the way a database lookup could — it can
// only catch what a careful, explicitly-instructed reading would catch,
// same epistemic ceiling as research-intel-ai.js's own dataQuality
// labeling (FACT vs SPECULATION) elsewhere in this app. approved_for_
// publication is a real, meaningful gate (a project cannot proceed to
// paid image/voice/video steps while false), but it is not a substitute
// for human review of religious content — the UI must say so, not imply
// certainty this agent cannot back up.

const { callStoryAiJson } = require("./story-ai-claude");

const CLASSIFICATIONS = new Set(["symbolic", "historical", "religious", "scientific", "factual", "fictional", "mixed"]);

const SYSTEM_PROMPT = [
  "You are the Verification Agent inside an Arabic storytelling studio's safety pipeline.",
  "You review a generated story script for factual and religious safety BEFORE it is allowed to proceed to image/voice/video production.",
  "",
  "SCIENTIFIC RULE: many viral motivational stories are exaggerated or falsely described as real experiments (e.g. the mice-swimming-in-water experiment, the elephant-and-rope story, the boiling-frog story, the five-monkeys-and-bananas experiment). If the story's provenance is weak or these are the kind of commonly-told-but-unverified tales, classify it as 'symbolic' or note in warnings that it must not be narrated as \"scientists proved...\" or as an established fact — it should be told as a commonly-told story or illustrative parable instead.",
  "",
  "RELIGIOUS SAFETY RULE: never treat an invented Quran verse, Hadith, saying attributed to a Sahabi, scholar quote, or Islamic historical incident as verified. If the story references any of these and you cannot confirm it is a genuine, well-known, correctly-attributed reference, list it in warnings and set approved_for_publication to false until a human reviews it. Do not attempt to supply a real Surah/ayah number or Hadith reference yourself unless you are highly confident it is correct and commonly known — when in doubt, flag it, don't fabricate a citation to fill the field.",
  "",
  "Return ONLY one JSON object, no prose outside it:",
  '{"classification":"symbolic|historical|religious|scientific|factual|fictional|mixed","needs_verification":true,"claims":[{"claim":"","concern":"","severity":"low|medium|high"}],"warnings":[""],"approved_for_publication":true}',
  "approved_for_publication must be false whenever there is any high-severity claim or any unverified religious attribution. It may be true for a clearly symbolic/fictional/inspirational story with no factual or religious claims at all.",
].join("\n");

function validateVerification(json) {
  if (!CLASSIFICATIONS.has(json.classification)) {
    throw new Error(`Verification Agent returned an unrecognized classification: ${json.classification}`);
  }
  json.claims = Array.isArray(json.claims) ? json.claims : [];
  json.warnings = Array.isArray(json.warnings) ? json.warnings : [];
  json.needs_verification = Boolean(json.needs_verification);
  json.approved_for_publication = Boolean(json.approved_for_publication);
  return json;
}

async function verifyStory({ story, apiKey }) {
  if (!story?.narration_ar) throw new Error("A generated story is required for verification.");
  const prompt = [
    `Title: ${story.title_ar || ""}`,
    `Category: ${story.category || ""}`,
    `Narration:\n${story.narration_ar}`,
    story.lesson_ar ? `Lesson: ${story.lesson_ar}` : null,
  ].filter(Boolean).join("\n\n");

  const { json, costUSD, model } = await callStoryAiJson({
    system: SYSTEM_PROMPT,
    prompt,
    apiKey,
    tier: "sonnet",
    maxTokens: 1500,
    feature: "story-ai-verify",
  });

  return { verification: validateVerification(json), costUSD, model };
}

module.exports = { verifyStory, validateVerification, CLASSIFICATIONS, SYSTEM_PROMPT };
