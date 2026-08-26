// lightbox-state-store.js — persisted, server-authoritative state for the
// Live Trade Light Box: one confirmed BUY/WAIT/SELL per watchlist symbol,
// plus a capped state-change transition log. Structurally the direct
// sibling of watchlist-daytrade-alerts.js (same real symbol-keyed
// persisted-diff pattern), but this is the first place in the app that
// tracks *multi-tick confirmation* rather than firing on a single-poll
// edge — see lightbox-engine.js's header comment for why.
//
// Confirmation must be computed once, here, server-side — not per HTTP
// request and not client-side. If debounce counters lived in the browser,
// two open tabs/devices could show the same symbol in two different states
// at the same moment (each running its own poll-driven counter). One
// authoritative background tick computes the real confirmed state; every
// client just reads it.
"use strict";

const path = require("node:path");
const { ROOT, PORT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { loadWatchlist } = require("./routes/watchlist");
const { computeDayTradeSignal } = require("./day-trade-calc");
const { getMinBuyScore } = require("./day-trade-signal-store");
const { stepSymbol, classifyLifecycle, applyWeakeningOverride } = require("./lightbox-engine");
const { LIGHTBOX_DEFAULTS, SIGNAL_TO_STATE } = require("./lightbox-config");
const { getEdgeVelocityFor, recordQualitySnapshots } = require("./lightbox-timeline-store");
const { recordEvent: recordOutcomeEvent, winRateFor, HORIZONS: OUTCOME_HORIZONS } = require("./lightbox-outcome-tracker");
const { computeDayTradeEV, computeDayTradeChase, computeOpportunityGap, computeDayTradeRedFlags, computeAttentionScore } = require("./lightbox-intelligence");
const { withTimeout } = require("./utils");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");

// Real Telegram delivery on a lifecycle transition (#11, Market
// Opportunity Intelligence Engine upgrade, 2026-08-26, spec: "Light Box
// should NOT constantly interrupt me... alert when something materially
// changes"). EARLY/DEVELOPING are deliberately excluded — they're by far
// the most frequent real transitions (every symbol passes through them
// on the way to anything else), so pushing on those would be exactly the
// "more alerts" noise the spec explicitly rules out; they stay visible
// in-app (the real lifecycle field on every row) without an external
// push. The other 5 states get a real, disclosed priority tag in the
// message text itself — a full graphical priority-tiered Notification
// Center is explicitly deferred (see the approved plan).
const TELEGRAM_WORTHY_LIFECYCLES = { QUALIFIED: "🟢 Level 2 — Watch", ACTIONABLE: "🚨 Level 4 — Urgent", "A+": "🔥 Level 5 — Critical", WEAKENING: "🟡 Level 3 — Important", INVALIDATED: "🔴 Level 3 — Important" };
// Real elapsed-time cooldown, same Map-based pattern price-alert-monitor.js/
// adol22-scanner.js already use — prevents a flapping symbol (bouncing
// QUALIFIED<->ACTIONABLE tick to tick) from spamming Telegram. In-memory
// (resets on a real server restart) — acceptable, a fresh restart
// re-establishing cooldowns from scratch is a real, honest, minor cost,
// not a correctness issue. 15 min matches Light Box's own real 15m
// primary timeframe — long enough to damp flapping, short enough that a
// genuinely new development still gets through same-session.
const TELEGRAM_COOLDOWN_MS = 15 * 60_000;
const lastTelegramSentAt = new Map();

async function sendLifecycleTelegram(symbol, lifecycle, dt) {
  if (!telegramConfigured()) return;
  const tag = TELEGRAM_WORTHY_LIFECYCLES[lifecycle];
  if (!tag) return;
  const last = lastTelegramSentAt.get(symbol) || 0;
  if (Date.now() - last < TELEGRAM_COOLDOWN_MS) return;
  lastTelegramSentAt.set(symbol, Date.now());
  const fmt = (v) => Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—";
  const lines = [
    `🚦 LIGHT BOX — ${symbol}`,
    `${tag}`,
    `${lifecycle} · ${dt.direction || "—"}`,
    `Entry ${fmt(dt.bestEntry)} · Stop ${fmt(dt.stop)} · Target ${fmt(dt.target)}`,
    `Quality ${dt.quality ?? "—"}/100 (${dt.grade || "—"}) · RVOL ${Number.isFinite(dt.rvol) ? dt.rvol.toFixed(1) + "x" : "—"}`,
    dt.signalReason ? `Why: ${dt.signalReason}` : null,
  ].filter(Boolean);
  await sendTelegramMessage(lines.join("\n")).catch(() => {});
}

// Same real self-loopback JSON-fetch convention routes/ai-hub.js and
// quick-trade-service.js already use for computeSymbolVsPositionsCorrelation
// — but THOSE call sites run inside a real HTTP route handler, naturally
// bounded by the calling client's own timeout/cancellation. This one runs
// inside a recurring BACKGROUND JOB (tickLightBox, every 5 real min) —
// an unbounded hang here would silently freeze the entire tick forever
// (setState never reached, the whole real symbol grid stops updating,
// with no thrown error for job-heartbeat.js to even record). Real,
// explicit 8s timeout, same withTimeout() utility every other real
// external fetch in this codebase already uses — honest null on timeout,
// never a fabricated response, and the tick keeps moving.
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(pathAndQuery) {
  try {
    const r = await withTimeout(fetch(`${BASE()}${pathAndQuery}`), 8000, null);
    if (!r) return null;
    return await withTimeout(r.json(), 8000, null);
  } catch { return null; }
}

const STORE_PATH = path.join(ROOT, "data", "lightbox-state.json");

function loadState() {
  const s = readJsonSafe(STORE_PATH, {});
  return {
    config: { confirmBars: LIGHTBOX_DEFAULTS.confirmBars, ...(s.config || {}) },
    bySymbol: s.bySymbol || {},
    transitions: Array.isArray(s.transitions) ? s.transitions : [],
    updatedAt: s.updatedAt || null,
  };
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

// Cheap read for the API route — never recomputes, just returns the last
// persisted result of the background tick below.
function getLightBoxState() {
  return loadState();
}

// User-configurable confirmation period ("Make the confirmation period
// configurable in Settings" — the spec's explicit requirement). Persisted
// here directly rather than folded into the app's broader client-side
// settings-sync system, since confirmation is computed by this background
// job, not per-request — the value has to live somewhere the job can read
// it regardless of whether any browser tab is even open.
function setConfirmBars(n) {
  const clamped = Math.max(LIGHTBOX_DEFAULTS.confirmBarsMin, Math.min(LIGHTBOX_DEFAULTS.confirmBarsMax, Math.round(Number(n))));
  if (!Number.isFinite(clamped)) return loadState().config.confirmBars;
  const state = loadState();
  state.config.confirmBars = clamped;
  saveState(state);
  return clamped;
}

// Light Box's own hours gate — explicit user request, 2026-08-19: "light
// box start at 4 am to 8pm" (the same real 4:00 AM-8:00 PM ET extended-
// session window this app already uses elsewhere, e.g.
// institutional-scoring.js's getMarketSessionET PREMARKET/AFTERMARKET
// boundaries — 240/1200 minutes, not new numbers). Deliberately a separate
// function from risk-guardrails.js's isMarketHoursET (9:35-15:55 ET) rather
// than widening that one: isMarketHoursET gates real order-placement safety
// checks in server-autopilot.js/quick-trade-service.js/routes/autoexec.js
// and 15+ other files — widening it to cover illiquid extended hours would
// be a real, unintended risk change to live trading logic, not just Light
// Box's display window.
function isLightBoxHoursET() {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); if (day < 1 || day > 5) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 4 * 60 && mins <= 20 * 60;   // 4:00 AM - 8:00 PM ET
}

// The real background tick — fetches real day-trade-scan rows for the real
// watchlist, steps each symbol's confirmation state, persists any real
// transitions. Gated to Light Box's own extended-hours window above — real
// honest caveat, not silently glossed over: Day Trade Mode's VWAP/opening-
// range/RVOL signal is a regular-session concept (opening range = the
// first 5-15 min after the real 9:30 open; VWAP accumulates from the real
// session start), so premarket/after-hours reads outside 9:35-15:55 ET are
// real, live data but computed against thinner, less representative volume
// — same underlying signal engine, not rebuilt for extended-hours
// semantics. Not the same gate watchlist-daytrade-alerts.js uses anymore.
// Real incident, 2026-08-17: this job originally scanned the FULL real
// watchlist (grown to 180 symbols the same day) every 60s — each tick is
// 2 Alpaca bars requests per symbol (fetchDayTradeScanRows), so a full
// pass burst ~360 real requests in well under a minute. That tripped
// Alpaca's rate limit (confirmed via a raw 429 "too many requests" from
// data.alpaca.markets) and stalled Day Trade Mode/Light Box for the whole
// app, not just this job. Capped here — not just a slower interval —
// because the burst-per-tick size was the real problem; a slower interval
// alone still bursts the same request count each time it fires.
// Raised 50 -> 80 (2026-08-19, real user report: with today's real
// watchlist at 73 symbols, the rotation below meant any single symbol only
// refreshed once every 2 ticks — up to 10 minutes stale — even though the
// client polls every 25s and looked live. 80 symbols/tick = ~160 requests
// per 5-minute tick (still one burst every 5 min, same interval as before,
// not touched), comfortably under the ~360-request burst that actually
// tripped the rate limit. If the real watchlist grows past 80, the
// rotation below still protects against a repeat of the 2026-08-17
// incident — it degrades to "some symbols take 2 ticks" again, not a
// renewed burst risk.
const MAX_SCAN_SYMBOLS = 80;

// Real follow-up, same day: capping to the first 50 watchlist symbols
// meant the other 130 (of 180) never got scanned at all — user reported
// only ~25-50 tickers ever showing up. Fix keeps the same per-tick burst
// size (still safe against the rate limit above) but rotates which slice
// of the watchlist gets scanned each tick, so the whole watchlist cycles
// through over a few ticks instead of the same head-of-list 50 forever.
// Offset persists in state.config so it survives restarts/redeploys.
function rotateSlice(arr, offset, count) {
  if (arr.length <= count) return arr;
  const out = [];
  for (let i = 0; i < count; i++) out.push(arr[(offset + i) % arr.length]);
  return out;
}

async function tickLightBox() {
  if (!isLightBoxHoursET()) return { ok: true, skipped: "outside Light Box hours (4 AM-8 PM ET)" };

  // Lazy require (not top-level) — src/routes/market.js's route handler
  // lazily requires this file too, so a top-level require here would form
  // a circular require. Same lazy-require pattern watchlist-daytrade-alerts.js
  // already uses for the exact same reason.
  let fetchDayTradeScanRows, fetchMarketQuotes, DAYTRADE_UNIVERSE;
  try {
    ({ fetchDayTradeScanRows, fetchMarketQuotes, DAYTRADE_UNIVERSE } = require("./routes/market"));
  } catch {
    return { ok: false, checked: 0 };
  }

  // Broader real universe (#10, Market Opportunity Intelligence Engine
  // upgrade, 2026-08-26, explicit spec: "broader market universe... more
  // opportunities without more noise"). Union of the user's real watchlist
  // and the SAME real DAYTRADE_UNIVERSE the /api/market/lightbox route's
  // own ?universe=full option already uses, deduped — MAX_SCAN_SYMBOLS
  // stays unchanged (80/tick), the same real rate-limit-safe rotation
  // discipline just cycles through a bigger real pool over more real
  // ticks instead of bursting more per tick. An empty watchlist no longer
  // means zero real coverage — DAYTRADE_UNIVERSE alone still gives real
  // signal.
  const { symbols: watchlistSymbols } = loadWatchlist();
  const allSymbols = [...new Set([...(watchlistSymbols || []), ...(DAYTRADE_UNIVERSE || [])])];
  if (!allSymbols.length) return { ok: true, checked: 0 };

  const state = loadState();
  const confirmBars = state.config.confirmBars || LIGHTBOX_DEFAULTS.confirmBars;
  const offset = Number(state.config.scanOffset) || 0;
  const symbols = rotateSlice(allSymbols, offset, MAX_SCAN_SYMBOLS);
  const nextOffset = allSymbols.length ? (offset + MAX_SCAN_SYMBOLS) % allSymbols.length : 0;

  const { etfOf } = require("./sector-theme-map");
  const { getTrendQuality } = require("./trend-quality-store");

  // Real QQQ/VIX + whichever real sector ETFs this tick's symbols actually
  // need, still ONE batched quote call (not per-symbol) — the same
  // rate-limit-safety discipline this job's own header comments already
  // document two real prior incidents about. Feeds Relative Strength
  // (vs QQQ + sector) and the Market dimension's real VIX read into
  // computeDayTradeSignal's optional `extra` param.
  const sectorEtfs = [...new Set(symbols.map((s) => etfOf(s)).filter(Boolean))];
  const keys = resolveProviderKeys(new URLSearchParams());
  const [scanResult, macroRows] = await Promise.all([
    fetchDayTradeScanRows(symbols).catch(() => ({ rows: [], generatedAt: null })),
    fetchMarketQuotes(["SPY", "QQQ", "^VIX", ...sectorEtfs], keys).catch(() => []),
  ]);
  const spyRow = (macroRows || []).find((m) => m.symbol === "SPY");
  const spyChg = Number(spyRow?.changesPercentage || 0);
  const qqqRow = (macroRows || []).find((m) => m.symbol === "QQQ");
  const qqqChg = qqqRow ? Number(qqqRow.changesPercentage || 0) : null;
  const sectorChgByEtf = new Map((macroRows || []).map((m) => [m.symbol, Number(m.changesPercentage || 0)]));
  const generatedAt = scanResult.generatedAt || new Date().toISOString();
  // Start from the previous map so a symbol whose real fetch failed this
  // tick (rate limit / transient timeout) keeps its last-known state
  // instead of dropping out of the grid.
  const nextBySymbol = { ...state.bySymbol };
  const newTransitions = [];
  const nowIso = new Date().toISOString();
  const qualitySnapshotBatch = [];

  // Real, configurable quality gate (2026-08-19, "Fix Trading Signal
  // Logic" spec) — same threshold every other real caller reads, so Light
  // Box's BUY/WAIT/SELL state stays consistent with Green Light's and the
  // Telegram alert's.
  const minBuyScore = getMinBuyScore();

  // Real global win rate for THIS tick's EV calc (Market Opportunity
  // Intelligence Engine upgrade, 2026-08-26) — computed ONCE per tick, not
  // per symbol: lightbox-outcome-tracker.js's real sample floor
  // (MIN_WIN_SAMPLE=10) is far more reachable pooled across every real
  // confirmed BUY/SELL this store has ever logged than per-individual-
  // symbol, same real reasoning institutional-scoring.js's winProbFor
  // already uses for its own broader buckets. Uses the longest real
  // horizon (a full regular session) to match Light Box's own real
  // "Flatten by 3:55 PM ET" same-day expectation.
  const primaryHorizon = OUTCOME_HORIZONS[OUTCOME_HORIZONS.length - 1];
  const { winRate } = winRateFor(primaryHorizon);

  for (const row of scanResult.rows || []) {
   try {
    const sectorEtf = etfOf(row.symbol);
    const tq = getTrendQuality(row.symbol);
    const extra = { qqqChg, sectorChg: sectorEtf ? sectorChgByEtf.get(sectorEtf) ?? null : null, trendLabel: tq.trendLabel, vcpVerdict: tq.vcpVerdict, minBuyScore };
    const dt = computeDayTradeSignal(row, spyChg, extra);
    if (!dt) continue;
    const symbol = dt.symbol;
    const prev = state.bySymbol[symbol];
    const stepped = stepSymbol(prev, dt.signal, generatedAt, confirmBars);

    // Edge Velocity (#4) — real same-day rate-of-change, read BEFORE this
    // tick's own new quality snapshot is recorded (batched below, after
    // this loop) so there's no leakage of this tick's own score into its
    // own velocity read — same real ordering discipline
    // routes/market.js's computeAllOpportunities already established.
    const edgeVelocity = getEdgeVelocityFor(symbol);

    // Lifecycle (#1) — real base state from confirmation/entry-trigger,
    // then the one real override (WEAKENING) edge velocity can trigger.
    const baseLifecycle = classifyLifecycle({
      confirmed: stepped.confirmed, pendingSignal: stepped.pendingSignal, pendingCount: stepped.pendingCount,
      entryTriggerStatus: dt.entryTriggerStatus, qualifiesAPlus: dt.qualifiesAPlus,
    });
    const lifecycle = applyWeakeningOverride(baseLifecycle, edgeVelocity.status);

    // Chase Engine (#6) + WHY NOW/NOT (#5) — real, reused engines.
    const chase = computeDayTradeChase(dt);
    const redFlags = computeDayTradeRedFlags(dt);

    // EV (#3) + Opportunity Gap (#7) — honest null whenever the real
    // pooled win rate hasn't reached MIN_WIN_SAMPLE yet.
    const ev = computeDayTradeEV({ winRate, entry: dt.bestEntry, stop: dt.stop, target: dt.target, direction: dt.direction });
    const opportunityGap = computeOpportunityGap({ winRate, dt });

    // Portfolio Awareness (#9) — real, but deliberately bounded: only
    // recomputed on a genuine NEW transition into ACTIONABLE/A+ (never on
    // every tick a symbol simply stays there), same "expensive real
    // fetch must be event-gated, not auto-polled every tick" discipline
    // already established for this exact real correlation check
    // elsewhere in the app. A symbol that stays ACTIONABLE/A+ carries its
    // prior real correlation read forward unchanged.
    const prevLifecycle = prev?.lifecycle;

    // Real Telegram delivery (#11) — fires exactly on a genuine lifecycle
    // transition (prev must be a real known state, never on first-seen —
    // same "no alert flood on first deploy/restart" discipline
    // opportunity-pivot-alerts.js's justBecameActionable already
    // established), gated to the worthy states + cooldown above.
    if (prevLifecycle && prevLifecycle !== lifecycle) {
      sendLifecycleTelegram(symbol, lifecycle, dt).catch(() => {});
    }

    const justBecameActionable = (lifecycle === "ACTIONABLE" || lifecycle === "A+") && prevLifecycle !== "ACTIONABLE" && prevLifecycle !== "A+";
    let correlation = prev?.correlation ?? null;
    if (justBecameActionable) {
      correlation = null; // reset while the real check below runs; honestly null if it fails rather than stale
      try {
        const posResp = await getJson("/api/alpaca/positions");
        const positions = posResp?.positions || [];
        if (positions.length) {
          const { computeSymbolVsPositionsCorrelation, correlationGateTripped } = require("./portfolio-correlation-calc");
          const acctResp = await getJson("/api/alpaca/account");
          const equity = Number(acctResp?.account?.equity) || 0;
          const result = await computeSymbolVsPositionsCorrelation(symbol, positions, getJson);
          const hit = correlationGateTripped({ correlations: result.correlations, equity });
          correlation = { highCorrelation: !!hit, top: result.correlations?.[0] || null };
        } else {
          correlation = { highCorrelation: false, top: null };
        }
      } catch { correlation = null; } // best-effort — never blocks the real tick
    }

    // Attention Score (#8) — real, disclosed ranking input.
    const attentionScore = computeAttentionScore({
      quality: dt.quality, entryTriggerStatus: dt.entryTriggerStatus, chaseBand: chase.band,
      edgeVelocityStatus: edgeVelocity.status, ev, highCorrelation: !!correlation?.highCorrelation,
    });

    nextBySymbol[symbol] = {
      ...stepped, raw: dt, updatedAt: nowIso,
      lifecycle, edgeVelocity, chase, redFlags, ev, opportunityGap, correlation, attentionScore,
    };
    qualitySnapshotBatch.push({ symbol, quality: dt.quality });

    if (prev && stepped.confirmed !== prev.confirmed) {
      const to = SIGNAL_TO_STATE[stepped.confirmed] || stepped.confirmed;
      newTransitions.push({
        ts: nowIso,
        symbol,
        from: SIGNAL_TO_STATE[prev.confirmed] || prev.confirmed,
        to,
        quality: dt.quality,
        lifecycle,
      });
      // Day-trade outcome tracking (#2) — real forward-tracking log,
      // fired exactly on the genuine transition (never re-logged while
      // the same confirmed state persists).
      try {
        recordOutcomeEvent({
          symbol, toState: to, price: dt.px, stop: dt.stop, target: dt.target,
          quality: dt.quality, grade: dt.grade, direction: dt.direction, rr: dt.rr, entryTriggerStatus: dt.entryTriggerStatus,
        });
      } catch { /* best-effort — a logging failure never blocks the real tick */ }
    }
   } catch (err) {
     // One real symbol's processing failure must never abort the whole
     // tick (same "one item's failure never blocks the rest" discipline
     // mtf-outcome-tracker.js's/lightbox-outcome-tracker.js's own
     // trackOutcomes() loops already use) — this symbol's entry simply
     // carries forward whatever was already in nextBySymbol (its prior
     // real state, from the `{...state.bySymbol}` seed above), never a
     // half-written/corrupt entry.
     console.error(`[Light Box] real per-symbol processing failed for ${row?.symbol}:`, err instanceof Error ? err.message : err);
   }
  }

  // Batch-record this tick's real quality snapshots for tomorrow... er,
  // the NEXT tick's edge-velocity read (same batching discipline
  // opportunity-timeline-store.js's own recordOpportunitySnapshots uses).
  try { recordQualitySnapshots(qualitySnapshotBatch); } catch { /* additive-only, never blocks the real tick */ }

  const transitions = [...newTransitions, ...state.transitions].slice(0, LIGHTBOX_DEFAULTS.maxTransitions);
  saveState({ config: { ...state.config, scanOffset: nextOffset }, bySymbol: nextBySymbol, transitions, updatedAt: nowIso });
  return { ok: true, checked: symbols.length, scannedThisTick: symbols, watchlistSize: allSymbols.length, newTransitions: newTransitions.length };
}

module.exports = { getLightBoxState, setConfirmBars, tickLightBox };
