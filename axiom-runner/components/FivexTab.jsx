import { Badge } from "./ui-atoms.jsx";
import { FIVEX_DATA } from "./fivex-data.js";

export default function FivexTab({
  C, MONO, fivexError, fivexFetchedAt, fivexLoading, fivexPrices, fivexSector, fivexSort,
  setActiveTab, setFivexSector, setFivexSort, setScanExpanded, setScanResults, setTerminalSymbol,
  fetchLivePrices, loadDeepDive, loadDeepSocial,
}) {
          const FIVEX = FIVEX_DATA; // module-level constant — shared with Smart Scanner

          const SECTOR_META = {
            "Defense AI":        { color: "#4488ff", icon: "🛡️" },
            "Robotics":          { color: "#00d4ff", icon: "🤖" },
            "Nuclear":           { color: "#ffaa00", icon: "⚛️" },
            "Space":             { color: "#b06cff", icon: "🚀" },
            "Satellite AI":      { color: "#00ffd4", icon: "🛰️" },
            "Automation":        { color: "#66ff88", icon: "⚙️" },
            "AI Energy":         { color: "#ff6633", icon: "⚡" },
            "Infrastructure":    { color: "#88a0b8", icon: "🏗️" },
            "AI Infrastructure": { color: "#cc66ff", icon: "🖥️" },
            "Quantum AI":        { color: "#ff44cc", icon: "⚛️🤖" },
            "AI Voice":          { color: "#44ffdd", icon: "🎙️" },
            "Air Mobility":      { color: "#88ccff", icon: "✈️" },
          };

          const RISK_COLOR = {
            "Medium":       "#26a69a",
            "Medium-High":  "#a8c030",
            "High":         "#ffaa00",
            "Very High":    "#ff7030",
            "Extreme":      "#ff2255",
          };

          const UPSIDE_COLOR = (u) => {
            if (u === "10x+") return "#ffd700";
            if (u.startsWith("8x")) return "#00d4ff";
            if (u.startsWith("5x")) return "#66ff88";
            return "#aabbcc";
          };

          const $ = (n) => `$${n.toFixed(2)}`;
          const sectors = ["ALL", ...Object.keys(SECTOR_META)];

          // zone classification per ticker (using live price when available)
          function getZone(s) {
            const lv = fivexPrices[s.ticker];
            const p  = lv ? lv.price : s.price;
            if (!lv) return "no-data";
            if (p <= s.stop)     return "stop";
            if (p <= s.e3)       return "deep";
            if (p <= s.e2)       return "better";
            if (p <= s.e1)       return "starter";
            if (p >= s.trigger)  return "breakout";
            return "wait";
          }

          // zone sort order
          const ZONE_ORDER = { deep: 0, better: 1, starter: 2, breakout: 3, wait: 4, stop: 5, "no-data": 6 };
          const UPSIDE_VAL = u => u === "10x+" ? 10 : parseFloat(u) || 0;
          const RISK_ORDER = { Extreme: 0, "Very High": 1, High: 2, "Medium-High": 3, Medium: 4 };

          // sector summary counts
          const counts = {};
          FIVEX.forEach(s => { counts[s.sector] = (counts[s.sector] || 0) + 1; });

          // zone summary counts
          const zoneCounts = { deep: 0, better: 0, starter: 0, breakout: 0, wait: 0, stop: 0 };
          FIVEX.forEach(s => { const z = getZone(s); if (z in zoneCounts) zoneCounts[z]++; });

          // filter + sort
          const filtered = fivexSector === "ALL" ? [...FIVEX] : FIVEX.filter(s => s.sector === fivexSector);
          const visible = filtered.sort((a, b) => {
            if (fivexSort === "zone")   return ZONE_ORDER[getZone(a)] - ZONE_ORDER[getZone(b)];
            if (fivexSort === "upside") return UPSIDE_VAL(b.upside) - UPSIDE_VAL(a.upside);
            if (fivexSort === "risk")   return (RISK_ORDER[a.risk] ?? 9) - (RISK_ORDER[b.risk] ?? 9);
            return a.rank - b.rank; // default: rank
          });

          const TH = (label, tip) => (
            <th title={tip} style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, fontWeight: 700,
              padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap",
              borderBottom: `1px solid ${C.border}`, letterSpacing: "0.06em" }}>
              {label}
            </th>
          );

          return (
            <div>
              {/* ── Header ── */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, letterSpacing: "0.08em" }}>
                    🚀 HIGH-GROWTH THEMATIC WATCHLIST — 5× AND UP
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 4 }}>
                    AI · INFRASTRUCTURE · ROBOTICS · NUCLEAR · SATELLITE · SPACE · AI ENERGY · DEFENCE AI &nbsp;|&nbsp;
                    {FIVEX.length} STOCKS &nbsp;|&nbsp; REF PRICES: 2026-05-27
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: "#ff9900", marginTop: 3 }}>
                    ⚠ Entry zones rule-based (−5% / −12% / −20% from ref price). Not financial advice.
                  </div>
                  {fivexFetchedAt && (
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.green, marginTop: 3 }}>
                      ● LIVE PRICES as of {fivexFetchedAt.toLocaleTimeString()}
                    </div>
                  )}
                  {fivexError && (
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, marginTop: 3 }}>⚠ {fivexError}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={fetchLivePrices}
                    disabled={fivexLoading}
                    style={{ fontFamily: MONO, fontSize: 12,
                      background: fivexLoading ? C.surface : `${C.green}18`,
                      border: `1px solid ${fivexLoading ? C.border : C.green}`,
                      color: fivexLoading ? C.textDim : C.green,
                      borderRadius: 6, padding: "5px 12px", cursor: fivexLoading ? "default" : "pointer", whiteSpace: "nowrap" }}>
                    {fivexLoading ? "⌛ LOADING…" : "↻ LIVE PRICES"}
                  </button>
                  <button
                    onClick={async () => {
                      const lines = ["🚀 *5X Growth Watchlist*\n"];
                      visible.forEach(s => {
                        const lv = fivexPrices[s.ticker];
                        const sm = SECTOR_META[s.sector];
                        const priceStr = lv ? ` @ $${lv.price.toFixed(2)} (${lv.pct >= 0 ? "+" : ""}${lv.pct.toFixed(1)}%)` : "";
                        const zone = lv ? (lv.price <= s.e3 ? " 🟢 DEEP VALUE" : lv.price <= s.e2 ? " 🟡 IN ZONE" : lv.price <= s.e1 ? " 🔵 STARTER" : "") : "";
                        lines.push(`${sm ? sm.icon : "•"} *${s.ticker}*${priceStr}${zone} ${s.upside} — ${s.thesis}`);
                      });
                      try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) }); } catch {}
                    }}
                    style={{ fontFamily: MONO, fontSize: 12, background: `${C.accent}18`, border: `1px solid ${C.accent}55`,
                      color: C.accent, borderRadius: 6, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                    PUSH TO TELEGRAM
                  </button>
                </div>
              </div>

              {/* ── Zone summary bar ── */}
              {Object.keys(fivexPrices).length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12,
                  padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginRight: 4 }}>LIVE ZONES:</span>
                  {[
                    { key: "deep",     label: "🟢 DEEP VALUE",  color: "#00e676" },
                    { key: "better",   label: "⚡ BETTER ENTRY", color: "#4caf50" },
                    { key: "starter",  label: "🔵 STARTER",      color: "#26a69a" },
                    { key: "breakout", label: "🚀 BREAKOUT",     color: "#ffd700" },
                    { key: "wait",     label: "⏳ WAIT",         color: C.textDim },
                    { key: "stop",     label: "⚠ BELOW STOP",   color: C.red     },
                  ].map(({ key, label, color }) => zoneCounts[key] > 0 && (
                    <span key={key} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                      color, background: color + "18", border: `1px solid ${color}44`,
                      borderRadius: 12, padding: "3px 10px", cursor: "pointer" }}
                      onClick={() => setFivexSort("zone")}>
                      {label} <span style={{ fontWeight: 900 }}>{zoneCounts[key]}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* ── Sort + Sector pills row ── */}
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>SORT:</span>
                {[["rank","RANK"],["zone","ZONE"],["upside","UPSIDE"],["risk","RISK"]].map(([val, lbl]) => (
                  <button key={val} onClick={() => setFivexSort(val)} style={{
                    fontFamily: MONO, fontSize: 12, cursor: "pointer", borderRadius: 6,
                    padding: "3px 8px",
                    background: fivexSort === val ? `${C.accent}22` : C.surface,
                    border: `1px solid ${fivexSort === val ? C.accent : C.border}`,
                    color: fivexSort === val ? C.accent : C.textDim, fontWeight: fivexSort === val ? 700 : 400,
                  }}>{lbl}</button>
                ))}
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.border, margin: "0 4px" }}>|</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>SECTOR:</span>
              </div>

              {/* ── Sector summary pills ── */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {sectors.map(sec => {
                  const meta = SECTOR_META[sec];
                  const active = fivexSector === sec;
                  const cnt = sec === "ALL" ? FIVEX.length : (counts[sec] || 0);
                  return (
                    <button key={sec}
                      onClick={() => setFivexSector(sec)}
                      style={{
                        fontFamily: MONO, fontSize: 12, cursor: "pointer", borderRadius: 20,
                        padding: "4px 10px", whiteSpace: "nowrap",
                        background: active ? (meta ? meta.color + "30" : `${C.accent}22`) : C.surface,
                        border: `1px solid ${active ? (meta ? meta.color : C.accent) : C.border}`,
                        color: active ? (meta ? meta.color : C.accent) : C.textDim,
                        fontWeight: active ? 700 : 400,
                      }}>
                      {meta ? meta.icon + " " : ""}{sec} {cnt > 0 && cnt < FIVEX.length ? `(${cnt})` : ""}
                    </button>
                  );
                })}
              </div>

              {/* ── Table ── */}
              <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
                  <thead style={{ background: C.surface }}>
                    <tr>
                      {TH("#", "Rank by price")}
                      {TH("TICKER", "Symbol")}
                      {TH("COMPANY", "Company name")}
                      {TH("SECTOR", "Thematic sector")}
                      {TH("REF PRICE", "Reference capture price (2026-05-27)")}
                      {TH("LIVE", "Live market price + today's change")}
                      {TH("ZONE", "Current entry zone based on live price")}
                      {TH("STARTER −5%", "Starter entry zone")}
                      {TH("BETTER −12%", "Better entry zone")}
                      {TH("DEEP −20%", "Deep value entry zone")}
                      {TH("BREAKOUT +8%", "Breakout trigger level")}
                      {TH("STOP −15%", "Suggested stop loss")}
                      {TH("RISK", "Risk classification")}
                      {TH("UPSIDE", "Potential upside multiple")}
                      {TH("THESIS", "Investment thesis")}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((s, i) => {
                      const meta = SECTOR_META[s.sector] || { color: C.textDim, icon: "•" };
                      const rColor = RISK_COLOR[s.risk] || C.textDim;
                      const uColor = UPSIDE_COLOR(s.upside);
                      const lv = fivexPrices[s.ticker];
                      const liveP = lv ? lv.price : null;
                      // Use live price for zone detection when available, fall back to ref price
                      const checkP = liveP || s.price;
                      const isAboveBreakout = checkP >= s.trigger;
                      const isBelowStop     = checkP <= s.stop;
                      const isInEntry1      = checkP <= s.e1;
                      const isInEntry2      = checkP <= s.e2;
                      const isInEntry3      = checkP <= s.e3;
                      // Row tint based on live zone
                      let rowTint = "transparent";
                      if (liveP) {
                        if (isBelowStop)        rowTint = "#ff22441a";
                        else if (isInEntry3)    rowTint = "#00e67610";
                        else if (isInEntry2)    rowTint = "#4caf5010";
                        else if (isInEntry1)    rowTint = "#26a69a0c";
                        else if (isAboveBreakout) rowTint = "#ffd70010";
                      }
                      const rowBase = i % 2 === 0 ? C.surface : C.bg;
                      const rowBg = rowTint !== "transparent" ? rowTint : rowBase;
                      // Zone badge
                      let zoneBadge = null;
                      if (liveP) {
                        if (isBelowStop)          zoneBadge = { label: "⚠ STOP", color: C.red };
                        else if (isInEntry3)      zoneBadge = { label: "🟢 DEEP", color: "#00e676" };
                        else if (isInEntry2)      zoneBadge = { label: "⚡ BETTER", color: "#4caf50" };
                        else if (isInEntry1)      zoneBadge = { label: "🔵 STARTER", color: "#26a69a" };
                        else if (isAboveBreakout) zoneBadge = { label: "🚀 BREAK", color: "#ffd700" };
                        else                      zoneBadge = { label: "WAIT", color: C.textDim };
                      }
                      return (
                        <tr key={s.ticker} style={{ background: rowBg, cursor: "pointer" }}
                          onClick={async () => {
                            const ticker = s.ticker;
                            setTerminalSymbol(ticker);
                            // Build a scan row from 5X data + live price
                            const lv2  = fivexPrices[ticker];
                            const px2  = lv2?.price || s.price || 0;
                            const signalRow = {
                              ticker,
                              score: lv2?.score || 65,
                              signal: "BUY",
                              signals: [{ txt: s.thesis || "5X potential setup", bull: true }],
                              sColor: C.accent,
                              rsiVal: lv2?.rsi || null,
                              macdBull: null,
                              ema9v: null, ema21v: null,
                              ref: s, // pass the full 5X ref data (entry zones, targets)
                              quote: {
                                price: px2, changePercent: lv2?.chgPct || 0,
                                yearHigh: s.target2 || px2 * 1.3,
                                yearLow: s.stop || px2 * 0.7,
                                priceAvg50: s.e1 || 0, priceAvg200: s.e3 || 0,
                                volume: 0, avgVolume: 0,
                              },
                              candles: null,
                            };
                            setScanResults(prev => {
                              const exists = prev.some(r => r.ticker === ticker);
                              return exists ? prev : [signalRow, ...prev];
                            });
                            setActiveTab("smartscan");
                            setScanExpanded(ticker);
                            loadDeepDive(ticker);
                            loadDeepSocial(ticker);
                          }}
                          title={`Click to open ${s.ticker} in Smart Scanner deep dive`}>
                          {/* Rank */}
                          <td style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center",
                            padding: "12px 10px", borderBottom: `1px solid ${C.border}22` }}>
                            {s.rank}
                          </td>
                          {/* Ticker */}
                          <td style={{ padding: "12px 10px", borderBottom: `1px solid ${C.border}22`, textAlign: "center" }}>
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: meta.color,
                              background: meta.color + "18", borderRadius: 6, padding: "3px 7px" }}>
                              {s.ticker}
                            </span>
                          </td>
                          {/* Company */}
                          <td style={{ fontFamily: MONO, fontSize: 12, color: C.text, padding: "12px 10px",
                            borderBottom: `1px solid ${C.border}22`, whiteSpace: "nowrap" }}>
                            {s.company}
                          </td>
                          {/* Sector */}
                          <td style={{ padding: "12px 10px", borderBottom: `1px solid ${C.border}22`, whiteSpace: "nowrap" }}>
                            <span style={{ fontFamily: MONO, fontSize: 12, color: meta.color, fontWeight: 700 }}>
                              {meta.icon} {s.sector}
                            </span>
                          </td>
                          {/* Ref Price */}
                          <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.textDim,
                            textAlign: "right", padding: "12px 12px", borderBottom: `1px solid ${C.border}22` }}>
                            {$(s.price)}
                          </td>
                          {/* Live Price */}
                          <td style={{ padding: "12px 12px", borderBottom: `1px solid ${C.border}22`, textAlign: "right" }}>
                            {fivexLoading ? (
                              <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>…</span>
                            ) : liveP ? (
                              <div>
                                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800,
                                  color: lv.pct >= 0 ? C.green : C.red }}>
                                  {$(liveP)}
                                </div>
                                <div style={{ fontFamily: MONO, fontSize: 12,
                                  color: lv.pct >= 0 ? C.green : C.red }}>
                                  {lv.pct >= 0 ? "+" : ""}{lv.pct.toFixed(2)}%
                                </div>
                              </div>
                            ) : (
                              <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>—</span>
                            )}
                          </td>
                          {/* Zone Badge */}
                          <td style={{ textAlign: "center", padding: "12px 10px", borderBottom: `1px solid ${C.border}22` }}>
                            {zoneBadge ? (
                              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                                color: zoneBadge.color, background: zoneBadge.color + "22",
                                border: `1px solid ${zoneBadge.color}44`,
                                borderRadius: 6, padding: "2px 5px", whiteSpace: "nowrap" }}>
                                {zoneBadge.label}
                              </span>
                            ) : (
                              <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>—</span>
                            )}
                          </td>
                          {/* Entry 1 -5% */}
                          <td style={{ fontFamily: MONO, fontSize: 12, textAlign: "right", padding: "12px 12px",
                            borderBottom: `1px solid ${C.border}22`,
                            color: isInEntry1 ? "#26a69a" : C.textDim,
                            background: isInEntry1 ? "#26a69a14" : "transparent" }}>
                            {$(s.e1)}
                          </td>
                          {/* Entry 2 -12% */}
                          <td style={{ fontFamily: MONO, fontSize: 12, textAlign: "right", padding: "12px 12px",
                            borderBottom: `1px solid ${C.border}22`,
                            color: isInEntry2 ? "#4caf50" : C.textDim,
                            fontWeight: isInEntry2 ? 700 : 400,
                            background: isInEntry2 ? "#4caf5018" : "transparent" }}>
                            {$(s.e2)}
                          </td>
                          {/* Entry 3 -20% deep value */}
                          <td style={{ fontFamily: MONO, fontSize: 12, textAlign: "right", padding: "12px 12px",
                            borderBottom: `1px solid ${C.border}22`,
                            color: isInEntry3 ? "#00e676" : C.textDim,
                            fontWeight: isInEntry3 ? 800 : 400,
                            background: isInEntry3 ? "#00e67618" : "transparent" }}>
                            {$(s.e3)}
                          </td>
                          {/* Breakout +8% */}
                          <td style={{ fontFamily: MONO, fontSize: 12, textAlign: "right", padding: "12px 12px",
                            borderBottom: `1px solid ${C.border}22`,
                            color: isAboveBreakout ? "#ffd700" : "#ff9900",
                            fontWeight: 700 }}>
                            {$(s.trigger)}
                          </td>
                          {/* Stop -15% */}
                          <td style={{ fontFamily: MONO, fontSize: 12, textAlign: "right", padding: "12px 12px",
                            borderBottom: `1px solid ${C.border}22`, color: C.red }}>
                            {$(s.stop)}
                          </td>
                          {/* Risk */}
                          <td style={{ textAlign: "center", padding: "12px 10px", borderBottom: `1px solid ${C.border}22` }}>
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: rColor,
                              background: rColor + "20", border: `1px solid ${rColor}55`,
                              borderRadius: 6, padding: "3px 7px", whiteSpace: "nowrap" }}>
                              {s.risk.toUpperCase()}
                            </span>
                          </td>
                          {/* Upside */}
                          <td style={{ textAlign: "center", padding: "12px 10px", borderBottom: `1px solid ${C.border}22` }}>
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: uColor }}>
                              {s.upside}
                            </span>
                          </td>
                          {/* Thesis */}
                          <td style={{ fontFamily: MONO, fontSize: 12, color: C.textSec, padding: "12px 12px",
                            borderBottom: `1px solid ${C.border}22`, whiteSpace: "nowrap" }}>
                            {s.thesis}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Legend ── */}
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 14, padding: "10px 14px",
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                  <span style={{ color: "#26a69a" }}>■</span> STARTER −5% &nbsp;
                  <span style={{ color: "#4caf50" }}>■</span> BETTER −12% &nbsp;
                  <span style={{ color: "#00e676", fontWeight: 700 }}>■</span> DEEP −20% &nbsp;&nbsp;
                  <span style={{ color: "#ff9900" }}>■</span> BREAKOUT +8% &nbsp;
                  <span style={{ color: C.red }}>■</span> STOP −15%
                </div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                  {["Extreme","Very High","High","Medium-High","Medium"].map(r => (
                    <span key={r} style={{ marginRight: 10 }}>
                      <span style={{ color: RISK_COLOR[r] }}>■</span> {r}
                    </span>
                  ))}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginLeft: "auto" }}>
                  Click any row → Stock Deep Dive ↗
                </div>
              </div>
            </div>
          );
}
