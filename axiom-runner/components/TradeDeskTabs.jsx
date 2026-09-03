import React from "react";

// Real bug fixed 2026-09-03 (user report: "circled tabs not working
// properly"): Scenarios/AI Analysis both pointed at the same real target
// ("cortex") and History/Journal both pointed at the same real target
// ("journal") — two differently-labeled buttons doing the identical
// thing, which reads as broken. Collapsed each duplicate pair into the
// one real tab it actually opens. Fundamentals -> "discover" is kept:
// MarketTerminalTab.jsx (dockModule "discover") genuinely fetches and
// shows real fundamentals (market cap, P/E, etc.) alongside its other
// content, not a mislabel.
const TABS = [
  ["Overview", "overview"], ["Technicals", "vcp"], ["Options", "options"], ["News", "news"],
  ["Fundamentals", "discover"], ["Cortex", "cortex"], ["Journal", "journal"],
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
