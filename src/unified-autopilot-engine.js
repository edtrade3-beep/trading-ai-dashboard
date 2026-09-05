"use strict";
// unified-autopilot-engine.js — Unified Autopilot merge, Stage 7 (real
// cutover, not shadow-only prep — see .claude/plans/proud-yawning-unicorn.md).
//
// The one shared module server-autopilot.js and lightbox-autopilot-
// execute.js both call now for the two things that were previously
// byte-for-byte duplicated between them (already flagged as a known
// duplicate back in the Execution Bot Architecture Audit, 2026-08-24:
// "this file was one of 2 remaining real duplicates"):
//
//  1. apca()/keys() — the real Alpaca trading-account request shim.
//  2. placeGatedBracketOrder() — build a real bracket order, take the
//     real per-symbol lock, place it at the broker, and record the real
//     state-machine transition. The transition log is no longer a
//     parallel "shadow" copy sitting alongside two independently-acting
//     systems (Stage 3) — placing a real order and logging its real
//     transition now happen inside ONE shared function call for both
//     systems, which is the actual, concrete meaning of "merged" here.
//
// Each caller still owns its own upstream candidate selection/gating
// (sector cap, sizing, validateAndSize, replay-brain gates, etc. —
// legitimately different between a multi-candidate tick loop and a
// single-symbol on-demand call) and its own post-fill bookkeeping (the
// onFilled callback below) — this module owns exactly the part that was
// actually duplicated: the broker call and its real transition log.
const { resolveAlpacaKeys, alpacaTradingRequest } = require("./providers/alpaca-client");
const { withSymbolLock } = require("./autopilot-idempotency");
const { transition: logTransition } = require("./autopilot-order-store");
const { REJECTION_CODES } = require("./autopilot-rejection-codes");

const keys = resolveAlpacaKeys;

// Real contract, unchanged from both files' own former copies: returns
// null on no key or any fetch error (a background tick must never throw
// and break its own interval on a transient network blip); otherwise
// {ok, status, data} straight from the real Alpaca response.
async function apca(path, method = "GET", body = null) {
  try {
    const res = await alpacaTradingRequest(path, method, body);
    if (res._noKey) return null;
    return { ok: res.ok, status: res.status, data: res.data };
  } catch { return null; }
}

function safeTransition(orderRecordId, to, opts) {
  if (!orderRecordId) return;
  try { logTransition(orderRecordId, to, opts); }
  catch (err) { console.error("[unified-autopilot-engine] transition log failed (non-fatal):", err.message); }
}

// Places one real bracket order under a per-symbol lock and records its
// real ORDER_PENDING -> FILLED/FAILED transition — now the actual,
// authoritative record of what this shared execution path did, not a
// parallel observation of it. `orderRecordId` is the caller's own
// order-store record id (already RECEIVED/VALIDATING/RISK_APPROVED by
// the time this is called) — pass null/undefined to skip logging, never
// required. `onFilled(res, ctx)` runs INSIDE the same per-symbol lock,
// only on a real broker success, so a caller's own bookkeeping (journal,
// position store, Telegram) can never race a second order for the same
// symbol either. Returns {ok:true, res} on success or {ok:false, error,
// res} on failure — never throws.
async function placeGatedBracketOrder({ symbol, side, qty, entry, stop, target, clientOrderId, orderRecordId, onFilled }) {
  return withSymbolLock(symbol, async () => {
    const order = {
      symbol, qty: String(qty), side, type: "market", time_in_force: "day",
      order_class: "bracket",
      take_profit: { limit_price: String(target) },
      stop_loss: { stop_price: String(+Number(stop).toFixed(2)) },
      client_order_id: clientOrderId,
    };
    safeTransition(orderRecordId, "ORDER_PENDING");
    const res = await apca("/v2/orders", "POST", order);
    if (!res || !res.ok) {
      safeTransition(orderRecordId, "FAILED", { reason: "broker order call failed", meta: { code: REJECTION_CODES.BROKER_ERROR } });
      return { ok: false, error: res?.data?.message || "broker order call failed", res };
    }
    // FILLED is optimistic here — a market order's real fill isn't
    // synchronously confirmed by this response; real fill/partial-fill
    // polling is a later stage (restart-reconciliation), not this one.
    safeTransition(orderRecordId, "FILLED", { meta: { orderId: res.data?.id } });
    if (onFilled) await onFilled(res, { entry, qty, symbol, side, target, stop });
    return { ok: true, res };
  });
}

module.exports = { apca, keys, placeGatedBracketOrder };
