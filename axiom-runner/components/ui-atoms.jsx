import { C, MONO, SANS } from "./theme.js";

// Tiny shared UI atoms used throughout the app. Unlike most extracted
// components, these read C/MONO directly from theme.js instead of
// receiving them as props — that's how they were already written in the
// monolith (no prop drilling for something this small), preserved as-is.

// Per-module failure isolation (2026-08-19, app-wide audit — explicit user
// spec section 17: "one broken module must never crash the entire
// Workspace"). Confirmed via direct code reading that the only error
// boundary in the whole app is RhErrorBoundary at the very root
// (axiom-live.jsx), wrapping <App> — a crash in any single panel (Options
// Flow, News, AI Research, a dTab sub-tab, etc.) currently takes down the
// entire page to that boundary's generic "Something hit an error" screen.
// This is a small, inline-sized sibling to that one — same
// getDerivedStateFromError/componentDidCatch mechanics (React's own error
// boundary API, not custom logic), but renders a compact "X temporarily
// unavailable" message in place instead of replacing the whole viewport, so
// everything else on the page keeps working. React only supports error
// boundaries as class components — no hook equivalent exists.
export class PanelErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) {
    try { console.error(`[Panel crash: ${this.props.label || "module"}]`, err, info && info.componentStack); } catch {}
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.card, textAlign: "center" }}>
        <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: C.textDim }}>
          ⚠ {this.props.label || "This section"} temporarily unavailable
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 4 }}>
          The rest of the page is unaffected. Reload if this persists.
        </div>
      </div>
    );
  }
}

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

// Visual consistency pass (2026-09-05, explicit user request: "best and
// easiest way to organize my platform and make it pro"). Confirmed via
// direct audit before writing this: colors/fonts are already unified
// app-wide through theme.js's C/MONO/SANS, but card chrome (border/
// radius/shadow/padding) and the small uppercase "section label" header
// text (e.g. "KEY LEVELS", "FINAL DECISION") were not — dozens of
// near-duplicate hand-typed literals platform-wide, including C.shadow
// (already a real theme token) getting bypassed by hand-rolled duplicate
// shadow strings even in files that otherwise use the shared theme.
//
// sectionLabelStyle codifies the convention already shared by the most
// recently-built Trade Desk panels (MarketCommandCenter.jsx,
// AutopilotPanel.jsx, UnifiedAutopilotPanel.jsx: fontSize 10/fontWeight
// 800/letterSpacing "0.06em") rather than inventing a new one — adopting
// it elsewhere converges toward what was already trending, and these 3
// files' own look doesn't change at all.
export const sectionLabelStyle = (extra) => ({
  fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: C.textDim, ...extra,
});

// cardStyle matches AutopilotPanel.jsx/UnifiedAutopilotPanel.jsx's own
// already-identical self-contained-card chrome (radius 8, the real
// C.shadow token, "10px 14px" padding) — a real, safe consolidation of
// two files that had already independently converged on the same look,
// not a new invention. Only for components that are ALREADY styled as a
// standalone bordered/shadowed card — full-width strip components
// (MarketCommandCenter.jsx, CanonicalVerdictStrip.jsx) are a
// deliberately different, valid pattern and don't use this.
export const cardStyle = (extra) => ({
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: C.shadow, padding: "10px 14px", ...extra,
});

export const formatNum = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  // toLocaleString() with no options shows however many decimals the raw
  // float happens to need (0-3) rather than a fixed format — the same
  // dollar table could read "$20,075.6", "$110.845", and "$67.82" side by
  // side depending on each value's exact binary float. Force 2, matching
  // every other dollar amount in the app.
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
