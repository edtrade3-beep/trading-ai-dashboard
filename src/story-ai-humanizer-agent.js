"use strict";

// story-ai-humanizer-agent.js — Arabic Humanizer Agent (2026-09-10,
// explicit user request: "changing the buttons alone will not solve the
// unnatural Arabic voice problem... use one clean generation pipeline:
// TOPIC -> STORY WRITER -> ARABIC HUMANIZER -> VOICE DIRECTOR -> TTS").
//
// A dedicated second Claude pass, deliberately separate from
// story-ai-story-agent.js — the Story Writer's own job is narrowed back
// to WHAT happens (plot, structure, hook, character, factual/religious
// safety); this agent's only job is HOW it's said (spoken delivery,
// rhythm, punctuation for TTS). Splitting these into two real calls
// (rather than asking one call to do both, which is what this pipeline
// did before this change) matches the user's own explicit architecture
// and gives this step its own real, independently-retryable pipeline
// stage — not a second, silently-duplicated copy of the same rules
// living in two files.
//
// Voice Performance/Emotion/Pauses (spec's own "Voice Director" controls)
// are folded into THIS prompt, not faked as TTS API parameters — the
// configured TTS providers (story-ai-tts-provider.js: Google/ElevenLabs/
// Azure) don't expose a real "emotion" or "pause density" knob for their
// standard voices. Speed is the one setting that maps to a genuine TTS
// parameter (speakingRate/speed) and is wired separately in
// runVoiceStep. Disclosed here rather than silently pretending a UI
// slider changes something it can't.

const { callStoryAiJson } = require("./story-ai-claude");

const PERFORMANCE_GUIDE = {
  natural_storyteller: "A natural, warm storyteller speaking casually to one listener — the default, versatile delivery.",
  warm: "Extra warmth and gentleness — like a caring relative telling a comforting story.",
  calm: "Slow, calm, deliberate delivery — minimal urgency, lots of breathing room.",
  emotional: "More emotionally expressive word choice and rhythm — lean into feeling without overdoing it.",
  dramatic: "Heightened tension and weight at key moments — real stakes, real suspense, still natural.",
  documentary: "Measured, informative, slightly more matter-of-fact — like a calm narrator explaining real events.",
  spiritual: "Peaceful, reflective, sincere — appropriate for Islamic Reflection or wisdom stories, never preachy.",
};

const EMOTION_GUIDE = {
  low: "Keep emotional intensity subdued and understated throughout.",
  medium: "Natural emotional variation — calmer in setup, warmer at emotional beats.",
  high: "Lean noticeably into emotional peaks at the story's key turning points, while staying natural (not melodramatic).",
};

const PAUSE_GUIDE = {
  light: "Use pauses (commas, periods) sparingly — a brisker, more continuous flow.",
  natural: "Use commas and periods at natural spoken breath points — the default rhythm.",
  dramatic: "Add a few more deliberate pauses (short sentences on their own, occasional meaningful ellipses) around the story's key moments only.",
};

function buildSystemPrompt({ voiceSettings = {}, dialect = "msa" } = {}) {
  const performance = PERFORMANCE_GUIDE[voiceSettings.performance] || PERFORMANCE_GUIDE.natural_storyteller;
  const emotion = EMOTION_GUIDE[voiceSettings.emotion] || EMOTION_GUIDE.medium;
  const pauses = PAUSE_GUIDE[voiceSettings.pauses] || PAUSE_GUIDE.natural;
  // Real bug found live (2026-09-10): without this, "sound natural" alone
  // led Claude to substitute in actual regional dialect vocabulary
  // (رأى -> شاف, حين -> لما) even when MSA was requested — colloquial IS
  // how Arabic is spoken day-to-day, so "natural" alone under-specifies
  // which register. Naturalness and dialect are separate axes: MSA can
  // (and, per this app's own spec, must) still sound spoken and warm
  // without borrowing another dialect's actual words.
  const dialectNote = dialect && dialect !== "msa"
    ? `Write in the ${dialect} Arabic dialect throughout — natural for spoken narration in that region.`
    : "Stay in Modern Standard Arabic (MSA) throughout — natural, warm, conversational MSA, but do NOT substitute in words or verb forms from a specific regional dialect (e.g., don't replace رأى with شاف, or حين with لما). Naturalness comes from simple vocabulary, short sentences, and rhythm — not from switching register.";

  return [
    "You are the Arabic Humanizer Agent inside a story-video pipeline — the Voice Director's own script polish pass.",
    "You receive an Arabic story narration that was written for its PLOT, and your only job is to rewrite it so it sounds NATURAL when spoken aloud by an AI voice — like a skilled human storyteller speaking directly to the listener, not someone reading a book, a newspaper, or a school text.",
    "Write for the EAR, not for the page. Do not change what happens in the story, its characters, or its meaning — only HOW it is said.",
    dialectNote,
    "",
    `Requested voice performance: ${performance}`,
    `Requested emotional intensity: ${emotion}`,
    `Requested pause style: ${pauses}`,
    "",
    "LANGUAGE",
    "- Clear, warm, conversational Arabic. Prefer simple vocabulary over literary vocabulary.",
    "- Short and medium-length sentences. Break up any long or complicated sentence — long sentences make TTS voices sound robotic.",
    "- Remove academic Arabic, newspaper-style phrasing, and repetitive sentence patterns.",
    "",
    "QUESTION MARKS — be extremely strict:",
    "- Maximum 1-2 rhetorical questions in the ENTIRE narration. If the input already has more, rewrite the extras into statements.",
    "- Never turn normal narration into a question just to sound conversational.",
    "- Bad: ولكن ماذا حدث؟ / وهل استسلم؟ — Good: لكن ما حدث بعد ذلك غيّر كل شيء... / لم يستسلم، واستمر بصبر.",
    "",
    "PUNCTUATION FOR TEXT-TO-SPEECH",
    "- Commas for short pauses. Periods often, so the voice can breathe.",
    "- Ellipses (...) ONLY for a genuinely meaningful pause or suspense beat — never overuse them.",
    "- Do not overuse exclamation marks.",
    "",
    "DIALOGUE — keep any spoken lines short and natural, not formal.",
    "",
    "Before returning, silently check: rewrite anything that still sounds written rather than spoken; vary sentence length so it doesn't fall into one repetitive rhythm; make sure the emotional intensity matches what's happening scene to scene, not uniformly dramatic throughout. Final gut check: \"Would an Arabic listener feel a real person is telling them this, right now?\" If no, rewrite before returning.",
    "",
    "Return ONLY one JSON object, no prose outside it: {\"narration_ar\":\"\"}",
    "narration_ar must be the COMPLETE rewritten narration (same length/content coverage as the input — you are restyling delivery, not summarizing or shortening the story).",
  ].join("\n");
}

async function humanizeNarration({ narrationAr, voiceSettings, dialect, apiKey }) {
  if (!narrationAr || !narrationAr.trim()) throw new Error("A generated narration is required to humanize.");

  const { json, costUSD, model } = await callStoryAiJson({
    system: buildSystemPrompt({ voiceSettings, dialect }),
    prompt: `Original narration:\n${narrationAr}`,
    apiKey,
    tier: "sonnet",
    maxTokens: 2500,
    feature: "story-ai-humanizer",
  });

  if (typeof json.narration_ar !== "string" || json.narration_ar.trim().length < 20) {
    throw new Error("Humanizer Agent output has an implausibly short narration_ar.");
  }
  return { narrationAr: json.narration_ar, costUSD, model };
}

module.exports = { humanizeNarration, buildSystemPrompt, PERFORMANCE_GUIDE, EMOTION_GUIDE, PAUSE_GUIDE };
