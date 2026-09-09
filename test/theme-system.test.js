"use strict";
// Structural regression checks for the 2026-09-09 THEME SYSTEM spec
// (Dark / Light / System modes, entire app updates instantly, no white
// flash, charts adapt live) — same fs.readFileSync + regex convention as
// test/trade-desk-layout.test.js, since these are real wiring bugs
// (React dependency arrays, matchMedia listeners), not pure functions
// worth extracting just to unit-test.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

console.log("Checking three-way theme mode (Dark/Light/System)…");

const selectorSrc = read("axiom-runner", "components", "ThemeModeSelector.jsx");
ok("ThemeModeSelector.jsx offers all three real modes", () => {
  assert.match(selectorSrc, /key:\s*"light"/);
  assert.match(selectorSrc, /key:\s*"system"/);
  assert.match(selectorSrc, /key:\s*"dark"/);
});

const axiomLiveSrc = read("axiom-runner", "axiom-live.jsx");
ok("axiom-live.jsx imports ThemeModeSelector", () => {
  assert.match(axiomLiveSrc, /import ThemeModeSelector from ".\/components\/ThemeModeSelector\.jsx"/);
});
ok("axiom-live.jsx keeps the raw stored preference (incl. \"system\") separate from the resolved dark/light value every other consumer reads", () => {
  assert.match(axiomLiveSrc, /const themeModePref = String\(settings\.themeMode \|\| "dark"\)\.toLowerCase\(\)/);
});
ok("System mode really follows prefers-color-scheme via matchMedia, not a guessed default", () => {
  assert.match(axiomLiveSrc, /matchMedia\("\(prefers-color-scheme:\s*dark\)"\)/);
  assert.match(axiomLiveSrc, /setSystemPrefersDark/);
});
ok("System mode resolves through systemPrefersDark, never leaking a third \"system\" value to the many themeMode===\"dark\" consumers", () => {
  assert.match(axiomLiveSrc, /themeModePref === "system"\s*\n?\s*\?\s*\(systemPrefersDark \? "dark" : "light"\)/);
});
ok("The old binary-only toggle buttons are gone; both toolbar locations (mobile + desktop) now render the 3-way selector", () => {
  const matches = axiomLiveSrc.match(/<ThemeModeSelector/g) || [];
  assert.ok(matches.length >= 2, `expected >= 2 <ThemeModeSelector usages, found ${matches.length}`);
  assert.doesNotMatch(axiomLiveSrc, /themeMode === "dark" \? "light" : "dark"/);
});
ok("themeMode's unconfigured fallback still matches DEFAULT_SETTINGS' documented dark default (spec: \"Default to Dark Mode\")", () => {
  assert.match(axiomLiveSrc, /themeMode: "dark", \/\/ permanent default/);
});

console.log("\nChecking charts actually re-theme on a live switch (not frozen at mount time)…");

// Real bug found in this exact audit: `C` (theme.js's mutable singleton
// object) as a React dependency never changes REFERENCE — Object.assign(C,
// THEME_*) mutates it in place — so an effect depending on the bare object
// never re-runs when the user flips Light/Dark/System while a chart is
// already on screen. C.bg (a plain string) genuinely differs between
// THEME_DARK/THEME_LIGHT and correctly retriggers the effect.
const trendChartSrc = read("axiom-runner", "components", "TrendChart.jsx");
ok("TrendChart.jsx's chart-creation effect depends on C.bg (a real changing value), not the never-changing C object itself", () => {
  assert.match(trendChartSrc, /\}, \[data && data\.symbol, C\.bg, H, SANS\]\);/);
});
ok("TrendChart.jsx's data/price-line effect also depends on C.bg, so it repopulates the freshly-recreated series after a theme switch", () => {
  assert.match(trendChartSrc, /\}, \[data, C\.bg, vcpOverlayOn, showLevels\]\);/);
});

const coloredIntradaySrc = read("axiom-runner", "components", "ColoredIntradayChart.jsx");
ok("ColoredIntradayChart.jsx's chart-creation effect has the same C.bg fix", () => {
  assert.match(coloredIntradaySrc, /\}, \[symbol, iv, C\.bg\]\);/);
});

ok("No lightweight-charts effect anywhere still depends on the bare, never-changing C object", () => {
  const files = ["TrendChart.jsx", "ColoredIntradayChart.jsx"].map((f) => read("axiom-runner", "components", f));
  for (const src of files) {
    const deps = src.match(/\}, \[[^\]]*\]\)/g) || [];
    for (const dep of deps) {
      // A bare "C" token (not "C.something") inside a dependency array.
      assert.doesNotMatch(dep, /[[,]\s*C\s*[,\]]/, `found a bare C dependency: ${dep}`);
    }
  }
});

console.log("\nChecking no white/dark flash on first paint, including System mode…");

const indexHtml = read("axiom-runner", "index.html");
ok("index.html's pre-hydration script resolves \"system\" via matchMedia too, not just \"light\"/\"dark\" (otherwise a light-OS user on System mode still gets the dark flash this script exists to prevent)", () => {
  assert.match(indexHtml, /mode === "system"/);
  assert.match(indexHtml, /matchMedia\("\(prefers-color-scheme:\s*dark\)"\)/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("THEME-SYSTEM TEST FAILED");
else console.log("THEME-SYSTEM TEST OK");
