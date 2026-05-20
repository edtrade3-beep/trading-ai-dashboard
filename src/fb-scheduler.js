const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./config");
const { loadInventory, saveInventory } = require("./inventory-store");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");

const SETTINGS_PATH = path.join(ROOT, "data", "fb-settings.json");
const PHOTO_DIR     = path.join(ROOT, "data", "photos");
const PHOTO_EXT_RE  = /\.(jpe?g|png|webp|gif)$/i;
const PHOTO_MIME    = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

// ─── Settings store ────────────────────────────────────────────────────────────

function loadFbSettings() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return {};
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch { return {}; }
}

function saveFbSettings(updates) {
  const current = loadFbSettings();
  const merged = { ...current, ...updates };
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

// ─── Multipart builder (Node-native, no deps) ─────────────────────────────────

function buildMultipart(fields, files) {
  const boundary = `DixieBdy${Date.now().toString(16)}`;
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    ));
  }

  for (const { name, filename, data, mime } of files) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
    ));
    parts.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
    parts.push(Buffer.from("\r\n"));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

// ─── Facebook Graph API helpers ───────────────────────────────────────────────

async function fbUploadPhoto(pageId, token, photoPath, filename) {
  const data = fs.readFileSync(photoPath);
  const ext = path.extname(filename).toLowerCase();
  const { body, contentType } = buildMultipart(
    { published: "false", access_token: token },
    [{ name: "source", filename, data, mime: PHOTO_MIME[ext] || "image/jpeg" }]
  );
  const res = await fetch(`https://graph.facebook.com/${encodeURIComponent(pageId)}/photos`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
  const j = await res.json().catch(() => ({}));
  if (!j.id) throw new Error(j.error?.message || "Photo upload to Facebook failed");
  return j.id;
}

async function fbCreatePost(pageId, token, message, photoIds) {
  const params = new URLSearchParams();
  params.append("message", message);
  params.append("access_token", token);
  photoIds.forEach((id, i) => params.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
  const res = await fetch(`https://graph.facebook.com/${encodeURIComponent(pageId)}/feed`, {
    method: "POST",
    body: params,
  });
  const j = await res.json().catch(() => ({}));
  if (!j.id) throw new Error(j.error?.message || "Facebook post creation failed");
  return j.id;
}

function buildAdMessage(vehicle) {
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? " " + vehicle.trim : ""}`;
  const miStr = vehicle.mileage ? `📍 ${Number(vehicle.mileage).toLocaleString()} miles` : "";
  const priceStr = vehicle.price ? `💰 Price: $${Number(vehicle.price).toLocaleString()}` : "";
  return [
    `${title}`,
    ``,
    `✅ Clean Title · ${vehicle.condition || "Good"} Condition`,
    miStr,
    priceStr,
    ``,
    `🟢 Fast & Easy Financing – All Credit Accepted`,
    `🟢 ITIN Accepted – Low Down Payment Options`,
    `🟢 Trade-Ins Welcome`,
    ``,
    `📩 Message us now!`,
  ].filter(l => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Post a single vehicle ─────────────────────────────────────────────────────

async function postVehicle(vehicle, pageId, token) {
  const safeVin = String(vehicle.vin || "").toUpperCase().replace(/[^A-Z0-9\-]/g, "").slice(0, 25);
  const photoDir = path.join(PHOTO_DIR, safeVin);
  const photoFiles = fs.existsSync(photoDir)
    ? fs.readdirSync(photoDir).filter(f => PHOTO_EXT_RE.test(f)).sort().slice(0, 10)
    : [];

  const photoIds = [];
  for (const filename of photoFiles) {
    const id = await fbUploadPhoto(pageId, token, path.join(photoDir, filename), filename);
    photoIds.push(id);
  }

  const message = buildAdMessage(vehicle);
  const postId = await fbCreatePost(pageId, token, message, photoIds);
  return postId;
}

// ─── Post all pending (unsold, never posted) ──────────────────────────────────

async function postPendingVehicles() {
  const settings = loadFbSettings();
  if (!settings.pageId || !settings.pageToken) {
    return { ok: false, posted: 0, errors: ["Facebook Page ID and Token not configured."] };
  }

  const items = loadInventory() || [];
  const pending = items.filter(v => !v.soldPrice && !v.fbPostedAt);

  if (!pending.length) {
    return { ok: true, posted: 0, skipped: 0, errors: [], message: "No new vehicles to post." };
  }

  const results = [];
  const errors  = [];
  const updated  = items.map(v => ({ ...v }));

  for (const vehicle of pending) {
    try {
      const postId = await postVehicle(vehicle, settings.pageId, settings.pageToken);
      const idx = updated.findIndex(v => v.vin === vehicle.vin);
      if (idx >= 0) { updated[idx].fbPostedAt = new Date().toISOString(); updated[idx].fbPostId = postId; }
      results.push({ vin: vehicle.vin, postId });
      console.log(`[FB] Posted ${vehicle.year} ${vehicle.make} ${vehicle.model} — ${postId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ vin: vehicle.vin, error: msg });
      console.error(`[FB] Failed to post ${vehicle.vin}: ${msg}`);
    }
  }

  if (results.length) saveInventory(updated);
  return { ok: true, posted: results.length, errors, items: results };
}

// ─── Scheduler (fires once per matching minute) ────────────────────────────────

let _lastFiredKey = "";

function getCurrentTimeInZone(tz) {
  try {
    const str = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "America/Chicago",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date());
    // str looks like "09:30" but Intl may add "24:" for midnight — normalise
    const parts = str.split(":");
    const hh = String(parseInt(parts[0], 10)).padStart(2, "0");
    const mm = String(parseInt(parts[1], 10)).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    const now = new Date();
    return `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  }
}

function startFbScheduler() {
  // Check every 30 seconds so we never miss a minute window
  setInterval(async () => {
    const settings = loadFbSettings();
    if (!settings.enabled || !settings.scheduleTime) return;

    const currentTime = getCurrentTimeInZone(settings.timezone);
    const fireKey = `${currentTime}-${new Date().toISOString().slice(0, 10)}`;

    if (currentTime === settings.scheduleTime && fireKey !== _lastFiredKey) {
      _lastFiredKey = fireKey;
      console.log(`[FB Scheduler] Auto-posting pending vehicles at ${currentTime}…`);
      try {
        const result = await postPendingVehicles();
        saveFbSettings({ lastRunAt: new Date().toISOString(), lastRunResult: result });
        console.log(`[FB Scheduler] Posted ${result.posted} vehicle(s), ${result.errors.length} error(s).`);

        if (telegramConfigured()) {
          if (result.posted > 0) {
            const errStr = result.errors.length ? `, ${result.errors.length} error(s)` : "";
            const names = (result.items || []).map(r => r.vin).join(", ");
            sendTelegramMessage(`🚗 *FB Auto-Post*: ${result.posted} vehicle(s) posted${errStr}\n${names}`).catch(() => {});
          } else if (result.errors && result.errors.length) {
            sendTelegramMessage(`⚠️ *FB Auto-Post Failed*: ${result.errors.map(e => e.error).join("; ")}`).catch(() => {});
          }
        }
      } catch (err) {
        console.error("[FB Scheduler] Unexpected error:", err.message);
        if (telegramConfigured()) {
          sendTelegramMessage(`⚠️ *FB Scheduler Error*: ${err.message}`).catch(() => {});
        }
      }
    }
  }, 30000);

  console.log("[FB Scheduler] Running — will auto-post when enabled and time matches.");
}

module.exports = { loadFbSettings, saveFbSettings, postPendingVehicles, startFbScheduler };
