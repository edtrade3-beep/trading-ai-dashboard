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
// Google Cloud TTS (added 2026-09-07, explicit user request: "cheapest
// way" — Google's free tier is far more generous than ElevenLabs' for
// this app's real per-video character volume). Uses the simple REST
// API-key auth (?key=...), not a service-account JSON file — avoids
// needing file upload/storage handling for a credential, consistent with
// every other provider in this app being a single env-var string. Voice
// names are real, disclosed defaults (Google's own ar-XA WaveNet voices),
// not invented — but Google's own voice catalog can change, so both are
// env-overridable rather than hardcoded assumptions.
const GOOGLE_TTS_API_KEY = (process.env.GOOGLE_TTS_API_KEY || "").trim();
const GOOGLE_TTS_VOICE_MALE = (process.env.GOOGLE_TTS_VOICE_MALE_AR || "ar-XA-Wavenet-B").trim();
const GOOGLE_TTS_VOICE_FEMALE = (process.env.GOOGLE_TTS_VOICE_FEMALE_AR || "ar-XA-Wavenet-A").trim();

// Budget/limits — real, disclosed defaults, all overridable. Enforced by
// story-ai-job-runner.js before any paid step, never silently ignored.
// Real bump (2026-09-10, explicit user request: "more video time") — the
// old 240s/24-scene/$1.50 ceilings were sized for the original 2-minute
// default. A real 5-minute video at this app's own ~7.5s/scene average
// needs ~40 scenes, which alone estimates to ~$1.60 in images at
// $0.04/image (story-ai-cost.js) — over the old cap before voice/Claude
// costs are even added. Raised together so a long video doesn't
// immediately trip its own budget gate.
const MAX_COST_PER_VIDEO_USD = Number(process.env.STORY_AI_MAX_COST_USD) || 3.0;
const MAX_SCENE_COUNT = Number(process.env.STORY_AI_MAX_SCENES) || 40;
const MAX_RETRIES_PER_STEP = Number(process.env.STORY_AI_MAX_RETRIES) || 2;
const MAX_TOPIC_LENGTH = 200;
const MAX_NOTES_LENGTH = 1000;
const MAX_DURATION_SECONDS = 300; // hard ceiling — 5 minutes, above the new 3-minute UI option

function imageProviderConfigured() {
  if (IMAGE_PROVIDER === "openai") return Boolean(OPENAI_API_KEY);
  if (IMAGE_PROVIDER === "replicate") return Boolean(REPLICATE_API_TOKEN);
  return false;
}
function ttsProviderConfigured() {
  if (TTS_PROVIDER === "elevenlabs") return Boolean(ELEVENLABS_API_KEY);
  if (TTS_PROVIDER === "azure") return Boolean(AZURE_SPEECH_KEY && AZURE_SPEECH_REGION);
  if (TTS_PROVIDER === "google") return Boolean(GOOGLE_TTS_API_KEY);
  return false;
}

// Advanced Settings shared defaults/maps (2026-09-10) — one real source
// of truth for every agent/route that needs to interpret these, instead
// of re-deriving the same mapping in multiple files.
const CREATIVITY_TEMPERATURE = { conservative: 0.3, balanced: 0.7, creative: 1.0 };
const DEFAULT_SCENE_LENGTH_SECONDS = 5;

module.exports = {
  STORY_AI_ENABLED, ANTHROPIC_MODEL,
  IMAGE_PROVIDER, OPENAI_API_KEY, REPLICATE_API_TOKEN,
  TTS_PROVIDER, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_MALE, ELEVENLABS_VOICE_FEMALE,
  AZURE_SPEECH_KEY, AZURE_SPEECH_REGION,
  GOOGLE_TTS_API_KEY, GOOGLE_TTS_VOICE_MALE, GOOGLE_TTS_VOICE_FEMALE,
  MAX_COST_PER_VIDEO_USD, MAX_SCENE_COUNT, MAX_RETRIES_PER_STEP,
  MAX_TOPIC_LENGTH, MAX_NOTES_LENGTH, MAX_DURATION_SECONDS,
  CREATIVITY_TEMPERATURE, DEFAULT_SCENE_LENGTH_SECONDS,
  imageProviderConfigured, ttsProviderConfigured,
};
