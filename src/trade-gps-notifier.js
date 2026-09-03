"use strict";
// Trade GPS Stage 7 (2026-09-03) — notifications reuse the existing
// Telegram system end-to-end (telegram.js's own sendTelegramMessage,
// telegram-bot.js's own shouldSendAlert budget/cooldown gate) — no new
// delivery mechanism. Fires only on the spec's own "material state
// change" list, deduped both in-call (prevState !== newState) and against
// a real persisted last-notified-state map (survives a server restart),
// same pattern price-alert-monitor.js already uses for its own
// triggered/active dedup.
const path = require("path");
const { sendTelegramMessage } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { readJsonSafe, writeJsonAtomic } = require("./atomic-write");

const STATE_PATH = path.join(__dirname, "..", "data", "trade-gps-notify-state.json");

// The real state strings this fires on — signal-lifecycle.js's own
// SETUP_FORMING/ENTER_NOW/CANCELLED, position-decision-engine.js's own
// TRAIL/TAKE_PARTIAL/EXIT/HARD_EXIT, plus the synthetic
// DAILY_RISK_LOCKED the caller passes at Stage 1's own lock-trip point.
// Every other state (SCANNING/ARMED/HOLD/WARNING/null) is silently
// skipped — not every state change is material.
const MATERIAL_STATES = new Set([
  "SETUP_FORMING", "ENTER_NOW", "CANCELLED", "TRAIL", "TAKE_PARTIAL", "EXIT", "HARD_EXIT", "DAILY_RISK_LOCKED",
]);

// Only the genuinely time-critical states bypass the shared
// informational budget (spec: "ENTER_NOW/EXIT_NOW/DAILY_RISK_LOCKED
// only").
const ALWAYS_ALLOW_STATES = new Set(["ENTER_NOW", "EXIT", "HARD_EXIT", "DAILY_RISK_LOCKED"]);

function categoryFor(state) {
  return ALWAYS_ALLOW_STATES.has(state) ? "trade-gps-critical" : "trade-gps-info";
}

function fmtMoney(n) { return Number.isFinite(n) ? `$${n.toFixed(2)}` : null; }

function formatMessage({ symbol, newState, decision }) {
  const lines = [`Trade GPS — ${symbol}: ${newState}`];
  if (decision?.verdict) lines.push(`Verdict: ${decision.verdict}`);
  if (decision?.structure) lines.push(`Structure: ${decision.structure}`);
  const entry = fmtMoney(decision?.entry);
  if (entry) lines.push(`Entry: ${entry}`);
  const stop = fmtMoney(decision?.stop);
  if (stop) lines.push(`Stop: ${stop}`);
  if (Array.isArray(decision?.targets) && decision.targets.length) {
    lines.push(`Targets: ${decision.targets.filter(Number.isFinite).map((t) => `$${t.toFixed(2)}`).join(", ")}`);
  }
  if (Number.isFinite(decision?.size)) lines.push(`Size: ${decision.size}`);
  const maxLoss = fmtMoney(decision?.maxLoss);
  if (maxLoss) lines.push(`Max Loss: ${maxLoss}`);
  if (Number.isFinite(decision?.confidence)) lines.push(`Confidence: ${decision.confidence}`);
  if (decision?.reasonOneLine) lines.push(`Why: ${decision.reasonOneLine}`);
  if (Number.isFinite(decision?.signalExpiresAt)) {
    lines.push(`Expires: ${new Date(decision.signalExpiresAt).toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET`);
  }
  return lines.join("\n");
}

// Real, deliberately narrow entry point — every caller must supply its
// own real prevState (this never infers "material change" on its own).
async function notifyMaterialStateChange({ symbol = null, prevState = null, newState = null, decision = null } = {}) {
  if (!symbol || !newState || !MATERIAL_STATES.has(newState)) return { sent: false, reason: "not-material" };
  if (newState === prevState) return { sent: false, reason: "unchanged" };

  const persisted = readJsonSafe(STATE_PATH, {});
  if (persisted[symbol]?.lastState === newState) return { sent: false, reason: "duplicate" };

  if (!shouldSendAlert({ category: categoryFor(newState) })) return { sent: false, reason: "gated" };

  const result = await sendTelegramMessage(formatMessage({ symbol, newState, decision }));

  persisted[symbol] = { lastState: newState, at: Date.now() };
  writeJsonAtomic(STATE_PATH, persisted);

  return { sent: result?.ok === true, reason: result?.ok ? null : (result?.reason || "send-failed") };
}

module.exports = { notifyMaterialStateChange, MATERIAL_STATES, ALWAYS_ALLOW_STATES, categoryFor, STATE_PATH };
