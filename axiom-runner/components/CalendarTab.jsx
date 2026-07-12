export default function CalendarTab({
  C, MONO, isMobile, themeMode,
}) {
          const CAL_H = isMobile ? 520 : 720;
          const tvTheme = themeMode === "dark" ? "dark" : "light";
          return (
            <div style={{ padding: "0 2px" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
                padding: "12px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text, letterSpacing: "0.06em" }}>
                    📅 ECONOMIC CALENDAR
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>
                    Upcoming market-moving events — Fed · CPI · NFP · GDP · Earnings · Central Banks
                  </div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  {[
                    { label: "HIGH IMPACT", color: C.red },
                    { label: "MEDIUM",      color: C.amber },
                    { label: "LOW",         color: C.textDim },
                  ].map(({ label, color }) => (
                    <span key={label} style={{ fontFamily: MONO, fontSize: 12, color,
                      background: color + "20", border: `1px solid ${color}44`,
                      borderRadius: 6, padding: "3px 8px" }}>
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* TradingView Economic Calendar Widget */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                overflow: "hidden" }}>
                <iframe
                  title="Economic Calendar"
                  scrolling="no"
                  style={{ width: "100%", height: CAL_H, border: "none", display: "block" }}
                  src={`/client/tv-widget.html?w=events&s=SPY&t=${themeMode === "dark" ? "dark" : "light"}&h=${CAL_H}`}
                />
              </div>

              {/* Quick reference */}
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { event: "FOMC Rate Decision", desc: "Fed interest rate — market-wide impact", color: C.red },
                  { event: "CPI Inflation",       desc: "Consumer Price Index — USD + equities move",  color: C.red },
                  { event: "NFP Jobs Report",     desc: "Non-Farm Payrolls — 1st Friday monthly",      color: C.red },
                  { event: "GDP",                 desc: "Economic growth — quarterly",                  color: C.amber },
                  { event: "PCE Inflation",       desc: "Fed's preferred inflation gauge",              color: C.amber },
                  { event: "PPI",                 desc: "Producer Price Index — leading CPI",           color: C.amber },
                ].map(({ event, desc, color }) => (
                  <div key={event} style={{ flex: "1 1 200px", minWidth: 180,
                    background: C.card, border: `1px solid ${color}33`,
                    borderLeft: `3px solid ${color}`, borderRadius: 6, padding: "8px 12px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color }}>{event}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          );
}
