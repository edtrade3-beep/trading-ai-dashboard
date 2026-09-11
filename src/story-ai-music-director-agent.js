"use strict";

// story-ai-music-director-agent.js — AI Background Music Director
// (2026-09-11, explicit user request: "add a dedicated AI Background
// Music Director so the music follows the story instead of playing one
// generic track from start to finish"). The user's own closing priority
// on their 33-section spec: "Auto Music + smart ducking + scene-by-scene
// emotion + strategic silence are the most important additions."
//
// This module supplies the "scene-by-scene emotion" half: one real
// Claude call reads the already-generated scene breakdown (real
// narration text, real scene order — the same data Images/Voice already
// consume) and returns a real per-scene mood/intensity/silence plan.
// `buildMusicTimeline` (pure, no Claude) then merges contiguous
// same-mood scenes into fewer, longer real music segments — the actual
// audio track never gets reused literally, but ffmpeg looping the same
// real file for one continuous emotional passage reads as "music that
// follows the story," not a jarring new track every 5 seconds.
//
// MUSIC_MOODS is the one real, fixed vocabulary Claude must choose from
// — it doubles as the literal subfolder name story-ai-music-provider.js
// looks up (data/story-ai/music-library/<mood>/), so an invented mood
// string here would just silently return "no track for mood" later.
const { callStoryAiJson } = require("./story-ai-claude");

const MUSIC_MOODS = ["calm", "curious", "tense", "sad", "hopeful", "triumphant"];

function buildSystemPrompt() {
  return [
    "You are a film music supervisor planning the background score for a short vertical-video story, scene by scene.",
    "",
    `For EACH scene, pick exactly one mood from this fixed list (do not invent new moods): ${MUSIC_MOODS.join(", ")}.`,
    "Also give an intensity from 0 (barely there) to 5 (full, driving) reflecting how prominent the music should feel under that scene.",
    "",
    "Use dramaticSilence=true VERY RARELY — at most one scene in the whole story, only for a genuine turning point or emotional gut-punch where NO music (real silence under the narration) makes the moment land harder. Most scenes should be dramaticSilence=false.",
    "",
    "Think about the story's real arc: an opening hook is often \"curious\", rising stakes are often \"tense\", a resolution or lesson is often \"hopeful\" or \"triumphant\", a loss or regret beat is often \"sad\". Adjacent scenes with the same emotional beat should usually share the same mood — do not flip moods scene-to-scene without a real reason, since the goal is fewer, longer musical passages that follow the story's actual emotional shape, not a new mood every scene.",
    "",
    "Return ONLY one JSON object, no prose outside it:",
    '{"scenes":[{"scene_number":1,"mood":"curious","intensity":2,"dramaticSilence":false}, ...]}',
    "Include exactly one entry per scene number given to you, in the same order.",
  ].join("\n");
}

function clampIntensity(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 2;
  return Math.max(0, Math.min(5, v));
}

async function planMusicForScenes({ scenes, story, apiKey }) {
  if (!Array.isArray(scenes) || !scenes.length) throw new Error("Real scenes are required for the Music Director.");
  const prompt = [
    story?.title_ar ? `Story title: ${story.title_ar}` : null,
    "Scenes (in order):",
    ...scenes.map((s) => `Scene ${s.scene_number}: ${(s.narration_ar || "").slice(0, 400)}`),
  ].filter(Boolean).join("\n");

  const { json, costUSD, model } = await callStoryAiJson({
    system: buildSystemPrompt(),
    prompt,
    apiKey,
    tier: "haiku",
    maxTokens: 2000,
    feature: "story-ai-music-director",
    timeoutMs: 60000,
  });

  const byScene = new Map();
  for (const entry of Array.isArray(json.scenes) ? json.scenes : []) {
    const num = Number(entry?.scene_number);
    if (!Number.isFinite(num)) continue;
    byScene.set(num, entry);
  }

  // Real, honest per-scene fallback: a scene Claude's own response
  // skipped (malformed JSON entry, list length mismatch) gets a neutral
  // "calm"/intensity 2/no silence plan rather than dropping music
  // planning for the whole project over one bad entry.
  const plan = scenes.map((s) => {
    const entry = byScene.get(s.scene_number);
    const mood = MUSIC_MOODS.includes(entry?.mood) ? entry.mood : "calm";
    return {
      scene_number: s.scene_number,
      mood,
      intensity: clampIntensity(entry?.intensity),
      dramaticSilence: Boolean(entry?.dramaticSilence),
    };
  });

  return { plan, costUSD, model };
}

// Pure — merges contiguous scenes sharing the same real (mood,
// dramaticSilence) pair into fewer, longer music segments, using the
// REAL per-scene durations already probed off the generated audio
// (runVideoStep's own `durations` array — never the pre-generation
// script estimate, so segment boundaries land on the actual assembled
// timeline). Each segment reports its own start/end offset in seconds
// so the caller can build one continuous music bed matching the final
// video's real length.
function buildMusicTimeline(plan, durations) {
  if (!Array.isArray(plan) || plan.length !== durations.length) {
    throw new Error("buildMusicTimeline requires one duration per planned scene.");
  }
  const segments = [];
  let cursor = 0;
  for (let i = 0; i < plan.length; i++) {
    const { mood, dramaticSilence } = plan[i];
    const duration = Number(durations[i]) || 0;
    const prev = segments[segments.length - 1];
    if (prev && prev.mood === mood && prev.dramaticSilence === dramaticSilence) {
      prev.endSeconds = cursor + duration;
      prev.durationSeconds = prev.endSeconds - prev.startSeconds;
      prev.sceneNumbers.push(plan[i].scene_number);
    } else {
      segments.push({
        startSeconds: cursor,
        endSeconds: cursor + duration,
        durationSeconds: duration,
        mood,
        dramaticSilence,
        sceneNumbers: [plan[i].scene_number],
      });
    }
    cursor += duration;
  }
  return segments;
}

module.exports = { MUSIC_MOODS, buildSystemPrompt, planMusicForScenes, buildMusicTimeline, clampIntensity };
