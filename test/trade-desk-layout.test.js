"use strict";
// Structural regression checks for the 2026-09-02 Trade Desk layout fixes
// — same fs.readFileSync + regex convention as
// test/client-server-twin-sync.test.js's "authoritative client consumption"
// checks, since these are real bugs in fetch/CSS wiring, not pure
// functions worth extracting just to unit-test.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

console.log("Checking Trade Desk request timeouts (Cortex 'Analyzing…' / opportunities 'Scanning…' must never hang forever)…");

const cortexSrc = read("axiom-runner", "components", "CortexMiniPanel.jsx");
ok("CortexMiniPanel.jsx's news fetch (the one real fetch it still owns solely) uses an AbortController with a timeout", () => {
  assert.match(cortexSrc, /new AbortController\(\)/);
  assert.match(cortexSrc, /setTimeout\(\(\) => controller\.abort\(\), 15_000\)/);
  assert.match(cortexSrc, /signal:\s*controller\.signal/);
});
ok("CortexMiniPanel.jsx's decision fetch (shared via decision-store.js, 2026-09-05 perf fix) never hangs forever either — raced against a 15s timeout instead of an AbortController, since aborting the shared in-flight fetch would wrongly cancel it for other consumers (e.g. TradeDeskTab.jsx) too", () => {
  assert.match(cortexSrc, /Promise\.race\(\[\s*fetchDecision\(symbol\)/);
  assert.match(cortexSrc, /setTimeout\(\(\) => reject\(new Error\("timeout"\)\), 15_000\)/);
});
ok("CortexMiniPanel.jsx surfaces a Retry action on error, not a permanent 'Analyzing…'", () => {
  assert.match(cortexSrc, /setRetryTick/);
  assert.match(cortexSrc, />Retry</);
});

const searchPanelSrc = read("axiom-runner", "components", "CommandSearchPanel.jsx");
ok("CommandSearchPanel.jsx's opportunities fetch uses an AbortController with a timeout", () => {
  assert.match(searchPanelSrc, /new AbortController\(\)/);
  assert.match(searchPanelSrc, /setTimeout\(\(\) => controller\.abort\(\), 15_000\)/);
  assert.match(searchPanelSrc, /signal:\s*controller\.signal/);
});
ok("CommandSearchPanel.jsx surfaces a Retry action on error, not a permanent 'Scanning…'", () => {
  assert.match(searchPanelSrc, />Retry</);
});

console.log("\nChecking root layout (white-frame flash / theme sync)…");

const indexHtml = read("axiom-runner", "index.html");
ok("index.html no longer hardcodes a static body background that can mismatch the live theme", () => {
  assert.doesNotMatch(indexHtml, /body\s*\{\s*background:\s*#[0-9a-fA-F]{3,6}/);
});
ok("index.html reads the same cached settings key axiom-live.jsx persists, before first paint", () => {
  assert.match(indexHtml, /axiom_local_config_v1/);
  assert.match(indexHtml, /document\.documentElement\.style\.background/);
});
ok("html/body/#root have no default margin/padding and fill the viewport width", () => {
  assert.match(indexHtml, /html,\s*body,\s*#root\s*\{[^}]*width:\s*100%/);
  assert.match(indexHtml, /html,\s*body,\s*#root\s*\{[^}]*margin:\s*0/);
});

const axiomLiveSrc = read("axiom-runner", "axiom-live.jsx");
ok("axiom-live.jsx's theme effect keeps <html> in sync, not just <body>", () => {
  assert.match(axiomLiveSrc, /document\.documentElement\.style\.background = C\.bg/);
  assert.match(axiomLiveSrc, /document\.body\.style\.background = C\.bg/);
});
ok("themeMode's unconfigured fallback matches DEFAULT_SETTINGS' documented dark default", () => {
  assert.match(axiomLiveSrc, /themeMode: "dark", \/\/ permanent default/);
  assert.match(axiomLiveSrc, /settings\.themeMode \|\| "dark"/);
});

console.log("\nChecking Trade Desk reference redesign (2026-09-09 — Chart | AI Analysis | Risk/Avoid, drag-resizable columns retired)…");
const tradeDeskSrc = read("axiom-runner", "components", "TradeDeskTab.jsx");
// The 2026-09-04/09-08 drag-resizable leftColW/rightColW 3-pane grid
// (SEARCH | CHART | CORTEX) this test used to pin the tablet/desktop
// default widths for is gone — replaced by the reference-matching Chart |
// AI Analysis | Risk/Avoid card row (no user-resizable columns, matching
// the reference design's own fixed-proportion layout). Real, deliberate
// removal, not a regression — see this file's own TradeGpsCard/OhlcStatsRow/
// CardWrap-based layout for what replaced it.
ok("TradeDeskTab.jsx's old drag-resizable leftColW/rightColW grid is gone (a later comment may still reference the retired feature by name for historical context — only real declarations/usages are checked here)", () => {
  assert.doesNotMatch(tradeDeskSrc, /const \[leftColW|const \[rightColW|const startColDrag/);
});
ok("TradeDeskTab.jsx renders the reference layout's Search | Chart | AI Analysis | Risk/Avoid row (search restored to the primary flow, 2026-09-09: \"move search to keep the flow in right way\")", () => {
  assert.match(tradeDeskSrc, /gridTemplateColumns:\s*"260px minmax\(0,1fr\)\s*320px\s*300px"/);
  assert.match(tradeDeskSrc, /🤖 AI ANALYSIS/);
  assert.match(tradeDeskSrc, /function RiskAvoidCard/);
  assert.match(tradeDeskSrc, /<CommandSearchPanel symbol={symbol} onSelectSymbol={selectSymbol} onOpenDaytrade={applyLightboxHandoff}/);
});
ok("TradeDeskTab.jsx's analysis row gives every column a real shared bounded height instead of letting mismatched content heights leave a blank void (2026-09-09 fix, live user report: \"lots of empty areas\")", () => {
  const matches = tradeDeskSrc.match(/height: 680/g) || [];
  assert.ok(matches.length >= 4, `expected all 4 analysis-row columns to share height:680, found ${matches.length}`);
});
ok("TradeDeskTab.jsx's reference-layout metrics (Key Levels/Targets/Key Metrics/Market Sentiment/Trade Setup/Detailed Analysis) still exist, real, inside the METRICS side-tab rather than an always-on bottom-card wall (2026-09-09, explicit user request: \"TOO MUCH DATA IN TRADE DESK I WANT ONE PAGE ONLY THE REST JUST CONNECTION AS TABS IN SIDE\")", () => {
  for (const marker of ["KeyLevelsCard", "function TargetsCard", "function KeyMetricsCard", "function MarketSentimentCard", "function TradeSetupCard", "TradeDeskEvidence"]) {
    assert.ok(tradeDeskSrc.includes(marker), `missing ${marker}`);
  }
  assert.match(tradeDeskSrc, /dockModule === "metrics"/);
});
ok("TradeDeskTab.jsx's Simple/Full view-mode toggle is retired — the side tab rail is the only layout now, no second mode to discover", () => {
  assert.doesNotMatch(tradeDeskSrc, /const \[viewMode|toggleViewMode|MORE ANALYSIS/);
});
ok("TradeDeskTab.jsx renders a real vertical side tab rail grouping every module (TRADE/ACCOUNT/ANALYSIS/EXECUTION/INTEL), each still scoped to the active symbol", () => {
  assert.match(tradeDeskSrc, /aria-label="Trade Desk tabs"/);
  assert.match(tradeDeskSrc, /group: "INTEL"/);
  for (const key of ["metrics", "beforeitpops", "hiddengem", "buyassistant", "smartmoney", "moreintel", "movers"]) {
    assert.match(tradeDeskSrc, new RegExp(`key: "${key}"`));
  }
});
ok("TradeDeskTab.jsx's previously always-on panels (Before It Pops/Hidden Gem/Options Buy Assistant/Smart Money/Trade GPS Why/Extended Hours Movers) each render exactly once now — inside their real dockModule tab gate, not ALSO as a second always-on copy on the page", () => {
  for (const tag of ["<BeforeItPopsPanel", "<HiddenGemPanel", "<OptionsBuyAssistantPanel", "<SmartMoneyIntelPanel", "<TradeGpsWhyPanel", "<ExtendedHoursMovers"]) {
    const count = tradeDeskSrc.split(tag).length - 1;
    assert.strictEqual(count, 1, `expected exactly one ${tag} usage, found ${count}`);
  }
});
ok("TradeDeskTab.jsx renders a real bottom status bar", () => {
  assert.match(tradeDeskSrc, /function BottomStatusBar/);
  assert.match(tradeDeskSrc, /<BottomStatusBar/);
});

console.log("\nChecking news-feed consolidation phase 1 (RegimeNewsPanel retirement)…");
ok("axiom-live.jsx no longer imports the retired, unmounted RegimeNewsPanel", () => {
  assert.doesNotMatch(axiomLiveSrc, /RegimeNewsPanel/);
});
ok("RegimeNewsPanel.jsx has been deleted", () => {
  assert.ok(!fs.existsSync(path.join(__dirname, "..", "axiom-runner", "components", "RegimeNewsPanel.jsx")));
});
ok("axiom-live.jsx's news sentiment effect no longer calls the unauthorized-scrape finviz news endpoint", () => {
  assert.doesNotMatch(axiomLiveSrc, /finviz\/news/);
});
ok("axiom-live.jsx's news sentiment effect reads the real classified pipeline's MARKET aggregate", () => {
  assert.match(axiomLiveSrc, /api\/news\/ticker\/MARKET/);
});
const finvizSrc = read("src", "routes", "finviz.js");
ok("finviz.js's unauthorized news-scraping (news.ashx + RSS fallback) is gone; quote/chart untouched", () => {
  assert.doesNotMatch(finvizSrc, /news\.ashx/);
  assert.doesNotMatch(finvizSrc, /RSS_FEEDS/);
  assert.match(finvizSrc, /api\/finviz\/quote/);
  assert.match(finvizSrc, /api\/finviz\/chart/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-DESK-LAYOUT TEST FAILED");
else console.log("TRADE-DESK-LAYOUT TEST OK");
