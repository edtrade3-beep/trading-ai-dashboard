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
- Smart Money now publishes the canonical `assetDecision`/`finalVerdict` alongside its institutional/SMC evidence, making its decision boundary inspectable without replacing existing detail fields.
- Smart Money Decision Panel now renders that canonical final verdict and reason when available; legacy route labels remain compatibility-only.
- Cortex Stock tab's second verdict card is now explicitly labeled as the canonical decision track record, removing the implication that Cortex computes a separate final verdict.

## Target canonical contracts

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

- [ ] Cortex becomes a query/explanation layer over canonical state
- [~] Future Wallet separates asset potential from current timing (API now labels `verdictType: FUTURE_POTENTIAL`; live entry verdict remains canonical pipeline data and is not fabricated)
- [~] Portfolio consumes canonical decisions and exposes factor/event concentration (open-position edge monitor now carries canonical `assetDecision`; factor/event aggregation remains)
- [~] Add real event-risk inputs and risk overrides where provider data exists (earnings DTE and explicit event records are supported; provider calendar wiring remains)
- [x] Upgrade decision timeline to record standardized verdict transitions and causes without unchanged duplicates

### P3

- [ ] Publish Research/Market Wrap narrative state into canonical context
- [~] Standardize verdict/stage UI vocabulary and visual treatment (canonical data is now delivered to remaining trend-screen surfaces; local presentation cleanup remains)
- [ ] Remove verified dead engines, fallbacks, routes, prompts, imports, and duplicate requests
- [ ] Complete dependency-flow and operational documentation

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
