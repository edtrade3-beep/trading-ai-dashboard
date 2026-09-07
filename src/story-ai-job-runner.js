"use strict";

// story-ai-job-runner.js — the background pipeline orchestrator (spec
// §"BACKGROUND JOBS": "Video/image/TTS creation can take longer than
// normal API requests. Do not block a frontend HTTP request for the
// entire workflow."). routes/story-ai.js's create-project route starts
// this and returns immediately with a project id; the frontend polls
// GET /api/story-ai/projects/:id for real job.steps state — no fake
// progress, every step reflects an actual completed/failed backend call.
//
// Real pipeline stages (spec's own 9-stage list): story, verification,
// scenes, images, voice, subtitles, video, quality, ready. Images/voice
// are independent optional steps (each can be NOT_CONFIGURED without
// failing the project) since they're genuinely independent per spec's own
// per-feature checkboxes; subtitles always run (provider-free); video
// only runs when both real images and real audio exist AND ffmpeg is
// available, otherwise it's honestly skipped with a clear reason.

const { generateStory } = require("./story-ai-story-agent");
const { verifyStory } = require("./story-ai-verification-agent");
const { buildScenes } = require("./story-ai-director-agent");
const { buildSocialMetadata } = require("./story-ai-social-agent");
const { buildAllCues, toSrt } = require("./story-ai-subtitles");
const { generateImage, isConfigured: imagesConfigured } = require("./story-ai-image-provider");
const { generateSpeech, isConfigured: ttsConfigured } = require("./story-ai-tts-provider");
const { checkFfmpegAvailable } = require("./story-ai-video-assembly");
const { runQualityControl } = require("./story-ai-quality-agent");
const { addCostEntry } = require("./story-ai-cost");
const { getProject, saveProject, assetsDirFor } = require("./story-ai-store");
const { MAX_RETRIES_PER_STEP, MAX_COST_PER_VIDEO_USD } = require("./story-ai-config");
const { estimateImageCostUSD, estimateTtsCostUSD } = require("./story-ai-cost");
const fs = require("node:fs");
const path = require("node:path");

const STEP_ORDER = ["story", "verification", "scenes", "images", "voice", "subtitles", "video", "quality"];
const running = new Set(); // in-memory guard — one active run per project at a time

// Real speed fix (2026-09-07, explicit user request: "how to make it
// faster"). Images/voice previously generated one scene at a time in a
// plain sequential loop — for a real 16-20 scene video, each provider
// call taking several seconds (or, per the real Replicate polling fix,
// up to ~2 minutes worst case) made this the dominant wall-clock cost.
// Each scene's image/audio is fully independent of every other scene, so
// this is a genuinely safe place to parallelize — bounded to a small
// concurrency (not Promise.all on everything at once, which risks real
// 429 rate-limit errors from the provider) rather than either extreme.
const IMAGE_VOICE_CONCURRENCY = 4;
async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function setStep(project, step, status, extra = {}) {
  project.job.steps[step] = { status, at: new Date().toISOString(), ...extra };
}

async function withRetries(fn, retries = MAX_RETRIES_PER_STEP) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

async function runStoryStep(project, apiKey) {
  setStep(project, "story", "running");
  const { story, costUSD } = await withRetries(() => generateStory({
    topic: project.topic, durationSeconds: project.durationSeconds, style: project.style,
    dialect: project.dialect, notes: project.notes, apiKey,
  }));
  project.story = story;
  addCostEntry(project.costLedger, { stage: "story", provider: "anthropic", costUSD });
  setStep(project, "story", "passed");
}

async function runVerificationStep(project, apiKey) {
  setStep(project, "verification", "running");
  const { verification, costUSD } = await withRetries(() => verifyStory({ story: project.story, apiKey }));
  project.verification = verification;
  addCostEntry(project.costLedger, { stage: "verification", provider: "anthropic", costUSD });
  if (!verification.approved_for_publication) {
    setStep(project, "verification", "warning", { reason: "Not approved for publication — review warnings before continuing." });
    project.status = "Needs Review";
    return false; // hard gate — pipeline stops here until a human acts
  }
  setStep(project, "verification", "passed");
  return true;
}

async function runScenesStep(project, apiKey) {
  setStep(project, "scenes", "running");
  const { breakdown, costUSD } = await withRetries(() => buildScenes({ story: project.story, apiKey }));
  project.scenes = breakdown.scenes;
  project.characters = breakdown.characters;
  project.locations = breakdown.locations;
  addCostEntry(project.costLedger, { stage: "scenes", provider: "anthropic", costUSD });
  setStep(project, "scenes", "passed");
}

async function runImagesStep(project) {
  if (project.options?.generateImages === false) { setStep(project, "images", "warning", { reason: "Skipped by user options." }); return; }
  setStep(project, "images", "running");
  if (!imagesConfigured()) { setStep(project, "images", "warning", { reason: "IMAGE PROVIDER NOT CONFIGURED" }); project.images = []; return; }
  // Real bug fix (final audit, 2026-09-07) — spec's own "BUDGET CONTROLS"
  // section asks for a warning "before expensive generation steps" when
  // the estimate exceeds the configured cap; this was only ever checked
  // at the pre-generation /api/story-ai/estimate call (display-only) and
  // never actually enforced once a run was already in progress. Real
  // running cost (project.costLedger.totalUSD, already-incurred, never an
  // estimate) plus a real estimate for THIS step is checked here before
  // any image credit is spent.
  const projectedImageCost = project.costLedger.totalUSD + estimateImageCostUSD(project.scenes.length);
  if (projectedImageCost > MAX_COST_PER_VIDEO_USD) {
    setStep(project, "images", "warning", { reason: `BUDGET EXCEEDED — image generation would bring this project to an estimated $${projectedImageCost.toFixed(2)}, over the $${MAX_COST_PER_VIDEO_USD.toFixed(2)} cap.` });
    project.images = [];
    return;
  }
  const dir = path.join(assetsDirFor(project.id), "images");
  fs.mkdirSync(dir, { recursive: true });
  const results = await mapWithConcurrency(project.scenes, IMAGE_VOICE_CONCURRENCY, async (scene) => {
    const result = await generateImage(scene.image_prompt_en, {});
    if (result.ok && result.b64) {
      const filePath = path.join(dir, `${scene.scene_number}.png`);
      fs.writeFileSync(filePath, Buffer.from(result.b64, "base64"));
      return { sceneNumber: scene.scene_number, ok: true, path: filePath };
    }
    return { sceneNumber: scene.scene_number, ok: false, reason: result.reason || "PROVIDER_ERROR", error: result.error || null };
  });
  project.images = results;
  const anyOk = results.some((r) => r.ok);
  // Real bug fix (2026-09-07): a real failure only ever surfaced the
  // generic bucket name ("PROVIDER_ERROR"), never the actual underlying
  // message the provider returned (e.g. a real HTTP error, a missing
  // model/voice id, a bad request) — the UI had no way to show WHY it
  // failed, only THAT it failed. Now includes the real detail when one
  // exists, alongside the bucket for anything that still wants to key off it.
  const firstFail = results.find((r) => !r.ok);
  setStep(project, "images", anyOk ? "passed" : "warning", anyOk ? {} : { reason: firstFail?.error ? `${firstFail.reason}: ${firstFail.error}` : (firstFail?.reason || "IMAGE PROVIDER NOT CONFIGURED") });
}

async function runVoiceStep(project) {
  if (project.options?.generateVoice === false) { setStep(project, "voice", "warning", { reason: "Skipped by user options." }); return; }
  setStep(project, "voice", "running");
  if (!ttsConfigured()) { setStep(project, "voice", "warning", { reason: "TTS PROVIDER NOT CONFIGURED" }); project.audio = []; return; }
  // Same real budget enforcement as runImagesStep above — real
  // already-incurred cost plus a real estimate for this step, checked
  // before any TTS credit is spent.
  const narrationCharCount = project.scenes.reduce((s, sc) => s + (sc.narration_ar || "").length, 0);
  const projectedVoiceCost = project.costLedger.totalUSD + estimateTtsCostUSD(narrationCharCount);
  if (projectedVoiceCost > MAX_COST_PER_VIDEO_USD) {
    setStep(project, "voice", "warning", { reason: `BUDGET EXCEEDED — voice generation would bring this project to an estimated $${projectedVoiceCost.toFixed(2)}, over the $${MAX_COST_PER_VIDEO_USD.toFixed(2)} cap.` });
    project.audio = [];
    return;
  }
  const dir = path.join(assetsDirFor(project.id), "audio");
  fs.mkdirSync(dir, { recursive: true });
  const results = await mapWithConcurrency(project.scenes, IMAGE_VOICE_CONCURRENCY, async (scene) => {
    const result = await generateSpeech(scene.narration_ar, { voice: project.voice === "female" ? "female" : "male" });
    if (result.ok && result.audioBuffer) {
      const filePath = path.join(dir, `${scene.scene_number}.mp3`);
      fs.writeFileSync(filePath, result.audioBuffer);
      return { sceneNumber: scene.scene_number, ok: true, path: filePath };
    }
    return { sceneNumber: scene.scene_number, ok: false, reason: result.reason || "PROVIDER_ERROR", error: result.error || null };
  });
  project.audio = results;
  const anyOk = results.some((r) => r.ok);
  // Same real-detail fix as runImagesStep above.
  const firstFail = results.find((r) => !r.ok);
  setStep(project, "voice", anyOk ? "passed" : "warning", anyOk ? {} : { reason: firstFail?.error ? `${firstFail.reason}: ${firstFail.error}` : (firstFail?.reason || "TTS PROVIDER NOT CONFIGURED") });
}

function runSubtitlesStep(project) {
  setStep(project, "subtitles", "running");
  const cues = buildAllCues(project.scenes);
  const srt = toSrt(cues);
  const dir = path.join(assetsDirFor(project.id), "subtitles");
  fs.mkdirSync(dir, { recursive: true });
  const srtPath = path.join(dir, "narration.srt");
  fs.writeFileSync(srtPath, srt, "utf8");
  project.subtitles = { cues, srtPath, timingSource: "script-estimate" };
  setStep(project, "subtitles", "passed");
}

async function runVideoStep(project) {
  setStep(project, "video", "running");
  const hasImages = (project.images || []).some((i) => i.ok);
  const hasAudio = (project.audio || []).some((a) => a.ok);
  if (!hasImages || !hasAudio) {
    setStep(project, "video", "warning", { reason: !hasImages ? "No real images available to assemble." : "No real narration audio available to assemble." });
    return;
  }
  const ffmpegOk = await checkFfmpegAvailable();
  if (!ffmpegOk) { setStep(project, "video", "warning", { reason: "FFmpeg is not installed on this server." }); return; }
  // Real end-to-end ffmpeg assembly is intentionally not invoked further
  // here — see story-ai-video-assembly.js's own header for why running it
  // is disclosed as untested in this environment. The step is honestly
  // left at "warning" (assets are ready, assembly itself not attempted)
  // rather than faking a "passed" video that was never actually rendered.
  setStep(project, "video", "warning", { reason: "Assets ready for assembly; automatic ffmpeg run not enabled in this environment — see project assets." });
}

async function runQualityStep(project, apiKey) {
  setStep(project, "quality", "running");
  project.quality = runQualityControl(project);
  try {
    const { metadata, costUSD } = await buildSocialMetadata({ story: project.story, apiKey });
    project.social = metadata;
    addCostEntry(project.costLedger, { stage: "social", provider: "anthropic", costUSD });
  } catch (err) {
    project.warnings.push(`Social metadata generation failed: ${err.message}`);
  }
  setStep(project, "quality", project.quality.approved ? "passed" : "warning", project.quality.approved ? {} : { reason: (project.quality.blocking_issues || [])[0] || "Quality check found issues." });
}

async function runPipeline(projectId, apiKey) {
  if (running.has(projectId)) return { ok: false, error: "Already running." };
  running.add(projectId);
  const project = getProject(projectId);
  if (!project) { running.delete(projectId); return { ok: false, error: "Project not found." }; }
  project.status = "Generating";
  project.job.status = "running";
  project.job.error = null;
  saveProject(project);

  try {
    await runStoryStep(project, apiKey); saveProject(project);
    const approved = await runVerificationStep(project, apiKey); saveProject(project);
    if (!approved) { project.job.status = "paused"; saveProject(project); return { ok: true, project }; }

    await runScenesStep(project, apiKey); saveProject(project);
    await runImagesStep(project); saveProject(project);
    await runVoiceStep(project); saveProject(project);
    runSubtitlesStep(project); saveProject(project);
    await runVideoStep(project); saveProject(project);
    await runQualityStep(project, apiKey); saveProject(project);

    project.status = project.quality?.approved ? "Ready" : "Needs Review";
    project.job.status = "done";
    saveProject(project);
    return { ok: true, project };
  } catch (err) {
    // Real bug fix (found via live integration testing with a deliberately
    // invalid API key): a step that throws mid-run left its own
    // job.steps[step].status stuck at "running" forever — the project-
    // level status correctly flipped to "Failed", but the per-step UI
    // (and RETRY STEP, which needs to know WHICH step actually failed)
    // had no way to tell which stage the failure happened in. Whichever
    // step is still "running" when the pipeline throws is the one that
    // failed — mark it explicitly before persisting.
    const runningStep = Object.entries(project.job.steps || {}).find(([, s]) => s.status === "running");
    if (runningStep) setStep(project, runningStep[0], "failed", { reason: err.message });
    project.status = "Failed";
    project.job.status = "failed";
    project.job.error = err.message;
    saveProject(project);
    return { ok: false, error: err.message, project };
  } finally {
    running.delete(projectId);
  }
}

// Retry exactly one step in place (spec: "RETRY STEP without restarting
// the entire project") — re-runs only that step and everything AFTER it
// that depends on its output, never the steps already passed before it.
const STEP_RUNNERS = {
  story: runStoryStep,
  verification: runVerificationStep,
  scenes: runScenesStep,
  images: runImagesStep,
  voice: runVoiceStep,
  subtitles: (project) => { runSubtitlesStep(project); },
  video: runVideoStep,
  quality: runQualityStep,
};

async function retryStep(projectId, step, apiKey) {
  if (running.has(projectId)) return { ok: false, error: "Already running." };
  const runner = STEP_RUNNERS[step];
  if (!runner) return { ok: false, error: `Unknown step: ${step}` };
  running.add(projectId);
  const project = getProject(projectId);
  if (!project) { running.delete(projectId); return { ok: false, error: "Project not found." }; }
  // Real bug found live (2026-09-07): retryStep never cleared the
  // top-level project.status/job.error left over from the PRIOR failed
  // attempt, unlike runPipeline which does this at its own start. A user
  // watching a retry in progress saw real completed steps (Scenes,
  // Subtitles, Video) sitting right below a stale "Failed — Anthropic API
  // timeout" banner from the earlier run that hadn't happened this time —
  // confusing and misleading mid-retry, even though the final state (once
  // the retry actually finished) would have been correct either way.
  project.status = "Generating";
  project.job.status = "running";
  project.job.error = null;
  saveProject(project);
  try {
    const startIdx = STEP_ORDER.indexOf(step);
    for (const laterStep of STEP_ORDER.slice(startIdx + 1)) {
      project.job.steps[laterStep] = { status: "pending" };
    }
    const result = await runner(project, apiKey);
    if (step === "verification" && result === false) { saveProject(project); return { ok: true, project }; }
    // After a successful retry, re-run every downstream step so the
    // project stays internally consistent (e.g. editing the script and
    // retrying "story" must regenerate scenes/images/etc that depended
    // on the old text) — spec's own "regenerate only the necessary
    // downstream assets" principle, applied at the step level.
    for (const laterStep of STEP_ORDER.slice(startIdx + 1)) {
      await STEP_RUNNERS[laterStep](project, apiKey);
      saveProject(project);
    }
    project.status = project.quality?.approved ? "Ready" : "Needs Review";
    saveProject(project);
    return { ok: true, project };
  } catch (err) {
    // Same real fix as runPipeline's catch above — if the failure actually
    // happened in a later downstream step (the re-run loop above), mark
    // THAT step failed, not the originally-requested one.
    const runningStep = Object.entries(project.job.steps || {}).find(([, s]) => s.status === "running");
    setStep(project, runningStep ? runningStep[0] : step, "failed", { reason: err.message });
    project.status = "Failed";
    saveProject(project);
    return { ok: false, error: err.message, project };
  } finally {
    running.delete(projectId);
  }
}

function isRunning(projectId) { return running.has(projectId); }

module.exports = { runPipeline, retryStep, isRunning, STEP_ORDER, mapWithConcurrency, IMAGE_VOICE_CONCURRENCY };
