"use strict";
// pwa-manifest.test.js (2026-09-18, "mobile setup" — PWA install-to-
// homescreen) — real structural checks: a valid manifest.webmanifest with
// real icon files that actually exist on disk at the sizes it declares,
// index.html wired to it + a real apple-touch-icon (iOS never reads the
// manifest, so both paths matter), and a deliberately non-caching service
// worker (this app's own index.html already has a careful "new version
// ready" banner that never force-reloads a live session — a caching SW
// here would silently fight that and serve stale bundles after a deploy).
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const ROOT = path.join(__dirname, "..");
const manifestPath = path.join(ROOT, "axiom-runner", "manifest.webmanifest");
const indexSrc = fs.readFileSync(path.join(ROOT, "axiom-runner", "index.html"), "utf8");
const swSrc = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const configSrc = fs.readFileSync(path.join(ROOT, "src", "config.js"), "utf8");

console.log("Checking manifest.webmanifest — real, valid, installable…");

ok("is valid JSON with the required installability fields (name, icons w/ 192 + 512, standalone display, start_url)", () => {
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.ok(m.name && m.short_name);
  assert.strictEqual(m.display, "standalone");
  assert.strictEqual(m.start_url, "/");
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 2);
  assert.ok(m.icons.some((i) => i.sizes === "192x192"));
  assert.ok(m.icons.some((i) => i.sizes === "512x512"));
});

ok("every declared icon file actually exists on disk (never a manifest pointing at a missing asset)", () => {
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const icon of m.icons) {
    const iconPath = path.join(ROOT, icon.src.replace(/^\//, ""));
    assert.ok(fs.existsSync(iconPath), `missing icon file: ${icon.src}`);
  }
});

ok("theme_color/background_color match index.html's own existing dark-boot color (#070d19) — no second, conflicting color declared here", () => {
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.strictEqual(m.theme_color, "#070d19");
  assert.strictEqual(m.background_color, "#070d19");
  assert.match(indexSrc, /content="#070d19"/); // the existing <meta name="theme-color">
});

console.log("\nChecking index.html — wired to the manifest + a real iOS apple-touch-icon…");

ok("links the real manifest.webmanifest and a properly-sized (180x180) apple-touch-icon — not the raw 1254x1254 source logo", () => {
  assert.match(indexSrc, /<link rel="manifest" href="\/axiom-runner\/manifest\.webmanifest">/);
  assert.match(indexSrc, /<link rel="apple-touch-icon" href="\/axiom-runner\/assets\/icon-180\.png">/);
  assert.doesNotMatch(indexSrc, /apple-touch-icon" href="\/axiom-runner\/assets\/am-trading-logo\.png"/, "must not still point at the raw unsized source logo");
});

ok("registers the service worker deferred on window load — never blocking/racing real app boot", () => {
  assert.match(indexSrc, /window\.addEventListener\("load", \(\) => \{\s*navigator\.serviceWorker\.register\("\/sw\.js"\)/);
});

console.log("\nChecking sw.js — deliberately non-caching (never fights the existing deploy-banner logic)…");

ok("has install/activate/fetch handlers (required for Chrome/Android installability) but never calls caches.open/caches.match — pure network passthrough", () => {
  assert.match(swSrc, /addEventListener\("install"/);
  assert.match(swSrc, /addEventListener\("activate"/);
  assert.match(swSrc, /addEventListener\("fetch"/);
  assert.doesNotMatch(swSrc, /caches\.(open|match)/, "must not cache — would silently fight index.html's own real 'new version ready' banner");
});

console.log("\nChecking config.js — real MIME type for the manifest…");

ok("registers .webmanifest as application/manifest+json (the spec-correct type, not a generic octet-stream fallback)", () => {
  assert.match(configSrc, /"\.webmanifest": "application\/manifest\+json"/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("PWA-MANIFEST TEST FAILED");
else console.log("PWA-MANIFEST TEST OK");
