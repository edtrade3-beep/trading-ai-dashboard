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
  // Further tightened: all 4 mobile FABs shrunk 54/52px -> 42px and pulled
  // in from bottom/right:18 to bottom/right:10, with matching tighter gaps
  // between them (Copilot right:10-52, RealityCheck right:60-102, this
  // button right:110-152) — shrinks the row's total footprint (both height
  // and width) so less of whatever's underneath gets covered.
  return (
    <div style={{ position: "fixed", bottom: (isMobile ? 10 : 82) + statusBarH, right: isMobile ? 110 : 18, zIndex: 8000 }}>
      <button
        className={`fab-checklist-btn${!isMobile ? " fab-peek" : ""}`}
        onClick={() => setActiveTab("tools")}
        style={{ width: isMobile ? 42 : 52, height: isMobile ? 42 : 52, borderRadius: "50%", border: "none", cursor: "pointer",
          background: allDone ? C.green : done > 0 ? C.amber : C.red,
          boxShadow: `0 4px 18px ${allDone ? C.green : done > 0 ? C.amber : C.red}66`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: isMobile ? 17 : 20, transition: "all 0.2s, opacity 0.2s",
          opacity: fabFading ? 0 : (isMobile ? 1 : undefined), pointerEvents: fabFading ? "none" : "auto" }}>
        ✅
      </button>
    </div>
  );
}
