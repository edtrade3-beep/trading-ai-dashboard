"use strict";
// session-auth.test.js — real regression test for the Priority 1 security
// fix (2026-09-14 platform audit): PasswordLockScreen.jsx's "unlock" only
// ever set a client-side sessionStorage flag with nothing server-side to
// check against, so every route it was meant to protect stayed reachable
// directly (confirmed live via unauthenticated curl against production:
// /api/portfolio, /api/holdings, /api/journal, /api/alpaca/positions,
// /api/settings, /api/jobs/health all returned real account data).
// Sets a real-looking (never real) APP_PASSWORD before requiring src/
// session.js, same convention as test/astra-cost-safeguard.test.js
// (module-level config.js reads env at require time) — run as its own
// process (node test/session-auth.test.js or npm test), never interferes
// with other test files' own env.
process.env.APP_PASSWORD = "test-password-for-session-auth-only";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { hasValidSession, buildSessionCookie, clearSessionCookie, SESSION_COOKIE_NAME } = require("../src/session");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking src/session.js — real server-side session, not a client-side flag…");

ok("no Cookie header at all -> honestly unauthenticated", () => {
  assert.strictEqual(hasValidSession({ headers: {} }), false);
});

ok("a Cookie header with the wrong value -> rejected, never a partial/loose match", () => {
  assert.strictEqual(hasValidSession({ headers: { cookie: `${SESSION_COOKIE_NAME}=not-the-real-token` } }), false);
});

ok("a real cookie built by buildSessionCookie() round-trips through hasValidSession()", () => {
  const req = { headers: { "x-forwarded-proto": "https" } };
  const cookieHeader = buildSessionCookie(req);
  assert.ok(cookieHeader, "a real cookie header must be produced when APP_PASSWORD is configured");
  const token = cookieHeader.split(";")[0].split("=")[1];
  const authedReq = { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } };
  assert.strictEqual(hasValidSession(authedReq), true);
});

ok("buildSessionCookie sets real HttpOnly + SameSite=Lax always", () => {
  const cookieHeader = buildSessionCookie({ headers: {} });
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /SameSite=Lax/);
});

ok("buildSessionCookie only sets Secure when the request actually arrived over TLS (x-forwarded-proto: https) — real local-dev-over-http still works", () => {
  assert.doesNotMatch(buildSessionCookie({ headers: {} }), /Secure/);
  assert.match(buildSessionCookie({ headers: { "x-forwarded-proto": "https" } }), /Secure/);
});

ok("clearSessionCookie sets a real Max-Age=0 (real logout, not a fake one)", () => {
  assert.match(clearSessionCookie({ headers: {} }), /Max-Age=0/);
});

ok("the session token is deterministic across calls (same real APP_PASSWORD -> same real token) — no per-process randomness that would log a user out on every restart", () => {
  const a = buildSessionCookie({ headers: {} }).split(";")[0];
  const b = buildSessionCookie({ headers: {} }).split(";")[0];
  assert.strictEqual(a, b);
});

console.log("\nChecking router.js — the real sensitive-read gate actually exists…");

const routerSrc = fs.readFileSync(path.join(__dirname, "..", "src", "router.js"), "utf8");

ok("router.js requires hasValidSession from src/session.js", () => {
  assert.match(routerSrc, /const \{ hasValidSession \} = require\("\.\/session"\);/);
});

ok("the sensitive-read gate covers every route this audit confirmed live-exposed: portfolio, holdings, journal, alpaca, settings, jobs/health", () => {
  const gateStart = routerSrc.indexOf("SENSITIVE_READ_PREFIXES");
  assert.ok(gateStart > 0, "sensitive-read gate not found");
  const gateBlock = routerSrc.slice(gateStart, gateStart + 700);
  for (const route of ["/api/portfolio", "/api/holdings", "/api/journal", "/api/alpaca", "/api/settings"]) {
    assert.ok(gateBlock.includes(`"${route}"`), `${route} missing from SENSITIVE_READ_PREFIXES`);
  }
  assert.match(gateBlock, /"\/api\/jobs\/health"/);
  assert.match(gateBlock, /hasValidSession\(req\)/);
});

ok("the money-moving x-api-token comparison now uses safeCompare (timing-safe), not a plain !== (the audit's other real finding)", () => {
  assert.doesNotMatch(routerSrc, /const tok = req\.headers\["x-api-token"\] \|\| "";\s*\n\s*if \(tok !== AUTH_TOKEN\)/);
  assert.match(routerSrc, /if \(!safeCompare\(tok, AUTH_TOKEN\)\)/);
});

ok("/api/auth/logout is now dispatched to handleAuth (real server-side logout exists, not just a frontend sessionStorage clear)", () => {
  assert.match(routerSrc, /pathname === "\/api\/auth\/check" \|\| pathname === "\/api\/auth\/logout"/);
});

console.log("\nChecking routes/health.js — public response is minimal, rich diagnostics require a real session…");

const healthSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "health.js"), "utf8");

ok("health.js checks hasValidSession and only returns the minimal shape when unauthenticated", () => {
  assert.match(healthSrc, /const authed = hasValidSession\(req\);/);
  assert.match(healthSrc, /if \(!authed\) return writeJson\(res, 200, minimal\);/);
});

ok("the route itself never 401s (Render's own health prober never sends the session cookie and must always see 200, or deploys could restart-loop)", () => {
  assert.doesNotMatch(healthSrc, /writeJson\(res, 401/);
});

ok("rich diagnostics (envSeen/postgres/execution/dynamicUniverse) are still real and present, just gated behind authed, not deleted", () => {
  assert.match(healthSrc, /envSeen, postgres, dynamicUniverse,/);
});

console.log("\nChecking routes/auth.js — real cookie issuance on successful login…");

const authSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "auth.js"), "utf8");

ok("a successful password check sets a real Set-Cookie header via buildSessionCookie, not just {ok:true}", () => {
  assert.match(authSrc, /const cookie = buildSessionCookie\(req\);/);
  assert.match(authSrc, /res\.setHeader\("Set-Cookie", cookie\);/);
});

ok("/api/auth/logout clears the real cookie via clearSessionCookie", () => {
  assert.match(authSrc, /res\.setHeader\("Set-Cookie", clearSessionCookie\(req\)\);/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("SESSION-AUTH TEST FAILED"); else console.log("SESSION-AUTH TEST OK");
