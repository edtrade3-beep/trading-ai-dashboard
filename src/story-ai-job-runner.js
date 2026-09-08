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
const { buildAllCues, toSrt, rebuildSubtitlesFromAudioTiming } = require("./story-ai-subtitles");
const { generateImage, isConfigured: imagesConfigured } = require("./story-ai-image-provider");
const { generateSpeech, isConfigured: ttsConfigured } = require("./story-ai-tts-provider");
const { checkFfmpegAvailable, buildSceneClipArgs, buildFinalMuxArgs, runFfmpeg, getAudioDurationSeconds } = require("./story-ai-video-assembly");
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

// Real bug found live (2026-09-08): a real production run passed Voice
// for real, then sat at Subtitles — a pure, synchronous, no-network step
// — for 108 real minutes with zero progress. runVideoStep's own ffmpeg
// calls already got real timeout protection the same day (story-ai-
// video-assembly.js), but that only covers ffmpeg specifically; this
// stall happened BEFORE video even started, meaning something else in
// the real chain (most likely a real stuck saveProject -> Postgres write
// under this app's own atomic-write.js, though the exact mechanism
// wasn't directly observable from outside the process) can hang with
// nothing at all to catch it. Every step call in the real pipeline
// needs the SAME class of protection ffmpeg just got, not just the one
// place a hang happened to be found.
//
// Real, disclosed limitation: this races against the step, it does not
// force-cancel whatever's actually stuck inside it (Node has no generic
// way to abort an arbitrary already-running async call, especially a
// stuck DB write) — same real tradeoff src/utils.js's own withTimeout
// already accepts elsewhere in this codebase. A step that times out is
// marked failed and the real in-memory `running` lock is released
// (retryStep/runPipeline's own try/catch/finally already do this once
// the promise rejects) so the NEXT retry isn't blocked forever; the
// orphaned original call may still be running in the background and
// could theoretically still complete afterward, but "eventually report
// a real error and let the user retry" beats "hang forever with no way
// to recover short of restarting the whole server."
const STEP_TIMEOUT_MS = 8 * 60_000;
function runStepWithTimeout(stepName, fn) {
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise((_, reject) => setTimeout(
      () => reject(new Error(`Step "${stepName}" did not complete within ${STEP_TIMEOUT_MS / 1000}s — treated as a real stall, not a guessed hang.`)),
      STEP_TIMEOUT_MS,
    )),
  ]);
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

// Real end-to-end video assembly (2026-09-08 — wired up for the first
// time; previously this step only ever checked ffmpeg's own availability
// and then unconditionally reported "assembly not attempted" regardless
// of the result, see story-ai-video-assembly.js's own header for the
// full story). Only scenes with BOTH a real generated image AND real
// generated narration audio can go into the final video — a scene
// missing either is honestly dropped rather than faked with a
// placeholder image/silent gap.
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

  // Real bug found live (2026-09-08): project.images/.audio's own `ok`
  // flag reflects whether generation succeeded AT THE TIME IT RAN — it
  // is not a live guarantee the file still exists on THIS disk right
  // now. A real production case: scene 2 was recorded ok:true (its own
  // generation call really did succeed) but the file was genuinely
  // absent when Video ran later, and ffmpeg correctly hard-failed
  // ("Error opening input file... No such file or directory") rather
  // than silently producing a broken video — assembly must never trust
  // stale metadata over the real, current filesystem state. Re-verifies
  // with fs.existsSync here so a scene whose file has since gone missing
  // (redeploy wiping ephemeral disk, manual cleanup, a partial original
  // write, etc. — several real causes, one real fix regardless of which)
  // is honestly dropped from assembly instead of crashing the whole step.
  const realFile = (p) => { try { return p && fs.existsSync(p); } catch { return false; } };
  const imageByScene = new Map((project.images || []).filter((i) => i.ok && realFile(i.path)).map((i) => [i.sceneNumber, i.path]));
  const audioByScene = new Map((project.audio || []).filter((a) => a.ok && realFile(a.path)).map((a) => [a.sceneNumber, a.path]));
  const usableScenes = (project.scenes || []).filter((s) => imageByScene.has(s.scene_number) && audioByScene.has(s.scene_number));
  const missingAssetScenes = (project.scenes || [])
    .filter((s) => !usableScenes.includes(s))
    .map((s) => {
      const hadImageRecord = (project.images || []).some((i) => i.sceneNumber === s.scene_number && i.ok);
      const hadAudioRecord = (project.audio || []).some((a) => a.sceneNumber === s.scene_number && a.ok);
      const imageGone = hadImageRecord && !imageByScene.has(s.scene_number);
      const audioGone = hadAudioRecord && !audioByScene.has(s.scene_number);
      if (imageGone || audioGone) return `scene ${s.scene_number} (real ${[imageGone && "image", audioGone && "audio"].filter(Boolean).join("+")} file missing on disk)`;
      return null;
    })
    .filter(Boolean);
  if (!usableScenes.length) {
    setStep(project, "video", "warning", { reason: missingAssetScenes.length ? `No usable scenes — ${missingAssetScenes.join(", ")}.` : "No scene has both a real image and real narration audio — nothing to assemble." });
    return;
  }

  // Real fix: routes/story-ai.js's own asset-download route only ever
  // recognized kind = images|audio|subtitles|final (spec's own real
  // per-type asset folders) — "video" was never one of them, so an
  // assembled file written under a "video/" folder would 404 on
  // download. Working/intermediate files (per-scene clips, concat
  // lists, combined narration) go in "video" since they're not meant to
  // be individually downloadable; only the real final muxed output goes
  // into "final", matching that route's existing real contract.
  const videoDir = path.join(assetsDirFor(project.id), "video");
  const finalDir = path.join(assetsDirFor(project.id), "final");
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(finalDir, { recursive: true });
  const escapeForConcat = (p) => p.replace(/'/g, "'\\''");

  try {
    // 1. Real per-scene audio duration (probed off the actual generated
    //    file, not the script estimate — see getAudioDurationSeconds'
    //    own header) drives both this scene's clip length AND the final
    //    subtitle re-timing below, so video/audio/subtitles all agree on
    //    the same real timeline instead of drifting apart.
    const durations = [];
    for (const scene of usableScenes) {
      const real = await getAudioDurationSeconds(audioByScene.get(scene.scene_number));
      durations.push(real ?? (Number(scene.duration_seconds) || 5));
    }

    // 2. Real Ken-Burns clip per scene (pure builder, real ffmpeg run).
    const clipPaths = [];
    for (let i = 0; i < usableScenes.length; i++) {
      const scene = usableScenes[i];
      const clipPath = path.join(videoDir, `clip_${scene.scene_number}.mp4`);
      const args = buildSceneClipArgs({ imagePath: imageByScene.get(scene.scene_number), outPath: clipPath, durationSeconds: durations[i], motion: scene.motion });
      await runFfmpeg(args);
      clipPaths.push(clipPath);
    }

    // 3. Real video-clip concat list, real scene order.
    const concatListPath = path.join(videoDir, "concat.txt");
    fs.writeFileSync(concatListPath, clipPaths.map((p) => `file '${escapeForConcat(p)}'`).join("\n"), "utf8");

    // 4. Real combined narration track — concatenates each scene's own
    //    real generated audio file in real scene order, re-encoded to one
    //    consistent codec (AAC) regardless of which real TTS provider
    //    produced each segment.
    const audioConcatListPath = path.join(videoDir, "audio_concat.txt");
    fs.writeFileSync(audioConcatListPath, usableScenes.map((s) => `file '${escapeForConcat(audioByScene.get(s.scene_number))}'`).join("\n"), "utf8");
    const combinedAudioPath = path.join(videoDir, "narration.m4a");
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", audioConcatListPath, "-c:a", "aac", "-b:a", "192k", combinedAudioPath]);

    // 5. Real subtitle re-timing off the SAME real per-scene durations
    //    just probed (story-ai-subtitles.js's own rebuildSubtitlesFromAudioTiming
    //    — built earlier, never wired in until now) — never the script
    //    estimate once real audio exists, so burned-in subtitles line up
    //    with the real assembled timeline, not the pre-generation guess.
    const retimedCues = rebuildSubtitlesFromAudioTiming(usableScenes, durations);
    const retimedSrtPath = path.join(videoDir, "narration_retimed.srt");
    fs.writeFileSync(retimedSrtPath, toSrt(retimedCues), "utf8");
    project.subtitles = { ...project.subtitles, cues: retimedCues, srtPath: retimedSrtPath, timingSource: "real-audio-duration" };

    // 6. Real final mux — concatenated clips + real combined narration +
    //    real re-timed subtitles burned in. Background music is a real,
    //    disclosed follow-up (buildFinalMuxArgs already supports it via
    //    musicPath) — not built here, no music asset pipeline exists yet.
    const outPath = path.join(finalDir, "final.mp4");
    const muxArgs = buildFinalMuxArgs({ concatListPath, narrationAudioPath: combinedAudioPath, srtPath: retimedSrtPath, outPath, burnSubtitles: true });
    await runFfmpeg(muxArgs);

    const skippedCount = (project.scenes || []).length - usableScenes.length;
    // Real field name fix: StoryAiTab.jsx's own DOWNLOAD VIDEO link
    // already reads project.finalVideo.path (it was built and wired
    // before this real assembly step existed to ever populate it) —
    // matching that existing real contract, not inventing a new one.
    project.finalVideo = { path: outPath, sceneCount: usableScenes.length, totalDurationSeconds: Math.round(durations.reduce((a, b) => a + b, 0) * 100) / 100, skippedScenes: skippedCount };
    setStep(project, "video", "passed", skippedCount > 0 ? { reason: `${skippedCount} scene(s) skipped — ${missingAssetScenes.length ? missingAssetScenes.join(", ") : "missing a real image or narration audio"}.` } : {});
  } catch (err) {
    setStep(project, "video", "warning", { reason: `Real ffmpeg assembly failed: ${err.message}` });
  }
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
    await runStepWithTimeout("story", () => runStoryStep(project, apiKey)); saveProject(project);
    const approved = await runStepWithTimeout("verification", () => runVerificationStep(project, apiKey)); saveProject(project);
    if (!approved) { project.job.status = "paused"; saveProject(project); return { ok: true, project }; }

    await runStepWithTimeout("scenes", () => runScenesStep(project, apiKey)); saveProject(project);
    await runStepWithTimeout("images", () => runImagesStep(project)); saveProject(project);
    await runStepWithTimeout("voice", () => runVoiceStep(project)); saveProject(project);
    await runStepWithTimeout("subtitles", () => runSubtitlesStep(project)); saveProject(project);
    await runStepWithTimeout("video", () => runVideoStep(project)); saveProject(project);
    await runStepWithTimeout("quality", () => runQualityStep(project, apiKey)); saveProject(project);

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
    const result = await runStepWithTimeout(step, () => runner(project, apiKey));
    if (step === "verification" && result === false) { saveProject(project); return { ok: true, project }; }
    // After a successful retry, re-run every downstream step so the
    // project stays internally consistent (e.g. editing the script and
    // retrying "story" must regenerate scenes/images/etc that depended
    // on the old text) — spec's own "regenerate only the necessary
    // downstream assets" principle, applied at the step level.
    for (const laterStep of STEP_ORDER.slice(startIdx + 1)) {
      await runStepWithTimeout(laterStep, () => STEP_RUNNERS[laterStep](project, apiKey));
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
