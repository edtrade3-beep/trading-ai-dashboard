# AM Trading Platform — Architecture Overview

This is a readable snapshot of the platform's architecture. It summarizes
`docs/ARCHITECTURE_MIGRATION.md` (the live, detailed audit ledger — read
that file before any migration/audit work) plus features added after the
last migration pass. For open work items and constraints, see that file's
own "Migration plan and checklist" and "Known constraints" sections.

**Scale**: 264 engine/service modules (`src/*.js`), 49 HTTP routes
(`src/routes/*.js`), 143 test files. Single Node.js/CommonJS backend,
React/JSX frontend bundled via esbuild, Postgres-backed persistence,
deployed on Render (auto-deploys from `git push` to `main`).

## 1. The canonical decision spine

Every trading decision flows through one pipeline — no exceptions, no
competing verdict:

```
provider fetches -> normalized scanner row -> data-health-engine
  -> market-regime-engine -> opportunity-engine -> asset-decision (risk override)
  -> AssetDecision -> UI / execution / alerts
```

| Stage | Owner |
|---|---|
| Market regime | `market-regime-engine.js` — `RISK_ON \| SELECTIVE_RISK_ON \| NEUTRAL \| RISK_OFF \| CRISIS` |
| Opportunity assembly | `opportunity-engine.js` (uses `am-core-engine.js`, `entry-engine.js`, `red-flag-engine.js`, `setup-evidence.js`) |
| Final decision + risk override | `asset-decision.js` |
| Data freshness gate | `data-health-engine.js` |
| Event blocking | `event-risk-engine.js` |
| Broker mutator ownership | `execution-authority.js` |

Everything else — Cortex, Sniper, MTF, Smart Money, Future Wallet,
institutional score — is evidence, never a competing verdict. Every UI
surface reads `assetDecision.verdict` / `.opportunityStage`, never
re-derives its own.

Standard final verdict vocabulary:
`STRONG_BUY | BUY | WATCH | WAIT | HOLD | REDUCE | EXIT | AVOID`

Opportunity lifecycle:
`DORMANT | DEVELOPING | EMERGING | ACTIONABLE | CONFIRMED | EXTENDED | EXHAUSTED | INVALIDATED`

**Added on top of the base pipeline** (2026-09):
- Trade Score / Data Quality / Model Confidence / Probability separation (`asset-decision.js`)
- Red-Team review — real contradiction detection against a decision, never a fabricated attack (`red-team-engine.js`)
- Portfolio Shock Test — correlation-derived, explicitly-labeled modeled stress estimate (`portfolio-shock-engine.js`)

## 2. Execution authority — who's allowed to touch money

Five real autonomous mutators/schedulers, all paper-only, all reported
through one contract (`execution-authority.js` → `/api/health`):

- `ADOL22 Autopilot 2.0` — 5-min tick, simulated paper account (`autopilot2-engine.js`)
- `SERVER_AUTOPILOT` — Alpaca paper mutator
- `Light Box Confirm` — paper order-assist confirmation path
- `Day-Trade Autopilot` — alert/analysis tick only, not an order authority
- `Tradier Autoexec` — legacy; fails closed while Server Autopilot is active

None can place an order without a canonical `STRONG_BUY`/`BUY` — a raw
composite score alone is insufficient. **Scheduler consolidation
(fewer mutators) is intentionally deferred** — flagged high-risk,
requires deployment shadowing before any registration is removed.

Both real Alpaca execution paths (`server-autopilot.js`,
`lightbox-autopilot-execute.js`) also pass through one consolidated
**account-level gate** (`autopilot-risk-gate.js`'s `evaluateAccountGate()`)
before ever looking at a candidate symbol — this is where **portfolio
event concentration** (`portfolio-event-concentration.js`, added
2026-09-14) is enforced: a HIGH cluster (e.g. 4+ held positions all
reporting earnings within the same 7-day window) really blocks new
entries for that cycle; MODERATE is advisory-only (a sizing hint, never
a hard block). It never sells or closes a position itself.

## 3. Master Agent (chat layer, built 2026-09-11/12)

A deterministic-first chat surface, reachable from both the web
dashboard (`TradingCopilot.jsx`) and Telegram (`telegram-bot.js`), that
answers real questions from real platform data. **Zero Claude/Anthropic
calls** — explicit scoping decision: Anthropic is used for Story AI only.

Real triggers (English + Arabic, matching phrasing on both channels):
- Morning Mode (`morning-mode-engine.js`) — full daily report
- Deep Scan (`deep-scan-engine.js`) — full market-wide opportunity detail
- Market Narrative (`market-narrative-engine.js`) — regime stance + why,
  real major-news feed, real economic-calendar releases, movers with
  catalysts, trade ideas (entry/stop/target), ET timestamp
- Weather (`weather-engine.js`) — real Open-Meteo data for a fixed real location
- Prayer time / next prayer / full timetable / Hijri+Gregorian date
  (`prayer-times.js`, `prayer-query-engine.js`)
- Morning/evening azkar (`azkar-content.js`) — static, hand-verified religious text
- Portfolio Shock Test
- "salam" greeting (exact reply, both channels)

Telegram bot: 100+ commands, real inline-keyboard interactivity (the
`/tasbeeh` counter uses `callback_query` + `editMessageText`), BotFather
menu auto-registered on boot.

A **bare-word/ticker collision** was found and fixed here — plain
command words ("weather", "date", "prayer") also look like valid bare
stock tickers to the bot's dispatcher; `BARE_WORD_COMMAND_ALIASES` now
intercepts the known real command words before the ticker heuristic.

## 4. Story AI (the one real Anthropic consumer)

A full Claude-driven short-video generation pipeline:

```
Story -> Humanize -> Verify -> AI Critic -> Scenes -> Music Director
  -> Images -> Voice (SSML pauses) -> Subtitles -> FFmpeg assembly -> Quality gate
```

- **AI Story Critic** (`story-ai-critic-agent.js`) — real adversarial
  second pass; only revises when it finds a genuine weakness, never a
  cosmetic rewrite.
- **AI Background Music Director** (`story-ai-music-director-agent.js`,
  `story-ai-music-provider.js`) — real scene-by-scene mood/intensity/
  silence plan; real ffmpeg `sidechaincompress` ducking keyed off actual
  narration; honestly `NOT_CONFIGURED` when no real music library is set
  (no fabricated "copyright-free" source).
- Every provider (image/TTS/music) follows the same contract:
  `isConfigured()` real check, honest `NOT_CONFIGURED` state, never a
  faked/simulated result.

## 4b. Astra + Claude dev-task queue (built 2026-09-13)

A second, deliberately separate multi-agent system for building the
platform itself — not for trading. Reachable only through explicit
`/astra` and `/claude` Telegram commands (reuses the existing bot, no
second polling process); the Master Agent's own dispatch path (section 3)
is untouched and still makes zero incremental Claude calls.

```
Telegram (/astra <task>) -> agent-router.js (deterministic classify)
  -> astra-agent.js (real Claude call: plans the task)
  -> data/agent-state.json (the ONE shared project state)
  -> scripts/agent-worker.js (human/Claude session picks up "planned" tasks)
  -> astra-agent.js (real Claude call: reviews the completed work)
```

- **Astra** (`src/astra-agent.js`) — lead architect/auditor/planner/QA
  reviewer. Text-only: produces a plan or a review, never edits a file,
  runs a shell command, or touches execution-authority. Falls back to an
  honest offline plan/review (never fabricated) when not configured.
  **Cost safeguard (2026-09-13, explicit user request: "i dont want to use
  money for ai agent")** — gated by TWO independent checks, both required:
  a real `ANTHROPIC_API_KEY` AND `ASTRA_ENABLED=true`. The second defaults
  OFF even when the key is already set for Story AI/the web Copilot, so
  Astra spends nothing until explicitly turned on in Render's env vars.
- **Claude** — the implementer. Deliberately a **task queue, not a live
  bridge**: nothing in this repo invokes Claude Code unattended. A human
  (or an interactive Claude Code session) runs `node scripts/agent-worker.js
  <list|next|start|complete|status>` to pick up a planned task and mark it
  done; that triggers Astra's review automatically. This is the explicit
  scoping decision behind "Do not deploy destructive changes without
  safeguards" — real code changes always require a human in the loop.
- **Market Agents** (`src/market-agent.js`) — read-only research only. It
  imports only `getScannerStatus` from `market-scanner.js`; no
  order-placement or account-mutating module is reachable from this file,
  so it has no structural path to real money, consistent with section 2's
  execution-authority boundary.
- **Router** (`src/agent-router.js`) — deterministic keyword classifier
  (`astra_plan` / `market_research` / `router_status`); never calls Claude
  itself, so routing costs nothing. Owns every write to the shared state.
- **Shared project state** (`src/agent-state-store.js` ->
  `data/agent-state.json`, Postgres-backed via atomic-write.js when
  `DATABASE_URL` is set) — the one state object every agent above reads and
  writes: task queue (`queued -> planned -> in_progress -> review -> done`)
  plus each agent's last-action snapshot. `/astra status` and `/claude
  status` in Telegram both read straight from it.

## 5. Islamic tools

Two separate real surfaces sharing the same underlying real data:
- **Web** — "Islamic" tab (`IslamicTab.jsx`): Tasbeeh counter (localStorage-persisted,
  per-phrase editable goal), Prayer Tracker, Qibla Compass, Zakat Calculator, Athkar.
- **Telegram** — native commands: `/prayer`, `/prayertimes`, `/date`,
  `/morningduaa`, `/eveningduaa`, `/tasbeeh` (interactive counter with a
  real "Tasbeeh 100" auto-advancing combo mode).

## Known open gaps (from the migration ledger — not fixed)

- Scheduler consolidation (5 mutators → fewer) — deferred pending shadow testing
- Event-risk covers earnings DTE only; macro calendar (CPI/FOMC/jobs) isn't wired into risk overrides yet
- Short-side scoring has documented risk-model gaps — no live short execution
- Options-flow and research-market-wrap data sources report availability only, no staleness tracking

## Where to look next

- Full audit trail / in-progress work: `docs/ARCHITECTURE_MIGRATION.md`
- Rollback procedure: same file, "Safe rollback procedure" section
- Every new engine this session followed the same discipline: real data
  only, an honest `NOT_CONFIGURED`/empty state over a fabricated one, and
  a real test file per new module.
