// Real tests for src/car-business-engine.js's pure sanitizers + the
// deterministic diff/notification/synthesis logic (Car Business
// Intelligence, upgraded 2026-08-30). Pure-function, synthetic-input,
// zero-network, zero-DB — the AI calls themselves (car-business-ai.js) are
// untested by design, same precedent as research-intel-ai.js/
// command-center-ai.js in this codebase.
"use strict";
const assert = require("node:assert");
const {
  sanitizeMarketSections, sanitizeInventoryScores, sanitizeOpportunityCards, sanitizeRepricingResults,
  sanitizeBuyRecommendations, sanitizeAvoidList, sanitizeCustomerSegments, sanitizeLeadChannels,
  sanitizeFunnelRead, sanitizeFinanceRead, sanitizeRegulationFlags, sanitizeFutureScan,
  sanitizeLocalMarketGap, sanitizeForecast,
  sanitizeDimensions, dimensionsToSnapshot, computeNotificationTriggers,
  computeFinalVerdict, computeCommandCenter,
  gradeInventoryPrediction, gradeLearningHistory,
  MIN_GRADE_AGE_DAYS,
} = require("../src/car-business-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const DAY = 86_400_000;

console.log("Checking sanitizeMarketSections — bounded, honest-default shape…");
ok("a well-formed section round-trips with real fields intact", () => {
  const out = sanitizeMarketSections([{ category: "Used SUVs", classification: "STRONG", summary: "x", dataQuality: "DATA", sources: ["Manheim"] }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].classification, "STRONG");
});
ok("a section with no category is dropped, not fabricated", () => {
  assert.strictEqual(sanitizeMarketSections([{ category: "" }]).length, 0);
});
ok("an out-of-enum classification honestly degrades to NORMAL, never crashes", () => {
  assert.strictEqual(sanitizeMarketSections([{ category: "Trucks", classification: "bogus" }])[0].classification, "NORMAL");
});

console.log("\nChecking sanitizeInventoryScores — REAL VIN grounding, real daysOnLot, never an invented vehicle…");
const NOW = Date.now();
const REAL_VEHICLES = new Map([
  ["1HGCM82633A004352", { vin: "1HGCM82633A004352", createdAt: NOW - 10 * DAY }],
  ["5FRYD4H45KB012345", { vin: "5FRYD4H45KB012345", createdAt: NOW - 40 * DAY, soldPrice: 21000, soldAt: NOW - 5 * DAY }],
]);

ok("a real VIN on the real lot is scored, kept, and gets a real computed daysOnLot", () => {
  const out = sanitizeInventoryScores([{ vin: "1hgcm82633a004352", score: 82, classification: "STRONG_BUY", reason: "x", turnVerdict: "FAST_TURN", deadInventoryAction: null }], REAL_VEHICLES);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].vin, "1HGCM82633A004352");
  assert.strictEqual(out[0].score, 82);
  assert.strictEqual(out[0].daysOnLot, 10);
  assert.strictEqual(out[0].turnVerdict, "FAST_TURN");
});
ok("a VIN NOT on the real lot is dropped — never scores an invented vehicle", () => {
  assert.strictEqual(sanitizeInventoryScores([{ vin: "FAKEVIN0000000001", score: 90, classification: "STRONG_BUY" }], REAL_VEHICLES).length, 0);
});
ok("the new spec vocabulary (UNDERPRICED_OPPORTUNITY/STRONG_BUY) round-trips; a bogus classification degrades to WATCH", () => {
  const out = sanitizeInventoryScores([
    { vin: REAL_VEHICLES.keys().next().value, classification: "UNDERPRICED_OPPORTUNITY" },
    { vin: "5FRYD4H45KB012345", classification: "bogus" },
  ], REAL_VEHICLES);
  assert.strictEqual(out[0].classification, "UNDERPRICED_OPPORTUNITY");
  assert.strictEqual(out[1].classification, "WATCH");
});
ok("an out-of-enum turnVerdict/deadInventoryAction honestly degrades to null, never a guess", () => {
  const out = sanitizeInventoryScores([{ vin: REAL_VEHICLES.keys().next().value, turnVerdict: "bogus", deadInventoryAction: "bogus" }], REAL_VEHICLES);
  assert.strictEqual(out[0].turnVerdict, null);
  assert.strictEqual(out[0].deadInventoryAction, null);
});

console.log("\nChecking sanitizeOpportunityCards…");
ok("a well-formed card keeps real fields, drops one with no headline", () => {
  const out = sanitizeOpportunityCards([{ headline: "Wholesale trucks cheap this week", classification: "EARLY", confidence: 70, risk: "MEDIUM" }, { headline: "" }]);
  assert.strictEqual(out.length, 1);
});
ok("more than 12 cards are capped", () => {
  assert.strictEqual(sanitizeOpportunityCards(Array.from({ length: 20 }, (_, i) => ({ headline: `H${i}` }))).length, 12);
});

console.log("\nChecking sanitizeBuyRecommendations / sanitizeAvoidList (§2/§3)…");
ok("a well-formed buy recommendation keeps real fields, drops one with no vehicle", () => {
  const out = sanitizeBuyRecommendations([{ vehicle: "2022 Toyota Tacoma", targetBuy: "$28,000", maxBuy: "$30,000", demandScore: 88, financingDifficulty: "LOW", confidence: 80 }, { vehicle: "" }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].demandScore, 88);
});
ok("more than 10 buy recommendations are capped to the real top 10", () => {
  assert.strictEqual(sanitizeBuyRecommendations(Array.from({ length: 15 }, (_, i) => ({ vehicle: `V${i}` }))).length, 10);
});
ok("avoid list keeps vehicle+reason, drops entries with no vehicle", () => {
  const out = sanitizeAvoidList([{ vehicle: "2019 Fiat 500", reason: "weak resale, high repair risk" }, { reason: "no vehicle" }]);
  assert.strictEqual(out.length, 1);
});

console.log("\nChecking sanitizeCustomerSegments / sanitizeLeadChannels (§7/§8)…");
ok("a well-formed segment keeps real fields", () => {
  const out = sanitizeCustomerSegments([{ segment: "First-time buyers", priceRange: "$15k-$20k", bestChannel: "Facebook Marketplace" }]);
  assert.strictEqual(out[0].segment, "First-time buyers");
});
ok("only channels in the real tracked-data list get hasRealData:true; others stay honestly false", () => {
  const out = sanitizeLeadChannels([
    { channel: "Facebook", leadCount: 42, notes: "real CRM count" },
    { channel: "Instagram", leadCount: 999, notes: "should be dropped — no real tracking" },
  ], ["facebook"]);
  assert.strictEqual(out[0].hasRealData, true);
  assert.strictEqual(out[0].leadCount, 42);
  assert.strictEqual(out[1].hasRealData, false);
  assert.strictEqual(out[1].leadCount, null, "a channel with no real tracked data must never keep a fabricated lead count");
});

console.log("\nChecking sanitizeFunnelRead / sanitizeFinanceRead / sanitizeRegulationFlags / sanitizeFutureScan / sanitizeLocalMarketGap / sanitizeForecast…");
ok("funnel read caps topActions at 3", () => {
  const out = sanitizeFunnelRead({ biggestLeak: "appointment -> show", topActions: ["a", "b", "c", "d", "e"] });
  assert.strictEqual(out.topActions.length, 3);
});
ok("finance read degrades an unrecognized verdict to NORMAL", () => {
  assert.strictEqual(sanitizeFinanceRead({ verdict: "bogus" }).verdict, "NORMAL");
});
ok("regulation flags drop an entry with no summary, degrade a bad flag to WATCH", () => {
  const out = sanitizeRegulationFlags([{ summary: "" }, { summary: "real CARS Rule update", flag: "bogus" }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].flag, "WATCH");
});
ok("future scan degrades a bad impact to MIXED", () => {
  assert.strictEqual(sanitizeFutureScan([{ technology: "AI appraisal", impact: "bogus" }])[0].impact, "MIXED");
});
ok("local market gap round-trips real fields", () => {
  const out = sanitizeLocalMarketGap({ summary: "x", underservedSegments: ["compact SUVs under $20k"] });
  assert.deepStrictEqual(out.underservedSegments, ["compact SUVs under $20k"]);
});
ok("forecast round-trips base/bull/bear", () => {
  const out = sanitizeForecast({ baseCase: "a", bullCase: "b", bearCase: "c" });
  assert.strictEqual(out.baseCase, "a");
});

console.log("\nChecking sanitizeRepricingResults (CSV Repricing Analysis) — REAL uploaded-VIN grounding, never an invented vehicle…");
const UPLOADED_VINS = new Set(["1HGCM82633A004352", "5FRYD4H45KB012345"]);
ok("a real uploaded VIN is kept with real fields", () => {
  const out = sanitizeRepricingResults([{ vin: "1hgcm82633a004352", action: "REPRICE_DOWN", suggestedPrice: 18500, supplyDemandRead: "loose supply", reasoning: "x", urgency: "HIGH", confidence: 80 }], UPLOADED_VINS);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].vin, "1HGCM82633A004352");
  assert.strictEqual(out[0].action, "REPRICE_DOWN");
  assert.strictEqual(out[0].suggestedPrice, 18500);
});
ok("a VIN NOT actually uploaded this request is dropped — never analyzes an invented vehicle", () => {
  assert.strictEqual(sanitizeRepricingResults([{ vin: "NOTUPLOADED000001", action: "REPRICE_UP" }], UPLOADED_VINS).length, 0);
});
ok("an out-of-enum action honestly degrades to HOLD_PRICE, never a guessed direction", () => {
  const out = sanitizeRepricingResults([{ vin: "5FRYD4H45KB012345", action: "bogus" }], UPLOADED_VINS);
  assert.strictEqual(out[0].action, "HOLD_PRICE");
});
ok("more than 50 results are capped", () => {
  const many = Array.from({ length: 60 }, () => ({ vin: "1HGCM82633A004352" }));
  assert.ok(sanitizeRepricingResults(many, UPLOADED_VINS).length <= 50);
});

console.log("\nChecking sanitizeDimensions — real cross-run diff…");
ok("a dimension whose state differs from the real stored prior value is marked shifted", () => {
  const out = sanitizeDimensions([{ dimension: "credit-environment", state: "TIGHT" }], { "credit-environment": "NORMAL" });
  assert.strictEqual(out[0].shifted, true);
});
ok("an unrecognized dimension key is dropped", () => {
  assert.strictEqual(sanitizeDimensions([{ dimension: "made-up", state: "X" }], {}).length, 0);
});

console.log("\nChecking computeNotificationTriggers…");
ok("an ordinary run produces zero triggers", () => {
  const triggers = computeNotificationTriggers({
    dimensions: [{ dimension: "used-market", state: "NORMAL", shifted: false }],
    opportunities: [{ headline: "x", status: "UNCHANGED", classification: "DEVELOPING", confidence: 30 }],
    inventoryScores: [{ vin: "X", classification: "WATCH", score: 50, deadInventoryAction: null }],
  });
  assert.strictEqual(triggers.length, 0);
});
ok("a real UNDERPRICED_OPPORTUNITY at high score fires STRONG_LOT_VEHICLE (new spec vocabulary)", () => {
  const triggers = computeNotificationTriggers({
    dimensions: [], opportunities: [],
    inventoryScores: [{ vin: "X", classification: "UNDERPRICED_OPPORTUNITY", score: 92, reason: "real comps gap", deadInventoryAction: null }],
  });
  assert.ok(triggers.some((t) => t.kind === "STRONG_LOT_VEHICLE"));
});
ok("a non-HOLD deadInventoryAction fires DEAD_INVENTORY_ACTION", () => {
  const triggers = computeNotificationTriggers({
    dimensions: [], opportunities: [],
    inventoryScores: [{ vin: "X", classification: "WATCH", score: 40, deadInventoryAction: "WHOLESALE", reason: "aging, weak demand" }],
  });
  assert.ok(triggers.some((t) => t.kind === "DEAD_INVENTORY_ACTION"));
});

console.log("\nChecking computeFinalVerdict — real, disclosed formula, not another AI opinion…");
ok("all-positive real dimensions -> EXPAND", () => {
  const dims = ["BULLISH", "EASING", "STRONG", "STRONG", "BUY", "RAISING", "IMPROVING"].map((state, i) => ({ dimension: `d${i}`, state }));
  assert.strictEqual(computeFinalVerdict(dims).verdict, "EXPAND");
});
ok("all-negative real dimensions -> DEFENSIVE", () => {
  const dims = ["BEARISH", "TIGHT", "WEAK", "WEAK", "REDUCE", "FALLING", "DETERIORATING"].map((state, i) => ({ dimension: `d${i}`, state }));
  assert.strictEqual(computeFinalVerdict(dims).verdict, "DEFENSIVE");
});
ok("a genuinely mixed real read lands in the middle tiers, not an extreme", () => {
  const dims = [{ dimension: "a", state: "NEUTRAL" }, { dimension: "b", state: "NORMAL" }];
  const v = computeFinalVerdict(dims).verdict;
  assert.ok(["HOLD", "BUY_SELECTIVELY"].includes(v), `expected a middle verdict for a neutral read, got ${v}`);
});
ok("every input's real +1/-1/0 weight is visible, not a black box", () => {
  const dims = [{ dimension: "auto-market", state: "BULLISH" }, { dimension: "credit-environment", state: "TIGHT" }];
  const r = computeFinalVerdict(dims);
  assert.deepStrictEqual(r.inputs.map((i) => i.weight), [1, -1]);
});

console.log("\nChecking computeCommandCenter — real synthesis of the 3 calls' already-sanitized output, no 4th AI call…");
ok("picks the highest-confidence real opportunity/buy recommendation, not just the first", () => {
  const cc = computeCommandCenter({
    dimensions: [], biggestRisk: "real risk",
    opportunities: [{ headline: "low confidence", confidence: 40 }, { headline: "high confidence", confidence: 90 }],
    buyRecommendations: [{ vehicle: "Low conf truck", confidence: 30, targetBuy: "$10k", maxBuy: "$11k" }, { vehicle: "High conf SUV", confidence: 95, targetBuy: "$20k", maxBuy: "$22k" }],
    inventoryScores: [], customerSegments: [{ segment: "Families", bestChannel: "Facebook" }],
    leadChannels: [{ channel: "Facebook", hasRealData: true }], futureScan: [{ technology: "AI appraisal", impact: "CREATE_PROFIT" }],
    forecast: { baseCase: "steady growth" },
  });
  assert.strictEqual(cc.bestOpportunity, "high confidence");
  assert.strictEqual(cc.vehiclesToBuy[0], "High conf SUV");
  assert.strictEqual(cc.bestPriceRange, "$20k – $22k");
  assert.strictEqual(cc.bestCustomerSegment, "Families");
  assert.strictEqual(cc.bestLeadChannel, "Facebook");
  assert.strictEqual(cc.futureTechnology, "AI appraisal");
  assert.strictEqual(cc.biggestRisk, "real risk");
  assert.strictEqual(cc.twentyFourMonthOutlook, "steady growth");
  assert.ok(cc.finalVerdict && cc.finalVerdict.verdict);
});
ok("no dimension shift today is honestly reported, not fabricated", () => {
  const cc = computeCommandCenter({
    dimensions: [{ dimension: "used-market", state: "NORMAL", shifted: false }],
    opportunities: [], buyRecommendations: [], inventoryScores: [], customerSegments: [], leadChannels: [], futureScan: [], forecast: null, biggestRisk: null,
  });
  assert.strictEqual(cc.marketChange, "No dimension shift today.");
});

console.log("\nChecking gradeInventoryPrediction — real predicted-vs-actual, never fabricated outcomes…");
ok("a vehicle no longer in real inventory records grades UNKNOWN, never guessed", () => {
  const r = gradeInventoryPrediction({ vin: "X", classification: "STRONG_BUY", expectedDaysToSell: 14 }, null, NOW - 20 * DAY);
  assert.strictEqual(r.verdict, "UNKNOWN");
});
ok("sold faster than or near the real predicted days -> CORRECT", () => {
  const predictedAt = NOW - 20 * DAY;
  const real = { soldPrice: 25000, soldAt: predictedAt + 12 * DAY };
  const r = gradeInventoryPrediction({ vin: "X", classification: "STRONG_BUY", expectedDaysToSell: 14 }, real, predictedAt);
  assert.strictEqual(r.verdict, "CORRECT");
});
ok("sold much slower than the real predicted days -> TOO_LATE, not silently CORRECT", () => {
  const predictedAt = NOW - 60 * DAY;
  const real = { soldPrice: 25000, soldAt: predictedAt + 50 * DAY };
  const r = gradeInventoryPrediction({ vin: "X", classification: "STRONG_BUY", expectedDaysToSell: 14 }, real, predictedAt);
  assert.strictEqual(r.verdict, "TOO_LATE");
});
ok("still unsold with too little real elapsed time -> TOO_EARLY, never forced into a verdict", () => {
  const predictedAt = NOW - 1 * DAY;
  const r = gradeInventoryPrediction({ vin: "X", classification: "STRONG_BUY", expectedDaysToSell: 14 }, { vin: "X" }, predictedAt);
  assert.strictEqual(r.verdict, "TOO_EARLY");
  assert.ok(MIN_GRADE_AGE_DAYS >= 1);
});
ok("a real STRONG_BUY call still unsold well past its predicted fast turn -> WRONG", () => {
  const predictedAt = NOW - 40 * DAY;
  const r = gradeInventoryPrediction({ vin: "X", classification: "STRONG_BUY", expectedDaysToSell: 10 }, { vin: "X" }, predictedAt);
  assert.strictEqual(r.verdict, "WRONG");
});

console.log("\nChecking gradeLearningHistory — real aggregate grading across stored snapshots…");
ok("a snapshot younger than MIN_GRADE_AGE_DAYS is honestly excluded from grading", () => {
  const history = [{ at: new Date(NOW - 1 * DAY).toISOString(), inventoryScores: [{ vin: "X", classification: "STRONG_BUY", expectedDaysToSell: 10 }] }];
  assert.strictEqual(gradeLearningHistory(history, []).length, 0);
});
ok("uses the freshest gradeable snapshot per VIN, not every historical one (no double-counting)", () => {
  const history = [
    { at: new Date(NOW - 30 * DAY).toISOString(), inventoryScores: [{ vin: "X", classification: "WATCH", expectedDaysToSell: 20 }] },
    { at: new Date(NOW - 10 * DAY).toISOString(), inventoryScores: [{ vin: "X", classification: "STRONG_BUY", expectedDaysToSell: 10 }] },
  ];
  const graded = gradeLearningHistory(history, [{ vin: "X" }]);
  assert.strictEqual(graded.length, 1);
  assert.strictEqual(graded[0].classification, "STRONG_BUY");
});

console.log(`\n${passed} checks passed.`);
console.log("CAR-BUSINESS-ENGINE TEST OK");
