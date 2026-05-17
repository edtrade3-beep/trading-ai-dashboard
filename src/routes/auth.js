const crypto = require("node:crypto");
const { readRequestBody, writeJson } = require("../utils");
const { APP_PASSWORD } = require("../config");

function safeCompare(submitted, stored) {
  const a = Buffer.from(String(submitted));
  const b = Buffer.from(String(stored));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

async function handleAuth(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/auth/check" && req.method === "POST") {
    if (!APP_PASSWORD) {
      return writeJson(res, 503, { ok: false, error: "APP_PASSWORD is not configured on this server" });
    }

    let submitted = "";
    try {
      const raw = await readRequestBody(req);
      const parsed = JSON.parse(raw);
      submitted = String(parsed.password || "");
    } catch {
      return writeJson(res, 400, { ok: false, error: "Expected JSON body: {\"password\": \"...\"}" });
    }

    if (safeCompare(submitted, APP_PASSWORD)) {
      return writeJson(res, 200, { ok: true });
    }
    return writeJson(res, 401, { ok: false });
  }

  if (pathname === "/api/auth/check") {
    return writeJson(res, 405, { ok: false, error: "Method not allowed. Use POST." });
  }

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = handleAuth;
