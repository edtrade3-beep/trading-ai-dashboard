"use strict";

// routes/story-ai.js — REST API for the Arabic Story AI module. Thin
// HTTP layer only — all real logic lives in the story-ai-*.js services.
// Every route that needs Claude reads ANTHROPIC_API_KEY server-side
// (src/config.js, the same shared key/config source every other AI
// feature in this app already reads) and NEVER sends it to the client,
// per spec's explicit security requirement. Gated entirely behind
// STORY_AI_ENABLED so the whole module can be switched off without
// touching any trading route.

const fs = require("node:fs");
const path = require("node:path");
const { writeJson, readRequestBody } = require("../utils");
const { ANTHROPIC_API_KEY } = require("../config");
const {
  STORY_AI_ENABLED, MAX_TOPIC_LENGTH, MAX_NOTES_LENGTH, MAX_DURATION_SECONDS,
  MAX_COST_PER_VIDEO_USD, imageProviderConfigured, ttsProviderConfigured, IMAGE_PROVIDER, TTS_PROVIDER,
} = require("../story-ai-config");
const { createProject, getProject, saveProject, listProjects, deleteProject, duplicateProject, assetsDirFor } = require("../story-ai-store");
const { runPipeline, retryStep, isRunning } = require("../story-ai-job-runner");
const { estimateProjectCost, exceedsBudget } = require("../story-ai-cost");
const { checkFfmpegAvailable } = require("../story-ai-video-assembly");

const VALID_STYLES = new Set(["inspirational", "psychological", "islamic_reflection", "historical", "wisdom", "life_lesson", "children", "custom"]);
const VALID_DIALECTS = new Set(["msa", "gulf", "egyptian", "levantine", "maghrebi"]);

function badRequest(res, msg) { return writeJson(res, 400, { ok: false, error: msg }); }

function sanitizeCreateInput(body) {
  const topic = String(body.topic || "").trim().slice(0, MAX_TOPIC_LENGTH);
  if (!topic) throw new Error("Topic is required.");
  const durationSeconds = Math.min(MAX_DURATION_SECONDS, Math.max(20, Number(body.durationSeconds) || 120));
  const style = VALID_STYLES.has(body.style) ? body.style : "inspirational";
  const dialect = VALID_DIALECTS.has(body.dialect) ? body.dialect : "msa";
  const voice = body.voice === "female" ? "female" : "male";
  const visualStyle = String(body.visualStyle || "cinematic_realism").slice(0, 40);
  const notes = String(body.notes || "").trim().slice(0, MAX_NOTES_LENGTH);
  const options = {
    generateHook: body.options?.generateHook !== false,
    generateImages: body.options?.generateImages !== false,
    generateVoice: body.options?.generateVoice !== false,
    generateSubtitles: body.options?.generateSubtitles !== false,
    addMusic: body.options?.addMusic !== false,
    addMotion: body.options?.addMotion !== false,
    generateThumbnail: body.options?.generateThumbnail !== false,
    generateCaption: body.options?.generateCaption !== false,
    factCheck: body.options?.factCheck !== false,
    verifyReligious: body.options?.verifyReligious !== false,
  };
  return { topic, durationSeconds, style, dialect, voice, visualStyle, notes, options };
}

async function handleStoryAi(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;
  if (!pathname.startsWith("/api/story-ai/")) return writeJson(res, 404, { ok: false, error: "Not found" });
  if (!STORY_AI_ENABLED) return writeJson(res, 404, { ok: false, error: "Story AI is disabled (STORY_AI_ENABLED=false)." });

  // GET /api/story-ai/status — real provider connection status for the
  // Settings screen (spec: "masked credential status: Connected / Missing
  // / Error" — never the raw key, just presence).
  if (pathname === "/api/story-ai/status" && req.method === "GET") {
    const ffmpegAvailable = await checkFfmpegAvailable();
    return writeJson(res, 200, {
      ok: true,
      claude: { status: ANTHROPIC_API_KEY ? "Connected" : "Missing" },
      images: { provider: IMAGE_PROVIDER, status: imageProviderConfigured() ? "Connected" : "Missing" },
      voice: { provider: TTS_PROVIDER, status: ttsProviderConfigured() ? "Connected" : "Missing" },
      ffmpeg: { status: ffmpegAvailable ? "Connected" : "Missing" },
      maxCostPerVideoUSD: MAX_COST_PER_VIDEO_USD,
    });
  }

  // POST /api/story-ai/estimate — pre-generation cost estimate, spec's
  // own "Estimated before generation" requirement. Never spends anything.
  if (pathname === "/api/story-ai/estimate" && req.method === "POST") {
    let body; try { body = JSON.parse(await readRequestBody(req)); } catch { return badRequest(res, "Bad JSON body."); }
    const narrationCharCount = Math.round((Number(body.durationSeconds) || 120) * 2.3 * 5); // ~2.3 Arabic words/sec, ~5 chars/word — a rough, disclosed estimate
    const sceneCount = Math.max(3, Math.round((Number(body.durationSeconds) || 120) / 8));
    const estimate = estimateProjectCost({
      sceneCount, narrationCharCount,
      imageConfigured: body.options?.generateImages !== false && imageProviderConfigured(),
      ttsConfigured: body.options?.generateVoice !== false && ttsProviderConfigured(),
    });
    return writeJson(res, 200, { ok: true, estimate, overBudget: exceedsBudget(estimate), maxCostPerVideoUSD: MAX_COST_PER_VIDEO_USD });
  }

  // GET /api/story-ai/projects — list (Projects section).
  if (pathname === "/api/story-ai/projects" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, projects: listProjects() });
  }

  // POST /api/story-ai/projects — create + kick off the real background
  // pipeline (spec: "Do not block a frontend HTTP request for the entire
  // workflow"). Returns immediately with the Draft project; the frontend
  // polls GET .../:id for real progress.
  if (pathname === "/api/story-ai/projects" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set — Story AI's Claude service is not configured." });
    let body; try { body = JSON.parse(await readRequestBody(req)); } catch { return badRequest(res, "Bad JSON body."); }
    let input; try { input = sanitizeCreateInput(body); } catch (e) { return badRequest(res, e.message); }
    const scriptOnly = Boolean(body.scriptOnly);
    const project = createProject(input);
    if (scriptOnly) project.options = { ...project.options, generateImages: false, generateVoice: false };
    saveProject(project);
    runPipeline(project.id, ANTHROPIC_API_KEY).catch(() => {}); // fire-and-forget — runPipeline itself persists every real state transition
    return writeJson(res, 200, { ok: true, project });
  }

  // GET /api/story-ai/library — real media library across every project
  // (spec §"LIBRARY"), filterable by project/type via query params.
  if (pathname === "/api/story-ai/library" && req.method === "GET") {
    const projectFilter = searchParams.get("project");
    const typeFilter = searchParams.get("type");
    const items = [];
    for (const summary of listProjects()) {
      if (projectFilter && summary.id !== projectFilter) continue;
      const project = getProject(summary.id);
      if (!project) continue;
      (project.images || []).forEach((img) => { if (img.ok && (!typeFilter || typeFilter === "image")) items.push({ projectId: project.id, type: "image", sceneNumber: img.sceneNumber, path: img.path, at: project.updatedAt }); });
      (project.audio || []).forEach((a) => { if (a.ok && (!typeFilter || typeFilter === "audio")) items.push({ projectId: project.id, type: "audio", sceneNumber: a.sceneNumber, path: a.path, at: project.updatedAt }); });
      if (project.finalVideo && (!typeFilter || typeFilter === "video")) items.push({ projectId: project.id, type: "video", path: project.finalVideo.path, at: project.updatedAt });
      if (project.thumbnail && (!typeFilter || typeFilter === "thumbnail")) items.push({ projectId: project.id, type: "thumbnail", path: project.thumbnail.path, at: project.updatedAt });
    }
    return writeJson(res, 200, { ok: true, items });
  }

  // /api/story-ai/projects/<id>...
  const projMatch = pathname.match(/^\/api\/story-ai\/projects\/([^/]+)(\/.*)?$/);
  if (projMatch) {
    const id = projMatch[1];
    const sub = projMatch[2] || "";
    let project;
    try { project = getProject(id); } catch { return badRequest(res, "Invalid project id."); }
    if (!project) return writeJson(res, 404, { ok: false, error: "Project not found." });

    if (!sub && req.method === "GET") {
      return writeJson(res, 200, { ok: true, project, running: isRunning(id) });
    }

    // PATCH — Story Editor (spec §"STORY EDITOR"). Edits the real script/
    // scene fields in place; does NOT auto-regenerate downstream assets —
    // the client calls the relevant retry endpoint explicitly afterward
    // (spec: "regenerate only the necessary downstream assets", left as
    // an explicit user action here rather than a surprising auto-cascade).
    if (!sub && req.method === "PATCH") {
      let body; try { body = JSON.parse(await readRequestBody(req)); } catch { return badRequest(res, "Bad JSON body."); }
      if (body.story && project.story) Object.assign(project.story, body.story);
      if (Array.isArray(body.scenes) && Array.isArray(project.scenes)) {
        for (const patch of body.scenes) {
          const scene = project.scenes.find((s) => s.scene_number === patch.scene_number);
          if (scene) Object.assign(scene, patch);
        }
      }
      saveProject(project);
      return writeJson(res, 200, { ok: true, project });
    }

    if (!sub && req.method === "DELETE") {
      deleteProject(id);
      return writeJson(res, 200, { ok: true });
    }

    if (sub === "/duplicate" && req.method === "POST") {
      const copy = duplicateProject(id);
      return writeJson(res, 200, { ok: true, project: copy });
    }

    // POST .../retry — body: {step:"story"|"verification"|"scenes"|"images"|"voice"|"subtitles"|"video"|"quality"}
    if (sub === "/retry" && req.method === "POST") {
      if (!ANTHROPIC_API_KEY) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set." });
      let body; try { body = JSON.parse(await readRequestBody(req)); } catch { return badRequest(res, "Bad JSON body."); }
      if (isRunning(id)) return writeJson(res, 429, { ok: false, error: "This project is already generating." });
      retryStep(id, body.step, ANTHROPIC_API_KEY).catch(() => {});
      return writeJson(res, 200, { ok: true, project: getProject(id) });
    }

    // GET .../assets/<type>/<filename> — real asset file download, path
    // sanitized against the project's own real assets directory (spec's
    // explicit "sanitize filenames... prevent path traversal").
    const assetMatch = sub.match(/^\/assets\/(images|audio|subtitles|final)\/([^/]+)$/);
    if (assetMatch && req.method === "GET") {
      const [, kind, rawName] = assetMatch;
      const filename = path.basename(rawName); // strips any ../ traversal attempt
      const filePath = path.join(assetsDirFor(id), kind, filename);
      if (!filePath.startsWith(assetsDirFor(id)) || !fs.existsSync(filePath)) {
        return writeJson(res, 404, { ok: false, error: "Asset not found." });
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = { ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".srt": "application/x-subrip" }[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // POST /api/story-ai/suggest — Story Discovery (spec §"STORY
  // DISCOVERY"): topic ideas only, never spends on a full generation.
  if (pathname === "/api/story-ai/suggest" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set." });
    try {
      const { callStoryAiJson } = require("../story-ai-claude");
      const { json } = await callStoryAiJson({
        system: 'You suggest Arabic short-video story topics for an inspirational/reflective storytelling channel. Return ONLY JSON: {"ideas":[{"topic_ar":"","category":""}]} with about 10 ideas across varied categories.',
        prompt: "Suggest 10 fresh Arabic story topic ideas.",
        apiKey: ANTHROPIC_API_KEY, tier: "haiku", maxTokens: 800, feature: "story-ai-suggest",
      });
      return writeJson(res, 200, { ok: true, ideas: Array.isArray(json.ideas) ? json.ideas : [] });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: e.message });
    }
  }

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = { handleStoryAi, sanitizeCreateInput, VALID_STYLES, VALID_DIALECTS };
