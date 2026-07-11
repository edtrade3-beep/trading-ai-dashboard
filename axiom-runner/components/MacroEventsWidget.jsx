// Directional "whisper" guidance per event — general market read, not a forecast number
const MACRO_WHISPERS = {
  CPI:    "Cooler core → rate-cut bets → risk-on. Hot print → yields up, risk-off.",
  PCE:    "Fed's preferred gauge — soft = dovish tailwind for stocks.",
  FED:    "Hold widely expected; the move is in the dot plot & Powell's tone on cut timing.",
  FOMC:   "Hold widely expected; the move is in the dot plot & Powell's tone on cut timing.",
  JOBS:   "Hot jobs = hawkish (yields up, growth/tech pressure). Weak = recession fears.",
  NFP:    "Hot jobs = hawkish (yields up, growth/tech pressure). Weak = recession fears.",
  PPI:    "Leads CPI by 1–2 months — confirms or challenges the inflation trend.",
  RETAIL: "Strong = resilient consumer (risk-on); weak = slowdown fears.",
  GDP:    "Two negative quarters = technical recession. Growth surprises move yields.",
};

const MOVERS_UNIVERSE = "AAPL,MSFT,NVDA,AMZN,META,GOOGL,TSLA,AMD,AVGO,NFLX,JPM,BAC,XOM,WMT,UNH,LLY,COST,CRM,ORCL,ADBE,INTC,MU,PLTR,COIN,SMCI,MRVL,QCOM,UBER,DIS,BA";

export default function MacroEventsWidget({ C, MONO, SANS }) {
  const [live, setLive] = React.useState(null);   // FMP events with real numbers (when key set)
  const [cal, setCal]   = React.useState(null);   // fallback upcoming events (dates only)
  const [movers, setMovers] = React.useState(null);
  React.useEffect(() => {
    const loadMovers = () => fetch(`/api/market/movers?symbols=${MOVERS_UNIVERSE}&n=5`)
      .then(r => r.json()).then(d => { if (d && d.gainers) setMovers(d); }).catch(() => {});
    loadMovers();
    const mt = setInterval(loadMovers, 60000);
    return () => clearInterval(mt);
  }, []);
  React.useEffect(() => {
    const load = () => {
      // 1) try live FMP numbers
      fetch("/api/market/econ-events").then(r => r.json()).then(d => {
        const evs = (d?.events || []).filter(e => e.estimate != null || e.previous != null || e.actual != null);
        setLive(evs.length ? evs : []);
      }).catch(() => setLive([]));
      // 2) always load upcoming-event dates + whisper guidance as the base view
      fetch("/api/market/econ-calendar").then(r => r.json()).then(d => {
        const want = ["CPI", "FED", "FOMC", "NFP", "JOBS", "PCE", "PPI"];
        const evs = (d?.events || []).filter(e => want.includes(e.tag) && e.dte >= -1).slice(0, 5);
        setCal(evs);
      }).catch(() => setCal([]));
    };
    load();
    const t = setInterval(load, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const fmtDate = ds => { try { return new Date(ds).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ds; } };
  const hasLive = live && live.length > 0;
  const rows = hasLive ? live.slice(0, 5) : (cal || []);
  if (!rows.length) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 8 }}>
        📅 MACRO — CPI / FOMC {hasLive ? <>ESTIMATES <span style={{ color: C.green }}>● LIVE</span></> : <>MARKET READ <span style={{ color: C.amber }}>● guide</span></>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
      <div>
      {rows.map((e, i) => {
        const tag = (e.tag || "").toUpperCase();
        const sev = (e.impact === "High" || e.impact === "HIGH" || ["CPI","FED","FOMC","JOBS","NFP","PCE"].includes(tag)) ? C.red : C.amber;
        const whisper = MACRO_WHISPERS[tag] || e.note || "";
        return (
          <div key={i} style={{ borderRight: `3px solid ${sev}`, paddingRight: 10, marginBottom: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: sev, background: `${sev}18`, borderRadius: 3, padding: "1px 6px" }}>{tag}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{e.event || e.name}</span>
              {hasLive && <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginLeft: "auto" }}>{fmtDate(e.date)}</span>}
            </div>
            {hasLive && (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontFamily: MONO, fontSize: 11, marginBottom: 2 }}>
                {e.previous != null && <span style={{ color: C.textDim }}>Prior <b style={{ color: C.text }}>{e.previous}</b></span>}
                {e.estimate != null && <span style={{ color: C.textDim }}>Est. <b style={{ color: C.accent }}>{e.estimate}</b></span>}
                {e.actual != null && <span style={{ color: C.textDim }}>Actual <b style={{ color: C.green }}>{e.actual}</b></span>}
              </div>
            )}
            {whisper && <div style={{ fontFamily: SANS, fontSize: 11, color: C.amber }}>💬 {whisper}</div>}
          </div>
        );
      })}
      <div style={{ fontFamily: SANS, fontSize: 9, color: C.textDim }}>
        {hasLive ? "Live consensus & actuals from FMP." : "What each event means for the market. Add FMP_API_KEY for live dates, consensus & actual numbers."}
      </div>
      </div>

      {/* STOCK MOVERS (fills the right side) */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>📈 STOCK MOVERS</div>
        {!movers ? (
          <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Loading movers…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["GAINERS", movers.gainers, C.green], ["LOSERS", movers.losers, C.red]].map(([title, list, col]) => (
              <div key={title}>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: col, marginBottom: 4 }}>{title}</div>
                {(list || []).slice(0, 5).map((m) => (
                  <div key={m.symbol} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0", fontFamily: MONO, fontSize: 11 }}>
                    <span style={{ fontWeight: 800, color: C.text }}>{m.symbol}</span>
                    <span style={{ color: C.textDim, fontSize: 10 }}>${Number(m.price).toFixed(2)}</span>
                    <span style={{ fontWeight: 800, color: m.changesPercentage >= 0 ? C.green : C.red, minWidth: 52, textAlign: "right" }}>
                      {m.changesPercentage >= 0 ? "+" : ""}{Number(m.changesPercentage).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
