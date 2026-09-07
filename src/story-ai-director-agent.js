"use strict";

// story-ai-director-agent.js — Director Agent (spec §"3. DIRECTOR
// AGENT"). Splits an approved narration into timed scenes with an
// English image prompt each, plus a project-level character/location
// bible so recurring characters keep a consistent visual description
// across every scene's image prompt (spec's own "Character Consistency
// System").

const { callStoryAiJson } = require("./story-ai-claude");
const { MAX_SCENE_COUNT } = require("./story-ai-config");

const SYSTEM_PROMPT = [
  "You are the Director Agent inside an Arabic storytelling video studio.",
  "You convert a finished Arabic narration into a numbered shot list for a vertical (9:16) video, plus a character/location bible for visual consistency.",
  "",
  "Rules:",
  "- Split the FULL narration text across scenes with no gaps and no repeated sentences — every word of the real narration must appear in exactly one scene's narration_ar, in order.",
  "- Each scene should be 4-10 seconds long based on how much text it carries.",
  "- image_prompt_en must be written in ENGLISH (image models are more reliable in English), describing composition, subject, lighting, and mood — vertical 9:16 cinematic framing, no on-image text, no logos, no watermarks.",
  "- Every character appearing in more than one scene must have a stable character_id, and every scene's image_prompt_en referencing that character must repeat the SAME key visual identifiers from the character bible (age, hair, clothing, build, distinctive features) so the character doesn't visually change between scenes.",
  "- Reuse location_id the same way for recurring settings.",
  "",
  "Return ONLY one JSON object, no prose outside it:",
  '{"scenes":[{"scene_number":1,"start_time":0,"duration_seconds":7,"narration_ar":"","visual_description_ar":"","image_prompt_en":"","camera":"","motion":"slow zoom in|slow zoom out|horizontal pan|vertical pan|static","transition":"crossfade|cut|fade","character_ids":[],"location_id":""}],"characters":[{"character_id":"","name":"","age":0,"ethnicity_or_region_visual":"","hair":"","clothing":"","build":"","distinctive_features":"","visual_style":"cinematic realism"}],"locations":[{"location_id":"","name":"","description_en":""}]}',
];

function validateSceneBreakdown(json, { maxScenes = MAX_SCENE_COUNT } = {}) {
  if (!Array.isArray(json.scenes) || !json.scenes.length) throw new Error("Director Agent returned no scenes.");
  if (json.scenes.length > maxScenes) throw new Error(`Director Agent returned ${json.scenes.length} scenes, over the ${maxScenes} cap.`);
  for (const s of json.scenes) {
    if (!Number.isFinite(s.scene_number) || !s.narration_ar || !s.image_prompt_en) {
      throw new Error(`Scene ${s.scene_number ?? "?"} is missing a required field (scene_number/narration_ar/image_prompt_en).`);
    }
  }
  json.characters = Array.isArray(json.characters) ? json.characters : [];
  json.locations = Array.isArray(json.locations) ? json.locations : [];
  return json;
}

async function buildScenes({ story, apiKey, targetSceneCount }) {
  if (!story?.narration_ar) throw new Error("A generated story is required to build scenes.");
  const hint = targetSceneCount ? `Aim for approximately ${targetSceneCount} scenes.` : "Aim for approximately 14-20 scenes for a ~2-minute video (fewer for a shorter target duration).";
  const prompt = [
    `Title: ${story.title_ar || ""}`,
    `Full narration:\n${story.narration_ar}`,
    hint,
  ].join("\n\n");

  const { json, costUSD, model } = await callStoryAiJson({
    system: SYSTEM_PROMPT.join("\n"),
    prompt,
    apiKey,
    tier: "sonnet",
    // Real bug found live (2026-09-07): 4000 was too tight — a real ~16-20
    // scene breakdown (Arabic narration + visual_description_ar + an
    // English image_prompt_en + camera/motion/transition/character_ids/
    // location_id per scene, plus the character/location bible) genuinely
    // exceeded it, truncating Claude's output mid-JSON and failing this
    // step with a real (not synthetic) "no valid JSON" error. Scenes needs
    // meaningfully more headroom than Story/Verification's shorter,
    // single-paragraph outputs.
    maxTokens: 8000,
    // Real bug found live immediately after the maxTokens bump above
    // (2026-09-07, next real generation): the default 60s timeout
    // (story-ai-claude.js) was tuned for Story/Verification's much
    // shorter outputs — an 8000-token real generation genuinely needs
    // more wall-clock time to complete than that, and hit "Anthropic API
    // timeout" instead of finishing. 120s gives real headroom for the
    // largest output this pipeline asks Claude for.
    timeoutMs: 120000,
    feature: "story-ai-director",
  });

  return { breakdown: validateSceneBreakdown(json), costUSD, model };
}

module.exports = { buildScenes, validateSceneBreakdown, SYSTEM_PROMPT };
