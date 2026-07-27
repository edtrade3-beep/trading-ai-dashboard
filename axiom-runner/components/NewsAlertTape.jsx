// News / Alert Tape — the scrolling ticker strip under the market index strip
export default function NewsAlertTape({ C, MONO, SANS, topHeadlineTape, tapeFilter = "all", setTapeFilter }) {
  const filtered = tapeFilter === "all" ? topHeadlineTape : topHeadlineTape.filter((item) => item.bias === tapeFilter);
  const FILTERS = [
    { id: "all", label: "All" },
    { id: "bullish", label: "🟢 Bullish" },
    { id: "bearish", label: "🔴 Bearish" },
  ];
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", alignItems: "center" }}>
      {setTapeFilter && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRight: `1px solid ${C.border}`, flexShrink: 0 }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setTapeFilter(f.id)}
              style={{
                fontFamily: MONO, fontSize: 10.5, fontWeight: 700, cursor: "pointer",
                padding: "3px 8px", borderRadius: 5, whiteSpace: "nowrap",
                border: `1px solid ${tapeFilter === f.id ? C.accent : C.border}`,
                background: tapeFilter === f.id ? `${C.accent}18` : "transparent",
                color: tapeFilter === f.id ? C.accent : C.textDim,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ overflow: "hidden", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
      {filtered.length === 0 ? (
        <div style={{ padding: "6px 12px", fontFamily: SANS, fontSize: 12, color: C.textDim }}>
          No {tapeFilter} items right now.
        </div>
      ) : (
      <div className="axiom-ticker-track" style={{ display: "inline-flex", alignItems: "center", gap: 26, padding: "6px 0", animation: "axiomTickerLTR 500s linear infinite" }}>
        {[...filtered, ...filtered].map((item, i) => {
          const toneColor = item.tone === "red" ? C.red : item.tone === "green" ? C.green : item.tone === "amber" ? C.amber : C.accent;
          const toneBg    = item.tone === "red" ? C.redBg : item.tone === "green" ? C.greenBg : item.tone === "amber" ? C.amberBg : `${C.accent}12`;
          return (
            <span key={`ticker-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, paddingRight: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: toneColor, background: toneBg, border: `1px solid ${toneColor}44`, borderRadius: 5, padding: "3px 7px" }}>
                {item.kind}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>{item.symbol}</span>
              <span style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, maxWidth: 460, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", verticalAlign: "bottom" }}>
                {item.text}
              </span>
            </span>
          );
        })}
      </div>
      )}
      </div>
    </div>
  );
}
