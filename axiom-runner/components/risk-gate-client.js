// risk-gate-client.js — pure, client-side risk-gate helper(s), plain JS
// (no JSX) so it can be unit-tested directly from a Node test script,
// same "dual-port" reasoning this codebase already uses for market-
// helpers.js-style shared logic (just without the duplication, since this
// has zero server-only dependency to begin with).
//
// shouldStopTrading — the "3-Second AI Decision System" spec's Risk
// Engine override ("Risk management overrides opportunity scores...
// STOP TRADING. No new positions. Management/exit functions remain
// available."). `dailyLossLocked` is risk-guardrails.js's real
// dailyLossBreakerTripped result, already gating every autonomous order-
// placing path (server-autopilot.js, lightbox-autopilot-execute.js,
// routes/autoexec.js via autopilot-risk-gate.js) and now surfaced here so
// the same real breaker reaches the interactive Trade Desk verdict a
// human reads before manually placing an order. Only overrides a NEW-
// ENTRY verdict (BUY_*) — EXIT/WAIT/NO_TRADE (managing/exiting an
// existing position) are intentionally unaffected.
export function shouldStopTrading(verdict, dailyLossLocked) {
  return !!dailyLossLocked && typeof verdict === "string" && verdict.startsWith("BUY_");
}
