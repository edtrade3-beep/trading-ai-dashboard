// Server-side storage for vehicle listing photos — on the persistent disk
// added this session (render.yaml), under data/photos/<vehicleId>/. Public
// by design: these need to be fetchable by Meta's Marketplace feed crawler
// and by shoppers viewing /vehicle/:id. See src/router.js for the guard that
// keeps this the ONLY publicly-reachable subtree of data/.

const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("../config");
const { writeBinaryAtomic } = require("../atomic-write");

const PHOTOS_ROOT = path.join(ROOT, "data", "photos");

// Vehicle ids are numeric (nextId() in the client) but treat defensively —
// this id comes from a URL path segment, strip anything that isn't safe for
// a directory name so it can never escape PHOTOS_ROOT.
function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "");
}

function vehiclePhotosDir(id) {
  return path.join(PHOTOS_ROOT, safeId(id));
}

function deletePhotosForVehicle(id) {
  const dir = vehiclePhotosDir(id);
  if (dir.startsWith(PHOTOS_ROOT) && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Replaces (not merges) a vehicle's photo set. `photos` is an array of
// {mediaType, data} (base64, already parsed by parseDataUrl). Returns the
// public URL paths in order, first = cover photo.
function savePhotosForVehicle(id, photos) {
  deletePhotosForVehicle(id);
  const dir = vehiclePhotosDir(id);
  const urls = [];
  photos.forEach((p, i) => {
    const ext = p.mediaType === "image/png" ? "png" : "jpg";
    const filePath = path.join(dir, `${i + 1}.${ext}`);
    writeBinaryAtomic(filePath, Buffer.from(p.data, "base64"));
    urls.push(`/data/photos/${safeId(id)}/${i + 1}.${ext}`);
  });
  return urls;
}

module.exports = { savePhotosForVehicle, deletePhotosForVehicle, PHOTOS_ROOT };
