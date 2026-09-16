"use strict";
// Real structural tests for src/property-scanner.js, src/routes/property.js,
// and the Property Engine's Telegram wiring (2026-09-16, "STOCKS +
// PROPERTIES" master prompt). Live network calls against RentCast are not
// exercised here (same convention this app already uses for every other
// provider — no provider file in this repo is network-mocked; correctness
// is verified live after deploy, per the master prompt's own "then
// implement and test it" instruction covering math + wiring, with the real
// endpoint smoke-tested against the live RentCast key once deployed).
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { formatAddress } = require("../src/property-scanner");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking formatAddress — real RentCast listing shape, never a fabricated address…");

ok("prefers RentCast's own real formattedAddress field when present", () => {
  assert.strictEqual(formatAddress({ formattedAddress: "123 Main St, Austin, TX 78701" }), "123 Main St, Austin, TX 78701");
});

ok("falls back to real assembled address parts when formattedAddress is missing", () => {
  assert.strictEqual(formatAddress({ addressLine1: "123 Main St", city: "Austin", state: "TX", zipCode: "78701" }), "123 Main St, Austin, TX, 78701");
});

ok("a real listing with no usable address fields returns null, never a fabricated placeholder", () => {
  assert.strictEqual(formatAddress({}), null);
  assert.strictEqual(formatAddress(null), null);
});

console.log("\nChecking reuse discipline (source-inspection tripwire)…");

const scannerSrc = fs.readFileSync(path.join(__dirname, "..", "src", "property-scanner.js"), "utf8");
const routeSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "property.js"), "utf8");
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "src", "property-engine.js"), "utf8");
const botSrc = fs.readFileSync(path.join(__dirname, "..", "src", "telegram-bot.js"), "utf8");
const routerSrc = fs.readFileSync(path.join(__dirname, "..", "src", "router.js"), "utf8");
const configSrc = fs.readFileSync(path.join(__dirname, "..", "src", "config.js"), "utf8");

ok("property-scanner.js fetches through the real src/providers/rentcast.js adapter — no inline fetch() of the RentCast API declared here", () => {
  assert.match(scannerSrc, /require\("\.\/providers\/rentcast"\)/);
  assert.doesNotMatch(scannerSrc, /fetch\(`https:\/\/api\.rentcast\.io/, "must not bypass the real adapter with an inline fetch");
});

ok("property-scanner.js reuses the real src/property-engine.js math — no second flip/rental/deal-score formula declared here", () => {
  assert.match(scannerSrc, /require\("\.\/property-engine"\)/);
  assert.doesNotMatch(scannerSrc, /function computeFlipAnalysis|function computeRentalAnalysis|function computeRentalDealScore|function computeFlipDealScore/, "must not redeclare property math");
});

ok("routes/property.js reads the real per-provider RentCast key via config.js's resolveProviderKeys — no separate ad-hoc key lookup", () => {
  assert.match(routeSrc, /require\("\.\.\/config"\)/);
  assert.match(routeSrc, /resolveProviderKeys/);
});

ok("config.js's real resolveProviderKeys exposes a real rentcast key, same per-provider pattern every other provider already uses", () => {
  assert.match(configSrc, /rentcast: \(searchParams\.get\("rentcastKey"\) \|\| RENTCAST_API_KEY \|\| ""\)\.trim\(\),/);
});

ok("router.js wires both real property routes to routes/property.js's real handlers, no inline property logic in router.js itself", () => {
  assert.match(routerSrc, /require\("\.\/routes\/property"\)/);
  assert.match(routerSrc, /\/api\/property\/analyze/);
  assert.match(routerSrc, /\/api\/property\/search/);
});

console.log("\nChecking Telegram command wiring — /properties /rentals /under /flip, real reuse only…");

ok("all 4 real property commands are registered in the COMMANDS router", () => {
  assert.match(botSrc, /properties: \(a\) => cmdProperties\(a\),/);
  assert.match(botSrc, /rentals:\s+\(a\) => cmdRentals\(a\),/);
  assert.match(botSrc, /under:\s+\(a\) => cmdUnder\(a\),/);
  assert.match(botSrc, /flip:\s+\(a\) => cmdFlip\(a\),/);
});

ok("every property command calls the real src/property-scanner.js orchestrator — no second scan/scoring declared inline in telegram-bot.js", () => {
  const start = botSrc.indexOf("async function cmdProperties(args)");
  const end = botSrc.indexOf("async function cmdDeals(args)");
  const block = botSrc.slice(start, end);
  const requireCount = (block.match(/require\("\.\/property-scanner"\)/g) || []).length;
  assert.strictEqual(requireCount, 4, `expected all 4 property commands to require the real property-scanner module, found ${requireCount}`);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("PROPERTY-SCANNER TEST FAILED");
else console.log("PROPERTY-SCANNER TEST OK");
