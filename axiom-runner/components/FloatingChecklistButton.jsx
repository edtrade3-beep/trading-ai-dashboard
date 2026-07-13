// ── Floating Checklist Button ──
export default function FloatingChecklistButton({ C, checklistItems, setActiveTab }) {
  const done  = checklistItems.filter(c => c.done).length;
  const total = checklistItems.length;
  const allDone = done === total;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 8000 }}>
      <button
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
