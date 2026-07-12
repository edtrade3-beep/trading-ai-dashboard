import { Badge } from "./ui-atoms.jsx";

export default function SectorsTab({
  C, MONO, SANS, sectorData, WEATHER_ZIP, fetchWeather, weatherLoading, weatherError, weatherData,
  weatherCodeLabel, watchlistSymbols, setWatchlistSymbols, setTerminalSymbol, setActiveTab,
}) {
  return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                SECTOR PERFORMANCE — LIVE
              </div>
              {sectorData.length > 0 && (
                <button
                  onClick={async () => {
                    const sorted = [...sectorData].sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0));
                    const lines = ["🏭 *Sector Snapshot*\n"];
                    sorted.forEach((q, i) => {
                      const chg = q.changesPercentage || 0;
                      const icon = chg >= 0 ? "🟢" : "🔴";
                      const tag = i < 3 ? " ▲ LEADING" : i >= sorted.length - 3 ? " ▼ LAGGING" : "";
                      lines.push(`${icon} *${q.symbol}* ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%${tag}`);
                    });
                    try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) }); } catch {}
                  }}
                  style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 6, padding: "5px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                >PUSH BRIEF</button>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <div style={{ minWidth: 420, maxWidth: 560, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent }}>WEATHER ({WEATHER_ZIP})</div>
                  <button
                    onClick={fetchWeather}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                  >
                    {weatherLoading ? "..." : "REFRESH"}
                  </button>
                </div>
                {weatherError && <div style={{ fontSize: 12, color: C.red }}>{weatherError}</div>}
                {!weatherError && !weatherData && <div style={{ fontSize: 12, color: C.textDim }}>Loading weather...</div>}
                {!weatherError && weatherData && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text }}>{weatherData.temp.toFixed(0)}°F</span>
                    <span style={{ fontSize: 12, color: C.textSec }}>{weatherCodeLabel(weatherData.code)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>H/L {weatherData.high.toFixed(0)}°/{weatherData.low.toFixed(0)}°</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Wind {weatherData.wind.toFixed(0)} mph</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: weatherData.rainChance >= 50 ? C.red : C.green }}>Rain {weatherData.rainChance.toFixed(0)}%</span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
              {[...sectorData]
                .sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0))
                .map((q, i) => {
                  const chg = q.changesPercentage || 0;
                  const isUp = chg >= 0;
                  const isLeader = i < 3;
                  const isLagger = i >= sectorData.length - 3;
                  return (
                    <div key={q.symbol} style={{
                      background: C.card, borderRadius: 5, padding: 18,
                      border: `1px solid ${isLeader ? C.green + "40" : isLagger ? C.red + "30" : C.border}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{q.symbol}</span>
                        {isLeader && <Badge color={C.green}>LEADING</Badge>}
                        {isLagger && <Badge color={C.red}>LAGGING</Badge>}
                      </div>
                      <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, marginBottom: 10 }}>{q._sectorName}</div>
                      <div style={{
                        fontFamily: MONO, fontSize: 26, fontWeight: 800,
                        color: isUp ? C.green : C.red, marginBottom: 8,
                      }}>
                        {isUp ? "+" : ""}{chg.toFixed(2)}%
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: MONO, color: C.textDim, marginBottom: 8 }}>
                        <span>${q.price?.toFixed(2)}</span>
                        <span>Vol: {q.volume ? (q.volume / 1e6).toFixed(1) + "M" : "—"}</span>
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(q.symbol) ? prev.filter(s => s !== q.symbol) : Array.from(new Set([...prev, q.symbol])))}
                          style={{ flex: 1, fontFamily: MONO, fontSize: 12, padding: "3px 0", background: watchlistSymbols.includes(q.symbol) ? `${C.red}18` : `${C.green}18`, color: watchlistSymbols.includes(q.symbol) ? C.red : C.green, border: `1px solid ${watchlistSymbols.includes(q.symbol) ? C.red : C.green}44`, borderRadius: 5, cursor: "pointer" }}
                        >{watchlistSymbols.includes(q.symbol) ? "−WL" : "+WL"}</button>
                        <button
                          onClick={() => { setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }}
                          style={{ flex: 1, fontFamily: MONO, fontSize: 12, padding: "3px 0", background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 5, cursor: "pointer" }}
                        >CHART</button>
                        <button
                          onClick={async () => {
                            const msg = `🏭 *${q.symbol}* ${q._sectorName || ""}\n${chg >= 0 ? "🟢" : "🔴"} ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%  $${q.price?.toFixed(2)}${isLeader ? "  ▲ LEADING" : isLagger ? "  ▼ LAGGING" : ""}`;
                            try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                          }}
                          style={{ fontFamily: MONO, fontSize: 12, padding: "3px 5px", background: C.surface, color: C.textDim, border: `1px solid ${C.textDim}44`, borderRadius: 5, cursor: "pointer" }}
                          title="Push to Telegram"
                        >PUSH</button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
  );
}
