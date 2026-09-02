import React from "react";

const TABS = [
  ["Overview", "overview"], ["Technicals", "vcp"], ["Options", "options"], ["News", "news"],
  ["Fundamentals", "discover"], ["Scenarios", "cortex"], ["AI Analysis", "cortex"], ["History", "journal"], ["Journal", "journal"],
];

export default function TradeDeskTabs({ symbol, activeKey, onOpen, C, MONO }) {
  return (
    <nav aria-label={`${symbol || "Ticker"} analysis tabs`} style={{ display: "flex", gap: 2, overflowX: "auto", padding: "6px 10px", background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
      {TABS.map(([label, target]) => (
        <button key={label} aria-current={activeKey === target ? "page" : undefined} onClick={() => onOpen(target)} style={{ flex: "0 0 auto", border: `1px solid ${activeKey === target ? C.accent : C.border}`, background: activeKey === target ? `${C.accent}18` : "transparent", color: activeKey === target ? C.accent : C.textSec, borderRadius: 5, padding: "6px 10px", fontFamily: MONO, fontSize: 10.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          {label}
        </button>
      ))}
    </nav>
  );
}
