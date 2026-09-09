// Real tests for the Arabic Story AI module's pure/testable logic. The
// Claude-agent functions (story/verification/director/social) are NOT
// covered here — they'd need a real network call or a mocking layer this
// codebase's existing test convention doesn't use elsewhere either. This
// file covers everything that IS real, deterministic, dependency-free
// logic: JSON extraction, subtitle generation, quality control, cost
// estimation, and the project store (including its path-traversal
// defense). Same minimal no-framework style as test/news-divergence.test.js.
//
// Real bug fixed 2026-09-07: this file originally hard-asserted that no
// image/TTS/ffmpeg were configured/installed — true on the machine it was
// written on, NOT true on Render's real deploy environment (which has
// real TTS credentials and ffmpeg already available), so the hard
// assertion failed npm test and blocked an entire deploy over a test
// environment-coupling bug, not a real feature bug. Every check below
// that touches provider/ffmpeg presence now checks whichever real state
// this environment actually has and asserts the correspondingly correct
// behavior for it, and — critically — never makes a real (paid, external)
// API call during the test run even when a provider happens to be
// configured.
"use strict";
const assert = require("node:assert");
const { extractJson } = require("../src/story-ai-claude");
const { splitIntoCues, buildAllCues, toSrt, srtTimestamp } = require("../src/story-ai-subtitles");
const { runQualityControl } = require("../src/story-ai-quality-agent");
const { estimateProjectCost, exceedsBudget, newCostLedger, addCostEntry } = require("../src/story-ai-cost");
const { createProject, getProject, saveProject, listProjects, deleteProject, duplicateProject, assertSafeId } = require("../src/story-ai-store");
const { buildSceneClipArgs, buildFinalMuxArgs, checkFfmpegAvailable } = require("../src/story-ai-video-assembly");
const imageProvider = require("../src/story-ai-image-provider");
const ttsProvider = require("../src/story-ai-tts-provider");
const { mapWithConcurrency, IMAGE_VOICE_CONCURRENCY, resumeOrphanedJobs, firstPendingStep, STEP_ORDER } = require("../src/story-ai-job-runner");

let passed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

(async () => {

console.log("Checking extractJson — real, tolerant JSON extraction from Claude's raw text…");

await ok("a clean JSON object parses directly", () => {
  assert.deepStrictEqual(extractJson('{"a":1}'), { a: 1 });
});

await ok("a ```json fenced block is extracted", () => {
  assert.deepStrictEqual(extractJson('Sure, here you go:\n```json\n{"a":1}\n```'), { a: 1 });
});

await ok("stray prose before/after the object is stripped", () => {
  assert.deepStrictEqual(extractJson('Here is the result: {"a":1} — let me know if you need changes.'), { a: 1 });
});

await ok("genuinely malformed text returns an honest null, never a guess", () => {
  assert.strictEqual(extractJson("not json at all"), null);
  assert.strictEqual(extractJson(""), null);
  assert.strictEqual(extractJson(null), null);
});

console.log("\nChecking the Subtitle System — real Arabic cue splitting + SRT timing…");

await ok("srtTimestamp formats real hh:mm:ss,ms", () => {
  assert.strictEqual(srtTimestamp(0), "00:00:00,000");
  assert.strictEqual(srtTimestamp(65.25), "00:01:05,250");
});

await ok("a real Arabic scene splits into readable cues, none over the soft length cap", () => {
  const cues = splitIntoCues("كان هناك رجل حكيم يعيش في قرية صغيرة، وكان الجميع يطلبون نصيحته في كل أمر من أمور حياتهم اليومية.");
  assert.ok(cues.length > 1, "a long sentence must split into more than one cue");
  assert.ok(cues.every((c) => c.length <= 47), "every cue should stay near the readable-length cap");
});

await ok("buildAllCues produces monotonically increasing, non-overlapping real timestamps across scenes", () => {
  const scenes = [
    { scene_number: 1, start_time: 0, duration_seconds: 6, narration_ar: "الجملة الأولى هنا." },
    { scene_number: 2, start_time: 6, duration_seconds: 5, narration_ar: "والجملة الثانية هنا أيضا." },
  ];
  const cues = buildAllCues(scenes);
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].start >= cues[i - 1].end - 1e-9, `cue ${i} overlaps the previous one`);
});

await ok("toSrt emits real, correctly-numbered SRT blocks", () => {
  const srt = toSrt([{ start: 0, end: 1, text: "أهلا" }, { start: 1, end: 2, text: "وسهلا" }]);
  assert.ok(srt.startsWith("1\n00:00:00,000 --> 00:00:01,000\nأهلا"));
  assert.ok(srt.includes("2\n00:00:01,000 --> 00:00:02,000\nوسهلا"));
});

console.log("\nChecking the Quality Control Agent — real, measurable checks, never an invented confidence score…");

await ok("a project with only Claude configured (no images/voice/video) is still honestly approvable, with real disclosed warnings", () => {
  const project = {
    story: { narration_ar: "قصة" },
    verification: { classification: "inspirational", approved_for_publication: true, claims: [] },
    scenes: [
      { scene_number: 1, narration_ar: "a", image_prompt_en: "p1", character_ids: [] },
      { scene_number: 2, narration_ar: "b", image_prompt_en: "p2", character_ids: [] },
      { scene_number: 3, narration_ar: "c", image_prompt_en: "p3", character_ids: [] },
    ],
    characters: [], images: [], audio: [], subtitles: { cues: [{ text: "short" }] }, finalVideo: null,
  };
  const q = runQualityControl(project);
  assert.strictEqual(q.approved, true);
  assert.strictEqual(q.blocking_issues.length, 0);
  assert.ok(q.warnings.some((w) => w.includes("image provider not configured") || w.includes("No images")));
});

await ok("a story that failed real verification is a real blocking issue, not just a warning", () => {
  const project = {
    story: { narration_ar: "قصة" },
    verification: { classification: "religious", approved_for_publication: false, claims: [{ severity: "high" }] },
    scenes: [{ scene_number: 1, narration_ar: "a", image_prompt_en: "p1", character_ids: [] }],
    characters: [], images: [], audio: [], subtitles: { cues: [] }, finalVideo: null,
  };
  const q = runQualityControl(project);
  assert.strictEqual(q.approved, false);
  assert.ok(q.blocking_issues.some((b) => b.toLowerCase().includes("verification")));
});

await ok("a scene referencing an undefined character_id is a real, measurable consistency warning", () => {
  const project = {
    story: { narration_ar: "قصة" },
    verification: { classification: "inspirational", approved_for_publication: true, claims: [] },
    scenes: [{ scene_number: 1, narration_ar: "a", image_prompt_en: "p1", character_ids: ["ghost_char"] }],
    characters: [], images: [], audio: [], subtitles: { cues: [] }, finalVideo: null,
  };
  const q = runQualityControl(project);
  assert.ok(q.consistency_score < 100);
  assert.ok(q.warnings.some((w) => w.includes("not in the character bible")));
});

await ok("a final video with the wrong resolution is a real blocking issue", () => {
  const project = {
    story: { narration_ar: "قصة" },
    verification: { classification: "inspirational", approved_for_publication: true, claims: [] },
    scenes: [{ scene_number: 1, narration_ar: "a", image_prompt_en: "p1", character_ids: [] }],
    characters: [], images: [], audio: [], subtitles: { cues: [] },
    finalVideo: { width: 1920, height: 1080 },
  };
  const q = runQualityControl(project);
  assert.strictEqual(q.approved, false);
  assert.ok(q.blocking_issues.some((b) => b.includes("1080x1920")));
});

console.log("\nChecking Cost Tracking — real Claude cost ledger + disclosed image/TTS estimates…");

await ok("no image/TTS provider configured -> an honest near-zero estimate", () => {
  const est = estimateProjectCost({ sceneCount: 16, narrationCharCount: 1400, imageConfigured: false, ttsConfigured: false });
  assert.strictEqual(est.imageEstUSD, 0);
  assert.strictEqual(est.ttsEstUSD, 0);
  assert.ok(est.totalEstUSD > 0, "Claude's own real cost still counts");
});

await ok("a configured image+TTS provider produces a real, non-zero disclosed estimate", () => {
  const est = estimateProjectCost({ sceneCount: 16, narrationCharCount: 1400, imageConfigured: true, ttsConfigured: true });
  assert.ok(est.imageEstUSD > 0);
  assert.ok(est.ttsEstUSD > 0);
});

await ok("exceedsBudget flags a real over-budget estimate against the configured max", () => {
  const est = { totalEstUSD: 5 };
  assert.strictEqual(exceedsBudget(est, 1.5), true);
  assert.strictEqual(exceedsBudget({ totalEstUSD: 0.5 }, 1.5), false);
});

await ok("the real cost ledger accumulates entries from real agent calls", () => {
  const ledger = newCostLedger();
  addCostEntry(ledger, { stage: "story", provider: "anthropic", costUSD: 0.02 });
  addCostEntry(ledger, { stage: "verification", provider: "anthropic", costUSD: 0.01 });
  assert.strictEqual(ledger.entries.length, 2);
  assert.strictEqual(ledger.totalUSD, 0.03);
});

console.log("\nChecking provider abstractions — real NOT_CONFIGURED fallback…");

// Real bug fix (2026-09-07): these two tests originally hard-asserted
// isConfigured() === false, true on the machine this was written on but
// NOT a portable fact — Render's own deploy environment turned out to
// already have real TTS credentials set, so the hard assertion failed
// npm test and blocked the entire deploy (the actual feature code was
// fine; the test was coupled to one specific environment's absence of
// config, which is exactly the kind of test that should never gate a
// real build). Fixed to check WHICHEVER real state this environment
// actually has and assert the correspondingly correct behavior for it —
// critically, when a real key IS configured, this must never place a
// real (paid, external) API call during an automated test/build run, so
// that branch only verifies isConfigured() reports true and stops there.
await ok("generateImage's NOT_CONFIGURED path is honest and makes no real network attempt (only reachable if this environment truly has no image credentials)", async () => {
  if (imageProvider.isConfigured()) {
    console.log("    (skipped network-path assertion — this environment has real image credentials configured)");
    return;
  }
  const r = await imageProvider.generateImage("a wise old man");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NOT_CONFIGURED");
});

await ok("generateSpeech's NOT_CONFIGURED path is honest and makes no real network attempt (only reachable if this environment truly has no TTS credentials)", async () => {
  if (ttsProvider.isConfigured()) {
    console.log("    (skipped network-path assertion — this environment has real TTS credentials configured)");
    return;
  }
  const r = await ttsProvider.generateSpeech("مرحبا");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NOT_CONFIGURED");
});

console.log("\nChecking the Video Engine — real ffmpeg-availability probe + pure command construction…");

await ok("checkFfmpegAvailable returns a real boolean reflecting whatever this environment actually has, never throws", async () => {
  // Same fix as above — ffmpeg's presence is genuinely environment-
  // dependent (absent on the machine this was written on, present on
  // Render's build image), so this only asserts the real, portable
  // contract: a boolean, no exception, whichever way it goes.
  const result = await checkFfmpegAvailable();
  assert.strictEqual(typeof result, "boolean");
});

await ok("buildSceneClipArgs produces a real, well-formed ffmpeg argv for a Ken-Burns still-image clip", () => {
  const args = buildSceneClipArgs({ imagePath: "/tmp/1.png", outPath: "/tmp/1.mp4", durationSeconds: 6, motion: "slow zoom in" });
  assert.ok(args.includes("/tmp/1.png"));
  assert.ok(args.includes("/tmp/1.mp4"));
  assert.ok(args.some((a) => typeof a === "string" && a.includes("zoompan")));
});

await ok("buildFinalMuxArgs wires subtitles + ducked music + narration into one real filtergraph", () => {
  const args = buildFinalMuxArgs({ concatListPath: "/tmp/l.txt", narrationAudioPath: "/tmp/n.mp3", musicPath: "/tmp/m.mp3", srtPath: "/tmp/s.srt", outPath: "/tmp/f.mp4" });
  const filterIdx = args.indexOf("-filter_complex");
  assert.ok(filterIdx !== -1);
  assert.ok(args[filterIdx + 1].includes("subtitles="));
  assert.ok(args[filterIdx + 1].includes("amix"));
  assert.ok(args.includes("1080") === false); // resolution comes from the source image scale step, not this stage — sanity check this stage doesn't hardcode it twice
});

console.log("\nChecking the Project Store — real persistence, real path-traversal defense…");

await ok("a real project round-trips through create/get/list/delete", () => {
  const p = createProject({ topic: "TEST_TOPIC_ZZZ", durationSeconds: 90, style: "inspirational", dialect: "msa", voice: "male", visualStyle: "cinematic_realism", notes: "", options: {} });
  try {
    assert.strictEqual(getProject(p.id).topic, "TEST_TOPIC_ZZZ");
    assert.ok(listProjects().some((x) => x.id === p.id));
  } finally {
    deleteProject(p.id);
  }
  assert.ok(!listProjects().some((x) => x.id === p.id), "deleted project must not remain in the index");
});

await ok("duplicateProject copies the real script/scenes forward as a new Draft, not a re-run", () => {
  const p = createProject({ topic: "TEST_TOPIC_DUP", durationSeconds: 90, style: "inspirational", dialect: "msa", voice: "male", visualStyle: "cinematic_realism", notes: "", options: {} });
  p.story = { narration_ar: "نص حقيقي" };
  saveProject(p);
  const copy = duplicateProject(p.id);
  try {
    assert.notStrictEqual(copy.id, p.id);
    assert.strictEqual(copy.status, "Draft");
    assert.strictEqual(copy.story.narration_ar, "نص حقيقي");
  } finally {
    deleteProject(p.id);
    deleteProject(copy.id);
  }
});

await ok("a path-traversal attempt against the store is rejected, never touches the filesystem", () => {
  assert.throws(() => assertSafeId("../../../etc/passwd"));
  assert.throws(() => getProject("../../../etc/passwd"));
});

console.log("\nChecking mapWithConcurrency — real bounded-parallelism speed fix (2026-09-07, images/voice generation)…");

await ok("results preserve original item order regardless of real completion order", async () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  const results = await mapWithConcurrency(items, 4, async (item) => {
    await new Promise((r) => setTimeout(r, (10 - item) % 5)); // deliberately uneven real delays
    return item * 2;
  });
  assert.deepStrictEqual(results, items.map((i) => i * 2));
});

await ok("real concurrency never exceeds the configured limit", async () => {
  const items = Array.from({ length: 12 }, (_, i) => i);
  let concurrent = 0, maxConcurrent = 0;
  await mapWithConcurrency(items, 4, async () => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((r) => setTimeout(r, 15));
    concurrent--;
  });
  assert.ok(maxConcurrent <= 4, `observed ${maxConcurrent} concurrent calls, expected at most 4`);
  assert.ok(maxConcurrent >= 2, "should genuinely run some calls in parallel, not silently serialize");
});

await ok("a concurrency limit greater than the item count never over-spawns real workers", async () => {
  const items = [1, 2, 3];
  const results = await mapWithConcurrency(items, 10, async (item) => item + 1);
  assert.deepStrictEqual(results, [2, 3, 4]);
});

await ok("IMAGE_VOICE_CONCURRENCY is a real, sane positive limit, not accidentally 0/1/unbounded", () => {
  assert.ok(Number.isInteger(IMAGE_VOICE_CONCURRENCY) && IMAGE_VOICE_CONCURRENCY >= 2 && IMAGE_VOICE_CONCURRENCY <= 10);
});

console.log("\nChecking resumeOrphanedJobs — real fix for a job stuck at \"Generating\" forever after a server restart abandons the in-memory pipeline (2026-09-09, live bug: a real project's job.status stayed \"running\" 24+ hours with video/quality still \"pending\")…");

function makeStepsThrough(passedThrough) {
  const steps = {};
  const idx = STEP_ORDER.indexOf(passedThrough);
  STEP_ORDER.forEach((s, i) => { steps[s] = i <= idx ? { status: "passed", at: new Date().toISOString() } : { status: "pending" }; });
  return steps;
}

await ok("firstPendingStep finds exactly the step after the last one marked passed — the real resume point", () => {
  const project = { job: { steps: makeStepsThrough("subtitles") } };
  assert.strictEqual(firstPendingStep(project), "video");
});
await ok("firstPendingStep returns null when every step already has a real status (nothing honestly pending — not a case this fix should guess at)", () => {
  const project = { job: { steps: makeStepsThrough("quality") } };
  assert.strictEqual(firstPendingStep(project), null);
});

await ok("resumeOrphanedJobs leaves a project alone that isn't in \"Generating\" status at all — the summary-level pre-filter never touches a real Draft/Ready/Failed project", async () => {
  const project = createProject({ topic: "orphan test — wrong status", durationSeconds: 30, style: "life_lesson", voice: "male" });
  try {
    // Deliberately NOT "Generating" — Draft, the real default createProject
    // already leaves it in. Even with job.status="running" (an internally
    // inconsistent state that shouldn't exist for a Draft, but this checks
    // the function's own real filter, not just the happy path).
    project.job = { status: "running", error: null, steps: makeStepsThrough("subtitles") };
    saveProject(project);
    await resumeOrphanedJobs("test-fake-key-wrong-status-check");
    const after = getProject(project.id);
    assert.strictEqual(after.status, "Draft", "must be left exactly as found — the project.status filter is the real first gate");
    assert.strictEqual(after.job.steps.video.status, "pending");
  } finally { deleteProject(project.id); }
});

await ok("resumeOrphanedJobs stops retry-storming a project past MAX_AUTO_RESUME_ATTEMPTS and fails it with a real, disclosed reason instead of spending real API credits on every future restart forever", async () => {
  const project = createProject({ topic: "orphan test — cap reached", durationSeconds: 30, style: "life_lesson", voice: "male" });
  try {
    project.status = "Generating";
    project.job = { status: "running", error: null, steps: makeStepsThrough("subtitles"), resumeAttempts: 2 };
    saveProject(project);
    await resumeOrphanedJobs("test-fake-key-cap-check");
    const after = getProject(project.id);
    assert.strictEqual(after.status, "Failed");
    assert.strictEqual(after.job.status, "failed");
    assert.match(after.job.error, /2 automatic resume attempt/);
    // Must NOT have touched the video step at all — the cap stops it
    // before ever calling retryStep, not after a failed attempt.
    assert.strictEqual(after.job.steps.video.status, "pending");
  } finally { deleteProject(project.id); }
});

await ok("resumeOrphanedJobs leaves a genuinely still-running project alone — never double-runs a project this exact process is already working on", async () => {
  const project = createProject({ topic: "orphan test — not actually orphaned", durationSeconds: 30, style: "life_lesson", voice: "male" });
  try {
    project.status = "Generating";
    project.job = { status: "running", error: null, steps: makeStepsThrough("subtitles") };
    saveProject(project);
    // The module's own `running` Set is private (not exported) — probe it
    // behaviorally instead: call resumeOrphanedJobs while retryStep is
    // already in flight for this same project id and confirm it's left
    // completely untouched (not attempted, not counted against the cap).
    const { retryStep } = require("../src/story-ai-job-runner");
    const inFlight = retryStep(project.id, "video", "test-fake-key-inflight-check");
    await resumeOrphanedJobs("test-fake-key-inflight-check");
    const during = getProject(project.id);
    assert.strictEqual(during.job.resumeAttempts || 0, 0, "must not have incremented/attempted a resume while a real run is already in flight for this project");
    await inFlight;
  } finally { deleteProject(project.id); }
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("STORY-AI-CORE TEST FAILED");
else console.log("STORY-AI-CORE TEST OK");

})();
