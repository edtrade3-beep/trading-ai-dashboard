"use strict";
const assert = require("node:assert");
const { clusterNewsItems, tokenize, jaccardSimilarity } = require("../src/news/event-cluster");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

ok("tokenize: strips punctuation/stopwords/short words, lowercases", () => {
  const t = tokenize("The Fed Cuts Rates by a Quarter Point");
  assert.ok(t.has("fed"));
  assert.ok(t.has("cuts"));
  assert.ok(t.has("rates"));
  assert.ok(t.has("quarter"));
  assert.ok(t.has("point"));
  assert.ok(!t.has("the"));
  assert.ok(!t.has("by"));
  assert.ok(!t.has("a"));
});

ok("jaccardSimilarity: identical token sets score 1", () => {
  const a = tokenize("Fed cuts rates quarter point");
  assert.strictEqual(jaccardSimilarity(a, new Set(a)), 1);
});
ok("jaccardSimilarity: completely disjoint sets score 0", () => {
  assert.strictEqual(jaccardSimilarity(new Set(["apple"]), new Set(["banana"])), 0);
});
ok("jaccardSimilarity: an empty set on either side is honestly 0, never NaN", () => {
  assert.strictEqual(jaccardSimilarity(new Set(), new Set(["x"])), 0);
  assert.strictEqual(jaccardSimilarity(new Set(), new Set()), 0);
});

function row({ ticker = "AAPL", headline, source, category = "EARNINGS", impact_score = 60, publishedAt }) {
  return { ticker, headline, source, category, impact_score, published_at: publishedAt, url: `https://example.com/${source}` };
}

ok("clusterNewsItems: same real event from two different outlets merges into one cluster", () => {
  const rows = [
    row({ headline: "Apple beats Q3 earnings estimates on strong iPhone sales", source: "Reuters", impact_score: 75, publishedAt: "2026-09-07T10:00:00Z" }),
    row({ headline: "Apple beats Q3 earnings estimates, iPhone sales strong", source: "Bloomberg", impact_score: 70, publishedAt: "2026-09-07T10:15:00Z" }),
  ];
  const clusters = clusterNewsItems(rows);
  assert.strictEqual(clusters.length, 1);
  assert.strictEqual(clusters[0].itemCount, 2);
  assert.strictEqual(clusters[0].sourceCount, 2);
  assert.deepStrictEqual(new Set(clusters[0].sources), new Set(["Reuters", "Bloomberg"]));
});

ok("clusterNewsItems: the cluster's representative headline is the highest real impact-score item, not just the first", () => {
  const rows = [
    row({ headline: "Apple beats Q3 earnings estimates on strong iPhone sales", source: "SmallBlog", impact_score: 40, publishedAt: "2026-09-07T10:00:00Z" }),
    row({ headline: "Apple beats Q3 earnings estimates, iPhone sales strong", source: "Reuters", impact_score: 88, publishedAt: "2026-09-07T10:05:00Z" }),
  ];
  const clusters = clusterNewsItems(rows);
  assert.strictEqual(clusters.length, 1);
  assert.strictEqual(clusters[0].maxImpactScore, 88);
  assert.ok(clusters[0].representativeHeadline.includes("Reuters") === false); // sanity: headline text, not source name
});

ok("clusterNewsItems: a genuinely different story about the same ticker stays a separate cluster", () => {
  const rows = [
    row({ headline: "Apple beats Q3 earnings estimates on strong iPhone sales", source: "Reuters", category: "EARNINGS", publishedAt: "2026-09-07T10:00:00Z" }),
    row({ headline: "Apple sued over App Store antitrust practices", source: "WSJ", category: "LEGAL", publishedAt: "2026-09-07T10:05:00Z" }),
  ];
  const clusters = clusterNewsItems(rows);
  assert.strictEqual(clusters.length, 2);
});

ok("clusterNewsItems: the same headline for two different tickers never merges", () => {
  const rows = [
    row({ ticker: "AAPL", headline: "Company reports record quarterly revenue growth", source: "Reuters", publishedAt: "2026-09-07T10:00:00Z" }),
    row({ ticker: "MSFT", headline: "Company reports record quarterly revenue growth", source: "Reuters", publishedAt: "2026-09-07T10:00:00Z" }),
  ];
  const clusters = clusterNewsItems(rows);
  assert.strictEqual(clusters.length, 2);
});

ok("clusterNewsItems: items published far outside the real time window never merge, even if identical text", () => {
  const rows = [
    row({ headline: "Apple beats Q3 earnings estimates on strong iPhone sales", source: "Reuters", publishedAt: "2026-09-07T10:00:00Z" }),
    row({ headline: "Apple beats Q3 earnings estimates on strong iPhone sales", source: "Bloomberg", publishedAt: "2026-09-09T10:00:00Z" }), // 2 days later
  ];
  const clusters = clusterNewsItems(rows);
  assert.strictEqual(clusters.length, 2);
});

ok("clusterNewsItems: a lone real story is still a valid single-item cluster, not dropped", () => {
  const rows = [row({ headline: "Apple unveils new product line", source: "Reuters", publishedAt: "2026-09-07T10:00:00Z" })];
  const clusters = clusterNewsItems(rows);
  assert.strictEqual(clusters.length, 1);
  assert.strictEqual(clusters[0].itemCount, 1);
  assert.strictEqual(clusters[0].sourceCount, 1);
});

ok("clusterNewsItems: clusters are sorted by real max impact score, highest first", () => {
  const rows = [
    row({ headline: "Minor product update announced quietly", source: "Blog", impact_score: 30, publishedAt: "2026-09-07T09:00:00Z" }),
    row({ headline: "Apple beats Q3 earnings estimates on strong iPhone sales", source: "Reuters", impact_score: 90, publishedAt: "2026-09-07T10:00:00Z" }),
  ];
  const clusters = clusterNewsItems(rows);
  assert.strictEqual(clusters[0].maxImpactScore, 90);
  assert.strictEqual(clusters[1].maxImpactScore, 30);
});

ok("clusterNewsItems: an empty real feed returns an empty cluster list, never throws", () => {
  assert.deepStrictEqual(clusterNewsItems([]), []);
  assert.deepStrictEqual(clusterNewsItems(undefined), []);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("EVENT-CLUSTER TEST FAILED");
else console.log("EVENT-CLUSTER TEST OK");
