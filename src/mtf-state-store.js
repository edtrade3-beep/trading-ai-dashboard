// mtf-state-store.js — persisted, server-authoritative state for the MTF
// Decision System's 8-state machine (WATCH/EARLY/START/ADD/HOLD/
// EXIT_WARNING/REDUCE/EXIT). Structurally the direct sibling of
// lightbox-state-store.js — same real symbol-keyed persisted-diff +
// multi-tick confirmation pattern, extended for the richer state set (see
// src/mtf-decision-engine.js's own header for what's genuinely new vs.
// reused). Confirmation must be computed once, here, server-side — not
// per HTTP request and not client-side — for the same reason
// lightbox-state-store.js's header gives: two open tabs/devices running
// their own poll-driven counters could show the same symbol in two
// different confirmed states at the same moment.
"use strict";

const path = require("node:path");
const { ROOT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { loadWatchlist } = require("./routes/watchlist");
const { computeSniperDecision } = require("./sniper-decision");
// cortex-decision.js — the already-proven CommonJS twin of
// axiom-runner/components/cortex-engine.js (same dual-port convention
// sniper-decision.js uses), not a new shim. Same real functions
// aplus-score-history.js's own daily snapshot job already uses this way.
const { computeHeatRisk } = require("./cortex-decision");
const { computeRegime, computeAPlusScore } = require("./trade-planner-scoring");
const { deriveCandidateState, stepMtfState, GATE_DEFAULTS } = require("./mtf-decision-engine");
const { computeSwingSetup } = require("./mtf-swing-engine");
const { computeEarlyDevelopment } = require("./mtf-early-engine");
const { computeAtrRiskLevels, computeAntiChase } = require("./atr-risk-engine");
const { recordEvent } = require("./mtf-outcome-tracker");

const STORE_PATH = path.join(ROOT, "data", "mtf-state.json");
const DEFAULTS = { confirmBars: 2, confirmBarsMin: 1, confirmBarsMax: 10, maxTransitions: 200 };
const MAX_SCAN_SYMBOLS = 25; // each symbol costs 3 real fetches (trend-screen row + 4H bars + 1H bars) — a real, meaningfully bigger per-symbol cost than Light Box's single day-trade-scan row, so this rotates through a smaller slice per tick

function loadState() {
  const s = readJsonSafe(STORE_PATH, {});
  return {
    config: { confirmBars: DEFAULTS.confirmBars, ...(s.config || {}) },
    bySymbol: s.bySymbol || {},
    transitions: Array.isArray(s.transitions) ? s.transitions : [],
    scanOffset: Number(s.scanOffset) || 0,
    updatedAt: s.updatedAt || null,
  };
}
function saveState(s) { writeJsonAtomic(STORE_PATH, s); }

function getMtfState() { return loadState(); }

function setConfirmBars(n) {
  const clamped = Math.max(DEFAULTS.confirmBarsMin, Math.min(DEFAULTS.confirmBarsMax, Math.round(Number(n))));
  if (!Number.isFinite(clamped)) return loadState().config.confirmBars;
  const state = loadState();
  state.config.confirmBars = clamped;
  saveState(state);
  return clamped;
}

function rotateSlice(arr, offset, count) {
  if (arr.length <= count) return arr;
  const out = [];
  for (let i = 0; i < count; i++) out.push(arr[(offset + i) % arr.length]);
  return out;
}

async function tickMtfStates() {
  const { symbols: allSymbols } = loadWatchlist();
  if (!Array.isArray(allSymbols) || !allSymbols.length) return { ok: true, checked: 0 };

  const state = loadState();
  const confirmBars = state.config.confirmBars || DEFAULTS.confirmBars;
  const symbols = rotateSlice(allSymbols, state.scanOffset, MAX_SCAN_SYMBOLS);
  const nextOffset = allSymbols.length ? (state.scanOffset + MAX_SCAN_SYMBOLS) % allSymbols.length : 0;

  // Lazy requires (not top-level) — src/routes/market.js's route handler
  // lazily requires this file too, same circular-require avoidance
  // lightbox-state-store.js's own tick already documents and uses.
  const { screenTrendTemplate, fetchMarketQuotes } = require("./routes/market");
  const { fetchYahooCandlesWithIndicators } = require("./providers/yahoo");

  const generatedAt = new Date().toISOString();
  const nextBySymbol = { ...state.bySymbol };
  const newTransitions = [];
  const alertEvents = [];

  let trendRows = [];
  try { trendRows = await screenTrendTemplate(symbols, {}); } catch { trendRows = []; }
  const trendBySymbol = new Map(trendRows.filter((r) => !r.error).map((r) => [r.symbol, r]));
  let regime = {};
  try {
    const macroRows = await fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams()));
    regime = computeRegime(Array.isArray(macroRows) ? macroRows : []);
  } catch {}

  for (const symbol of symbols) {
    const row = trendBySymbol.get(symbol);
    if (!row) continue;
    try {
      const [r4h, r1h] = await Promise.all([
        fetchYahooCandlesWithIndicators(symbol, "4H").catch(() => null),
        fetchYahooCandlesWithIndicators(symbol, "1H").catch(() => null),
      ]);
      const swing = r4h ? computeSwingSetup(r4h.bars) : { state: null };
      const early = r1h ? computeEarlyDevelopment({ bars: r1h.bars, indicators: r1h.indicators }) : { score: null };
      const sniper = computeSniperDecision(row);
      const heat = computeHeatRisk(row, sniper);
      const aplus = computeAPlusScore(row, regime || {});
      const dailyBias = (String(row.stage || "").includes("2") && Number(row.passCount || 0) >= 6) ? "BULLISH"
        : String(row.stage || "").includes("4") ? "BEARISH" : "NEUTRAL";
      // Real ATR-based levels (Phase 4) off the same 4H bars already
      // fetched above — zero extra request. Additional lens alongside
      // Sniper's own structural stop, not a replacement for it.
      const currentPrice4h = r4h?.bars?.length ? r4h.bars[r4h.bars.length - 1].close : null;
      const atrLevels = r4h ? computeAtrRiskLevels(r4h.bars, currentPrice4h) : { dataInsufficient: true };
      const antiChase = computeAntiChase(Number(row.abovePivotPct));

      const prev = state.bySymbol[symbol];
      const ev = {
        quality: aplus.score, swingState: swing.state, earlyScore: early.score,
        entryAction: sniper.action, exitRiskState: heat.state, dailyBias,
        rsRating: row.rsRating, rr: sniper.rr, everStarted: !!prev?.everStarted,
      };
      const { state: candidate, gate } = deriveCandidateState(ev, GATE_DEFAULTS);
      const stepped = stepMtfState(prev, candidate, generatedAt, confirmBars);
      nextBySymbol[symbol] = { ...stepped, ev, gate, sniperReason: sniper.reason, sniperWaitingFor: sniper.waitingFor, heatReason: heat.reason, atrLevels, antiChase, updatedAt: generatedAt };

      if (prev && stepped.confirmed !== prev.confirmed) {
        newTransitions.push({ ts: generatedAt, symbol, from: prev.confirmed, to: stepped.confirmed, quality: aplus.score });
        alertEvents.push({
          symbol, from: prev.confirmed, to: stepped.confirmed, price: row.price,
          quality: aplus.score, reason: sniper.reason, waitingFor: sniper.waitingFor, heatReason: heat.reason,
        });
        // Trade Outcome Feedback Engine (Phase 7) — real EARLY/START
        // confirmations logged here; trackOutcomes() (its own background
        // job) fills in real forward MFE/MAE/returns once real time
        // actually passes. Best-effort — a logging failure never blocks
        // the state machine tick that already succeeded.
        try { recordEvent({ symbol, toState: stepped.confirmed, price: row.price, ev, gate, atrLevels, antiChase }); } catch {}
      }
    } catch { /* one symbol's real fetch failure never blocks the rest of the tick */ }
  }

  const transitions = [...newTransitions, ...state.transitions].slice(0, DEFAULTS.maxTransitions);
  saveState({ config: state.config, bySymbol: nextBySymbol, transitions, scanOffset: nextOffset, updatedAt: generatedAt });

  // Alerts (Phase 6, 2026-08-20) — real transitions this tick actually
  // confirmed, routed through the same digest-vs-immediate split every
  // other real alert job here already uses (per alert-buffer.js's own
  // header): EARLY/START/ADD are opportunity signals, batched into the
  // once-daily digest; EXIT_WARNING/REDUCE/EXIT are worth surfacing
  // immediately, same reasoning position-reversal-alerts.js's own header
  // gives for never batching a real risk-deterioration signal. Worded as
  // "this tracked setup," not "your position" — this system doesn't
  // place real orders, so it has no way to know whether the user actually
  // acted on an earlier START/ADD; overclaiming held-capital risk here
  // would be dishonest.
  try {
    const opportunityLines = alertEvents
      .filter((e) => ["EARLY", "START", "ADD"].includes(e.to))
      .map((e) => `${e.to === "START" ? "🟢" : e.to === "ADD" ? "🔵" : "🟡"} ${e.symbol} → ${e.to} — ${e.reason || e.waitingFor || "state confirmed"}${e.price ? ` (at $${Number(e.price).toFixed(2)})` : ""}`);
    if (opportunityLines.length) {
      const { pushDigestLines } = require("./alert-buffer");
      pushDigestLines("opportunity", "🎯 MTF DECISION — NEW SETUPS", opportunityLines);
    }
    const riskEvents = alertEvents.filter((e) => ["EXIT_WARNING", "REDUCE", "EXIT"].includes(e.to));
    if (riskEvents.length) {
      const { sendTelegramMessage, isConfigured } = require("./telegram");
      if (isConfigured()) {
        for (const e of riskEvents) {
          const icon = e.to === "EXIT" ? "🔴" : e.to === "REDUCE" ? "🟠" : "🟡";
          const text = [
            `${icon} ${e.symbol} — tracked setup now reads ${e.to}`,
            e.heatReason ? `Reason: ${e.heatReason}` : null,
            e.price ? `Price: $${Number(e.price).toFixed(2)}` : null,
            "(This reflects the MTF Decision System's own confirmed lifecycle for this setup — check your actual broker position separately.)",
          ].filter(Boolean).join("\n");
          await sendTelegramMessage(text).catch(() => {});
        }
      }
    }
  } catch { /* alerts are best-effort — the real state machine tick above already succeeded regardless */ }

  return { ok: true, checked: symbols.length, watchlistSize: allSymbols.length, newTransitions: newTransitions.length };
}

module.exports = { getMtfState, setConfirmBars, tickMtfStates };
