export default function ShortcutHelpModal({ C, MONO, SANS, shortcutHelpOpen, setShortcutHelpOpen, hotkeyProfile }) {
  if (!shortcutHelpOpen) return null;
  return (
    <div onClick={() => setShortcutHelpOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.55)", zIndex: 1300, display: "grid", placeItems: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(15,27,45,0.25)", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontFamily: MONO, fontSize: 13, color: C.text, fontWeight: 700 }}>KEYBOARD SHORTCUTS</div>
          <button onClick={() => setShortcutHelpOpen(false)} style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer", fontSize: 18, padding: "0 4px" }}>×</button>
        </div>
        {[
          { section: "GLOBAL" },
          { key: "Ctrl+K  or  /", desc: "Open command palette" },
          { key: "?", desc: "Show this help overlay" },
          { key: "Esc", desc: "Close any overlay / palette" },
          { section: "TERMINAL (when terminal tab is active)" },
          { key: hotkeyProfile === "scalper" ? "Z" : "Q", desc: "Switch chart to 5M" },
          { key: hotkeyProfile === "scalper" ? "X" : "W", desc: "Switch chart to 15M" },
          { key: hotkeyProfile === "scalper" ? "C" : "E", desc: "Switch chart to 1H" },
          { key: hotkeyProfile === "scalper" ? "V" : "R", desc: "Switch chart to 1D" },
          { key: hotkeyProfile === "scalper" ? "B" : "T", desc: "Switch chart to 1W" },
          { key: "1", desc: "Single-panel layout" },
          { key: "2", desc: "Two-panel layout" },
          { key: "4", desc: "Four-panel layout" },
          { section: "NAVIGATION — press anywhere (not in input)" },
          { key: "M", desc: "📊 Monitor (dashboard)" },
          { key: "S", desc: "🔍 Smart Scanner" },
          { key: "G", desc: "📈 Gap Scan" },
          { key: "C", desc: "📈 Chart (Terminal)" },
          { key: "N", desc: "📰 News" },
          { key: "P", desc: "💼 Portfolio" },
          { key: "J", desc: "📓 Journal" },
          { key: "A", desc: "📅 Earnings Calendar" },
          { key: "E", desc: "🗓 Economic Calendar" },
          { key: "Click watchlist row", desc: "Open deep dive" },
        ].map((item, i) => item.section
          ? <div key={i} style={{ fontFamily: MONO, fontSize: 12, color: C.accent, letterSpacing: "0.12em", fontWeight: 700, marginTop: i > 0 ? 14 : 0, marginBottom: 6 }}>{item.section}</div>
          : <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
              <kbd style={{ fontFamily: MONO, fontSize: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px", color: C.text }}>{item.key}</kbd>
              <span style={{ fontFamily: SANS, fontSize: 12, color: C.textSec }}>{item.desc}</span>
            </div>
        )}
        <div style={{ marginTop: 16, fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center" }}>
          Hotkey profile: <strong>{hotkeyProfile}</strong> · Change in Terminal → profile selector
        </div>
      </div>
    </div>
  );
}
