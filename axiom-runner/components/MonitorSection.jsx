// Collapsible Monitor section — click the header to fold it away. Remembers
// state per section. Card-boxed (background/border/radius/padding) to match
// the reference-design card convention now used across the rest of
// Dashboard — this component is Dashboard-exclusive (confirmed: used
// nowhere else in the app), so safe to restyle without side effects
// elsewhere.
export default function MonitorSection({ C, MONO, label, storeKey, defaultOpen = true, children }) {
  const [open, setOpen] = React.useState(() => {
    const v = localStorage.getItem(storeKey);
    return v === null ? defaultOpen : v === "1";
  });
  const toggle = () => { const v = !open; setOpen(v); localStorage.setItem(storeKey, v ? "1" : "0"); };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <button onClick={toggle} title={open ? "Click to collapse" : "Click to expand"}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "transparent",
          border: "none", cursor: "pointer", padding: 0, marginBottom: open ? 10 : 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em" }}>{label}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{open ? "▼ hide" : "▶ show"}</span>
      </button>
      {open && children}
    </div>
  );
}
