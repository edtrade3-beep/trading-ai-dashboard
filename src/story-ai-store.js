"use strict";

// story-ai-store.js — persistence for Story AI projects, using this
// platform's OWN existing storage layer (atomic-write.js's writeJsonAtomic/
// readJsonSafe — file-mode locally, transparently Postgres-backed in
// production when DATABASE_URL is set, exactly like every other store in
// this app). No second database, no new storage technology, per spec's
// explicit "do not add a second database unless technically necessary."
//
// This repo has no migrations-based SQL schema anywhere (confirmed by
// inspection — every one of its ~25 stores is a JSON-shaped key under
// atomic-write's kv_store table or an equivalent flat file); "StoryProject
// as one JSON document" is the real, honest equivalent of "a migration"
// in this codebase's actual architecture, not a compatibility shim.
//
// Layout (spec's own §"FILE STORAGE" naming, adapted to this app's real
// per-key JSON convention rather than literal nested directories):
//   data/story-ai/projects/index.json         — {projects:[{id,topic,title,status,createdAt,updatedAt}]}
//   data/story-ai/projects/<id>.json           — full StoryProject (script, scenes, characters, verification, quality, social, costLedger, job)
//   data/story-ai/assets/<id>/images/<n>.png   — generated scene images (written only once a real image provider succeeds)
//   data/story-ai/assets/<id>/audio/*.mp3      — generated narration/segments
//   data/story-ai/assets/<id>/subtitles/*.srt  — generated subtitle files
//   data/story-ai/assets/<id>/final/*.mp4      — final assembled video
// Binary assets are never stored as JSON blobs — only their real
// filesystem paths are recorded on the project document, per spec.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const PROJECTS_DIR = path.join(ROOT, "data", "story-ai", "projects");
const ASSETS_DIR = path.join(ROOT, "data", "story-ai", "assets");
const INDEX_PATH = path.join(PROJECTS_DIR, "index.json");
const MAX_PROJECTS = 500;

// Real filename/path safety (spec §"SECURITY": "sanitize filenames...
// protect file paths... prevent path traversal") — a project id is always
// generated here, never accepted raw from a client-supplied string, so
// this is real defense-in-depth, not a theoretical gap.
function newProjectId() {
  return `sp_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}
const SAFE_ID_RE = /^sp_[a-z0-9]+_[a-f0-9]{8}$/;
function assertSafeId(id) {
  if (typeof id !== "string" || !SAFE_ID_RE.test(id)) throw new Error("Invalid project id.");
  return id;
}

function projectPath(id) { return path.join(PROJECTS_DIR, `${assertSafeId(id)}.json`); }
function assetsDirFor(id) { return path.join(ASSETS_DIR, assertSafeId(id)); }

function loadIndex() {
  const data = readJsonSafe(INDEX_PATH, { projects: [] });
  return Array.isArray(data.projects) ? data.projects : [];
}
function saveIndex(projects) {
  const trimmed = projects.slice(-MAX_PROJECTS);
  writeJsonAtomic(INDEX_PATH, { projects: trimmed });
}
function upsertIndexEntry(summary) {
  const projects = loadIndex();
  const i = projects.findIndex((p) => p.id === summary.id);
  if (i === -1) projects.push(summary); else projects[i] = { ...projects[i], ...summary };
  saveIndex(projects);
}
function removeIndexEntry(id) {
  saveIndex(loadIndex().filter((p) => p.id !== id));
}

function summaryOf(project) {
  return {
    id: project.id, topic: project.topic, title: project.story?.title_ar || null,
    status: project.status, durationSeconds: project.durationSeconds,
    style: project.style, voice: project.voice,
    createdAt: project.createdAt, updatedAt: project.updatedAt,
    costUSD: project.costLedger?.totalUSD ?? 0,
  };
}

function createProject({ topic, durationSeconds, style, visualStyle, voice, dialect, notes, options }) {
  const id = newProjectId();
  const now = new Date().toISOString();
  const project = {
    id, topic, durationSeconds, style, visualStyle, voice, dialect, notes: notes || "", options: options || {},
    status: "Draft", // Draft | Generating | Needs Review | Ready | Failed
    createdAt: now, updatedAt: now,
    story: null, verification: null, scenes: null, characters: [], locations: [],
    images: [], audio: null, subtitles: null, finalVideo: null, thumbnail: null, social: null,
    quality: null, costLedger: { entries: [], totalUSD: 0 },
    job: { status: "pending", steps: {}, error: null },
    warnings: [],
  };
  fs.mkdirSync(assetsDirFor(id), { recursive: true });
  writeJsonAtomic(projectPath(id), project);
  upsertIndexEntry(summaryOf(project));
  return project;
}

function getProject(id) {
  return readJsonSafe(projectPath(id), null);
}

function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  writeJsonAtomic(projectPath(project.id), project);
  upsertIndexEntry(summaryOf(project));
  return project;
}

function listProjects() {
  return loadIndex().slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function deleteProject(id) {
  assertSafeId(id);
  try { fs.unlinkSync(projectPath(id)); } catch {}
  try { fs.rmSync(assetsDirFor(id), { recursive: true, force: true }); } catch {}
  removeIndexEntry(id);
  // Real cleanup (2026-09-09) for the new Postgres-backed asset store —
  // without this, deleting a project would leave its images/audio/video
  // rows behind in story_asset_store forever (no other code path ever
  // removes them). Required here, not optional — a lazy require avoids a
  // circular dependency (story-ai-asset-store.js has no reason to import
  // this file, but keeping the require local to this function matches
  // this codebase's existing convention for occasional-use cross-imports).
  try { await require("./story-ai-asset-store").deleteAssetsForProject(id); }
  catch (err) { console.error(`[story-ai-store] deleteAssetsForProject failed for ${id}:`, err.message); }
}

function duplicateProject(id) {
  const source = getProject(id);
  if (!source) return null;
  const copy = createProject({
    topic: source.topic, durationSeconds: source.durationSeconds, style: source.style,
    visualStyle: source.visualStyle, voice: source.voice, dialect: source.dialect,
    notes: source.notes, options: source.options,
  });
  // Copy the real script/scenes/verification forward so duplicating means
  // "start editing from here," not "re-run the whole pipeline from
  // scratch" — matches spec's "Duplicate" action intent.
  copy.story = source.story; copy.verification = source.verification;
  copy.scenes = source.scenes; copy.characters = source.characters; copy.locations = source.locations;
  copy.status = "Draft";
  return saveProject(copy);
}

module.exports = {
  PROJECTS_DIR, ASSETS_DIR,
  newProjectId, assertSafeId, projectPath, assetsDirFor,
  createProject, getProject, saveProject, listProjects, deleteProject, duplicateProject,
  summaryOf,
};
