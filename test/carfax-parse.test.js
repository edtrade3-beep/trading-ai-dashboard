// Real tests for carfax-parse.js's parseCarfaxText — synthetic pasted
// CarFax-report-style text, zero network, same convention as this
// session's other engine tests. ES module (browser-only), loaded via
// dynamic import, same precedent as test/market-helpers-trade-desk.test.js.
// Run: node test/carfax-parse.test.js (or npm test).
const assert = require("node:assert");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

(async () => {
  const { parseCarfaxText } = await import("../axiom-runner/components/carfax-parse.js");

  console.log("Checking parseCarfaxText — real facts only, never fabricated…");

  ok("a well-formed report extracts year/make/model/trim/vin/mileage", () => {
    const text = `
CARFAX Vehicle History Report
2019 Toyota Camry LE
VIN: 4T1BF1FK5KU123456
1-Owner Vehicle
No Accidents or Damage Reported
CarFax Guarantee: Clean Title
12 Service History Records
Odometer readings: 5,102 mi -> 22,400 mi -> 38,900 mi
`;
    const r = parseCarfaxText(text);
    assert.strictEqual(r.year, 2019);
    assert.strictEqual(r.make, "Toyota");
    assert.strictEqual(r.model, "Camry");
    assert.strictEqual(r.trim, "LE");
    assert.strictEqual(r.vin, "4T1BF1FK5KU123456");
    assert.strictEqual(r.mileage, 38900);
    assert.strictEqual(r.ownerCount, 1);
    assert.strictEqual(r.accidentFree, true);
    assert.strictEqual(r.accidentCount, 0);
    assert.strictEqual(r.titleStatus, "CLEAN");
    assert.strictEqual(r.serviceRecords, 12);
    assert.ok(r.notesSummary.includes("no accidents"));
  });

  ok("a known multi-word model is not split into model+trim", () => {
    const r = parseCarfaxText("2021 Jeep Grand Cherokee Limited\nVIN: 1C4RJFBG5MC123456");
    assert.strictEqual(r.make, "Jeep");
    assert.strictEqual(r.model, "Grand Cherokee");
    assert.strictEqual(r.trim, "Limited");
  });

  ok("reported accidents are captured with a real count, not marked accident-free", () => {
    const r = parseCarfaxText("2018 Honda Accord\n2 Accidents Reported");
    assert.strictEqual(r.accidentFree, false);
    assert.strictEqual(r.accidentCount, 2);
  });

  ok("a branded/salvage title is flagged with a warning, never silently treated as clean", () => {
    const r = parseCarfaxText("2017 Ford F-150 XLT\nSalvage Title");
    assert.strictEqual(r.titleStatus, "BRANDED");
    assert.strictEqual(r.titleWarning, true);
    assert.ok(r.notesSummary.toLowerCase().includes("verify"));
  });

  ok("empty or unrecognizable text returns no fabricated fields", () => {
    const r = parseCarfaxText("random unrelated text with no vehicle info at all");
    assert.strictEqual(r.year, undefined);
    assert.strictEqual(r.make, undefined);
    assert.strictEqual(r.mileage, undefined);
    assert.deepStrictEqual(r.foundFields, []);
  });

  ok("blank input returns an empty, non-throwing result", () => {
    const r = parseCarfaxText("   ");
    assert.deepStrictEqual(r.foundFields, []);
    assert.strictEqual(r.notesSummary, "");
  });

  ok("mileage picks the real highest reading among several, not the first", () => {
    const r = parseCarfaxText("2020 Subaru Outback\n1,200 mi\n45,600 mi\n22,000 mi");
    assert.strictEqual(r.mileage, 45600);
  });

  console.log(`\n${passed} checks passed.`);
  console.log("CARFAX-PARSE TEST OK");
})();
