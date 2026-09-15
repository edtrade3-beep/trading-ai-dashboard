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
const DEFAULT_GROUPS = [
  { name: null, items: [["Overview", "overview"], ["Technicals", "vcp"], ["Options", "options"], ["News", "news"], ["Fundamentals", "discover"], ["Cortex", "cortex"], ["Journal", "journal"]] },
];

// Collapsed from an always-visible 7-button row into one "Deep Analysis"
// dropdown (2026-09-15, "AI Trade Desk restructure" master prompt's own
// explicit closing recommendation: "don't keep separate Overview/
// Technicals/Options/News/Fundamentals/Cortex sub-tabs either — put them
// behind a single Deep Analysis expandable section"). Extended the SAME
// day ("simplify the entire user experience" master prompt, "Place
// advanced information behind ONE expandable section... Do not recreate
// eight visible tabs") to absorb the Trade Desk's OWN separate always-
// visible 19-item side rail too — `groups` now carries that rail's real
// DOCK_GROUPS structure (TradeDeskTab.jsx builds it, this component
// declares no second copy of that list), grouped with real section
// headers instead of one flat 7-item list. `groups` defaults to the
// original 7-item shape so any other real caller stays unaffected.
export default function TradeDeskTabs({ symbol, activeKey, onOpen, groups = DEFAULT_GROUPS, C, MONO }) {
  const [open, setOpen] = useState(false);
  const flat = groups.flatMap((g) => g.items);
  const active = flat.find(([, target]) => target === activeKey);
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
          <div role="menu" style={{ position: "absolute", top: "100%", left: 10, marginTop: 4, zIndex: 21, display: "flex", flexDirection: "column", gap: 2, border: `1px solid ${C.border}`, background: C.card, borderRadius: 8, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", minWidth: 190, maxHeight: "70vh", overflowY: "auto" }}>
            {groups.map((group, gi) => (
              <div key={group.name || gi}>
                {group.name && (
                  <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", padding: "6px 10px 3px" }}>{group.name}</div>
                )}
                {group.items.map(([label, target]) => (
                  <button key={label} role="menuitem" aria-current={activeKey === target ? "page" : undefined}
                    onClick={() => { onOpen(target); setOpen(false); }}
                    style={{ width: "100%", textAlign: "left", border: "none", background: activeKey === target ? `${C.accent}18` : "transparent", color: activeKey === target ? C.accent : C.textSec, borderRadius: 5, padding: "7px 10px", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
