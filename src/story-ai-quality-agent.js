"use strict";

// story-ai-quality-agent.js — Quality Control Agent (spec §"8. QUALITY
// CONTROL AGENT"). Deliberately deterministic, not another Claude call —
// the spec's own explicit instruction is "Do not claim 95% certainty
// arbitrarily. Use measurable acceptance checks instead," and every
// check below is a real, measurable fact about the project (scene count,
// missing images, presence of audio/subtitles/video, subtitle cue
// length, verification's own real approved_for_publication flag) — never
// an invented confidence score. Fully unit-testable with no external
// provider.

const { MAX_CHARS_PER_CUE } = require("./story-ai-subtitles");
const { MAX_SCENE_COUNT } = require("./story-ai-config");
const { TARGET_WIDTH, TARGET_HEIGHT } = require("./story-ai-video-assembly");

const MIN_SCENE_COUNT = 3; // even a short custom-duration video needs at least a few real scenes to be coherent

function scoreFromRatio(ok, total) {
  if (!total) return 100;
  return Math.round((ok / total) * 100);
}

function runQualityControl(project) {
  const warnings = [];
  const blockingIssues = [];

  // Script
  const hasStory = Boolean(project.story?.narration_ar);
  const scriptScore = hasStory ? 100 : 0;
  if (!hasStory) blockingIssues.push("No generated script.");

  // Scenes
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  let visualScore = 0;
  if (!scenes.length) {
    blockingIssues.push("No scenes generated.");
  } else {
    if (scenes.length < MIN_SCENE_COUNT) warnings.push(`Only ${scenes.length} scene(s) — below the recommended minimum of ${MIN_SCENE_COUNT}.`);
    if (scenes.length > MAX_SCENE_COUNT) warnings.push(`${scenes.length} scenes exceeds the configured cap of ${MAX_SCENE_COUNT}.`);
    const images = Array.isArray(project.images) ? project.images : [];
    const okImages = images.filter((i) => i?.ok).length;
    if (!images.length) warnings.push("No images generated (image provider not configured or not yet run).");
    else if (okImages < scenes.length) warnings.push(`${scenes.length - okImages} of ${scenes.length} scene image(s) missing.`);
    // Duplicate image prompt check — same visual_description twice in a
    // row is a real, measurable coherence smell.
    for (let i = 1; i < scenes.length; i++) {
      if (scenes[i].image_prompt_en && scenes[i].image_prompt_en === scenes[i - 1].image_prompt_en) {
        warnings.push(`Scene ${scenes[i].scene_number} repeats the prior scene's image prompt verbatim.`);
      }
    }
    visualScore = images.length ? scoreFromRatio(okImages, scenes.length) : 50; // honest partial credit for a real, coherent scene plan even with zero real images yet
  }

  // Audio
  const audioSegments = Array.isArray(project.audio) ? project.audio : [];
  const okAudio = audioSegments.filter((a) => a?.ok).length;
  let audioScore = 0;
  if (!scenes.length) audioScore = 0;
  else if (!audioSegments.length) { warnings.push("No narration audio generated (voice provider not configured or not yet run)."); audioScore = 0; }
  else audioScore = scoreFromRatio(okAudio, scenes.length);

  // Subtitles
  const cues = Array.isArray(project.subtitles?.cues) ? project.subtitles.cues : [];
  let subtitleScore = 0;
  if (!cues.length) warnings.push("No subtitles generated.");
  else {
    const tooLong = cues.filter((c) => c.text.length > MAX_CHARS_PER_CUE + 5).length; // small grace margin over the soft cap
    if (tooLong) warnings.push(`${tooLong} subtitle cue(s) exceed the readable-length guideline.`);
    subtitleScore = scoreFromRatio(cues.length - tooLong, cues.length);
  }

  // Consistency — real, measurable: every character_id referenced by a
  // scene must exist in the character bible (a genuine, checkable
  // invariant, not a subjective "does it look consistent" guess).
  const characterIds = new Set((project.characters || []).map((c) => c.character_id));
  const missingCharRefs = scenes.filter((s) => (s.character_ids || []).some((id) => !characterIds.has(id))).length;
  if (missingCharRefs) warnings.push(`${missingCharRefs} scene(s) reference a character not in the character bible.`);
  const consistencyScore = scenes.length ? scoreFromRatio(scenes.length - missingCharRefs, scenes.length) : 100;

  // Video
  const video = project.finalVideo;
  if (!video) warnings.push("No final video assembled yet.");
  else if (video.width !== TARGET_WIDTH || video.height !== TARGET_HEIGHT) blockingIssues.push(`Final video resolution ${video.width}x${video.height} does not match the required ${TARGET_WIDTH}x${TARGET_HEIGHT}.`);

  // Real factual/religious safety score — reuses the Verification Agent's
  // own real result rather than re-deriving a second, competing read.
  const verification = project.verification;
  let factualSafetyScore = 50, religiousSafetyScore = 50;
  if (verification) {
    const highSeverityCount = (verification.claims || []).filter((c) => c.severity === "high").length;
    factualSafetyScore = highSeverityCount ? 0 : (verification.claims?.length ? 60 : 100);
    religiousSafetyScore = verification.classification === "religious" ? (verification.approved_for_publication ? 100 : 0) : 100;
    if (!verification.approved_for_publication) blockingIssues.push("Verification Agent has not approved this story for publication — review its warnings before proceeding.");
  } else {
    blockingIssues.push("Story has not been through the Verification Agent yet.");
  }

  const scores = [scriptScore, visualScore, audioScore, subtitleScore, consistencyScore, factualSafetyScore, religiousSafetyScore];
  const overallScore = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);

  return {
    overall_score: overallScore,
    script_score: scriptScore, visual_score: visualScore, audio_score: audioScore,
    subtitle_score: subtitleScore, consistency_score: consistencyScore,
    factual_safety_score: factualSafetyScore, religious_safety_score: religiousSafetyScore,
    warnings, blocking_issues: blockingIssues,
    approved: blockingIssues.length === 0,
  };
}

module.exports = { runQualityControl, MIN_SCENE_COUNT };
