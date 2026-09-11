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
  // Real gap found live (2026-09-10 platform audit): ADOL22 Autopilot 2.0
  // (src/autopilot2-engine.js, registered in server.js as a 5-min tick)
  // opens/closes/manages its own real paper positions via
  // autopilot2-account.js and was never represented in this contract at
  // all — /api/health's activeMutators could never show it running even
  // while it actively mutated the account. Its decision logic already
  // reads the canonical AssetDecision (compliant); this closes the
  // visibility gap only, no behavior change. Its scheduler itself is
  // intentionally left unmerged with the others pending deployment
  // shadowing — see docs/ARCHITECTURE_MIGRATION.md's "Known constraints."
  ADOL22_AUTOPILOT2: { mode: "AUTOMATIC", paperOnly: true, decisionSource: "canonical-pipeline-v1" },
});
const READ_ONLY_PATHS = Object.freeze(["AUTOPILOT_ALERT_TICK", "SCANNERS", "ALERTS", "RESEARCH", "HISTORY"]);

function executionStatus({ serverAutopilot = false, lightboxMode = "OFF", tradierMode = "off", tradierLive = false, autopilot2State = "OFF" } = {}) {
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
      // OFF is the only state where the tick does nothing at all (per
      // autopilot2-engine.js's own _tickImpl — every other state still
      // manages real open positions, so it counts as an active mutator).
      ...(autopilot2State && autopilot2State !== "OFF" ? ["ADOL22_AUTOPILOT2"] : []),
    ],
    pendingApprovalPaths: tradierMode === "assistant" ? ["TRADIER_AUTOEXEC"] : [],
    readOnlySchedulers: READ_ONLY_PATHS,
  };
}

module.exports = { EXECUTION_AUTHORITY_VERSION, EXECUTION_PATHS, READ_ONLY_PATHS, executionStatus };
