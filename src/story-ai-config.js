"use strict";

// story-ai-config.js — Arabic Story AI's own env configuration, kept
// deliberately separate from src/config.js (the trading platform's shared
// config) rather than merged into it — same "own env vars, own file"
// convention src/quick-trade-service.js already uses for its own real
// constants. Zero changes to config.js; zero risk to any existing reader
// of it. STORY_AI_ENABLED lets the whole feature be disabled without
// touching the trading platform at all.
const STORY_AI_ENABLED = String(process.env.STORY_AI_ENABLED ?? "true").trim().toLowerCase() !== "false";

// Optional override for every Story AI Claude call — e.g.
// ANTHROPIC_MODEL=claude-sonnet-5. When unset, story-ai-claude.js falls
// back to the same named tiers (MODELS.sonnet, etc.) every other AI
// feature in this app already uses (src/anthropic.js) — never a second,
// independently-hardcoded model id.
const ANTHROPIC_MODEL = (process.env.ANTHROPIC_MODEL || "").trim();

// Image generation — provider abstraction, no default provider assumed
// configured. NOT_CONFIGURED is a first-class, expected state, not an
// error: the pipeline must complete a script/scene breakdown with zero
// image credentials.
const IMAGE_PROVIDER = (process.env.STORY_AI_IMAGE_PROVIDER || "openai").trim().toLowerCase();
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const REPLICATE_API_TOKEN = (process.env.REPLICATE_API_TOKEN || "").trim();

// Text-to-speech — same abstraction discipline.
const TTS_PROVIDER = (process.env.STORY_AI_TTS_PROVIDER || "elevenlabs").trim().toLowerCase();
const ELEVENLABS_API_KEY = (process.env.ELEVENLABS_API_KEY || "").trim();
const ELEVENLABS_VOICE_MALE = (process.env.ELEVENLABS_VOICE_ID_MALE_AR || "").trim();
const ELEVENLABS_VOICE_FEMALE = (process.env.ELEVENLABS_VOICE_ID_FEMALE_AR || "").trim();
const AZURE_SPEECH_KEY = (process.env.AZURE_SPEECH_KEY || "").trim();
const AZURE_SPEECH_REGION = (process.env.AZURE_SPEECH_REGION || "").trim();

// Budget/limits — real, disclosed defaults, all overridable. Enforced by
// story-ai-job-runner.js before any paid step, never silently ignored.
const MAX_COST_PER_VIDEO_USD = Number(process.env.STORY_AI_MAX_COST_USD) || 1.5;
const MAX_SCENE_COUNT = Number(process.env.STORY_AI_MAX_SCENES) || 24;
const MAX_RETRIES_PER_STEP = Number(process.env.STORY_AI_MAX_RETRIES) || 2;
const MAX_TOPIC_LENGTH = 200;
const MAX_NOTES_LENGTH = 1000;
const MAX_DURATION_SECONDS = 240; // hard ceiling — well above the 2-min default, prevents an unbounded/abusive request

function imageProviderConfigured() {
  if (IMAGE_PROVIDER === "openai") return Boolean(OPENAI_API_KEY);
  if (IMAGE_PROVIDER === "replicate") return Boolean(REPLICATE_API_TOKEN);
  return false;
}
function ttsProviderConfigured() {
  if (TTS_PROVIDER === "elevenlabs") return Boolean(ELEVENLABS_API_KEY);
  if (TTS_PROVIDER === "azure") return Boolean(AZURE_SPEECH_KEY && AZURE_SPEECH_REGION);
  return false;
}

module.exports = {
  STORY_AI_ENABLED, ANTHROPIC_MODEL,
  IMAGE_PROVIDER, OPENAI_API_KEY, REPLICATE_API_TOKEN,
  TTS_PROVIDER, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_MALE, ELEVENLABS_VOICE_FEMALE,
  AZURE_SPEECH_KEY, AZURE_SPEECH_REGION,
  MAX_COST_PER_VIDEO_USD, MAX_SCENE_COUNT, MAX_RETRIES_PER_STEP,
  MAX_TOPIC_LENGTH, MAX_NOTES_LENGTH, MAX_DURATION_SECONDS,
  imageProviderConfigured, ttsProviderConfigured,
};
