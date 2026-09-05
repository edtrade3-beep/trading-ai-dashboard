"use strict";
// autopilot-reconciliation.js — Unified Autopilot merge, Stage 8 (see
// .claude/plans/proud-yawning-unicorn.md: "Restart/broker reconciliation
// — on boot, reconcile Alpaca's real open positions/orders against the
// persisted transition log (no implementation of this exists anywhere
// today). Purely additive safety.")
//
// A real gap this closes: server-autopilot.js/lightbox-autopilot-execute.js
// write ORDER_PENDING to the order-store (autopilot-order-store.js)
// immediately before the real broker call, then FILLED/FAILED right
// after. If the process crashes or gets redeployed in the narrow window
// between those two writes, the record is left stuck at ORDER_PENDING
// forever — an honest "we don't actually know what happened" state that
// nothing ever revisits. This module runs once at boot, checks Alpaca's
// own real current positions/open orders for each stuck record's symbol,
// and closes it out to match what's actually true.
//
// Deliberately narrow in what it's allowed to do: this NEVER places,
// cancels, or modifies a real broker order. The only thing it ever
// writes is this app's OWN order-store transition log — correcting our
// own bookkeeping to match broker reality, never taking a broker-side
// action. And it only acts when BOTH real broker reads (positions, open
// orders) succeed — a broker-unreachable run touches nothing rather than
// risk mass-marking real fills as failed just because the account
// couldn't be read this one time.
const { apca } = require("./unified-autopilot-engine");
const { getRecentOrders, transition } = require("./autopilot-order-store");

// Last real run's outcome, held in memory so GET /api/autopilot/
// reconciliation (routes/autopilot.js) can report what boot-time
// reconciliation actually found without re-running it — this is a
// one-shot-at-boot check, not something a status read should re-trigger.
let _lastResult = null;
function getLastReconciliationResult() { return _lastResult; }

async function reconcileOnBoot({ window = 500 } = {}) {
  const stuck = getRecentOrders({ window }).filter((r) => r.currentState === "ORDER_PENDING");
  if (!stuck.length) { _lastResult = { ran: true, at: new Date().toISOString(), checked: 0, resolved: [] }; return _lastResult; }

  const [posR, ordR] = await Promise.all([apca("/v2/positions"), apca("/v2/orders?status=open&limit=200")]);
  if (!posR || !posR.ok || !ordR || !ordR.ok) {
    _lastResult = { ran: false, at: new Date().toISOString(), reason: "broker unreachable — reconciliation skipped, no records touched", checked: stuck.length };
    return _lastResult;
  }
  const positions = Array.isArray(posR.data) ? posR.data : [];
  const openOrders = Array.isArray(ordR.data) ? ordR.data : [];

  const resolved = [];
  for (const rec of stuck) {
    try {
      const hasPosition = positions.some((p) => p.symbol === rec.symbol);
      const hasOpenOrder = openOrders.some((o) => o.symbol === rec.symbol || o.client_order_id === rec.id);
      if (hasPosition || hasOpenOrder) {
        transition(rec.id, "FILLED", { reason: "reconciliation: a real broker position/open order confirms this actually filled", meta: { reconciled: true } });
        resolved.push({ id: rec.id, symbol: rec.symbol, to: "FILLED" });
      } else {
        transition(rec.id, "FAILED", { reason: "reconciliation: no matching real broker position or open order found — likely lost during a restart", meta: { reconciled: true, code: "RECONCILIATION_NO_MATCH" } });
        resolved.push({ id: rec.id, symbol: rec.symbol, to: "FAILED" });
      }
    } catch (err) {
      // One record's own state having already moved on (a genuine race
      // with something else resolving it between our read and this
      // write) must never abort reconciliation for the rest — log and
      // continue, same non-fatal discipline as every other shadow-log
      // write in this codebase.
      console.error(`[autopilot-reconciliation] failed to resolve stuck record ${rec.id} (${rec.symbol}):`, err.message);
    }
  }
  console.log(`[autopilot-reconciliation] boot check: ${stuck.length} stuck ORDER_PENDING record(s), resolved ${resolved.length}`);
  _lastResult = { ran: true, at: new Date().toISOString(), checked: stuck.length, resolved };
  return _lastResult;
}

module.exports = { reconcileOnBoot, getLastReconciliationResult };
