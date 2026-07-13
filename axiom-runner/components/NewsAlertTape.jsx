// News / Alert Tape — the scrolling ticker strip under the market index strip
export default function NewsAlertTape({ C, MONO, SANS, topHeadlineTape }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, background: "#06090e", overflow: "hidden", whiteSpace: "nowrap" }}>
      <div className="axiom-ticker-track" style={{ display: "inline-flex", alignItems: "center", gap: 26, padding: "6px 0", animation: "axiomTickerLTR 500s linear infinite" }}>
        {[...topHeadlineTape, ...topHeadlineTape].map((item, i) => {
          const toneColor = item.tone === "red" ? C.red : item.tone === "green" ? C.green : item.tone === "amber" ? C.amber : C.accent;
          const toneBg    = item.tone === "red" ? C.redBg : item.tone === "green" ? C.greenBg : item.tone === "amber" ? C.amberBg : `${C.accent}12`;
          return (
            <span key={`ticker-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, paddingRight: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: toneColor, background: toneBg, border: `1px solid ${toneColor}44`, borderRadius: 5, padding: "3px 7px" }}>
                {item.kind}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "#e8e8e8" }}>{item.symbol}</span>
              <span style={{ fontFamily: SANS, fontSize: 12, color: "#c8cfd8", maxWidth: 460, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", verticalAlign: "bottom" }}>
                {item.text}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
