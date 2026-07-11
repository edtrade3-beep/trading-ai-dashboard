// Collapsible Monitor section — click the header to fold it away. Remembers state per section.
export default function MonitorSection({ C, MONO, label, storeKey, defaultOpen = true, children }) {
  const [open, setOpen] = React.useState(() => {
    const v = localStorage.getItem(storeKey);
    return v === null ? defaultOpen : v === "1";
  });
  const toggle = () => { const v = !open; setOpen(v); localStorage.setItem(storeKey, v ? "1" : "0"); };
  return (
    <div>
      <button onClick={toggle} title={open ? "Click to collapse" : "Click to expand"}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "transparent",
          border: "none", cursor: "pointer", margin: "16px 0 8px", padding: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textDim, letterSpacing: "0.1em" }}>{label}</span>
        <span style={{ flex: 1, height: 1, background: C.border }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{open ? "▼ hide" : "▶ show"}</span>
      </button>
      {open && children}
    </div>
  );
}
