# AM Trading Platform Architecture Migration

Status: active `/goal` implementation ledger. Read this file with `git status` and `git diff` before continuing work.

## Mission

Migrate the platform to one canonical flow:

`normalized data -> data health -> market regime -> asset analysis -> opportunity -> decision -> risk override -> final AssetDecision -> UI/execution/alerts`

Paper trading remains the default. No migration step authorizes live execution or synthetic prices, fills, P&L, events, or provider data.

## Repository state at start

- Branch `main` matched `origin/main` at `57b802f`.
- The working tree already contained an uncommitted one-engine consolidation. It is preserved and audited as work in progress.
- Full tests and the production client build passed after that consolidation.
- Current canonical candidate engine: `src/opportunity-engine.js`, internally using `src/am-core-engine.js`, `src/entry-engine.js`, `src/red-flag-engine.js`, and `src/setup-evidence.js`.
- Current execution safety anchors: `src/risk-guardrails.js`, `src/emergency-stop.js`, broker-specific paper-mode configuration, and fail-closed checks in Autopilot 2.0/autoexec.

## Audit findings

### Canonical or reusable foundations

- Opportunity assembly: `src/opportunity-engine.js`
- Long/short scoring and raw verdict classification: `src/am-core-engine.js`
- Entry/setup calculation: `src/entry-engine.js`, `src/setup-evidence.js`
- Entry/exit blockers: `src/red-flag-engine.js`
- Position state: `src/position-decision-engine.js`
- Existing opportunity history: `src/opportunity-timeline-store.js`, `src/opportunity-snapshot-store.js`
- Existing quote freshness check: `src/data-freshness.js`
- Existing cross-asset context: `src/market-context-engine.js`
- Existing macro components: `src/macro-engine.js`, `src/treasury-credit-engine.js`, `src/liquidity-employment-engine.js`, `src/sector-rotation-engine.js`
- Existing portfolio calculations: `src/risk-lab-calc.js`, `src/portfolio-store.js`, `src/portfolio-correlation-calc.js`

### P0 conflicts found

- `computeRegime()` in `src/trade-planner-scoring.js` is widely used, but a different client-only `computeRegimeLabel()` also drives UI state. The source comments explicitly say the two were intentionally not consolidated. This violates the target architecture.
- `src/cortex-decision.js` still creates BUY ZONE / OVEREXTENDED / WATCH / WAIT / AVOID as an independent verdict cascade.
- Legacy trend-template GO/WAIT/AVOID fields remain active and feed compatibility helpers.
- `computeNextAction()` contains a fallback decision formula when `coreVerdict` is absent.
- Sniper, MTF, day-trade, foundation, news, Future Wallet, and market-context modules contain valid domain classifications, but some UI/jobs present them as competing final verdicts rather than evidence.
- Server schedules include legacy server Autopilot, Autopilot 2.0, and day-trade Autopilot jobs. They are separate execution orchestrators.

### Work completed in the current uncommitted migration

- Server alert/scanner/watchlist/BTC-HPC decision assembly now consumes `computeOpportunity()`.
- Trade Desk, Discover, and Smart Scan request `withDecision=1` and consume the server Opportunity Object instead of invoking the client Master Verdict classifier.
- Sniper reversal-top risk is a hard input to the canonical verdict and is client/server parity-tested.
- Autopilot 2.0 only accepts canonical `EARLY_BUY`/`BUY`; WATCH and Light Box cannot be promoted into executable candidates.
- Scanner cache keys are normalized; in-flight work is deduplicated; cached results are cloned; rejections are evicted.
- Build warnings from duplicate Smart Scan style keys were removed.
- Cortex Mini Panel and Terminal Workspace now render canonical final verdict metadata; legacy Cortex verdict calculation is no longer a primary UI decision path.
- Market opportunity, trend-screen, Sniper, and BTC/HPC routes now assemble decisions through `canonical-decision-pipeline.js` rather than duplicating regime/opportunity/decision wiring.
- Telegram `/cortex` and forward-history snapshots now consume the canonical `AssetDecision` for final verdicts; Cortex heat/technical functions remain explanatory evidence only.
- Market Terminal day-trade state display now reads canonical AssetDecision (or server position state) and no longer invokes the independent Cortex verdict classifier.
- Canonical AssetDecision now derives `riskReward` when the underlying entry/stop/target plan does not expose a precomputed ratio, avoiding a misleading null in downstream consumers.
- Health and Autopilot status APIs now explicitly publish `paperOnly: true` and `engineVersion: canonical-pipeline-v1`, plus the active Light Box mode, so execution state is visible and cannot be mistaken for live-money execution.
- Data Health now tracks optional fundamentals, news, and execution-paper-broker sources on every canonical decision; optional outages are visible without blocking, while required stale/unavailable sources still fail closed.
- Added `event-risk-engine.js`: explicit earnings/event records can block new exposure, while absent event data remains neutral and is never fabricated.
- Decision timeline samples now persist canonical verdict, opportunity stage, and reason, and suppress unchanged snapshots after the real sampling interval.
- Dashboard Top Opportunity now requests `withDecision=1` and selects only canonical BUY/STRONG_BUY rows; it no longer applies a separate client-side entry filter/verdict.
- AI Trade Session and RhPro Watchlists now use canonical verdicts for candidate gating/action labels instead of `computeNextAction` fallbacks.
- Quotes setup badges now prefer canonical `AssetDecision` verdicts, falling back only for legacy rows without `withDecision=1` data.
- Trade Planner and RhPro Scanner no longer recompute legacy next-action verdicts when canonical decisions are present.
- Smart Scan’s deep-dive/auto-trade compatibility display now derives its legacy `Cortex` label from canonical `AssetDecision`; the prior runtime reference had no local `cortexV` definition after migration.
- Autopilot 2.0 UI Stock Watch now filters and displays standardized `STRONG_BUY`/`BUY` AssetDecision verdicts rather than legacy `EARLY_BUY`/raw opportunity fields.
- Autopilot 2.0 Crypto Watch color/rank/actionable sets now use the same standardized final verdict vocabulary.
- Tradier scanner auto-execution now requires the canonical AssetDecision object at the order boundary; the scanner-local composite is retained only as a secondary threshold/telemetry signal. Unsupported SELL/short auto-execution is fail-closed until a canonical short-side decision exists.
- Trend-screen responses now publish top-level canonical `dataHealth` and `marketRegime` alongside per-row AssetDecision state for consistent page headers and health indicators.
- Added `execution-authority.js`, a shared paper-only ownership contract distinguishing broker mutators (Server Autopilot, Light Box Assist, Quick Trade) from read-only schedulers.
- Execution authority and `/api/health` now include the legacy Tradier Autoexec mode, including pending assistant approval, so every broker mutator is visible in one status contract.
- Remaining trend-screen consumers (Trade Advisor, Green Light, Terminal refresh, Predictions, Multi-TF, Heat Map, Holdings, Crypto, and Early Entry) now request `withDecision=1`, ensuring canonical AssetDecision data is available at each surface.
- Removed the Autoexec UI's misleading independent `allowShorts` control and retired its persisted setting; Tradier Autoexec is long-only until canonical short-side decisions are implemented.
- Tradier Autoexec now fails closed whenever the canonical Server Autopilot scheduler is enabled, preventing concurrent broker mutators during the scheduler migration.
- The opportunities route's canonical regime/health sample now carries the same Research/Market Wrap context as each per-symbol decision, avoiding a split top-level health state.
- Trend-screen `withDecision=1` responses now publish the bounded Research/Market Wrap context at both row and top-level scope, so all major decision consumers receive the same narrative context.
- Smart Money now publishes the canonical `assetDecision`/`finalVerdict` alongside its institutional/SMC evidence, making its decision boundary inspectable without replacing existing detail fields.
- Smart Money Decision Panel now renders that canonical final verdict and reason when available; legacy route labels remain compatibility-only.
- Future Wallet Horses endpoint supports opt-in `withDecision=1`; Light Box now requests it and displays the canonical current-entry verdict alongside long-term Horse score/stage.
- Holdings now displays each available canonical AssetDecision verdict beside its position risk status; local stop/MA indicators remain position-risk evidence, not replacement verdicts.
- Browser AutoPilot now gates entries on standardized canonical `AssetDecision` verdicts (`STRONG_BUY`/`BUY`) and ignores the legacy core-verdict fields; its local short toggle is fail-closed until canonical short decisions exist.
- Browser AutoPilot now reads shared health execution authority and stands down when any Server or Tradier automated mutator is active, preventing cross-scheduler overlap.
- Cortex Stock tab's second verdict card is now explicitly labeled as the canonical decision track record, removing the implication that Cortex computes a separate final verdict.
- Removed the duplicate Cortex symbol-view verdict card; one canonical verdict card remains, with track-record context beneath it.
- Cortex Mini now publishes the canonical trend-screen decision before optional fundamentals/news requests finish, preventing a temporary “Analyzing” state from appearing out of sync with the Trade Desk opportunity card.
- The conversational `run_scan` tool now ranks and reports the canonical AssetDecision verdict/stage/reason rather than the legacy client `computeNextAction` classifier.
- Trade Desk now presents a canonical Master Verdict strip, evidence/trade-plan panels, connected ticker tabs, IWM/data-status top-bar context, and a dark institutional shell; these are presentation-only and consume existing AssetDecision/chart data.
- Trade Desk's header now reads the Autopilot 2.0 status endpoint and labels it explicitly as the simulated paper account, avoiding ambiguity with legacy automation surfaces.
- Trade Desk chart loading now reports real API errors on desktop and mobile, and ticker-aware tabs preserve the selected symbol through existing route handoffs.

### 2026-09-06 platform-consolidation pass

A separate user-driven initiative (the "one integrated decision operating system" master prompt) was mapped against this ledger before any work started — most of its asks were already satisfied here under different names (AssetDecision, MarketRegimeState, data-health-engine, event-risk-engine, execution-authority, the standardized verdict vocabulary). The genuinely open gaps were built as small, additive slices, each verified with `npm test`/`npm run build`:

- **Global What-Changed engine** (`src/what-changed-engine.js`, `src/what-changed-store.js`) — extends the existing per-symbol `opp.whatChanged` to a platform-wide "since open"/"since last refresh" diff (regime, VIX, data health, market news sentiment, real candidate verdict transitions), fed additively off `/api/market/opportunities`'s existing scan (no new fetch cadence). Surfaced via `GET /api/market/what-changed` and `WhatChangedPanel.jsx` on Trade Desk. Deliberately not a duplicate of `command-center-ai.js`'s own AI-gated `buildWhatChanged` — that one diffs AI Command Center runs and needs an API key; this one is free, deterministic, and runs on every real scan.
- **Risk Command Center consolidation** — found three independent hardcoded copies of the same risk caps (`ai-hub.js`'s `buildRiskSnapshot` had its own `maxLossPct:2` literal; `PortfolioRiskCard.jsx` separately hardcoded `riskCap:6` and a sector-bar threshold of `3`) that could silently drift from the real caps `quick-trade-service.js`'s `preTradeCheck()` actually gates orders on. Consolidated to one source; also found the daily-loss breaker was silently ignoring the real `DAILY_LOSS_LOCK_DOLLARS` absolute floor. Added previously-computed-but-never-rendered fields (equity, buying power, daily P/L, risk budget remaining, daily loss limit used/remaining) to the existing card rather than building a new screen.
- **Alert priority tiers (P0-P3)** — found the single most critical alerts in the app (`emergency-stop.js`'s trip/rearm, `job-heartbeat.js`'s stalled-job alert) called `sendTelegramMessage` directly with no priority at all, subject to the same 60s/40-per-day global cooldown as routine chatter, with the result never checked. Extracted a pure, testable `evaluateGlobalThrottle()` (`src/telegram.js`) with a `priority:"P0"` bypass, added an explicit P0-P3 category taxonomy (`src/telegram-bot.js`'s `ALERT_PRIORITY`/`priorityFor`), and tagged the genuine emergency paths P0.
- **Command Palette query intelligence** — added 6 new deterministic (zero-AI-cost) intents to `runPaletteCommand` (`axiom-live.jsx`) following its own existing `WHY <SYMBOL>`/`COMPARE`/`REVIEW PORTFOLIO` pattern: `WHAT CHANGED`, `BEST TRADE NOW`, `SHOW TRADES WAITING FOR ENTRY`, `SHOW REJECTED TRADES`, `SHOW STALE DATA`, `SHOW PORTFOLIO WEAKNESSES` — each reads real already-computed data and answers through the existing Trading Copilot chat surface, no new AI call. Sector-scoped queries ("best semiconductor trade") were left out — the opportunities scan carries a sector *rank*, not a filterable sector *name*, and building that mapping client-side risked drifting from the server's own classification.
- **Journal decision-vs-outcome taxonomy** (`src/trade-outcome-classifier.js`) — the standard trading-psychology GOOD/BAD_TRADE × GOOD/BAD_OUTCOME split, built from data that already exists (the real `"A"`/`"B"` entry tier `server-autopilot.js` already assigns, crossed with real P&L), plus `EXECUTION_ERROR` when `trade-autopsy.js`'s own `classifyExit` finds the fill violated the real stop. `SYSTEM_ERROR`/`MARKET_RANDOMNESS` are real taxonomy members but deliberately never auto-assigned — no reliable signal exists in this codebase to detect either without fabricating one.
- **Dead-code verification (P3 checklist)** — manually traced 10 plausible orphan-looking files (`mtf-combiner.js`, `alpaca-closed-trade-feed.js`, `prediction-tracker.js`, `morning-digest.js`, `autopilot-tick.js`, `opportunity-pivot-alerts.js`, `position-reversal-alerts.js`, `premarket-alerts.js`, `price-alert-monitor.js`, `trailing-stops.js`) after a naive automated grep sweep proved unreliable (it flagged live files as dead — it can't see through `server.js`'s lazy `require("./src/X")` calls inside `registerJob(...)`). All 10 are genuinely live, wired through that same job-registration pattern. Zero real deletions this pass — recorded here so a future session doesn't redo the same check. Scheduler consolidation itself was explicitly not attempted — this ledger's own "Known constraints" section already requires deployment shadowing and operational approval neither of which an offline session can perform.

## Target canonical contracts

## Dependency flow and ownership

The production dependency path is:

`provider fetches -> normalized scanner row -> data-health-engine -> market-regime-engine -> opportunity-engine -> asset-decision risk override -> AssetDecision`

Consumers must read `assetDecision.verdict`, `assetDecision.opportunityStage`, and its reason/blocker fields. Technical, institutional, sniper, Cortex, Future Wallet, and portfolio calculations are evidence or long-horizon context; they cannot authorize an order. Order-capable paths are limited to the execution-authority mutators and must fail closed without a canonical BUY-family decision. Compatibility fields such as `coreVerdict`, `next`, and legacy GO/WAIT labels remain temporary presentation adapters only.

Source ownership:

- Market regime: `src/market-regime-engine.js`
- Opportunity assembly: `src/opportunity-engine.js`
- Final decision and risk override: `src/asset-decision.js`
- Data freshness/blocking: `src/data-health-engine.js`
- Event blocking: `src/event-risk-engine.js`
- Broker mutator ownership: `src/execution-authority.js`
- Research/Market Wrap context: `src/research-context-adapter.js`

### MarketRegimeState

Vocabulary: `RISK_ON | SELECTIVE_RISK_ON | NEUTRAL | RISK_OFF | CRISIS`.

Must include timestamp, score, confidence, data health, factor evidence, reasons, blockers, source timestamps, and engine version. Compatibility labels may be emitted temporarily but cannot be decision inputs.

### AssetDecision

Must include symbol/timestamp/price, data health, canonical market regime, asset-quality and trade-timing dimensions, opportunity lifecycle, confidence, one setup plan, risk/reward, pre-risk decision, risk override, final standardized verdict, reasons, blockers, change-my-mind conditions, data sources, and engine version.

Standard final verdict vocabulary: `STRONG_BUY | BUY | WATCH | WAIT | HOLD | REDUCE | EXIT | AVOID`.

Opportunity lifecycle: `DORMANT | DEVELOPING | EMERGING | ACTIONABLE | CONFIRMED | EXTENDED | EXHAUSTED | INVALIDATED`.

## Migration plan and checklist

### P0

- [x] Audit current git state and initial decision/execution graph
- [x] Route principal server scanners/alerts through Opportunity Engine
- [x] Route Trade Desk/Discover/Smart Scan through server Opportunity Object
- [x] Prevent Autopilot 2.0 from relabeling WATCH/Light Box as executable
- [x] Implement and validate canonical `AssetDecision` (`src/asset-decision.js`, v1 contract; consumer migration continues)
- [x] Implement one canonical `MarketRegimeState` (`src/market-regime-engine.js`, compatibility adapter retained during migration)
- [x] Add one explicit final risk-override boundary (data/regime/event/setup blockers in `buildAssetDecision`)
- [~] Migrate all active execution paths to final `AssetDecision` (Alpaca and Tradier paper order boundaries now require canonical BUY-family decisions; remaining broker/job audit is in progress)
- [~] Verify paper/live isolation across every broker route and scheduled job (Alpaca is paper-only; Tradier remains sandbox by default and live mode is explicit, auth-gated, and no longer reachable from unsupported short signals)

### P1

- [~] Consolidate user-facing Autopilot state and scheduler ownership (all mutators are now reported by one authority contract; scheduler consolidation remains a shadow/migration task)
- [~] Expand Data Health from quote freshness to per-source health (canonical pipeline now reports price/macro/options/fundamentals/news/paper-broker source states; provider-specific timestamps remain to be wired where available)
- [x] Add deterministic why / why-not / change-my-mind fields
- [x] Finish Trade Desk canonical-state presentation

### P2

- [~] Cortex becomes a query/explanation layer over canonical state (Cortex tab, Smart Money, Telegram, and `run_scan` now consume canonical decisions; remaining explanation surfaces are being audited)
- [~] Future Wallet separates asset potential from current timing (API now labels `verdictType: FUTURE_POTENTIAL`; live entry verdict remains canonical pipeline data and is not fabricated)
- [~] Portfolio consumes canonical decisions and exposes factor/event concentration (open-position edge monitor now carries canonical `assetDecision`; factor/event aggregation remains)
- [~] Add real event-risk inputs and risk overrides where provider data exists (earnings DTE and explicit event records are supported; provider calendar wiring remains)
- [x] Upgrade decision timeline to record standardized verdict transitions and causes without unchanged duplicates

### P3

- [~] Publish Research/Market Wrap narrative state into canonical context (opportunities and trend-screen now carry the bounded adapter output; scheduled publication/provider coverage remains)
- [~] Standardize verdict/stage UI vocabulary and visual treatment (Trade Desk canonical strip/evidence/tabs are complete; remaining legacy surfaces still require cleanup)
- [ ] Remove verified dead engines, fallbacks, routes, prompts, imports, and duplicate requests (2026-09-06: 10 plausible candidates checked, all genuinely live — see "2026-09-06 platform-consolidation pass" above; still open, real remaining candidates not yet found)
- [~] Complete dependency-flow and operational documentation (this file now also covers the 2026-09-06 pass; a full standalone ops doc is still open)

## Verification log

- Full `npm test`: passed (including canonical architecture, twin-sync, Autopilot 2.0, Light Box, and scanner-cache suites).
- `npm run build`: passed; current build has no duplicate-key warnings.
- `git diff --check`: passed.
- Route syntax checks passed after canonical-pipeline consolidation.
- Telegram/history syntax and forward-return regression tests passed after final-verdict migration.
- Full `npm test` passed after the latest UI, event-risk, timeline, and execution-authority changes.
- Client authority regression: Trade Desk, Discover, and Smart Scan cannot directly call `classifyCoreVerdict()` and must consume `.opportunity`.
- Canonical architecture unit tests cover regime vocabulary, stale required data, standardized decision/stage vocabularies, and risk overrides.
- `/api/market/opportunities` now publishes canonical `marketRegime`, `dataHealth`, and a per-opportunity `assetDecision` while retaining compatibility fields.
- Autopilot 2.0's final order boundary now fails closed unless `assetDecision.verdict` is `STRONG_BUY` or `BUY`; a raw Core BUY alone is insufficient.

## Known constraints and risks

### Scheduler inventory (shadow migration)

The following autonomous loops remain intentionally active until deployment
shadowing and operational approval are complete:

- `ADOL22 Autopilot 2.0` — internal simulated paper account, canonical BUY gate.
- `SERVER_AUTOPILOT` — existing Alpaca paper mutator, environment-gated.
- `Light Box Confirm` — paper order-assist confirmation path.
- `Day-Trade Autopilot` — alert/analysis tick; not an order authority.

They must not be merged by simply deleting registrations. The safe migration
is to compare heartbeats, candidate sets, risk decisions, and order intents in
shadow mode, then retire one mutator only after no active dependency remains.

- The client/server ESM/CommonJS twins remain because of the current build architecture. They may continue as feature calculators during migration, but must not independently finalize decisions.
- Some tactical MTF detail currently exists only in the client while the bulk server Opportunity Object is daily-scan based. Do not silently claim those inputs affected the canonical final verdict until they are moved server-side.
- Short-side scoring exists but has documented risk-model gaps. Do not enable live short execution as part of vocabulary normalization.
- Compatibility fields must remain until every active caller is traced and migrated.
- Scheduler consolidation is high risk because three autonomous trading paths exist. Migrate and shadow-test before disabling any job.
- The remaining scheduler paths are intentionally retained for now: Server Autopilot and Light Box Assist are paper mutators; the Day-Trade Autopilot tick is alert-only. Removing or merging scheduler registrations requires deployment shadowing and operational approval.

## Safe rollback procedure

1. Set `SERVER_AUTOPILOT=off` and set the persisted Light Box mode to `OFF` through `/api/autopilot/mode`; this stops new automated entries while leaving exits/flatten controls available.
2. Keep the emergency stop armed if any unexpected order or decision is observed.
3. Revert the deployment to the previous commit; do not delete persisted stores (`data/autopilot-risk-state.json`, opportunity timelines, or journals).
4. Verify `/api/health` reports `paperOnly: true`, no active mutator, and the expected build identifier before re-enabling paper automation.
5. Re-run `npm test` and `npm run build` before restoring any scheduler flag.
