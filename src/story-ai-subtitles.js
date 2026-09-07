"use strict";

// story-ai-subtitles.js — Subtitle System (spec §"6. SUBTITLE SYSTEM").
// Pure text/timing logic, zero external API dependency — fully testable
// without any provider credentials. Splits each scene's Arabic narration
// into short, readable subtitle cues and emits real SRT.
//
// Real, disclosed scope: cue timing here is derived from the Director
// Agent's own per-scene start_time/duration_seconds (script-estimated),
// not real measured voice-audio timing — per spec's own preference
// ("Do not rely only on estimated script timing if actual audio timing is
// available"), rebuildSubtitlesFromAudioTiming below re-times cues once a
// real TTS provider returns real per-segment durations; until a TTS
// provider is configured, the script-estimated version is the only one
// this can honestly produce.

const MAX_CHARS_PER_CUE = 42; // ~1-2 short Arabic lines, matches spec's own "1-2 short lines" cap

// Splits Arabic text into cue-sized chunks on natural punctuation/word
// boundaries — never mid-word, never far over the character cap.
function splitIntoCues(text) {
  const clean = String(text || "").trim().replace(/\s+/g, " ");
  if (!clean) return [];
  // Prefer splitting on real punctuation first (sentence/clause boundaries
  // read more naturally as separate cues than a raw word-count cut).
  const clauses = clean.split(/(?<=[.!؟?،,])\s+/).filter(Boolean);
  const cues = [];
  for (const clause of clauses) {
    if (clause.length <= MAX_CHARS_PER_CUE) { cues.push(clause); continue; }
    // A clause longer than the cap still needs a hard word-boundary split.
    const words = clause.split(" ");
    let current = "";
    for (const w of words) {
      const next = current ? `${current} ${w}` : w;
      if (next.length > MAX_CHARS_PER_CUE && current) { cues.push(current); current = w; }
      else current = next;
    }
    if (current) cues.push(current);
  }
  return cues;
}

function srtTimestamp(seconds) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`;
}

// Builds real cues for one scene, distributing the scene's own real
// duration proportionally across its cues by character count (a simple,
// honest estimate — not claimed to be more precise than that).
function buildSceneCues(scene) {
  const cues = splitIntoCues(scene.narration_ar);
  if (!cues.length) return [];
  const totalChars = cues.reduce((s, c) => s + c.length, 0) || 1;
  const duration = Number(scene.duration_seconds) || 5;
  let t = Number(scene.start_time) || 0;
  return cues.map((text) => {
    const share = (text.length / totalChars) * duration;
    const cue = { start: t, end: t + share, text };
    t += share;
    return cue;
  });
}

// Builds the full, ordered cue list across every scene.
function buildAllCues(scenes) {
  const all = [];
  for (const scene of scenes || []) all.push(...buildSceneCues(scene));
  return all;
}

// Real SRT output.
function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${srtTimestamp(c.start)} --> ${srtTimestamp(c.end)}\n${c.text}\n`).join("\n");
}

// Re-times cues once real TTS segment durations exist (one real duration
// per scene, from the actual generated audio) — same proportional-by-
// character-count distribution within each scene, now anchored to real
// audio length instead of the script's estimated duration_seconds.
function rebuildSubtitlesFromAudioTiming(scenes, sceneAudioDurations) {
  const retimed = scenes.map((s, i) => ({ ...s, duration_seconds: sceneAudioDurations[i] ?? s.duration_seconds }));
  let t = 0;
  for (const s of retimed) { s.start_time = t; t += Number(s.duration_seconds) || 0; }
  return buildAllCues(retimed);
}

module.exports = { splitIntoCues, srtTimestamp, buildSceneCues, buildAllCues, toSrt, rebuildSubtitlesFromAudioTiming, MAX_CHARS_PER_CUE };
