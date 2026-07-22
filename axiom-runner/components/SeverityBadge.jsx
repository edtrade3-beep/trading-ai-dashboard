// Shared badge for the X Intelligence Engine's one severity scale
// (src/severity-scale.js) — NORMAL/WATCH/CAUTION/HIGH RISK/PANIC. Used
// wherever a module maps its own real score onto this shared ladder so the
// whole engine reads consistently instead of each section inventing its
// own colors/wording.
const SEVERITY_COLOR = {
  NORMAL: "#0d9465", WATCH: "#d6a312", CAUTION: "#d97706", "HIGH RISK": "#c8282a", PANIC: "#7c1d1d",
};

export default function SeverityBadge({ severity, MONO, size = "normal" }) {
  if (!severity?.level) return null;
  const col = SEVERITY_COLOR[severity.level] || "#94a3b8";
  const fontSize = size === "small" ? 10 : 11;
  return (
    <span style={{ fontFamily: MONO, fontSize, fontWeight: 800, padding: "3px 8px", borderRadius: 5,
      background: `${col}18`, border: `1px solid ${col}44`, color: col, whiteSpace: "nowrap" }}>
      {severity.emoji} {severity.level}
    </span>
  );
}
