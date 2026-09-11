"use strict";

// story-ai-music-provider.js — Background Music provider abstraction
// (2026-09-11, AI Background Music Director, explicit user request).
// Same NOT_CONFIGURED discipline as story-ai-image-provider.js/
// story-ai-tts-provider.js: a missing/unset provider must never break
// the rest of the pipeline, and this file must never pretend a real
// track exists when none does.
//
// REAL, DISCLOSED SCOPE (v1): this app has no music-generation API key
// and no licensed music library today. Rather than fabricate one (which
// would be exactly the "tell the user music is copyright-free when it
// isn't" problem the user's own spec explicitly warns against), the only
// real provider implemented is "local": the user points
// STORY_AI_MUSIC_LIBRARY_DIR at a real folder on disk containing real
// audio files THEY have verified the rights to use, organized by mood —
// data/story-ai/music-library/<mood>/*.mp3 (or .wav/.m4a). This is the
// same real, zero-cost, zero-new-credential path the spec's own §25
// "USER MUSIC" section describes. A future real provider (an actual
// music-generation API, a real licensed library API) can be added here
// as a new branch without touching any other caller — same pattern as
// the image/TTS provider files.
const fs = require("node:fs");
const path = require("node:path");
const { MUSIC_PROVIDER, MUSIC_LIBRARY_DIR, musicProviderConfigured } = require("./story-ai-config");

function isConfigured() { return musicProviderConfigured(); }

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);

// Lists the real files actually present for a mood folder — never
// invents a track name. Returns [] (not an error) for a mood with no
// real files yet, so callers can honestly fall back to an adjacent mood
// or skip music for that segment rather than crash.
function listTracksForMood(mood) {
  if (!MUSIC_LIBRARY_DIR) return [];
  const dir = path.join(MUSIC_LIBRARY_DIR, String(mood || "").toLowerCase());
  try {
    return fs.readdirSync(dir)
      .filter((f) => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(dir, f));
  } catch {
    return []; // real, honest "no folder/no files yet" — never fabricated
  }
}

// Deterministic (not random) pick so the same project's repeated scenes
// requesting the same mood get real, stable, reproducible results rather
// than a different random track every retry.
function pickTrackForMood(mood, seed = 0) {
  const tracks = listTracksForMood(mood);
  if (!tracks.length) return null;
  return tracks[seed % tracks.length];
}

async function getTrackForMood(mood, { seed = 0 } = {}) {
  if (!isConfigured()) return { ok: false, reason: "NOT_CONFIGURED", provider: MUSIC_PROVIDER || "none" };
  if (MUSIC_PROVIDER === "local") {
    const trackPath = pickTrackForMood(mood, seed);
    if (!trackPath) return { ok: false, reason: "NO_TRACK_FOR_MOOD", provider: "local", mood };
    return { ok: true, provider: "local", path: trackPath, mood };
  }
  return { ok: false, reason: "UNKNOWN_PROVIDER", provider: MUSIC_PROVIDER };
}

module.exports = { isConfigured, getTrackForMood, listTracksForMood, pickTrackForMood, AUDIO_EXTENSIONS };
