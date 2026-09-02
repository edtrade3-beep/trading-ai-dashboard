"use strict";

// Single declaration of which components may mutate the broker account.
// All listed execution paths are paper-only; scanners, alerts, and history
// jobs are explicitly read-only and cannot be promoted by configuration.
const EXECUTION_AUTHORITY_VERSION = "execution-authority-v1";
const EXECUTION_PATHS = Object.freeze({
  SERVER_AUTOPILOT: { mode: "AUTOMATIC", paperOnly: true, decisionSource: "canonical-pipeline-v1" },
  LIGHTBOX_ASSIST: { mode: "ASSIST", paperOnly: true, decisionSource: "canonical-pipeline-v1" },
  QUICK_TRADE: { mode: "MANUAL", paperOnly: true, decisionSource: "user-confirmed" },
});
const READ_ONLY_PATHS = Object.freeze(["AUTOPILOT_ALERT_TICK", "SCANNERS", "ALERTS", "RESEARCH", "HISTORY"]);

function executionStatus({ serverAutopilot = false, lightboxMode = "OFF" } = {}) {
  return {
    version: EXECUTION_AUTHORITY_VERSION,
    paperOnly: true,
    decisionEngine: "canonical-pipeline-v1",
    activeMutators: [
      ...(serverAutopilot ? ["SERVER_AUTOPILOT"] : []),
      ...(lightboxMode === "ASSIST" ? ["LIGHTBOX_ASSIST"] : []),
    ],
    readOnlySchedulers: READ_ONLY_PATHS,
  };
}

module.exports = { EXECUTION_AUTHORITY_VERSION, EXECUTION_PATHS, READ_ONLY_PATHS, executionStatus };
