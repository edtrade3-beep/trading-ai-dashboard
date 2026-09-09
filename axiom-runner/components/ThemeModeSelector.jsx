// Three-way theme control (2026-09-09, explicit user spec: "THEME SYSTEM —
// REQUIRED" — Dark Mode / Light Mode / System Mode, "a small control near
// Settings or Profile"). Replaces the previous binary ☀/● toggle button
// that only ever cycled dark<->light with no way to select System/Auto.
// `value` is the RAW stored preference ("dark" | "light" | "system"), not
// the resolved effective mode — axiom-live.jsx keeps those separate so
// every other consumer of `themeMode` still only ever sees "dark"/"light".
export default function ThemeModeSelector({ C, MONO, value, onChange, compact = false }) {
  const opts = [
    { key: "light", icon: "☀", title: "Light Mode" },
    { key: "system", icon: "◐", title: "System (follows your device)" },
    { key: "dark", icon: "☾", title: "Dark Mode" },
  ];
  const active = value === "light" || value === "system" ? value : "dark";
  const size = compact ? 30 : 24;
  return (
    <div
      role="group"
      aria-label="Theme mode"
      style={{
        display: "flex", alignItems: "center", background: C.card,
        border: `1px solid ${C.border}`, borderRadius: 6, padding: 2, gap: 2, flexShrink: 0,
      }}
    >
      {opts.map((o) => {
        const isActive = active === o.key;
        return (
          <button
            key={o.key}
            title={o.title}
            aria-pressed={isActive}
            onClick={() => onChange(o.key)}
            style={{
              width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", borderRadius: 5, cursor: "pointer",
              background: isActive ? C.accent : "transparent",
              color: isActive ? "#ffffff" : C.textDim,
              fontFamily: MONO, fontSize: compact ? 15 : 13, lineHeight: 1,
              transition: "background 0.15s ease, color 0.15s ease",
            }}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}
