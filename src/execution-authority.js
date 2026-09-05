"use strict";

// Single declaration of which components may mutate the broker account.
// All listed execution paths are paper-only; scanners, alerts, and history
// jobs are explicitly read-only and cannot be promoted by configuration.
const EXECUTION_AUTHORITY_VERSION = "execution-authority-v1";
const EXECUTION_PATHS = Object.freeze({
  // SERVER_AUTOPILOT and LIGHTBOX_ASSIST share one real execution engine
  // (src/unified-autopilot-engine.js) as of the Unified Autopilot merge,
  // Stage 7, 2026-09-05 — same broker call, same per-symbol lock, same
  // transition log, not two independent implementations anymore.
  SERVER_AUTOPILOT: { mode: "AUTOMATIC", paperOnly: true, decisionSource: "canonical-pipeline-v1" },
  LIGHTBOX_ASSIST: { mode: "ASSIST", paperOnly: true, decisionSource: "canonical-pipeline-v1" },
  // mode is now aspirational, not reachable — Stage 9 (2026-09-05)
  // retired Tradier's "autopilot"/"assistant" auto-execution modes
  // (routes/autoexec.js only accepts "off"/"observer" now), so
  // executionStatus() below can never actually include this in
  // activeMutators or pendingApprovalPaths. Left defined rather than
  // deleted — same "leave the file, drop the front door" precedent this
  // codebase already uses for other reversible retirements.
  TRADIER_AUTOEXEC: { mode: "RETIRED", paperOnly: true, decisionSource: "canonical-pipeline-v1" },
  QUICK_TRADE: { mode: "MANUAL", paperOnly: true, decisionSource: "user-confirmed" },
});
const READ_ONLY_PATHS = Object.freeze(["AUTOPILOT_ALERT_TICK", "SCANNERS", "ALERTS", "RESEARCH", "HISTORY"]);

function executionStatus({ serverAutopilot = false, lightboxMode = "OFF", tradierMode = "off", tradierLive = false } = {}) {
  return {
    version: EXECUTION_AUTHORITY_VERSION,
    // Real, checked state (2026-09-03, Phase 0 audit finding: this was
    // previously hardcoded true regardless of tradier-broker.js's own LIVE
    // flag, so health could have silently lied about live-money exposure).
    paperOnly: !tradierLive,
    decisionEngine: "canonical-pipeline-v1",
    activeMutators: [
      ...(serverAutopilot ? ["SERVER_AUTOPILOT"] : []),
      ...(lightboxMode === "ASSIST" ? ["LIGHTBOX_ASSIST"] : []),
      ...(tradierMode === "autopilot" ? ["TRADIER_AUTOEXEC"] : []),
    ],
    pendingApprovalPaths: tradierMode === "assistant" ? ["TRADIER_AUTOEXEC"] : [],
    readOnlySchedulers: READ_ONLY_PATHS,
  };
}

module.exports = { EXECUTION_AUTHORITY_VERSION, EXECUTION_PATHS, READ_ONLY_PATHS, executionStatus };
