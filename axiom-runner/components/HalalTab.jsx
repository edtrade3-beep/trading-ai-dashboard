export default function HalalTab({
  C, MONO, SANS, isMobile, halalReport, halalInput, setHalalInput, fetchHalalCheck, halalLoading, halalError,
}) {
        const gold = "#c9a84c";
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        const verdictColor = (v = "") => {
          if (v.includes("HALAL")) return C.green;
          if (v.includes("HARAM")) return C.red;
          return C.amber;
        };
        const verdictMatch = halalReport?.report ? halalReport.report.match(/VERDICT:\s*(.+)/) : null;
        const verdict = verdictMatch ? verdictMatch[1].trim() : null;
        const scoreMatch = halalReport?.report ? halalReport.report.match(/COMPLIANCE SCORE:\s*(\d+)/) : null;
        const score = scoreMatch ? Number(scoreMatch[1]) : null;

        const WATCHLIST_FOR_HALAL = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "PLTR", "RKLB", "BBAI", "SMR", "OKLO", "ASTS"];

        return (
          <div dir="ltr" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Header */}
            <div style={{ ...card({ padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: gold }}>☪ HALAL STOCK SCREENER</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 3 }}>
                  Islamic finance compliance check per AAOIFI standards — powered by AI
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
                <input value={halalInput} onChange={e => setHalalInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter" && halalInput.trim()) fetchHalalCheck(halalInput.trim()); }}
                  placeholder="Enter ticker…"
                  style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, background: C.surface, border: `1px solid ${gold}88`, color: C.text, borderRadius: 6, padding: "7px 12px", width: 140, outline: "none" }} />
                <button onClick={() => halalInput.trim() && fetchHalalCheck(halalInput.trim())} disabled={halalLoading}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: halalLoading ? C.surface : gold, border: "none", color: halalLoading ? C.textDim : "#1a1000", borderRadius: 6, padding: "9px 18px", cursor: halalLoading ? "default" : "pointer" }}>
                  {halalLoading ? "CHECKING…" : "☪ CHECK"}
                </button>
              </div>
            </div>

            {/* Quick pick tickers */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {WATCHLIST_FOR_HALAL.map(t => (
                <button key={t} onClick={() => { setHalalInput(t); fetchHalalCheck(t); }}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                    background: halalReport?.ticker === t ? `${gold}22` : C.surface,
                    border: `1px solid ${halalReport?.ticker === t ? gold : C.border}`,
                    color: halalReport?.ticker === t ? gold : C.textDim,
                    borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>{t}</button>
              ))}
            </div>

            {halalError && (
              <div style={{ ...card({ padding: 16 }), borderLeft: `3px solid ${C.red}` }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>{halalError}</span>
              </div>
            )}

            {halalLoading && (
              <div style={{ ...card({ padding: 40 }), textAlign: "center" }}>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 24, color: gold, marginBottom: 12 }}>بِسْمِ اللَّهِ</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Consulting Islamic finance principles…</div>
              </div>
            )}

            {halalReport && !halalLoading && (() => {
              const SECTION_RE = /^([A-Z][A-Z\s\/]{3,})\n/gm;
              const parts = halalReport.report.split(SECTION_RE).filter(Boolean);
              const sections = [];
              for (let i = 0; i < parts.length; i += 2) {
                if (i + 1 < parts.length) sections.push({ title: parts[i].trim(), body: parts[i + 1].trim() });
                else sections.push({ title: "", body: parts[i].trim() });
              }

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Verdict card */}
                  <div style={{ ...card({ padding: 20, borderLeft: `4px solid ${verdict ? verdictColor(verdict) : gold}` }), display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 4 }}>TICKER</div>
                      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.accent }}>{halalReport.ticker}</div>
                    </div>
                    {verdict && (
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 4 }}>VERDICT</div>
                        <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: verdictColor(verdict) }}>{verdict}</div>
                      </div>
                    )}
                    {score != null && (
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 4 }}>COMPLIANCE SCORE</div>
                        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: score >= 70 ? C.green : score >= 40 ? C.amber : C.red }}>{score}/100</div>
                        <div style={{ height: 6, width: 120, background: C.border, borderRadius: 5, marginTop: 4 }}>
                          <div style={{ width: `${score}%`, height: "100%", background: score >= 70 ? C.green : score >= 40 ? C.amber : C.red, borderRadius: 5 }} />
                        </div>
                      </div>
                    )}
                    <div style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "right" }}>
                      {halalReport.at && new Date(halalReport.at).toLocaleString()}
                    </div>
                  </div>

                  {/* Detail sections */}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
                    {sections.map((s, i) => (
                      s.title !== "VERDICT" && s.title !== "COMPLIANCE SCORE" && (
                        <div key={i} style={{ ...card({ padding: 14, borderLeft: `3px solid ${gold}44` }) }}>
                          {s.title && <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: gold, letterSpacing: "0.07em", marginBottom: 8 }}>☪ {s.title}</div>}
                          <div style={{ fontFamily: SANS, fontSize: 12, color: C.text, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{s.body}</div>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              );
            })()}

            {!halalReport && !halalLoading && (
              <div style={{ ...card({ padding: 40 }), textAlign: "center" }}>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 36, color: gold, marginBottom: 12 }}>☪</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 6 }}>Enter a ticker to check halal compliance</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, maxWidth: 400, margin: "0 auto" }}>
                  Checks business activities, revenue from haram sources, debt ratios, and interest income against AAOIFI Islamic finance screening standards.
                </div>
              </div>
            )}
          </div>
        );
}
