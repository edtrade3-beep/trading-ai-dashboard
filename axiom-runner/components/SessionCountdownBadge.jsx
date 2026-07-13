// Shared by the mobile and desktop header layouts — was duplicated inline in both.
function fmtCountdownShort(secs) {
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(ss).padStart(2, "0")}s`;
  return `${ss}s`;
}

export default function SessionCountdownBadge({ C, MONO, sessionCountdown, compact }) {
  const cdColor = sessionCountdown.session === "REGULAR" ? C.green : sessionCountdown.session === "PREMARKET" ? C.accent : sessionCountdown.session === "AFTERMARKET" ? C.amber : C.textDim;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 4 : 6, padding: compact ? "4px 8px" : "7px 12px", background: `${cdColor}0e`, borderRadius: 6, border: `1px solid ${cdColor}2a` }}>
      <span style={{ fontSize: 12, fontFamily: MONO, color: C.textDim }}>{sessionCountdown.label}</span>
      <span style={{ fontSize: 12, fontFamily: MONO, color: cdColor, fontWeight: 800 }}>{fmtCountdownShort(sessionCountdown.secs)}</span>
    </div>
  );
}
