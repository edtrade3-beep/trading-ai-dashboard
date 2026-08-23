// ── Floating Checklist Button ──
export default function FloatingChecklistButton({ C, checklistItems, setActiveTab, statusBarH = 40, fabFading = false, isMobile = false }) {
  const done  = checklistItems.filter(c => c.done).length;
  const total = checklistItems.length;
  const allDone = done === total;
  // Desktop: stacked ABOVE the TradingCopilot button (bottom:18+statusBarH,
  // right:18, 54px tall, z:9999) instead of sitting almost exactly
  // underneath it — the old bottom:24/right:24 placement put this button
  // fully behind Copilot's higher z-index, permanently invisible and
  // unclickable on every screen size. statusBarH (real, dynamic — can wrap
  // to 2 lines) is added so neither button ever sits on top of the fixed
  // status bar at the very bottom of the viewport either (confirmed via
  // live boundingClientRect: the original bottom:18 baseline overlapped the
  // status bar's "Account: PAPER-001" text by 22px).
  //
  // Mobile: the 2-row stack (this button's row ABOVE Copilot/RealityCheck's
  // row) ate ~126px of vertical space on short viewports, permanently
  // covering 2-3 rows of whatever table/list was underneath (confirmed live
  // on the Sniper Scanner table — the "plan" buttons for rows 4-6 measured
  // inside the FAB stack's bounding box). Collapsing to a single row next to
  // RealityCheckWidget freed the entire upper row back to real content.
  // Further tightened, then finally collapsed (2026-08-23 — real user
  // report on an actual phone: even the tightened single-row layout still
  // spanned wide enough to obscure a full table row's Score/AI Action
  // columns and the RUN SCAN button). All 4 mobile FABs are now hidden by
  // default (via fabFading, gated on axiom-live.jsx's new mobileFabsExpanded
  // toggle, not the old scroll-heuristic) and only appear — stacked
  // VERTICALLY at right:10, not spread horizontally — when the user
  // explicitly taps the new "⚡" expand button. This button's slot in that
  // column: bottom:114 (third from the bottom; Copilot:10, RealityCheck:62,
  // this:114, ChartSearch:166).
  return (
    <div style={{ position: "fixed", bottom: (isMobile ? 166 : 82) + statusBarH, right: isMobile ? 10 : 18, zIndex: 8000 }}>
      <button
        className={`fab-checklist-btn${!isMobile ? " fab-peek" : ""}`}
        onClick={() => setActiveTab("tools")}
        style={{ width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: "50%", border: "none", cursor: "pointer",
          background: allDone ? C.green : done > 0 ? C.amber : C.red,
          boxShadow: `0 4px 18px ${allDone ? C.green : done > 0 ? C.amber : C.red}66`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: isMobile ? 13 : 15, transition: "all 0.2s, opacity 0.2s",
          opacity: fabFading ? 0 : (isMobile ? 1 : undefined), pointerEvents: fabFading ? "none" : "auto" }}>
        ✅
      </button>
    </div>
  );
}
