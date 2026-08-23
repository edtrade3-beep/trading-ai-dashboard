import { useState, useRef, useEffect } from "react";
import { C, MONO, SANS } from "./theme.js";

// ─────────────────────────────────────────────────────────────────────────
// QUICK CHART SEARCH — a self-contained floating shortcut button, same
// fixed-overlay pattern as TradingCopilot/RealityCheckWidget/
// FloatingChecklistButton (2026-08-05, explicit user request: a one-tap way
// to search a symbol that "every time i search chart page open straight
// [to the] chart" — the existing top-bar ticker search doesn't always do
// that; on the Dashboard tab it opens a DeepDive modal in place instead of
// navigating, which is exactly the inconsistency this button exists to
// route around). Tap the button anywhere in the app, type a ticker, hit
// Enter — it always lands on the Chart tab with that symbol loaded, no
// matter which tab you started on. Zero fetch of its own; it just sets the
// same real terminalSymbol state + mterminal_load_sym localStorage key
// every other "open in chart" handoff in this app already uses.
// ─────────────────────────────────────────────────────────────────────────
export default function ChartSearchWidget({ setActiveTab, setTerminalSymbol, statusBarH = 40, fabFading = false, isMobile = false } = {}) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const go = () => {
    const sym = ticker.trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g, "").slice(0, 12);
    if (!sym) return;
    setTerminalSymbol && setTerminalSymbol(sym);
    try { localStorage.setItem("mterminal_load_sym", sym); } catch {}
    setActiveTab && setActiveTab("mterminal");
    setTicker("");
    setOpen(false);
  };

  // Mobile FAB stack — vertical column, right:10, staggered bottom, hidden
  // by default via fabFading (2026-08-23 revision, see
  // TradingCopilot.jsx's header comment). Topmost slot in the column.
  return (
    <div style={{
      position: "fixed", zIndex: 300, fontFamily: SANS,
      bottom: (isMobile ? 218 : 82) + statusBarH, right: isMobile ? 10 : 86,
    }}>
      {open && (
        <div
          role="dialog"
          aria-label="Quick Chart Search"
          style={{
            position: "absolute", bottom: 64, right: 0, width: 260, maxWidth: "90vw",
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14,
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)", overflow: "hidden", padding: 12,
          }}
        >
          <div style={{ color: C.textDim, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", marginBottom: 8 }}>
            📈 GO TO CHART
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              ref={inputRef}
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") go(); if (e.key === "Escape") setOpen(false); }}
              placeholder="NVDA, TSLA…"
              style={{
                flex: 1, background: C.surface, border: `1px solid ${C.border}`, color: C.text,
                borderRadius: 8, padding: "9px 12px", fontFamily: MONO, fontSize: 13, fontWeight: 700, outline: "none",
              }}
            />
            <button onClick={go}
              style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "9px 14px", borderRadius: 8, border: "none",
                background: C.accent, color: "#fff", cursor: "pointer" }}>
              GO
            </button>
          </div>
        </div>
      )}

      <button
        className={`fab-chartsearch-btn${!isMobile && !open ? " fab-peek" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Quick Chart Search" : "Open Quick Chart Search"}
        title="Quick Chart Search — jump straight to a symbol's chart"
        style={{
          width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: "50%", cursor: "pointer",
          background: C.bg, border: `2px solid ${C.accent}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 14 : 16,
          opacity: fabFading && !open ? 0 : (isMobile || open ? 1 : undefined), pointerEvents: fabFading && !open ? "none" : "auto", transition: "opacity 0.2s",
        }}
      >
        {open ? <span style={{ color: C.text, fontSize: isMobile ? 13 : 15 }}>×</span> : "🔎"}
      </button>
    </div>
  );
}
