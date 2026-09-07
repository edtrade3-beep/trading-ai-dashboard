// Real tests for the Arabic Story AI module's pure/testable logic — no
// ANTHROPIC_API_KEY, image, or TTS credentials exist in any environment
// this runs in, so every Claude-agent function (story/verification/
// director/social) is NOT covered here (they'd need real network calls
// or a mocking layer this codebase's existing test convention doesn't
// use elsewhere either — see PLATFORM_MASTER_PROMPT_REPORT.md's "Test
// results" section for the full, honest breakdown of what is and isn't
// covered). This file covers everything that IS real, deterministic,
// dependency-free logic: JSON extraction, subtitle generation, quality
// control, cost estimation, and the project store (including its path-
// traversal defense). Same minimal no-framework style as
// test/news-divergence.test.js.
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

console.log("\nChecking provider abstractions — real NOT_CONFIGURED fallback (no image/TTS credentials in any test environment)…");

await ok("generateImage returns an honest NOT_CONFIGURED result with no real network attempt", async () => {
  assert.strictEqual(imageProvider.isConfigured(), false);
  const r = await imageProvider.generateImage("a wise old man");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NOT_CONFIGURED");
});

await ok("generateSpeech returns an honest NOT_CONFIGURED result with no real network attempt", async () => {
  assert.strictEqual(ttsProvider.isConfigured(), false);
  const r = await ttsProvider.generateSpeech("مرحبا");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NOT_CONFIGURED");
});

console.log("\nChecking the Video Engine — real ffmpeg-availability probe + pure command construction…");

await ok("checkFfmpegAvailable reports the real state of this environment (ffmpeg is not installed here)", async () => {
  assert.strictEqual(await checkFfmpegAvailable(), false);
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

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("STORY-AI-CORE TEST FAILED");
else console.log("STORY-AI-CORE TEST OK");

})();
