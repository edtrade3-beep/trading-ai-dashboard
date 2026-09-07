"use strict";

// story-ai-story-agent.js — Story Agent (Arabic Story AI, spec §"1. STORY
// AGENT"). Turns a topic into a structured Arabic story script via the
// one shared Claude service (story-ai-claude.js). Pure orchestration —
// all Arabic-writing judgment lives in the system prompt, not in code.

const { callStoryAiJson } = require("./story-ai-claude");
const { MAX_NOTES_LENGTH } = require("./story-ai-config");

const REQUIRED_FIELDS = [
  "topic", "category", "story_type", "title_ar", "hook_ar",
  "narration_ar", "lesson_ar", "ending_question_ar", "estimated_duration_seconds",
];

const STYLE_GUIDE = {
  inspirational: "Inspirational — uplifting, motivating, forward-looking.",
  psychological: "Psychological — grounded in real human behavior/emotion, reflective.",
  islamic_reflection: "Islamic Reflection — general faith-based reflection on values, NOT a claimed Quran/Hadith citation (that only ever comes from the Verification Agent's own strict sourcing, never invented here).",
  historical: "Historical — grounded in real, well-known history; do not invent specific dates/quotes/figures that cannot be verified.",
  wisdom: "Wisdom — a timeless lesson framed simply.",
  life_lesson: "Life Lesson — everyday, relatable stakes.",
  children: "Children — simple vocabulary, gentle stakes, clear moral, no frightening imagery.",
  custom: "Follow the user's own notes for tone/direction.",
};

function buildSystemPrompt({ dialect, style }) {
  const styleNote = STYLE_GUIDE[style] || STYLE_GUIDE.inspirational;
  const dialectNote = dialect && dialect !== "msa"
    ? `Write in the ${dialect} Arabic dialect, natural for spoken narration in that region.`
    : "Write in clear, contemporary Modern Standard Arabic (MSA) suitable for voice-over — NOT overly academic/classical Arabic.";
  return [
    "You are the Story Agent inside an Arabic vertical-video storytelling studio.",
    "You write ONE short story script from a topic, for a professional narrated video.",
    dialectNote,
    `Story style: ${styleNote}`,
    "",
    "Requirements for the narration:",
    "- Natural spoken Arabic, emotionally engaging, never robotic or stiff.",
    "- A strong curiosity hook in the FIRST 2-3 seconds of narration — the opening line must make someone stop scrolling.",
    "- A coherent narrative arc: setup, conflict/challenge, emotional development, turning point, meaning, lesson.",
    "- End with ONE short, thought-provoking question directed at the viewer (not a generic call to action).",
    "- Do not claim any statement is a proven scientific fact, a Quran verse, a Hadith, or a historical quote unless it is genuinely well-established — a separate Verification Agent will review this afterward, so when uncertain, phrase it as a commonly-told story or a general reflection rather than an asserted fact.",
    "",
    "Return ONLY one JSON object, no prose outside it, with exactly these fields:",
    '{"topic":"","category":"","story_type":"symbolic|historical|religious|scientific|factual|fictional|mixed","title_ar":"","hook_ar":"","narration_ar":"","lesson_ar":"","ending_question_ar":"","estimated_duration_seconds":120}',
    "narration_ar must be the FULL narration text (the hook is its opening line, already included), written to run approximately the requested duration when read aloud at a natural, calm pace (~2.3 Arabic words per second is a reasonable estimate).",
  ].join("\n");
}

function validateStory(json) {
  const missing = REQUIRED_FIELDS.filter((f) => json[f] === undefined || json[f] === null || json[f] === "");
  if (missing.length) throw new Error(`Story Agent output is missing required field(s): ${missing.join(", ")}`);
  if (typeof json.narration_ar !== "string" || json.narration_ar.trim().length < 20) {
    throw new Error("Story Agent output has an implausibly short narration_ar.");
  }
  return json;
}

async function generateStory({ topic, durationSeconds = 120, style = "inspirational", dialect = "msa", notes = "", apiKey }) {
  const cleanTopic = String(topic || "").trim();
  if (!cleanTopic) throw new Error("A topic is required.");
  const cleanNotes = String(notes || "").trim().slice(0, MAX_NOTES_LENGTH);

  const prompt = [
    `Topic: ${cleanTopic}`,
    `Target duration: ${durationSeconds} seconds`,
    cleanNotes ? `Additional notes from the user: ${cleanNotes}` : null,
  ].filter(Boolean).join("\n");

  const { json, costUSD, model } = await callStoryAiJson({
    system: buildSystemPrompt({ dialect, style }),
    prompt,
    apiKey,
    tier: "sonnet",
    maxTokens: 2500,
    feature: "story-ai-story",
  });

  const story = validateStory(json);
  story.topic = story.topic || cleanTopic;
  story.estimated_duration_seconds = Number(story.estimated_duration_seconds) || durationSeconds;
  return { story, costUSD, model };
}

module.exports = { generateStory, validateStory, REQUIRED_FIELDS, buildSystemPrompt };
