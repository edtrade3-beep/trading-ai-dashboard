// emergency-stop.js — the one real, global kill switch shared across all 4
// automated-execution systems (client swing AutoPilotEngine.jsx, server
// swing server-autopilot.js, Tradier scanner-driven routes/autoexec.js,
// Light Box day-trade lightbox-autopilot-execute.js). 2026-08-24, Phase 1
// of the Execution Bot Architecture Audit's own top-priority recommendation
// — currently the single highest-severity real gap (zero matches for
// "emergency"/"safe mode"/"kill switch" anywhere in the codebase before
// this file).
//
// Design: a real, persisted flag every system checks FIRST, before any
// other real check. Activating it cancels real open orders (best-effort,
// per broker) but deliberately does NOT close open positions — same real
// distinction the spec itself draws ("preserve open positions, preserve
// history"). Requires an explicit manual re-arm — nothing in this codebase
// clears it automatically.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured } = require("./telegram");

const STATE_PATH = path.join(ROOT, "data", "emergency-stop.json");

function loadState() {
  const s = readJsonSafe(STATE_PATH, {});
  return {
    active: !!s.active,
    activatedAt: s.activatedAt || null,
    activatedBy: s.activatedBy || null,
    reason: s.reason || null,
    rearmedAt: s.rearmedAt || null,
    rearmedBy: s.rearmedBy || null,
  };
}
function saveState(s) { writeJsonAtomic(STATE_PATH, s); }

// Real, fast, synchronous check every execution system calls first — a
// plain local JSON read, safe to call on every tick/request without
// worrying about latency or rate limits.
function isEmergencyStopActive() {
  return loadState().active;
}
function getEmergencyStopStatus() {
  return loadState();
}

// Cancels every real open order this app knows how to place, across every
// broker any of the 4 systems actually use. Best-effort per broker — one
// broker failing to respond must never stop the other broker's
// cancellation, and must never stop the flag itself from having already
// engaged (activation flips the flag first; this is cleanup on top of it).
async function cancelAllOpenOrders() {
  const results = { alpaca: null, tradier: null };
  try {
    const id = process.env.ALPACA_KEY_ID || process.env.ALPACA_API_KEY_ID || "";
    const secret = process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET_KEY || "";
    if (id && secret) {
      // Real Alpaca bulk cancel — one call cancels every open order on the
      // paper account, which is shared by server-autopilot.js,
      // AutoPilotEngine.jsx (via /api/alpaca/order), and
      // lightbox-autopilot-execute.js.
      const r = await fetch("https://paper-api.alpaca.markets/v2/orders", {
        method: "DELETE",
        headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret },
      });
      results.alpaca = { ok: r.ok, status: r.status };
    } else {
      results.alpaca = { ok: false, reason: "not configured" };
    }
  } catch (e) {
    results.alpaca = { ok: false, error: e.message };
  }
  try {
    const { isConfigured: tradierConfigured, getOrders, cancelOrder } = require("./tradier-broker");
    if (tradierConfigured()) {
      const orders = await getOrders();
      const OPEN_STATUSES = new Set(["open", "pending", "partially_filled"]);
      const openOrders = orders.filter((o) => OPEN_STATUSES.has(String(o.status || "").toLowerCase()));
      let cancelled = 0;
      for (const o of openOrders) {
        try { await cancelOrder(o.id); cancelled++; } catch { /* best-effort, one order failing shouldn't stop the rest */ }
      }
      results.tradier = { ok: true, cancelled, found: openOrders.length };
    } else {
      results.tradier = { ok: false, reason: "not configured" };
    }
  } catch (e) {
    results.tradier = { ok: false, error: e.message };
  }
  return results;
}

async function activateEmergencyStop({ reason, activatedBy }) {
  const state = loadState();
  state.active = true;
  state.activatedAt = new Date().toISOString();
  state.activatedBy = activatedBy || "unknown";
  state.reason = reason || "Manually triggered";
  state.rearmedAt = null;
  state.rearmedBy = null;
  saveState(state); // flag engages immediately — every system's next check sees it even if order cancellation below is slow/partial
  const cancelResults = await cancelAllOpenOrders();
  if (isConfigured()) {
    // priority: "P0" (alert-priority-tiers, 2026-09-06) — this is exactly
    // Part 17's "P0 CRITICAL" example ("unexpected open exposure" /
    // account-safety event). Previously this call was subject to the same
    // 60s/40-per-day global cooldown as any routine alert and could be
    // silently dropped by a busy day's chatter; P0 bypasses that.
    sendTelegramMessage(
      `🛑 EMERGENCY STOP ACTIVATED\nBy: ${state.activatedBy}\nReason: ${state.reason}\n\nAll 4 automated-execution systems will refuse new entries until manually re-armed (/rearm). Open positions were NOT closed — only pending orders were cancelled.\nAlpaca: ${cancelResults.alpaca?.ok ? "cancelled" : cancelResults.alpaca?.reason || cancelResults.alpaca?.error || "n/a"}\nTradier: ${cancelResults.tradier?.ok ? `${cancelResults.tradier.cancelled} cancelled` : cancelResults.tradier?.reason || cancelResults.tradier?.error || "n/a"}`,
      { priority: "P0" }
    ).catch(() => {});
  }
  return { ok: true, state, cancelResults };
}

function deactivateEmergencyStop({ rearmedBy }) {
  const state = loadState();
  if (!state.active) return { ok: true, state, alreadyInactive: true };
  state.active = false;
  state.rearmedAt = new Date().toISOString();
  state.rearmedBy = rearmedBy || "unknown";
  saveState(state);
  if (isConfigured()) {
    sendTelegramMessage(`✅ Emergency Stop re-armed by ${state.rearmedBy}. Automated systems may resume new entries.`, { priority: "P0" }).catch(() => {});
  }
  return { ok: true, state };
}

module.exports = {
  isEmergencyStopActive, getEmergencyStopStatus,
  activateEmergencyStop, deactivateEmergencyStop, cancelAllOpenOrders,
};
