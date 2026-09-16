"use strict";
// top50-telegram-alerts.js (2026-09-16, "Build Telegram Alerts for the AI
// Top 50 Scanner" master prompt) — fires Telegram alerts only on real,
// meaningful state transitions in the Top 50 scan (src/top50-scanner.js),
// same "diff canonical scan against last-known state" template
// opportunity-pivot-alerts.js already established (real state file, real
// transition predicates, first-seen-per-symbol seeds silently). Reuses
// telegram.js's real send + telegram-bot.js's real daily
// priority-budget/quiet-hours gate — never a second Telegram client.
//
// SCOPE, disclosed rather than silently narrowed: this job covers LONG
// setups only. computeAllOpportunities()'s tier/stage vocabulary
// (ACTIONABLE/DEVELOPING/WAIT/EXTENDED/INVALIDATED) is fundamentally
// long-oriented — a bearish symbol reads as WAIT/EXTENDED, never a real
// "SHORT READY" state — and this platform already has a real, separate,
// established bearish alert system (bearish-setups-alerts.js, its own
// real /api/market/trade-signals engine, already sending real short-setup
// Telegram alerts). Building a second, parallel bearish tier/execution-
// status system here — rather than reusing that one — would risk creating
// exactly the kind of competing classification this codebase's own "one
// engine" discipline exists to prevent. computeTop50Score's own direction
// auto-detection is still real and still used below for the "bullish ->
// bearish" DIRECTION-FLIP alert specifically (a real math signal, not a
// tier), without inventing a bearish execution-status ladder.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { isConfigured: telegramConfigured, sendTelegramMessage } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { isMarketHoursET } = require("./risk-guardrails");
const { scanTop50 } = require("./top50-scanner");

const STORE_PATH = path.join(ROOT, "data", "top50-alert-state.json");
function loadState() { return readJsonSafe(STORE_PATH, {}); }
function saveState(s) { writeJsonAtomic(STORE_PATH, s); }

// 30-minute cooldown (the prompt's own suggested figure) — a real safety
// net against the SAME transition type re-firing for the SAME symbol due
// to noisy data flapping (e.g. tier flickers WAIT->READY->WAIT->READY
// within minutes); in normal operation the transition-diff below already
// prevents duplicate alerts, this is a second, independent guard. Skipped
// entirely for the prompt's own explicit "allow immediate re-alert" list.
const COOLDOWN_MS = 30 * 60_000;
const IMMEDIATE_TYPES = new Set(["READY", "ENTRY", "STOP", "TARGET", "INVALIDATION_LEVEL", "DIRECTION_FLIP", "SCORE_JUMP"]);

function fmt(v) { return Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—"; }
function check(ok) { return ok ? "✅" : "⚠️"; }

function buildAlertMessage(row, kind, marketRegime) {
  const emoji = row.direction === "SHORT" ? "🔴 SHORT SETUP" : "🟢 LONG SETUP";
  const lines = [
    "🚨 AI TRADE ALERT", "", row.symbol, "", emoji,
    `Opportunity Score: ${row.top50Score}/100`, `Status: ${row.executionStatus}`, "",
    `Price: ${fmt(row.price)}`, `VWAP: ${fmt(row.vwap)}`,
    Number.isFinite(row.vwap) && row.vwap > 0 ? `Distance from VWAP: ${(((row.price - row.vwap) / row.vwap) * 100).toFixed(2)}%` : null,
    "",
    `EMA Structure: ${row.breakdown.trend >= 15 ? "Bullish" : "Weak"} ${check(row.breakdown.trend >= 15)}`,
    `MACD: ${row.breakdown.macd >= 10 ? (row.direction === "SHORT" ? "Bearish" : "Bullish") : "Weak"} ${check(row.breakdown.macd >= 10)}`,
    `RSI: ${row.rsi ?? "—"} ${check(row.breakdown.rsi >= 8)}`,
    `RVOL: ${Number.isFinite(row.rvol) ? `${row.rvol.toFixed(2)}x` : "—"} ${check(row.breakdown.rvol >= 8)}`,
    "", `Market Regime: ${marketRegime?.regime || marketRegime?.label || "—"}`, "",
    "AI VERDICT:", row.executionStatus === "READY" ? "ENTER — CONFIRMED" : row.executionStatus === "WATCH" ? "GOOD OPPORTUNITY, BAD ENTRY — TOO EXTENDED" : "WAIT FOR CONFIRMATION",
    "",
    `Preferred Entry: ${fmt(row.executableEntry ?? row.entry)}`, `Stop: ${fmt(row.stop)}`, `Target 1: ${fmt(row.target)}`,
    "", "Invalidation:", `Break below ${fmt(row.invalidation)}`,
    "", `Time: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })} ET`,
  ].filter((l) => l !== null);
  return lines.join("\n");
}

// Real transition predicates — every one is a pure diff of THIS run's
// real row against the PREVIOUS run's persisted state for the same
// symbol. First-seen-per-symbol (prevState == null) never fires anything
// — same "seed silently, don't flood on cold start" discipline as
// opportunity-pivot-alerts.js/watchlist-setup-alerts.js.
function detectTransitions(prevState, row) {
  if (!prevState) return [];
  const events = [];
  if (prevState.executionStatus !== "READY" && row.executionStatus === "READY") events.push("READY");
  if (prevState.top50Score < 80 && row.top50Score >= 80) events.push("SCORE_80");
  if (prevState.top50Score < 90 && row.top50Score >= 90) events.push("SCORE_90");
  if (row.top50Score - prevState.top50Score >= 15) events.push("SCORE_JUMP");
  if (prevState.direction && prevState.direction !== row.direction) events.push("DIRECTION_FLIP");
  const price = row.price;
  const entryLevel = row.executableEntry ?? row.entry;
  const isShort = row.direction === "SHORT";
  if (!prevState.entryTriggered && Number.isFinite(entryLevel) && Number.isFinite(price) && (isShort ? price <= entryLevel : price >= entryLevel)) events.push("ENTRY");
  if (!prevState.stopTriggered && Number.isFinite(row.stop) && Number.isFinite(price) && (isShort ? price >= row.stop : price <= row.stop)) events.push("STOP");
  if (!prevState.targetTriggered && Number.isFinite(row.target) && Number.isFinite(price) && (isShort ? price <= row.target : price >= row.target)) events.push("TARGET");
  if (!prevState.invalidationTriggered && Number.isFinite(row.invalidation) && Number.isFinite(price) && (isShort ? price >= row.invalidation : price <= row.invalidation)) events.push("INVALIDATION_LEVEL");
  return events;
}

async function checkTop50TelegramAlerts() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };

  const { symbols, invalidatedSymbols, marketRegime } = await scanTop50().catch(() => ({ symbols: [], invalidatedSymbols: [], marketRegime: null }));
  const prev = loadState();
  const next = {};
  const sent = [];

  // "Setup invalidated" — a symbol scanTop50() was already tracking
  // (real prior state exists) that has now genuinely dropped into the
  // real INVALIDATED tier drops entirely out of the ranked Top 50 output,
  // so the per-row loop below would never see it. Checked first, against
  // the real invalidatedSymbols list computeAllOpportunities() already
  // classified this same run — not a second classification.
  const invalidatedSet = new Set(invalidatedSymbols || []);
  for (const symbol of invalidatedSet) {
    const prevState = prev[symbol];
    if (!prevState) continue; // never tracked -> nothing real to invalidate, no alert
    if (prevState.invalidationAlertSent) { next[symbol] = prevState; continue; } // already alerted, carry state forward so it doesn't re-fire
    if (!shouldSendAlert({ category: "top50-scanner" })) { next[symbol] = prevState; continue; }
    await sendTelegramMessage(`⚠️ ${symbol} — setup invalidated. Structure broken; no longer a real Top 50 candidate.`).catch(() => {});
    sent.push({ symbol, kind: "SETUP_INVALIDATED" });
    next[symbol] = { ...prevState, invalidationAlertSent: true };
  }

  for (const row of symbols) {
    const prevState = prev[row.symbol] || null;
    const events = detectTransitions(prevState, row);
    const now = Date.now();
    const lastAlertAt = prevState?.lastAlertAt || 0;
    const withinCooldown = now - lastAlertAt < COOLDOWN_MS;

    // Fire at most one message per symbol per run — the strongest real
    // event present, priority order matches the prompt's own listed
    // severity (a triggered level matters more than a score crossing).
    const priority = ["INVALIDATION_LEVEL", "STOP", "TARGET", "ENTRY", "READY", "DIRECTION_FLIP", "SCORE_90", "SCORE_80", "SCORE_JUMP"];
    const fireKind = priority.find((k) => events.includes(k));

    next[row.symbol] = {
      executionStatus: row.executionStatus, top50Score: row.top50Score, direction: row.direction, tier: row.tier,
      entryTriggered: prevState?.entryTriggered || events.includes("ENTRY"),
      stopTriggered: prevState?.stopTriggered || events.includes("STOP"),
      targetTriggered: prevState?.targetTriggered || events.includes("TARGET"),
      invalidationTriggered: prevState?.invalidationTriggered || events.includes("INVALIDATION_LEVEL"),
      lastAlertAt: prevState?.lastAlertAt || 0,
    };

    if (!fireKind) continue;
    // The prompt's own explicit exception list (READY/entry/stop/target/
    // invalidation/direction-change/major-score-jump) bypasses the
    // cooldown entirely; everything else (SCORE_80/SCORE_90) still
    // respects it — real protection against a score hovering right at a
    // threshold and crossing back and forth repeatedly.
    if (!IMMEDIATE_TYPES.has(fireKind) && withinCooldown) continue;
    // Reuses telegram-bot.js's EXISTING real alert-priority categories
    // (stop-trigger/target-hit/opportunity are already P1 there) for the
    // triggers that matter most, rather than lumping a real stop-loss hit
    // under the same generic P3 budget as a routine score crossing.
    const category = fireKind === "STOP" ? "stop-trigger" : fireKind === "TARGET" ? "target-hit"
      : (fireKind === "READY" || fireKind === "ENTRY") ? "opportunity" : "top50-scanner";
    if (!shouldSendAlert({ category })) continue; // real daily priority-budget/quiet-hours gate — same one every other alert job already respects

    next[row.symbol].lastAlertAt = now;
    const message = buildAlertMessage(row, fireKind, marketRegime);
    await sendTelegramMessage(message).catch(() => {}); // a real Telegram failure must never break the scan/state-save below
    sent.push({ symbol: row.symbol, kind: fireKind });
  }

  saveState(next);
  return { ok: true, checked: symbols.length, sent };
}

// Morning summary — one Telegram message near market open with the real
// current Top 5 (the SAME real scanTop50() ranking, never a second list).
// Called on its own schedule (server.js), not gated by the transition
// logic above — this is a scheduled digest, not an event alert.
function buildMorningSummaryMessage(symbols, marketRegime) {
  const lines = [
    "🌅 AI TRADE DESK — MORNING TOP 5", "",
    ...symbols.map((r, i) => `${i + 1}. ${r.symbol} — ${r.top50Score} — ${r.direction === "SHORT" ? "SHORT" : "LONG"} — ${r.executionStatus}`),
    "", `Market Regime: ${marketRegime?.regime || marketRegime?.label || "—"}`,
  ];
  return lines.join("\n");
}

async function sendTop50MorningSummary() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  const { symbols, marketRegime } = await scanTop50({ limit: 5 }).catch(() => ({ symbols: [], marketRegime: null }));
  if (!symbols.length) return { ok: true, skipped: "no real candidates" };
  await sendTelegramMessage(buildMorningSummaryMessage(symbols, marketRegime)).catch(() => {});
  return { ok: true, sent: symbols.length };
}

module.exports = { checkTop50TelegramAlerts, sendTop50MorningSummary, detectTransitions, buildAlertMessage, buildMorningSummaryMessage, COOLDOWN_MS, STORE_PATH };
