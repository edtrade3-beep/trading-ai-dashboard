// ── Floating Checklist Button ──
export default function FloatingChecklistButton({ C, checklistItems, setActiveTab, statusBarH = 40 }) {
  const done  = checklistItems.filter(c => c.done).length;
  const total = checklistItems.length;
  const allDone = done === total;
  // bottom:82+statusBarH stacks this ABOVE the TradingCopilot button
  // (bottom:18+statusBarH, right:18, 54px tall, z:9999) instead of sitting
  // almost exactly underneath it — the old bottom:24/right:24 placement put
  // this button fully behind Copilot's higher z-index, permanently
  // invisible and unclickable on every screen size. statusBarH (real,
  // dynamic — can wrap to 2 lines) is added so neither button ever sits on
  // top of the fixed status bar at the very bottom of the viewport either
  // (confirmed via live boundingClientRect: the original bottom:18 baseline
  // overlapped the status bar's "Account: PAPER-001" text by 22px).
  return (
    <div style={{ position: "fixed", bottom: 82 + statusBarH, right: 18, zIndex: 8000 }}>
      <button
        className="fab-checklist-btn"
        onClick={() => setActiveTab("tools")}
        style={{ width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer",
          background: allDone ? C.green : done > 0 ? C.amber : C.red,
          boxShadow: `0 4px 18px ${allDone ? C.green : done > 0 ? C.amber : C.red}66`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, transition: "all 0.2s" }}>
        ✅
      </button>
    </div>
  );
}
