export default function CommandPaletteModal({ C, MONO, paletteOpen, setPaletteOpen, paletteInput, setPaletteInput, runPaletteCommand }) {
  if (!paletteOpen) return null;
  return (
        <div onClick={() => setPaletteOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.18)", zIndex: 1200, display: "grid", placeItems: "start center", paddingTop: "14vh" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: "92vw", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(15,27,45,0.18)" }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>AXIOM COMMAND PALETTE (GO)</div>
              <input
                autoFocus
                value={paletteInput}
                onChange={(e) => setPaletteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    runPaletteCommand(paletteInput);
                    setPaletteOpen(false);
                    setPaletteInput("");
                  }
                }}
                placeholder="Examples: NVDA GO | EARNINGS GO | MACRO GO | TERMINAL GO | TF 15M GO"
                style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "10px 12px", borderRadius: 6 }}
              />
            </div>
            <div style={{ padding: "10px 12px", display: "grid", gap: 4 }}>
              {["NVDA GO", "EARNINGS GO", "MACRO GO", "NEWS GO", "TV GO", "ALERTS GO", "AGENT GO", "WORKFLOW GO", "FLOW GO", "PORTFOLIO GO", "SCANNER GO", "BACKTEST GO", "TERMINAL GO", "JOURNAL GO", "TF 5M GO", "TF 1D GO", "LAYOUT 2 GO", "LAYOUT 4 GO", "QURAN GO", "ATHAN GO", "ATHKAR GO", "TASBIH GO"].map((cmd) => (
                <button key={cmd} onClick={() => { runPaletteCommand(cmd); setPaletteOpen(false); setPaletteInput(""); }} style={{ textAlign: "left", border: `1px solid ${C.border}`, background: C.card, borderRadius: 6, padding: "8px 10px", cursor: "pointer", fontFamily: MONO, fontSize: 12, color: C.textSec }}>
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>
  );
}
