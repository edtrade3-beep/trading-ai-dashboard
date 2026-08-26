// order-fill-tracker.js — Order fill confirmation (Phase 3 Tier B,
// 2026-08-26, spec Part 23: "never assume an order filled simply
// because it was submitted... distinguish PLANNED ENTRY from ACTUAL
// ENTRY"). Fire-and-forget background confirmation: the real order
// submission response (routes/quick-trade.js) stays fast — this polls
// Alpaca's real order-status endpoint over a real short window
// (quick-trade-service.js's pollOrderFill) and only THEN, once a real
// fill is confirmed, captures the Post-entry Edge Monitoring snapshot
// (position-edge-store.js) — never at mere order-acceptance time, which
// is exactly the "assumed filled" mistake the spec calls out.
"use strict";

async function confirmFillAndCapture(orderId, symbol) {
  const { pollOrderFill } = require("./quick-trade-service");
  const fill = await pollOrderFill(orderId).catch(() => null);
  if (fill && (fill.status === "filled" || fill.status === "partially_filled") && fill.filledQty > 0) {
    await require("./position-edge-store").captureEntrySnapshot(symbol).catch(() => {});
  }
  return fill;
}

module.exports = { confirmFillAndCapture };
