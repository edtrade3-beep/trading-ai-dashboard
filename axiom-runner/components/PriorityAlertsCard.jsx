// Dashboard's "high-priority alerts" card — pure render over the already
// sorted/capped combinedAlerts list (built once in App() from TradingView
// webhooks, auto-risk econ events, macro events, watchlist momentum/volume,
// and options flow). No new scoring logic — just surfaces what already exists.
export default function PriorityAlertsCard({ C, MONO, SANS, alerts, setTerminalSymbol, setActiveTab }) {
  const top = (alerts || []).slice(0, 5);
  const colorFor = (type) => type === "risk" ? "#c8282a" : type === "opportunity" ? "#0d9465" : type === "flow" ? "#7c5cff" : "#d6a312";
  const go = (a) => {
    if (!a.symbol || a.symbol === "MKT") return;
    setTerminalSymbol && setTerminalSymbol(a.symbol);
    try { localStorage.setItem("mterminal_load_sym", a.symbol); } catch {}
    setActiveTab && setActiveTab("mterminal");
  };
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px 0", fontFamily: SANS, fontSize: 15, fontWeight: 900, color: C.text }}>🔔 Priority Alerts</div>
      {!top.length && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, padding: "8px 16px 14px" }}>No high-priority alerts right now.</div>}
      {!!top.length && (
        <div style={{ padding: "8px 12px 12px" }}>
          {top.map((a, i) => {
            const col = colorFor(a.type);
            const clickable = a.symbol && a.symbol !== "MKT";
            return (
              <div key={i} onClick={() => go(a)}
                style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 10px", borderRadius: 8,
                  cursor: clickable ? "pointer" : "default", marginBottom: i === top.length - 1 ? 0 : 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: col, flexShrink: 0 }} />
                {clickable && <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, flexShrink: 0 }}>{a.symbol}</span>}
                <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
