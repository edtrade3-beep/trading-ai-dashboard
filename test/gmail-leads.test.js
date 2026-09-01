// Real tests for src/gmail-leads.js's outcome-grading (2026-09-01 platform
// audit) — pure, zero-network/zero-IMAP, mirrors car-business-engine.js's
// own gradeInventoryPrediction test discipline: grade only what's old
// enough to fairly judge, never fabricate an outcome.
// Run: node test/gmail-leads.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { gradeEmailLead, gradeEmailLeadHistory, MIN_GRADE_AGE_DAYS } = require("../src/gmail-leads");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const daysAgo = (n) => Date.now() - n * 86_400_000;

console.log("Checking gradeEmailLead — real CRM-stage-vs-classification grading, honest exclusions…");

ok("too soon to grade (younger than MIN_GRADE_AGE_DAYS) is honestly excluded, never a fabricated verdict", () => {
  const entry = { email: "a@x.com", stage: "NEW", createdAt: daysAgo(MIN_GRADE_AGE_DAYS - 1) };
  assert.strictEqual(gradeEmailLead(entry), null);
});

ok("a real SOLD stage after enough real time -> CONVERTED", () => {
  const entry = { email: "a@x.com", stage: "SOLD", createdAt: daysAgo(10) };
  const g = gradeEmailLead(entry);
  assert.strictEqual(g.verdict, "CONVERTED");
  assert.ok(g.reason.includes("SOLD"));
});

ok("a real APPOINTMENT stage after enough real time -> IN_PROGRESS", () => {
  const entry = { email: "a@x.com", stage: "APPOINTMENT", createdAt: daysAgo(10) };
  assert.strictEqual(gradeEmailLead(entry).verdict, "IN_PROGRESS");
});

ok("a real NEGOTIATING stage after enough real time -> IN_PROGRESS", () => {
  const entry = { email: "a@x.com", stage: "NEGOTIATING", createdAt: daysAgo(10) };
  assert.strictEqual(gradeEmailLead(entry).verdict, "IN_PROGRESS");
});

ok("a real NEW stage with no movement after enough real time -> NO_PROGRESS", () => {
  const entry = { email: "a@x.com", stage: "NEW", createdAt: daysAgo(10) };
  assert.strictEqual(gradeEmailLead(entry).verdict, "NO_PROGRESS");
});

ok("no real createdAt on file is honestly excluded, never a crash or a fabricated verdict", () => {
  assert.strictEqual(gradeEmailLead({ email: "a@x.com", stage: "NEW" }), null);
  assert.strictEqual(gradeEmailLead(null), null);
});

console.log("Checking gradeEmailLeadHistory — real filtering to email-sourced leads only…");

ok("only source:'email' entries are graded, Facebook-sourced leads are excluded", () => {
  const leads = [
    { email: "a@x.com", stage: "SOLD", createdAt: daysAgo(10), source: "email" },
    { email: "b@x.com", stage: "SOLD", createdAt: daysAgo(10), source: "facebook-bot" },
  ];
  const graded = gradeEmailLeadHistory(leads);
  assert.strictEqual(graded.length, 1);
  assert.strictEqual(graded[0].email, "a@x.com");
});

ok("empty/malformed input returns an honest empty list, never a crash", () => {
  assert.deepStrictEqual(gradeEmailLeadHistory(null), []);
  assert.deepStrictEqual(gradeEmailLeadHistory([]), []);
});

console.log(`\n${passed} checks passed.`);
console.log("GMAIL-LEADS TEST OK");
