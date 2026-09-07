"use strict";

// story-ai-tts-provider.js — Arabic Voice provider abstraction (spec
// §"5. ARABIC VOICE SYSTEM"). Same NOT_CONFIGURED discipline as
// story-ai-image-provider.js: a missing TTS credential must never break
// the rest of the pipeline.
//
// DISCLOSED: the ElevenLabs branch is real request-shape code per its
// documented API, UNTESTED (no ElevenLabs key in this environment).

const { TTS_PROVIDER, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_MALE, ELEVENLABS_VOICE_FEMALE, AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, ttsProviderConfigured } = require("./story-ai-config");

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

async function generateSpeech(text, settings = {}) {
  if (!isConfigured()) return { ok: false, reason: "NOT_CONFIGURED", provider: TTS_PROVIDER };
  try {
    if (TTS_PROVIDER === "elevenlabs") return { ok: true, provider: "elevenlabs", ...(await generateWithElevenLabs(text, settings)) };
    if (TTS_PROVIDER === "azure") return { ok: true, provider: "azure", ...(await generateWithAzure(text, settings)) };
    return { ok: false, reason: "UNKNOWN_PROVIDER", provider: TTS_PROVIDER };
  } catch (err) {
    return { ok: false, reason: "PROVIDER_ERROR", provider: TTS_PROVIDER, error: err.message };
  }
}

module.exports = { generateSpeech, isConfigured };
