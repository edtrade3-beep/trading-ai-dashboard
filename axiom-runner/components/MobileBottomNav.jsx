// MobileBottomNav.jsx — persistent mobile bottom tab bar (2026-08-23
// mobile nav redesign, explicit user reference image). Replaces the
// former hamburger-trigger's fixed position (top-left) — the "More"
// button here now opens the same real sheet (search/nav-grid/actions/
// status, unchanged content) axiom-live.jsx already owns and renders,
// just repositioned to anchor above this bar instead of dropping from
// the top bar. This component only owns the 5 fixed buttons; the sheet's
// open/closed state and content stay in axiom-live.jsx (the caller),
// same as every other real handler this component doesn't duplicate.
//
// 4 primary destinations map to real, already-functional tab ids
// (confirmed via Sidebar.jsx / axiom-live.jsx before writing this):
// Dashboard->"dashboard", Watchlist->"rhpro-lists" (the real Watchlists
// sub-view, part of Discover's alsoActive set), Alerts->"alerts",
// Calendar->"calendar".
const PRIMARY = [
  { id: "dashboard", label: "Dashboard", icon: "🏠", tab: "dashboard" },
  { id: "watchlist", label: "Watchlist", icon: "⭐", tab: "rhpro-lists" },
  { id: "alerts", label: "Alerts", icon: "🔔", tab: "alerts" },
  { id: "calendar", label: "Calendar", icon: "📅", tab: "calendar" },
];

export const MOBILE_BOTTOM_NAV_H = 62;

export default function MobileBottomNav({ C, MONO, SANS, activeTab, setActiveTab, moreOpen, onToggleMore, alertCount }) {
  const Item = ({ icon, label, active, onClick, badge }) => (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        background: "transparent", border: "none", cursor: "pointer", padding: "8px 2px",
        color: active ? C.accent : C.textDim, position: "relative",
      }}
    >
      <span style={{ fontSize: 19, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: active ? 800 : 600 }}>{label}</span>
      {badge > 0 && (
        <span style={{ position: "absolute", top: 2, right: "28%", background: C.red, color: "#fff", borderRadius: 8, minWidth: 15, height: 15, fontSize: 9, fontWeight: 800, fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{badge}</span>
      )}
    </button>
  );

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9997,
      height: MOBILE_BOTTOM_NAV_H, display: "flex",
      background: C.surface, borderTop: `1px solid ${C.border}`,
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      {PRIMARY.map((p) => (
        <Item
          key={p.id} icon={p.icon} label={p.label}
          active={activeTab === p.tab && !moreOpen}
          badge={p.id === "alerts" ? alertCount : 0}
          onClick={() => { setActiveTab(p.tab); if (moreOpen) onToggleMore(); }}
        />
      ))}
      <Item icon="☰" label="More" active={moreOpen} onClick={onToggleMore} />
    </div>
  );
}
