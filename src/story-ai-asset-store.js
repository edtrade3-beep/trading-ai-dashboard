"use strict";

// story-ai-asset-store.js — real persistent storage for Story AI's
// generated binary assets (scene images, narration audio, subtitle
// files, the final muxed video), inside this app's own existing
// Postgres database rather than a new external service.
//
// Real bug this exists to fix (2026-09-09, live user reports across two
// real projects): these files were being written with plain
// fs.writeFileSync straight onto Render's local disk. That disk does not
// actually survive a restart for this service (confirmed directly —
// files generated hours earlier are gone by the time the Video step
// runs) — same root cause src/atomic-write.js's own header already
// documents for this app's JSON stores ("a device-id diagnostic proved
// Render's persistent disk was never actually mounted for this service
// despite showing 'attached' in the dashboard"), and the exact same real
// fix already proven working for dealer vehicle photos
// (src/dealership/photo-store.js) — Postgres bytea storage, inside the
// SAME database this app already has provisioned. No new account, no
// new credentials, nothing outside "the platform."
//
// Backed by Postgres (bytea column) when DATABASE_URL is set, direct
// files on disk otherwise (local dev, zero setup) — identical shape and
// convention to photo-store.js. Deliberately its own table/module rather
// than folded into atomic-write.js's in-memory-cache KV store: bulk-
// loading every project's image/audio/video binaries into memory at
// boot has the same real memory-bloat risk photo-store.js's own header
// already flags for vehicle photos, at a similar real scale (a 20-scene
// video's assets can run several MB).

const fs = require("node:fs");
const path = require("node:path");
const { writeBinaryAtomic, getPool } = require("./atomic-write");

const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
let pool = null;

// Call once from server.js at startup, AFTER atomic-write's initPgStore()
// has completed — same sequencing requirement and same shared-pool reuse
// as photo-store.js's initPhotoStore (see that file's own comment for why
// a second independent pg.Pool against the same DATABASE_URL was a real
// production problem under crash-restart cycling).
async function initStoryAssetStore() {
  if (!DATABASE_URL) return; // local dev / no DB configured — stays file-mode
  pool = getPool();
  if (!pool) throw new Error("story-ai-asset-store: DATABASE_URL is set but atomic-write's shared pool isn't ready — check init order in server.js");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS story_asset_store (
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      data BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (project_id, kind, filename)
    )
  `);
  console.log("[story-ai-asset-store] Postgres asset store ready.");
}

function isDbMode() { return pool !== null; }

// project ids are already validated (assertSafeId in story-ai-store.js)
// before reaching here; kind/filename are always one of a small fixed set
// this codebase controls (images|audio|subtitles|final, "1.png" etc — see
// routes/story-ai.js's own asset-download regex) — still defensively
// stripped so nothing can ever build an unexpected disk path or SQL key.
function safe(s) {
  return String(s || "").replace(/[^a-zA-Z0-9_.-]/g, "");
}

function localPath(assetsDir, kind, filename) {
  return path.join(assetsDir, safe(kind), safe(filename));
}

const CONTENT_TYPE_BY_EXT = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "video/mp4",
  ".srt": "application/x-subrip", ".txt": "text/plain",
};
function contentTypeFor(filename) {
  return CONTENT_TYPE_BY_EXT[path.extname(filename).toLowerCase()] || "application/octet-stream";
}

// Saves one real asset. `assetsDir` is the project's own real local
// directory (story-ai-store.js's assetsDirFor(id)) — used as the file-mode
// destination AND, in DB mode, still written there too as a same-process
// working copy (ffmpeg needs real files on a real path; writing both
// copies costs nothing extra and means a video assembled in the same
// process run that generated its assets never needs a network round trip
// to re-fetch them). Returns the real local path either way, matching
// this file's own previous fs.writeFileSync-based callers' expectations.
async function saveAsset(projectId, assetsDir, kind, filename, buffer, contentType) {
  const ct = contentType || contentTypeFor(filename);
  const filePath = localPath(assetsDir, kind, filename);
  writeBinaryAtomic(filePath, buffer);
  if (isDbMode()) {
    await pool.query(
      "INSERT INTO story_asset_store (project_id, kind, filename, content_type, data, updated_at) VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (project_id, kind, filename) DO UPDATE SET content_type = $4, data = $5, updated_at = now()",
      [safe(projectId), safe(kind), safe(filename), ct, buffer]
    );
  }
  return filePath;
}

// Real existence check — the honest source of truth is Postgres in DB
// mode (a local file surviving is not guaranteed across a restart, which
// is the entire bug this module exists to fix), the local filesystem
// otherwise. Async in both modes for one consistent caller contract.
async function assetExists(projectId, assetsDir, kind, filename) {
  if (isDbMode()) {
    const { rows } = await pool.query(
      "SELECT 1 FROM story_asset_store WHERE project_id = $1 AND kind = $2 AND filename = $3",
      [safe(projectId), safe(kind), safe(filename)]
    );
    return rows.length > 0;
  }
  try { return fs.existsSync(localPath(assetsDir, kind, filename)); } catch { return false; }
}

// Ensures a real local copy exists at the project's own real path,
// fetching it from Postgres first if the local copy is missing (the real
// "a restart happened between generation and now" case this whole module
// exists for) — returns the real local path once it's confirmed to exist,
// or null if the asset genuinely doesn't exist anywhere. Callers that
// need a real file on disk for ffmpeg (runVideoStep) use this instead of
// a raw fs.existsSync check.
async function hydrateToLocal(projectId, assetsDir, kind, filename) {
  const filePath = localPath(assetsDir, kind, filename);
  try { if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return filePath; } catch { /* fall through to DB fetch */ }
  if (!isDbMode()) return null; // file-mode has no other real source
  const { rows } = await pool.query(
    "SELECT data FROM story_asset_store WHERE project_id = $1 AND kind = $2 AND filename = $3",
    [safe(projectId), safe(kind), safe(filename)]
  );
  if (!rows.length) return null;
  writeBinaryAtomic(filePath, rows[0].data);
  return filePath;
}

// DB-mode read for the real asset-download route (routes/story-ai.js) —
// serves straight from Postgres so a download works even if this exact
// process instance never generated the file itself (a real, normal case
// after any restart). File-mode downloads are unaffected — that route's
// existing fs.createReadStream path already works for local dev.
async function getAssetForDownload(projectId, kind, filename) {
  if (!isDbMode()) return null;
  const { rows } = await pool.query(
    "SELECT content_type, data FROM story_asset_store WHERE project_id = $1 AND kind = $2 AND filename = $3",
    [safe(projectId), safe(kind), safe(filename)]
  );
  if (!rows.length) return null;
  return { contentType: rows[0].content_type, data: rows[0].data };
}

async function deleteAssetsForProject(projectId) {
  if (isDbMode()) {
    await pool.query("DELETE FROM story_asset_store WHERE project_id = $1", [safe(projectId)]);
  }
  // File-mode (and the same-process local working copy in DB mode) is
  // already handled by story-ai-store.js's own deleteProject, which
  // rm -rf's the whole assetsDirFor(id) tree — unchanged, not duplicated
  // here.
}

module.exports = {
  initStoryAssetStore, isDbMode, saveAsset, assetExists, hydrateToLocal,
  getAssetForDownload, deleteAssetsForProject, contentTypeFor,
};
