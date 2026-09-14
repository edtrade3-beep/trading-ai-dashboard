const { readRequestBody, writeJson, safeCompare } = require("../utils");
const { APP_PASSWORD } = require("../config");
const { buildSessionCookie, clearSessionCookie } = require("../session");

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
      // Real server-side session (2026-09-14 security fix) — previously
      // this only told the browser "yes," which the frontend remembered
      // in its own sessionStorage with nothing server-side to check
      // against, so every route this screen was meant to protect stayed
      // reachable directly. Now a real HttpOnly cookie is issued that
      // gated routes (router.js's sensitive-read gate) actually verify.
      const cookie = buildSessionCookie(req);
      if (cookie) res.setHeader("Set-Cookie", cookie);
      return writeJson(res, 200, { ok: true });
    }
    return writeJson(res, 401, { ok: false });
  }

  // Real logout — clears the real session cookie server-side, not just
  // the frontend's own sessionStorage flag (existing handleLock()
  // behavior, unchanged, still clears that too).
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    res.setHeader("Set-Cookie", clearSessionCookie(req));
    return writeJson(res, 200, { ok: true });
  }

  if (pathname === "/api/auth/check") {
    return writeJson(res, 405, { ok: false, error: "Method not allowed. Use POST." });
  }

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = handleAuth;
