"use strict";

// story-ai-tts-provider.js — Arabic Voice provider abstraction (spec
// §"5. ARABIC VOICE SYSTEM"). Same NOT_CONFIGURED discipline as
// story-ai-image-provider.js: a missing TTS credential must never break
// the rest of the pipeline.
//
// DISCLOSED: the ElevenLabs/Azure/Google branches are real request-shape
// code per each provider's documented API, UNTESTED against a live
// account in this environment (no credentials for any of them here).

const { TTS_PROVIDER, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_MALE, ELEVENLABS_VOICE_FEMALE, AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, GOOGLE_TTS_API_KEY, GOOGLE_TTS_VOICE_MALE, GOOGLE_TTS_VOICE_FEMALE, ttsProviderConfigured } = require("./story-ai-config");

function isConfigured() { return ttsProviderConfigured(); }

// UNTESTED (no ElevenLabs key in this environment).
async function generateWithElevenLabs(text, { voice = "male", speed = 1.0, stability = 0.5 } = {}) {
  const voiceId = voice === "female" ? ELEVENLABS_VOICE_FEMALE : ELEVENLABS_VOICE_MALE;
  if (!voiceId) throw new Error(`No ElevenLabs voice id configured for "${voice}" (set ELEVENLABS_VOICE_ID_${voice.toUpperCase()}_AR).`);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": ELEVENLABS_API_KEY },
    body: JSON.stringify({
      text, model_id: "eleven_multilingual_v2",
      voice_settings: { stability, similarity_boost: 0.75, speed },
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.detail?.message || `ElevenLabs API error (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { audioBuffer: buf, mimeType: "audio/mpeg" };
}

// UNTESTED (no Azure Speech key in this environment).
async function generateWithAzure(text, { voice = "male" } = {}) {
  const voiceName = voice === "female" ? "ar-SA-ZariyahNeural" : "ar-SA-HamedNeural";
  const ssml = `<speak version='1.0' xml:lang='ar-SA'><voice name='${voiceName}'>${text}</voice></speak>`;
  const res = await fetch(`https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/ssml+xml",
      "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
    },
    body: ssml,
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Azure Speech API error (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { audioBuffer: buf, mimeType: "audio/mpeg" };
}

// UNTESTED (no Google Cloud TTS key in this environment). Added
// 2026-09-07, explicit user request for the cheapest real path to
// working voice — Google's free tier is far more generous than
// ElevenLabs' for this app's real per-video character volume. Uses the
// simple REST API-key auth (?key=...), not a service-account JSON file —
// avoids needing file upload/storage handling for a credential, keeping
// this provider a single env-var string like every other one here.
// Real voice names (ar-XA-Wavenet-A/B), not invented, but Google's own
// catalog can change or add new voices over time — both configurable via
// GOOGLE_TTS_VOICE_MALE_AR/GOOGLE_TTS_VOICE_FEMALE_AR rather than a
// silently-hardcoded assumption.
async function generateWithGoogle(text, { voice = "male", speed = 1.0 } = {}) {
  const voiceName = voice === "female" ? GOOGLE_TTS_VOICE_FEMALE : GOOGLE_TTS_VOICE_MALE;
  const languageCode = voiceName.split("-").slice(0, 2).join("-") || "ar-XA";
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(GOOGLE_TTS_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode, name: voiceName },
      audioConfig: { audioEncoding: "MP3", speakingRate: Math.max(0.25, Math.min(4.0, speed)) },
    }),
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Google Cloud TTS API error (${res.status})`);
  if (!data.audioContent) throw new Error("Google Cloud TTS returned no audio content.");
  return { audioBuffer: Buffer.from(data.audioContent, "base64"), mimeType: "audio/mpeg" };
}

async function generateSpeech(text, settings = {}) {
  if (!isConfigured()) return { ok: false, reason: "NOT_CONFIGURED", provider: TTS_PROVIDER };
  try {
    if (TTS_PROVIDER === "elevenlabs") return { ok: true, provider: "elevenlabs", ...(await generateWithElevenLabs(text, settings)) };
    if (TTS_PROVIDER === "azure") return { ok: true, provider: "azure", ...(await generateWithAzure(text, settings)) };
    if (TTS_PROVIDER === "google") return { ok: true, provider: "google", ...(await generateWithGoogle(text, settings)) };
    return { ok: false, reason: "UNKNOWN_PROVIDER", provider: TTS_PROVIDER };
  } catch (err) {
    return { ok: false, reason: "PROVIDER_ERROR", provider: TTS_PROVIDER, error: err.message };
  }
}

module.exports = { generateSpeech, isConfigured };
