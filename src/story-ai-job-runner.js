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
const { humanizeNarration } = require("./story-ai-humanizer-agent");
const { critiqueAndRevise } = require("./story-ai-critic-agent");
const { verifyStory } = require("./story-ai-verification-agent");
const { buildScenes } = require("./story-ai-director-agent");
const { buildSocialMetadata } = require("./story-ai-social-agent");
const { buildAllCues, toSrt, rebuildSubtitlesFromAudioTiming } = require("./story-ai-subtitles");
const { generateImage, isConfigured: imagesConfigured } = require("./story-ai-image-provider");
const { generateSpeech, isConfigured: ttsConfigured } = require("./story-ai-tts-provider");
const { planMusicForScenes, buildMusicTimeline } = require("./story-ai-music-director-agent");
const { getTrackForMood, isConfigured: musicConfigured } = require("./story-ai-music-provider");
const { checkFfmpegAvailable, buildSceneClipArgs, buildFinalMuxArgs, runFfmpeg, getAudioDurationSeconds, TARGET_WIDTH, TARGET_HEIGHT } = require("./story-ai-video-assembly");
const { runQualityControl } = require("./story-ai-quality-agent");
const { addCostEntry } = require("./story-ai-cost");
const { getProject, saveProject, assetsDirFor, listProjects } = require("./story-ai-store");
const { saveAsset, hydrateToLocal } = require("./story-ai-asset-store");
const { MAX_RETRIES_PER_STEP, MAX_COST_PER_VIDEO_USD } = require("./story-ai-config");
const { estimateImageCostUSD, estimateTtsCostUSD } = require("./story-ai-cost");
const fs = require("node:fs");
const path = require("node:path");

const STEP_ORDER = ["story", "humanize", "verification", "critic", "scenes", "music", "images", "voice", "subtitles", "video", "quality"];
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
    creativity: project.advancedSettings?.creativity,
  }));
  project.story = story;
  addCostEntry(project.costLedger, { stage: "story", provider: "anthropic", costUSD });
  setStep(project, "story", "passed");
}

// Arabic Humanizer (2026-09-10, explicit user request: its own real
// pipeline stage between Story and Verification, not folded silently
// into the Story Agent's single pass). Runs on the Story Agent's own
// narration_ar and rewrites it for spoken delivery per the project's
// voiceSettings (Voice Performance/Emotion/Pauses). Verification then
// checks the HUMANIZED text — the one that will actually reach TTS —
// rather than a version that gets rewritten out from under it afterward.
// The original is kept (project.story.narration_ar_original) so a human
// reviewing this project can always see what actually changed.
async function runHumanizeStep(project, apiKey) {
  setStep(project, "humanize", "running");
  const original = project.story.narration_ar;
  const { narrationAr, costUSD } = await withRetries(() => humanizeNarration({
    narrationAr: original, voiceSettings: project.voiceSettings, dialect: project.dialect, apiKey,
  }));
  project.story.narration_ar_original = project.story.narration_ar_original || original;
  project.story.narration_ar = narrationAr;
  addCostEntry(project.costLedger, { stage: "humanize", provider: "anthropic", costUSD });
  setStep(project, "humanize", "passed");
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

// AI Story Critic (Story AI 2.0 §33/34, 2026-09-11 explicit user request)
// — a real, adversarial second pass over the humanized, verified
// narration, run once before scene breakdown so any revision reaches the
// scenes/images/voice that follow. Never a silent rewrite: the pre-critic
// story is kept (project.story.narration_ar_pre_critic, same discipline
// as the Humanizer's own narration_ar_original), and project.critic
// always discloses what was checked and whether anything changed, even
// when nothing did.
async function runCriticStep(project, apiKey) {
  setStep(project, "critic", "running");
  const result = await withRetries(() => critiqueAndRevise({
    story: project.story, durationSeconds: project.durationSeconds, style: project.style, apiKey,
  }));
  project.critic = { weaknesses: result.weaknesses, revised: result.revised, revisionNotes: result.revisionNotes };
  if (result.revised) {
    project.story.narration_ar_pre_critic = project.story.narration_ar;
    project.story.title_ar = result.story.title_ar;
    project.story.hook_ar = result.story.hook_ar;
    project.story.narration_ar = result.story.narration_ar;
    project.story.lesson_ar = result.story.lesson_ar;
    project.story.ending_question_ar = result.story.ending_question_ar;
  }
  addCostEntry(project.costLedger, { stage: "critic", provider: "anthropic", costUSD: result.costUSD });
  setStep(project, "critic", "passed");
}

async function runScenesStep(project, apiKey) {
  setStep(project, "scenes", "running");
  // Real Scene Length wiring (2026-09-10) — Advanced Settings' own
  // sceneLengthSeconds picker previously had nothing downstream reading
  // it at all. targetSceneCount is the Director Agent's existing real
  // hint param (buildScenes already honored it when supplied, see its own
  // header comment) — deriving it from durationSeconds/sceneLengthSeconds
  // is the honest way to turn "3/5/7 sec scenes" into a real instruction
  // rather than a cosmetic picker.
  const sceneLengthSeconds = project.advancedSettings?.sceneLengthSeconds || 5;
  const targetSceneCount = Math.max(1, Math.round(project.durationSeconds / sceneLengthSeconds));
  const { breakdown, costUSD } = await withRetries(() => buildScenes({
    story: project.story, apiKey, visualStyle: project.visualStyle,
    targetSceneCount, imageConsistency: project.advancedSettings?.imageConsistency,
  }));
  project.scenes = breakdown.scenes;
  project.characters = breakdown.characters;
  project.locations = breakdown.locations;
  addCostEntry(project.costLedger, { stage: "scenes", provider: "anthropic", costUSD });
  setStep(project, "scenes", "passed");
}

// Real AI Background Music Director step (2026-09-11) — the real, cheap
// (haiku-tier, one call for the whole story) scene-by-scene mood/
// intensity/silence plan. Deliberately does NOT touch ffmpeg or the
// music provider here — this only needs the real narration text, which
// exists right after Scenes; the real per-scene AUDIO durations the
// timeline needs to turn this plan into actual segment lengths aren't
// known until runVideoStep probes the real generated voice files. Same
// honest-skip discipline as Images/Voice: a project with no music
// provider configured, or musicPolicy="off", still completes normally —
// music is real and additive, never a hard requirement.
async function runMusicStep(project, apiKey) {
  setStep(project, "music", "running");
  if (project.advancedSettings?.musicPolicy === "off") {
    setStep(project, "music", "warning", { reason: "Music disabled by user (musicPolicy=off)." });
    project.music = null;
    return;
  }
  if (!musicConfigured()) {
    setStep(project, "music", "warning", { reason: "MUSIC PROVIDER NOT CONFIGURED" });
    project.music = null;
    return;
  }
  try {
    const { plan, costUSD, model } = await planMusicForScenes({ scenes: project.scenes, story: project.story, apiKey });
    project.music = { plan, model };
    addCostEntry(project.costLedger, { stage: "music", provider: "anthropic", costUSD });
    setStep(project, "music", "passed");
  } catch (err) {
    setStep(project, "music", "warning", { reason: `Music planning failed: ${err.message}` });
    project.music = null;
  }
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
  // Real bug fix (2026-09-09, "the video pipeline hangs/loses its own
  // assets" — root cause was Render's local disk never actually
  // surviving a restart between steps). Persists to this app's own
  // Postgres database (story-ai-asset-store.js — the same real bytea
  // pattern already proven for dealer vehicle photos) instead of trusting
  // fs.writeFileSync alone to still be there later.
  const assetsDir = assetsDirFor(project.id);
  const results = await mapWithConcurrency(project.scenes, IMAGE_VOICE_CONCURRENCY, async (scene) => {
    const result = await generateImage(scene.image_prompt_en, {});
    if (result.ok && result.b64) {
      const filename = `${scene.scene_number}.png`;
      const filePath = await saveAsset(project.id, assetsDir, "images", filename, Buffer.from(result.b64, "base64"), "image/png");
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

// Speed is the one Voice Performance control that maps to a real TTS API
// parameter (Google's speakingRate / ElevenLabs' speed) — disclosed
// honestly in story-ai-humanizer-agent.js's own header comment that
// Emotion/Pauses do NOT have a real equivalent on these providers'
// standard voices and are instead expressed through the script text
// itself via the Humanizer's prompt.
const SPEED_MAP = { slow: 0.85, natural: 1.0, fast: 1.15 };

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
  // Same real Postgres-backed persistence fix as runImagesStep above.
  const assetsDir = assetsDirFor(project.id);
  const results = await mapWithConcurrency(project.scenes, IMAGE_VOICE_CONCURRENCY, async (scene) => {
    const speed = SPEED_MAP[project.voiceSettings?.speed] || SPEED_MAP.natural;
    const result = await generateSpeech(scene.narration_ar, { voice: project.voice === "female" ? "female" : "male", speed, pauses: project.voiceSettings?.pauses });
    if (result.ok && result.audioBuffer) {
      const filename = `${scene.scene_number}.mp3`;
      const filePath = await saveAsset(project.id, assetsDir, "audio", filename, result.audioBuffer, "audio/mpeg");
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

async function runSubtitlesStep(project) {
  setStep(project, "subtitles", "running");
  const cues = buildAllCues(project.scenes);
  const srt = toSrt(cues);
  // Same real Postgres-backed persistence fix as images/voice above —
  // this file is cheap to regenerate from project.scenes alone, but
  // runVideoStep's OWN re-timed replacement (narration_retimed.srt) is
  // not, and both go through the identical saveAsset call for one
  // consistent real contract rather than a special case for the cheap one.
  const srtPath = await saveAsset(project.id, assetsDirFor(project.id), "subtitles", "narration.srt", Buffer.from(srt, "utf8"), "application/x-subrip");
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
// Detailed [VIDEO] logging (2026-09-09, explicit user request after this
// exact project sat stuck at "Generating" — job.steps.subtitles: passed,
// job.steps.video: still "pending", never even started, per a real GET
// /api/story-ai/projects/:id check). Cheap, always-on (this step runs at
// most once per real project run) — real console output on the actual
// Render server, not a guess about what's happening from outside it.
function logVideo(...args) { console.log("[VIDEO]", ...args); }

// Real Background Music bed builder (2026-09-11) — turns the Music
// Director's per-scene plan (project.music.plan) plus the REAL per-scene
// audio durations just probed in runVideoStep into one continuous real
// audio file matching the final video's own length. Each merged segment
// (buildMusicTimeline groups contiguous same-mood scenes) becomes one
// real ffmpeg-rendered clip: a real looped/trimmed track for a real
// music segment, or real digital silence (`anullsrc`) for a
// `dramaticSilence` beat OR a mood with no real track file yet (an
// honest gap, never a fabricated substitute). Returns null (skip music
// mixing entirely) only if every single segment came back silent — no
// point wiring a silent "music" input into the final mux.
async function buildMusicBed(segments, videoDir) {
  const clipPaths = [];
  let anyRealTrack = false;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const clipPath = path.join(videoDir, `music_seg_${i}.m4a`);
    const duration = Math.max(0.2, seg.durationSeconds);
    if (seg.dramaticSilence) {
      logVideo(`Music segment ${i}: dramatic silence for ${duration.toFixed(1)}s (scenes ${seg.sceneNumbers.join(",")})`);
      await runFfmpeg(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(duration), "-c:a", "aac", "-b:a", "192k", clipPath]);
    } else {
      const track = await getTrackForMood(seg.mood, { seed: i });
      if (track.ok) {
        anyRealTrack = true;
        logVideo(`Music segment ${i}: real track "${track.path}" (mood=${seg.mood}) for ${duration.toFixed(1)}s (scenes ${seg.sceneNumbers.join(",")})`);
        // Real loop+trim to the segment's real length, with a short
        // fade-out so looping/cutting to the next segment never clicks.
        const fadeStart = Math.max(0, duration - 1.5);
        await runFfmpeg(["-y", "-stream_loop", "-1", "-i", track.path, "-t", String(duration), "-af", `afade=t=out:st=${fadeStart}:d=1.5`, "-c:a", "aac", "-b:a", "192k", clipPath]);
      } else {
        logVideo(`Music segment ${i}: no real track for mood "${seg.mood}" (${track.reason}) — honest silence for ${duration.toFixed(1)}s`);
        await runFfmpeg(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(duration), "-c:a", "aac", "-b:a", "192k", clipPath]);
      }
    }
    clipPaths.push(clipPath);
  }
  if (!anyRealTrack) { logVideo("No real music track found for any segment — skipping music mixing entirely."); return null; }
  const escapeForConcat = (p) => p.replace(/'/g, "'\\''");
  const listPath = path.join(videoDir, "music_concat.txt");
  fs.writeFileSync(listPath, clipPaths.map((p) => `file '${escapeForConcat(p)}'`).join("\n"), "utf8");
  const combinedPath = path.join(videoDir, "music.m4a");
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:a", "aac", "-b:a", "192k", combinedPath]);
  return combinedPath;
}

async function runVideoStep(project) {
  logVideo(`Starting assembly for ${project.id}`);
  setStep(project, "video", "running");
  const hasImages = (project.images || []).some((i) => i.ok);
  const hasAudio = (project.audio || []).some((a) => a.ok);
  logVideo(`Images recorded ok: ${(project.images || []).filter((i) => i.ok).length}/${(project.images || []).length}, audio recorded ok: ${(project.audio || []).filter((a) => a.ok).length}/${(project.audio || []).length}`);
  if (!hasImages || !hasAudio) {
    logVideo(`Aborting — ${!hasImages ? "no images" : "no audio"} recorded ok.`);
    setStep(project, "video", "warning", { reason: !hasImages ? "No real images available to assemble." : "No real narration audio available to assemble." });
    return;
  }
  const ffmpegOk = await checkFfmpegAvailable();
  logVideo(`FFmpeg available: ${ffmpegOk}`);
  if (!ffmpegOk) { setStep(project, "video", "warning", { reason: "FFmpeg is not installed on this server." }); return; }

  // Real bug found live (2026-09-08): project.images/.audio's own `ok`
  // flag reflects whether generation succeeded AT THE TIME IT RAN — it
  // is not a live guarantee the file still exists on THIS disk right
  // now. A real production case: scene 2 was recorded ok:true (its own
  // generation call really did succeed) but the file was genuinely
  // absent when Video ran later, and ffmpeg correctly hard-failed
  // ("Error opening input file... No such file or directory") rather
  // than silently producing a broken video — assembly must never trust
  // stale metadata over the real, current filesystem state.
  //
  // Real fix (2026-09-09): a plain fs.existsSync check here could only
  // ever say "gone," with no way to get the file back — that's exactly
  // what kept happening (Render's local disk not surviving a restart
  // between the Voice/Subtitles steps and this one). hydrateToLocal
  // (story-ai-asset-store.js) checks the real local path first, and if
  // it's missing, re-fetches the real bytes from this app's own Postgres
  // database (where saveAsset already persisted them during Images/
  // Voice) and rewrites the local file before reporting success — the
  // same real file this scene's own generation call produced, not a
  // guess or a placeholder. Only a scene whose asset is genuinely gone
  // from BOTH the local disk AND Postgres (or was never generated
  // successfully to begin with) is honestly dropped from assembly.
  const assetsDir = assetsDirFor(project.id);
  const imageByScene = new Map();
  const audioByScene = new Map();
  for (const i of project.images || []) {
    if (!i.ok) continue;
    const p = await hydrateToLocal(project.id, assetsDir, "images", `${i.sceneNumber}.png`);
    if (p) imageByScene.set(i.sceneNumber, p);
  }
  for (const a of project.audio || []) {
    if (!a.ok) continue;
    const p = await hydrateToLocal(project.id, assetsDir, "audio", `${a.sceneNumber}.mp3`);
    if (p) audioByScene.set(a.sceneNumber, p);
  }
  logVideo(`Found ${imageByScene.size}/${(project.images || []).length} images available (local disk or re-hydrated from Postgres), ${audioByScene.size}/${(project.audio || []).length} audio files available`);
  for (const i of project.images || []) logVideo(`  image scene ${i.sceneNumber}: ${imageByScene.get(i.sceneNumber) || "(unavailable)"}`);
  for (const a of project.audio || []) logVideo(`  audio scene ${a.sceneNumber}: ${audioByScene.get(a.sceneNumber) || "(unavailable)"}`);
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
  logVideo(`Temp dir: ${videoDir}`);
  logVideo(`Output dir: ${finalDir}`);
  logVideo(`Usable scenes: ${usableScenes.length}/${(project.scenes || []).length}${missingAssetScenes.length ? ` — dropped: ${missingAssetScenes.join(", ")}` : ""}`);
  const escapeForConcat = (p) => p.replace(/'/g, "'\\''");

  try {
    // 1. Real per-scene audio duration (probed off the actual generated
    //    file, not the script estimate — see getAudioDurationSeconds'
    //    own header) drives both this scene's clip length AND the final
    //    subtitle re-timing below, so video/audio/subtitles all agree on
    //    the same real timeline instead of drifting apart.
    const durations = [];
    for (const scene of usableScenes) {
      const p = audioByScene.get(scene.scene_number);
      const real = await getAudioDurationSeconds(p);
      // p is guaranteed to exist locally at this point — it only ever
      // entered audioByScene above after hydrateToLocal confirmed (and,
      // if needed, re-fetched from Postgres) a real local file.
      logVideo(`Voice file scene ${scene.scene_number}: ${p} duration=${real ?? "(probe failed, using script estimate)"}s`);
      durations.push(real ?? (Number(scene.duration_seconds) || 5));
    }

    // 1b. Real Background Music bed (2026-09-11) — only attempted when
    //     the Music Director actually produced a plan (runMusicStep
    //     honestly skips this on musicPolicy="off" or no provider
    //     configured) and a real provider is configured RIGHT NOW (it
    //     could have been unconfigured at plan time and configured since,
    //     or vice versa — always re-check live rather than trust a stale
    //     flag). A failure here is non-blocking: the video still
    //     assembles with narration-only audio, same as before this
    //     feature existed.
    let musicPath = null;
    if (project.music?.plan?.length && musicConfigured()) {
      try {
        const planByScene = new Map(project.music.plan.map((p) => [p.scene_number, p]));
        const usablePlan = usableScenes.map((s) => planByScene.get(s.scene_number) || { scene_number: s.scene_number, mood: "calm", intensity: 2, dramaticSilence: false });
        const segments = buildMusicTimeline(usablePlan, durations);
        logVideo(`Music plan: ${segments.length} real segment(s) from ${usablePlan.length} scene(s).`);
        musicPath = await buildMusicBed(segments, videoDir);
      } catch (err) {
        logVideo(`Music bed build failed (non-blocking, video continues narration-only): ${err.message}`);
        musicPath = null;
      }
    }

    // 2. Real Ken-Burns clip per scene (pure builder, real ffmpeg run).
    const clipPaths = [];
    for (let i = 0; i < usableScenes.length; i++) {
      const scene = usableScenes[i];
      const clipPath = path.join(videoDir, `clip_${scene.scene_number}.mp4`);
      const args = buildSceneClipArgs({ imagePath: imageByScene.get(scene.scene_number), outPath: clipPath, durationSeconds: durations[i], motion: scene.motion });
      logVideo(`Running FFmpeg (scene ${scene.scene_number} clip): ffmpeg ${args.join(" ")}`);
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
    logVideo(`Running FFmpeg (combine narration): ffmpeg -y -f concat -safe 0 -i ${audioConcatListPath} -c:a aac -b:a 192k ${combinedAudioPath}`);
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", audioConcatListPath, "-c:a", "aac", "-b:a", "192k", combinedAudioPath]);

    // 5. Real subtitle re-timing off the SAME real per-scene durations
    //    just probed (story-ai-subtitles.js's own rebuildSubtitlesFromAudioTiming
    //    — built earlier, never wired in until now) — never the script
    //    estimate once real audio exists, so burned-in subtitles line up
    //    with the real assembled timeline, not the pre-generation guess.
    const retimedCues = rebuildSubtitlesFromAudioTiming(usableScenes, durations);
    // Real Postgres persistence (2026-09-09), same as Images/Voice/the
    // original Subtitles step — this replaces the script-estimate SRT
    // saved there with the real-audio-timed one under the SAME "subtitles"
    // kind/filename the asset-download route already serves, so a later
    // restart can't leave the download link pointing at a file that only
    // ever lived on this one process's local disk.
    const retimedSrtPath = await saveAsset(project.id, assetsDir, "subtitles", "narration.srt", Buffer.from(toSrt(retimedCues), "utf8"), "application/x-subrip");
    logVideo(`Subtitle file: ${retimedSrtPath}`);
    project.subtitles = { ...project.subtitles, cues: retimedCues, srtPath: retimedSrtPath, timingSource: "real-audio-duration" };

    // 6. Real final mux — concatenated clips + real combined narration +
    //    real re-timed subtitles burned in + the real Background Music
    //    bed built above (null when no provider is configured, disabled
    //    by musicPolicy, or every planned segment came back silent) —
    //    buildFinalMuxArgs's own sidechaincompress ducking keeps
    //    narration clear whenever music is actually present.
    const outPath = path.join(finalDir, "final.mp4");
    const muxArgs = buildFinalMuxArgs({ concatListPath, narrationAudioPath: combinedAudioPath, musicPath, srtPath: retimedSrtPath, outPath, burnSubtitles: true, subtitleStyle: project.advancedSettings?.subtitleStyle });
    logVideo(`Running FFmpeg (final mux): ffmpeg ${muxArgs.join(" ")}`);
    await runFfmpeg(muxArgs);
    logVideo(`FFmpeg exited 0 (runFfmpeg only resolves on a real exit code 0 — see story-ai-video-assembly.js)`);

    const outExists = fs.existsSync(outPath);
    const outSize = outExists ? fs.statSync(outPath).size : 0;
    logVideo(`Output exists=${outExists}`);
    logVideo(`Output size=${outSize} bytes`);
    if (!outExists || outSize === 0) {
      // Real, explicit failure — never silently mark a step "passed" over
      // an output file that doesn't exist or is empty (ffmpeg can exit 0
      // and still produce a truncated/zero-byte file in rare real cases,
      // e.g. disk full mid-write).
      throw new Error(`FFmpeg reported success but the output file is ${outExists ? "empty" : "missing"} at ${outPath}.`);
    }

    // Real Postgres persistence (2026-09-09) — the whole reason this fix
    // exists: the final MP4 itself is exactly the kind of file that used
    // to be there one moment and gone the next restart, making the
    // DOWNLOAD VIDEO link 404 with no warning. Re-reads the real bytes
    // ffmpeg just wrote and saves them the same way every other asset now
    // is — the download route (routes/story-ai.js) serves this from
    // Postgres first, so it survives every future restart from here on.
    const finalBuffer = fs.readFileSync(outPath);
    const finalStoredPath = await saveAsset(project.id, assetsDir, "final", "final.mp4", finalBuffer, "video/mp4");
    logVideo(`Persisted final video to durable storage: ${finalStoredPath}`);

    const skippedCount = (project.scenes || []).length - usableScenes.length;
    // Real field name fix: StoryAiTab.jsx's own DOWNLOAD VIDEO link
    // already reads project.finalVideo.path (it was built and wired
    // before this real assembly step existed to ever populate it) —
    // matching that existing real contract, not inventing a new one.
    project.finalVideo = { path: finalStoredPath, sceneCount: usableScenes.length, totalDurationSeconds: Math.round(durations.reduce((a, b) => a + b, 0) * 100) / 100, skippedScenes: skippedCount, fileSizeBytes: outSize, width: TARGET_WIDTH, height: TARGET_HEIGHT, musicUsed: Boolean(musicPath) };
    logVideo(`Marking video step complete (${usableScenes.length} scenes, ${project.finalVideo.totalDurationSeconds}s, ${outSize} bytes)`);
    setStep(project, "video", "passed", skippedCount > 0 ? { reason: `${skippedCount} scene(s) skipped — ${missingAssetScenes.length ? missingAssetScenes.join(", ") : "missing a real image or narration audio"}.` } : {});
  } catch (err) {
    logVideo(`FAILED: ${err.message}`);
    setStep(project, "video", "warning", { reason: `Real ffmpeg assembly failed: ${err.message}` });
  }
}

async function runQualityStep(project, apiKey) {
  console.log("[QUALITY] Starting");
  setStep(project, "quality", "running");
  project.quality = runQualityControl(project);
  try {
    const { metadata, costUSD } = await buildSocialMetadata({ story: project.story, apiKey });
    project.social = metadata;
    addCostEntry(project.costLedger, { stage: "social", provider: "anthropic", costUSD });
  } catch (err) {
    console.log(`[QUALITY] Social metadata generation failed (non-blocking): ${err.message}`);
    project.warnings.push(`Social metadata generation failed: ${err.message}`);
  }
  console.log(`[QUALITY] ${project.quality.approved ? "Passed" : "Warning"}${project.quality.approved ? "" : ` — ${(project.quality.blocking_issues || [])[0] || "issues found"}`}`);
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
    await runStepWithTimeout("humanize", () => runHumanizeStep(project, apiKey)); saveProject(project);
    const approved = await runStepWithTimeout("verification", () => runVerificationStep(project, apiKey)); saveProject(project);
    if (!approved) { project.job.status = "paused"; saveProject(project); return { ok: true, project }; }

    await runStepWithTimeout("critic", () => runCriticStep(project, apiKey)); saveProject(project);
    await runStepWithTimeout("scenes", () => runScenesStep(project, apiKey)); saveProject(project);
    await runStepWithTimeout("music", () => runMusicStep(project, apiKey)); saveProject(project);
    await runStepWithTimeout("images", () => runImagesStep(project)); saveProject(project);
    await runStepWithTimeout("voice", () => runVoiceStep(project)); saveProject(project);
    await runStepWithTimeout("subtitles", () => runSubtitlesStep(project)); saveProject(project);
    await runStepWithTimeout("video", () => runVideoStep(project)); saveProject(project);
    await runStepWithTimeout("quality", () => runQualityStep(project, apiKey)); saveProject(project);

    project.status = project.quality?.approved ? "Ready" : "Needs Review";
    project.job.status = "done";
    saveProject(project);
    console.log(`[PROJECT] ${projectId} Status=${project.status} (job.status=done, video=${project.job.steps.video?.status}, quality=${project.job.steps.quality?.status})`);
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
    console.log(`[PROJECT] ${projectId} Status=Failed at step "${runningStep ? runningStep[0] : "?"}": ${err.message}`);
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
  humanize: runHumanizeStep,
  verification: runVerificationStep,
  critic: runCriticStep,
  scenes: runScenesStep,
  music: runMusicStep,
  images: runImagesStep,
  voice: runVoiceStep,
  // Real bug fix (2026-09-09): runSubtitlesStep became async once it
  // started awaiting saveAsset's real Postgres write — this wrapper used
  // to call it and discard the returned promise (a bare statement, no
  // return), so retryStep's own `await runner(project, apiKey)` resolved
  // immediately without ever actually waiting for the real write to land,
  // racing whatever ran next against a subtitles file that might not be
  // saved yet.
  subtitles: (project) => runSubtitlesStep(project),
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
    project.job.status = "done";
    saveProject(project);
    console.log(`[PROJECT] ${projectId} Status=${project.status} (retry from "${step}" — job.status=done, video=${project.job.steps.video?.status}, quality=${project.job.steps.quality?.status})`);
    return { ok: true, project };
  } catch (err) {
    // Same real fix as runPipeline's catch above — if the failure actually
    // happened in a later downstream step (the re-run loop above), mark
    // THAT step failed, not the originally-requested one.
    const runningStep = Object.entries(project.job.steps || {}).find(([, s]) => s.status === "running");
    setStep(project, runningStep ? runningStep[0] : step, "failed", { reason: err.message });
    project.status = "Failed";
    // Real bug fix (2026-09-09) — this used to only ever set
    // project.status, never project.job.status, unlike runPipeline's own
    // identical catch block just above. A retry that genuinely throws
    // here left job.status stuck at "running" forever (set at this
    // function's own start) even though project.status correctly said
    // "Failed" — the exact "running but nothing is actually running"
    // inconsistency this whole fix is about, just from a different path.
    project.job.status = "failed";
    project.job.error = err.message;
    saveProject(project);
    console.log(`[PROJECT] ${projectId} Status=Failed at step "${runningStep ? runningStep[0] : step}" (retry from "${step}"): ${err.message}`);
    return { ok: false, error: err.message, project };
  } finally {
    running.delete(projectId);
  }
}

function isRunning(projectId) { return running.has(projectId); }

// Real root cause of "stuck at Generating forever" (2026-09-09, found by
// directly inspecting a real stuck project's own job.steps via GET
// /api/story-ai/projects/:id): job.status can be "running" with NO actual
// in-process run behind it. Every step call in runPipeline/retryStep is
// a plain in-memory async chain guarded only by the `running` Set above —
// if the WHOLE SERVER PROCESS restarts mid-run (a Render redeploy, or any
// other real restart) at any point, including the split-second between
// two awaited steps, that promise chain is abandoned with it. The
// project file on disk is left exactly as the last real saveProject()
// wrote it: job.status still "running", whichever step hadn't started
// yet still "pending" — indistinguishable from "genuinely still working"
// to anything reading the file, forever, since `running` (a fresh empty
// Set on every new process) can never disprove it either. Confirmed live:
// a real project's subtitles step passed, video/quality both sat at
// "pending", job.status stayed "running" for over 24 hours with zero
// further progress.
//
// Fix: on every real server boot, scan for exactly this signature
// (project.status === "Generating" AND job.status === "running" AND NOT
// in the in-memory `running` Set — always true right after a fresh boot)
// and resume each one from its first real "pending" step via the SAME
// retryStep() a manual RETRY STEP click would call — reusing every
// already-passed step's real output (images/voice/subtitles already on
// disk are never regenerated), not restarting the project from scratch.
// Capped at 2 auto-resume attempts per project (persisted as
// job.resumeAttempts) so a project that's stuck for a REAL reason (a
// genuinely broken asset, not just an orphaned process) can't retry-storm
// real Anthropic/image/TTS credits forever across every future restart —
// past the cap it's left stuck with a real, disclosed error for a human
// to look at, exactly like any other real failure.
const MAX_AUTO_RESUME_ATTEMPTS = 2;
function firstPendingStep(project) {
  for (const step of STEP_ORDER) {
    const s = project.job?.steps?.[step];
    if (!s || s.status === "pending") return step;
  }
  return null;
}
async function resumeOrphanedJobs(apiKey) {
  if (!apiKey) { try { ({ ANTHROPIC_API_KEY: apiKey } = require("./config")); } catch { /* fall through with undefined */ } }
  if (!apiKey) return; // nothing this function can do without it — every real step needs it
  let candidates;
  try { candidates = listProjects().filter((p) => p.status === "Generating"); }
  catch (err) { console.log(`[PROJECT] resumeOrphanedJobs: could not list projects: ${err.message}`); return; }
  for (const summary of candidates) {
    let project;
    try { project = getProject(summary.id); } catch { continue; }
    if (!project || project.job?.status !== "running" || running.has(project.id)) continue;
    const resumeFrom = firstPendingStep(project);
    if (!resumeFrom) {
      console.log(`[PROJECT] ${project.id} looks orphaned (status=Generating, job.status=running) but every step already has a real status — leaving for manual review, not guessing where to resume.`);
      continue;
    }
    const attempts = Number(project.job.resumeAttempts) || 0;
    if (attempts >= MAX_AUTO_RESUME_ATTEMPTS) {
      console.log(`[PROJECT] ${project.id} already auto-resumed ${attempts} time(s) and is still orphaned at "${resumeFrom}" — real, disclosed stop, not retrying again automatically.`);
      project.status = "Failed";
      project.job.status = "failed";
      project.job.error = `Orphaned at step "${resumeFrom}" after ${attempts} automatic resume attempt(s) — a server restart likely interrupted this run each time. Use RETRY STEP manually to try again.`;
      saveProject(project);
      continue;
    }
    project.job.resumeAttempts = attempts + 1;
    saveProject(project);
    console.log(`[PROJECT] ${project.id} orphaned (job.status=running, no active in-process run — likely abandoned by a prior server restart) — auto-resuming from step "${resumeFrom}" (attempt ${attempts + 1}/${MAX_AUTO_RESUME_ATTEMPTS}).`);
    retryStep(project.id, resumeFrom, apiKey).catch((err) => {
      console.log(`[PROJECT] ${project.id} auto-resume from "${resumeFrom}" failed: ${err.message}`);
    });
  }
}

module.exports = { runPipeline, retryStep, isRunning, resumeOrphanedJobs, firstPendingStep, STEP_ORDER, mapWithConcurrency, IMAGE_VOICE_CONCURRENCY };
