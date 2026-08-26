// Real tests for src/routes/photo-banner.js's sanitizeSuggestion — the
// real, disclosed validation layer between Claude's raw JSON output and
// what the client ever renders. Schema upgraded 2026-08-26 (explicit user
// follow-up, showed a real dealership listing-photo example with a title +
// several icon badges) from a single plain text line to a title + up to
// MAX_BADGES icon/label/sublabel badges. Never trust a model's output
// shape blindly: any field outside the real allowed vocabulary must fall
// back to an honest, clearly-labeled default rather than passing through
// and breaking the Canvas draw or rendering something unreadable.
// Pure-function, synthetic-input, zero-network.
// Run: node test/photo-banner.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { sanitizeSuggestion, MAX_BADGES, VALID_FONTS, VALID_BADGE_SHAPES, VALID_LAYOUTS, VALID_CORNERS } = require("../src/routes/photo-banner");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking sanitizeSuggestion — real validation of Claude's raw output…");

ok("a real, well-formed title + badges suggestion passes through unchanged", () => {
  const r = sanitizeSuggestion({
    titleText: "TOYOTA COROLLA",
    badges: [{ icon: "✅", label: "ONE OWNER", sublabel: "" }, { icon: "⏱️", label: "71K", sublabel: "MILES ONLY", primary: true }],
    position: "top", bgColor: "#12203a", textColor: "#ffffff", accentColor: "#2563eb",
    fontFamily: "Georgia", badgeShape: "square",
    reasoning: "Dark navy reads clean against the showroom background.",
  });
  assert.strictEqual(r.titleText, "TOYOTA COROLLA");
  assert.strictEqual(r.badges.length, 2);
  assert.deepStrictEqual(r.badges[0], { icon: "✅", label: "ONE OWNER", sublabel: "", primary: false });
  assert.deepStrictEqual(r.badges[1], { icon: "⏱️", label: "71K", sublabel: "MILES ONLY", primary: true });
  assert.strictEqual(r.position, "top");
  assert.strictEqual(r.bgColor, "#12203a");
  assert.strictEqual(r.accentColor, "#2563eb");
  assert.strictEqual(r.fontFamily, "Georgia");
  assert.strictEqual(r.badgeShape, "square");
});

console.log("Checking sanitizeSuggestion — gradient, font, badge shape, and primary-badge hierarchy (2026-08-26 design upgrade)…");

ok("gradient:true with a real bgColor2 is honored", () => {
  const r = sanitizeSuggestion({ titleText: "X", gradient: true, bgColor: "#111111", bgColor2: "#eeeeee" });
  assert.strictEqual(r.gradient, true);
  assert.strictEqual(r.bgColor2, "#eeeeee");
});

ok("gradient:false (or absent) honestly ignores bgColor2 — falls back to a flat single-color fill (bgColor2 === bgColor)", () => {
  const r1 = sanitizeSuggestion({ titleText: "X", gradient: false, bgColor: "#111111", bgColor2: "#eeeeee" });
  assert.strictEqual(r1.gradient, false);
  assert.strictEqual(r1.bgColor2, "#111111");
  const r2 = sanitizeSuggestion({ titleText: "X", bgColor: "#111111", bgColor2: "#eeeeee" });
  assert.strictEqual(r2.gradient, false);
  assert.strictEqual(r2.bgColor2, "#111111");
});

ok("an invalid bgColor2 while gradient:true honestly falls back to bgColor (never a broken gradient stop)", () => {
  const r = sanitizeSuggestion({ titleText: "X", gradient: true, bgColor: "#111111", bgColor2: "not-a-color" });
  assert.strictEqual(r.bgColor2, "#111111");
});

ok("an invalid fontFamily falls back to the honest default 'Arial', never an unvalidated font string reaching Canvas", () => {
  const r = sanitizeSuggestion({ titleText: "X", fontFamily: "Comic Sans MS" });
  assert.strictEqual(r.fontFamily, "Arial");
});

ok("every real font in the allowed list is honored exactly", () => {
  for (const f of VALID_FONTS) assert.strictEqual(sanitizeSuggestion({ titleText: "X", fontFamily: f }).fontFamily, f);
});

ok("an invalid badgeShape falls back to the honest default 'circle'", () => {
  const r = sanitizeSuggestion({ titleText: "X", badgeShape: "diamond" });
  assert.strictEqual(r.badgeShape, "circle");
});

ok("every real badge shape in the allowed list is honored exactly", () => {
  for (const s of VALID_BADGE_SHAPES) assert.strictEqual(sanitizeSuggestion({ titleText: "X", badgeShape: s }).badgeShape, s);
});

ok("only the FIRST badge marked primary:true wins — one clear hierarchy, never several competing 'biggest' badges", () => {
  const r = sanitizeSuggestion({
    badges: [{ icon: "✅", label: "A", primary: true }, { icon: "🛡️", label: "B", primary: true }, { icon: "⏱️", label: "C", primary: true }],
  });
  assert.strictEqual(r.badges[0].primary, true);
  assert.strictEqual(r.badges[1].primary, false);
  assert.strictEqual(r.badges[2].primary, false);
});

ok("no badge marked primary -> all honestly false, never a fabricated default primary", () => {
  const r = sanitizeSuggestion({ badges: [{ icon: "✅", label: "A" }, { icon: "🛡️", label: "B" }] });
  assert.strictEqual(r.badges.every((b) => b.primary === false), true);
});

console.log("Checking sanitizeSuggestion — ribbon layout + corner (2026-08-26 shape-variety follow-up)…");

ok("a real 'ribbon' layout with a real corner is honored exactly", () => {
  const r = sanitizeSuggestion({ titleText: "SALE", layout: "ribbon", corner: "bottom-left" });
  assert.strictEqual(r.layout, "ribbon");
  assert.strictEqual(r.corner, "bottom-left");
});

ok("no layout given -> honest default 'bar', the original full-width behavior", () => {
  assert.strictEqual(sanitizeSuggestion({ titleText: "X" }).layout, "bar");
});

ok("an invalid layout falls back to the honest default 'bar'", () => {
  assert.strictEqual(sanitizeSuggestion({ titleText: "X", layout: "diagonal-explosion" }).layout, "bar");
});

ok("an invalid corner falls back to the honest default 'top-right' (the classic ribbon spot)", () => {
  assert.strictEqual(sanitizeSuggestion({ titleText: "X", corner: "middle" }).corner, "top-right");
});

ok("every real corner in the allowed list is honored exactly", () => {
  for (const c of VALID_CORNERS) assert.strictEqual(sanitizeSuggestion({ titleText: "X", corner: c }).corner, c);
});

ok("every real layout in the allowed list is honored exactly", () => {
  for (const l of VALID_LAYOUTS) assert.strictEqual(sanitizeSuggestion({ titleText: "X", layout: l }).layout, l);
});

ok("no titleText AND no real badges -> honestly null, never a fabricated empty banner", () => {
  assert.strictEqual(sanitizeSuggestion({ titleText: "", badges: [] }), null);
  assert.strictEqual(sanitizeSuggestion({}), null);
  assert.strictEqual(sanitizeSuggestion(null), null);
});

ok("a real title alone (no badges) is enough — badges are optional", () => {
  const r = sanitizeSuggestion({ titleText: "SPRING SALE" });
  assert.strictEqual(r.titleText, "SPRING SALE");
  assert.deepStrictEqual(r.badges, []);
});

ok("real badges alone (no title) is enough", () => {
  const r = sanitizeSuggestion({ badges: [{ icon: "🛡️", label: "CLEAN TITLE" }] });
  assert.strictEqual(r.titleText, "");
  assert.strictEqual(r.badges.length, 1);
});

ok("badges beyond MAX_BADGES are honestly capped, never silently accepted unbounded", () => {
  const badges = Array.from({ length: MAX_BADGES + 5 }, (_, i) => ({ icon: "✅", label: `B${i}` }));
  const r = sanitizeSuggestion({ badges });
  assert.strictEqual(r.badges.length, MAX_BADGES);
});

ok("a badge missing a real label is dropped, not kept as a blank badge", () => {
  const r = sanitizeSuggestion({ badges: [{ icon: "✅", label: "" }, { icon: "🛡️", label: "REAL" }] });
  assert.strictEqual(r.badges.length, 1);
  assert.strictEqual(r.badges[0].label, "REAL");
});

ok("a badge missing an icon falls back to an honest generic bullet, never a broken/undefined glyph", () => {
  const r = sanitizeSuggestion({ badges: [{ label: "NO ICON" }] });
  assert.strictEqual(r.badges[0].icon, "•");
});

ok("titleText and badge label/sublabel are trimmed and length-capped", () => {
  const r = sanitizeSuggestion({
    titleText: "  " + "X".repeat(50) + "  ",
    badges: [{ icon: "✅", label: "  " + "Y".repeat(30), sublabel: "Z".repeat(30) }],
  });
  assert.strictEqual(r.titleText.length, 30);
  assert.ok(!r.titleText.startsWith(" "));
  assert.strictEqual(r.badges[0].label.length, 16);
  assert.strictEqual(r.badges[0].sublabel.length, 16);
});

ok("an invalid position falls back to the honest default 'top'", () => {
  const r = sanitizeSuggestion({ titleText: "X", position: "diagonal-corner-ribbon" });
  assert.strictEqual(r.position, "top");
});

ok("both real valid positions ('top' and 'bottom') are honored exactly", () => {
  assert.strictEqual(sanitizeSuggestion({ titleText: "X", position: "top" }).position, "top");
  assert.strictEqual(sanitizeSuggestion({ titleText: "X", position: "bottom" }).position, "bottom");
});

ok("invalid/missing hex colors fall back to honest defaults, never a broken CSS value reaching the client", () => {
  const r = sanitizeSuggestion({ titleText: "X", bgColor: "navy", textColor: "not-a-color", accentColor: 123 });
  assert.strictEqual(r.bgColor, "#12203a");
  assert.strictEqual(r.textColor, "#ffffff");
  assert.strictEqual(r.accentColor, "#2563eb");
});

ok("real valid hex colors (any case) are honored exactly", () => {
  const r = sanitizeSuggestion({ titleText: "X", bgColor: "#0D9465", textColor: "#000000", accentColor: "#FFAA00" });
  assert.strictEqual(r.bgColor, "#0D9465");
  assert.strictEqual(r.textColor, "#000000");
  assert.strictEqual(r.accentColor, "#FFAA00");
});

ok("missing/non-string reasoning degrades to an honest empty string, never fabricated", () => {
  assert.strictEqual(sanitizeSuggestion({ titleText: "X", reasoning: 12345 }).reasoning, "");
  assert.strictEqual(sanitizeSuggestion({ titleText: "X" }).reasoning, "");
});

console.log(`\n${passed} checks passed.`);
console.log("PHOTO-BANNER TEST OK");
