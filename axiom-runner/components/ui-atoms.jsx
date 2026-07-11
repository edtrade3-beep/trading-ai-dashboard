import { C, MONO } from "./theme.js";

// Tiny shared UI atoms used throughout the app. Unlike most extracted
// components, these read C/MONO directly from theme.js instead of
// receiving them as props — that's how they were already written in the
// monolith (no prop drilling for something this small), preserved as-is.

export const Badge = ({ children, color = C.accent, bg }) => (
  <span style={{
    fontSize: 12, fontFamily: MONO, fontWeight: 700, padding: "3px 7px",
    borderRadius: 2, color, background: bg || `${color}18`, letterSpacing: "0.04em",
    whiteSpace: "nowrap", textTransform: "uppercase",
  }}>{children}</span>
);

export const ScoreBar = ({ value, color, w = "100%" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 5, width: w }}>
    <div style={{ flex: 1, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
      <div style={{
        width: `${value}%`, height: "100%", borderRadius: 2,
        background: color || (value >= 70 ? C.green : value >= 45 ? C.amber : C.red),
        transition: "width 0.4s ease",
      }} />
    </div>
    <span style={{ fontSize: 12, fontFamily: MONO, color: C.text, minWidth: 20, textAlign: "right" }}>{value}</span>
  </div>
);

export const TrendTag = ({ trend }) => {
  const m = {
    "Strong Up": { c: C.green, i: "▲▲" }, "Up": { c: C.green, i: "▲" },
    "Flat": { c: C.amber, i: "◆" }, "Weak": { c: C.red, i: "▽" }, "Down": { c: C.red, i: "▼▼" },
    "—": { c: C.textDim, i: "—" },
  };
  const { c, i } = m[trend] || m["—"];
  return <Badge color={c}>{i} {trend}</Badge>;
};

export const formatNum = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
};
