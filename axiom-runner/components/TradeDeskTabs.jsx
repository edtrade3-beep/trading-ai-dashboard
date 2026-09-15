import React, { useState } from "react";

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

// Collapsed from an always-visible 7-button row into one "Deep Analysis"
// dropdown (2026-09-15, "AI Trade Desk restructure" master prompt's own
// explicit closing recommendation: "don't keep separate Overview/
// Technicals/Options/News/Fundamentals/Cortex sub-tabs either — put them
// behind a single Deep Analysis expandable section"). Zero change to the
// underlying contract: same TABS list, same onOpen(target)/activeKey
// props, same real dockModule this already switched before — only the
// visual chrome (one toggle + a dropdown menu instead of 7 permanent
// buttons) changes. Journal is genuinely a different destination
// (opens the real Journal tab, symbol-scoped view) — kept in the list,
// unchanged behavior.
export default function TradeDeskTabs({ symbol, activeKey, onOpen, C, MONO }) {
  const [open, setOpen] = useState(false);
  const active = TABS.find(([, target]) => target === activeKey);
  const activeLabel = active ? active[0] : "Overview";

  return (
    <div style={{ position: "relative", padding: "6px 10px", background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true" aria-expanded={open}
        aria-label={`${symbol || "Ticker"} deep analysis menu`}
        style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${open ? C.accent : C.border}`, background: open ? `${C.accent}18` : "transparent", color: open ? C.accent : C.textSec, borderRadius: 5, padding: "6px 10px", fontFamily: MONO, fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}
      >
        🔍 Deep Analysis{activeLabel !== "Overview" ? ` — ${activeLabel}` : ""} <span style={{ fontSize: 9 }}>{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <>
          {/* Click-away backdrop — invisible, sits under the menu, closes
              the dropdown on any outside click without needing a
              document-level listener. */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div role="menu" style={{ position: "absolute", top: "100%", left: 10, marginTop: 4, zIndex: 21, display: "flex", flexDirection: "column", gap: 2, border: `1px solid ${C.border}`, background: C.card, borderRadius: 8, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", minWidth: 160 }}>
            {TABS.map(([label, target]) => (
              <button key={label} role="menuitem" aria-current={activeKey === target ? "page" : undefined}
                onClick={() => { onOpen(target); setOpen(false); }}
                style={{ textAlign: "left", border: "none", background: activeKey === target ? `${C.accent}18` : "transparent", color: activeKey === target ? C.accent : C.textSec, borderRadius: 5, padding: "7px 10px", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
