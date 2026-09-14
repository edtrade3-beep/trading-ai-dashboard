"use strict";
// Real server-side session for the single-user app password
// (Priority 1 security fix, 2026-09-14 platform audit — "a frontend
// login screen is not server-side authorization"). Before this,
// PasswordLockScreen.jsx's successful /api/auth/check only set a local
// sessionStorage flag on the browser; the server never issued or checked
// anything, so every API route it was meant to gate was reachable
// directly (confirmed live: /api/portfolio, /api/holdings, /api/journal,
// /api/alpaca/positions, /api/settings, /api/jobs/health all returned
// real account data to an unauthenticated curl).
//
// Deliberately NOT a random-per-login session id + server-side session
// store — this is a single-user app (see Sidebar.jsx's own "no login/
// session concept" comment) with one shared secret already (APP_PASSWORD),
// same static-shared-secret model this codebase already uses for
// API_AUTH_TOKEN. The session cookie value is a real HMAC-SHA256 of a
// fixed label under APP_PASSWORD as the key — deterministic (so it
// survives server restarts with zero storage), but only computable by
// someone who already knows APP_PASSWORD, and never derivable from the
// cookie value itself (HMAC, not a reversible encoding of the password).
// It naturally invalidates every existing session the moment APP_PASSWORD
// is changed, with no separate revocation list needed.
const crypto = require("node:crypto");
const { APP_PASSWORD } = require("./config");
const { safeCompare } = require("./utils");

const SESSION_COOKIE_NAME = "am_session";
// 30 days — long enough that a real user isn't repeatedly locked out on
// this single-user app, short enough that a leaked cookie doesn't stay
// valid forever without at least a length bound; the real revocation path
// is still "change APP_PASSWORD," same as changing API_AUTH_TOKEN today.
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sessionToken() {
  if (!APP_PASSWORD) return null;
  return crypto.createHmac("sha256", APP_PASSWORD).update("am-trading-session-v1").digest("hex");
}

// Real cookie header — HttpOnly (JS on the page can never read it, so an
// XSS bug can't exfiltrate it directly), SameSite=Lax (sent on normal
// same-site navigation/fetch, not on cross-site requests), Secure only
// when the request actually arrived over TLS (Render terminates TLS and
// forwards x-forwarded-proto; local dev over plain http still needs the
// cookie to stick, so Secure is conditional, not hard-coded).
function buildSessionCookie(req) {
  const token = sessionToken();
  if (!token) return null;
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

function clearSessionCookie(req) {
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

// Minimal cookie-header parser — this app has exactly one cookie to read,
// never pulls in a dependency for it.
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

// Fail closed, same policy this codebase already chose for
// API_AUTH_TOKEN (router.js: "an unset token left live order-placement
// unauthenticated... never left open by default"): no APP_PASSWORD
// configured means no valid session can ever exist, so every gated
// route stays refused rather than silently open.
function hasValidSession(req) {
  const expected = sessionToken();
  if (!expected) return false;
  const submitted = readCookie(req, SESSION_COOKIE_NAME);
  if (!submitted) return false;
  return safeCompare(submitted, expected);
}

module.exports = { SESSION_COOKIE_NAME, hasValidSession, buildSessionCookie, clearSessionCookie };
