import { useState, useEffect } from "react";
import { computeRegime, SECTOR_ETFS } from "./market-helpers.js";

export default function RhProDashboard({ C, MONO, SANS, macroData, sectorData }) {
  const [fg, setFg] = useState(null), [breadth, setBreadth] = useState(null);
  const [movers, setMovers] = useState(null), [news, setNews] = useState([]);
  const [updated, setUpdated] = useState(null);
  const [guide, setGuide] = useState(() => localStorage.getItem("rhpro_guide_hide") !== "1");
  const [idxSym, setIdxSym] = useState("SPY"); const [idxTf, setIdxTf] = useState("1H"); const [idxBars, setIdxBars] = useState([]);
  useEffect(() => {
    fetch(`/api/market/candles?ticker=${idxSym}&timeframe=${idxTf}`).then(r => r.json())
      .then(d => setIdxBars(d.ok ? (d.bars || []) : [])).catch(() => setIdxBars([]));
  }, [idxSym, idxTf]);
  useEffect(() => {
    const j = (p, set, pick) => fetch(p).then(r => r.json()).then(d => set(pick ? pick(d) : d)).catch(() => {});
    const moversList = "AAPL,MSFT,NVDA,AMZN,META,GOOGL,AVGO,TSLA,AMD,NFLX,MU,QCOM,SMCI,ARM,COIN,PLTR,CRWD,PANW,UBER,SHOP,MARA,RIOT,HUT,TSM,DELL,VRT,CEG,LLY,JPM,COST,XOM,BA,DIS,NKE,HOOD,NET,APP,CVNA,RDDT,SNOW";
    const newsList = "SPY,QQQ,NVDA,AAPL,MSFT,TSLA,AMD,META,AMZN,GOOGL,MU,PLTR";
    const load = () => {
      j("/api/market/feargreed", setFg);
      j("/api/market/breadth", setBreadth);
      j(`/api/market/movers?symbols=${moversList}&n=6`, setMovers);
      j(`/api/market/news?tickers=${newsList}&limit=10`, setNews, d => Array.isArray(d) ? d : (d.news || d.articles || d.items || []));
      setUpdated(new Date());
    };
    load(); const iv = setInterval(load, 60000); return () => clearInterval(iv);
  }, []);

  const regime = computeRegime(macroData);
  const qOf = s => (macroData || []).find(m => (m.symbol || "").toUpperCase() === s);
  const chg = x => Number(x?.changesPercentage ?? x?.changePercent ?? 0);
  const spy = qOf("SPY"), qqq = qOf("QQQ"), iwm = qOf("IWM");
  const vix = Number(regime.vixVal || 0);
  const bias = regime.label === "GREEN" ? "BULLISH" : regime.label === "YELLOW" ? "NEUTRAL / MIXED" : "BEARISH / DEFENSIVE";
  const confidence = regime.score;
  const cashRec = regime.score >= 75 ? "0–25% cash · deploy into strength"
    : regime.score >= 55 ? "40–60% cash · be selective" : "70–100% cash · protect capital";
  const risk = vix >= 28 ? { t: "HIGH", c: C.red } : vix >= 20 ? { t: "ELEVATED", c: C.amber } : vix > 0 ? { t: "NORMAL", c: C.green } : { t: "—", c: C.textDim };

  const sectors = SECTOR_ETFS.map(se => {
    const sd = (sectorData || []).find(x => (x.symbol || "").toUpperCase() === se.symbol);
    return { ...se, chg: chg(sd), has: !!sd };
  }).filter(s => s.has).sort((a, b) => b.chg - a.chg);

  const gainers = (movers?.gainers || movers?.topGainers || []).slice(0, 6);
  const losers = (movers?.losers || movers?.topLosers || []).slice(0, 6);
  const trendTxt = q => !q ? "—" : `${chg(q) >= 0 ? "▲" : "▼"} ${chg(q).toFixed(2)}%`;
  const trendCol = q => !q ? C.textDim : chg(q) >= 0 ? C.green : C.red;

  const Card = ({ title, children, span }) => (
    <div style={{ gridColumn: span ? `span ${span}` : "auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
  const Big = ({ v, c }) => <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 900, color: c || C.text, lineHeight: 1 }}>{v}</div>;
  const Sub = ({ v }) => <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 6 }}>{v}</div>;

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>🎯 ROBINHOOD PRO — COMMAND DECK</div>
        <button onClick={() => setGuide(g => !g)} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: `1px solid ${C.border}`, background: C.surface, color: C.textSec }}>{guide ? "✕ hide guide" : "❔ how to use"}</button>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Manual-trading intelligence · places no orders · {updated ? `updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "loading…"}</div>
      </div>

      {/* How-to-use guide */}
      {guide && (
        <div style={{ background: C.card, border: `1px solid ${C.accent}44`, borderLeft: `3px solid ${C.accent}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent }}>📘 HOW TO USE ROBINHOOD PRO AI</div>
            <button onClick={() => { setGuide(false); localStorage.setItem("rhpro_guide_hide", "1"); }} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: `1px solid ${C.border}`, background: C.surface, color: C.textSec }}>got it — don't show again</button>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.7 }}>
            This module <b>finds and analyzes opportunities</b> so you can execute manually in Robinhood. It <b>never places orders</b> and is fully separate from your Alpaca autopilot.
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, margin: "12px 0 6px", letterSpacing: "0.05em" }}>THE DAILY WORKFLOW ↓</div>
            <div style={{ display: "grid", gap: 6 }}>
              {[
                ["1. 🎯 COMMAND DECK", "Start here. Is the market safe? Check bias, risk level, cash rec. Red day → don't trade."],
                ["2. 🎯 SNIPER SCANNER", "See the whole market ranked 0–100. Filter to ≥75 or 'at buy point'."],
                ["3. 📋 WATCHLISTS", "Or browse by type (breakout, momentum, pullback). Tap any ticker → opens its chart."],
                ["4. 🗺 HEAT MAP", "Only hunt longs in Leading/Improving sectors. Avoid Lagging."],
                ["5. 🖥 TERMINAL", "Full trend-template read, entry/stop/3 targets, AI second opinion, and account-sized position sizing — all on the symbol's chart tab now."],
                ["— execute in Robinhood —", "Place the trade yourself, with the levels Terminal gave you."],
                ["6. 📓 JOURNAL", "Log every trade — including the mistake and the emotion."],
                ["7. 🎓 AI COACH", "Grade each trade A+ to F. It rewards discipline, not luck."],
              ].map(([a, b], i) => (
                <div key={i} style={{ display: "flex", gap: 10 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: a.startsWith("—") ? C.amber : C.text, minWidth: 168 }}>{a}</span>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{b}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 11.5, color: C.textSec }}>💡 <b>The one rule that matters:</b> a green market + a high-score stock + at its buy zone + sized to 1% risk = a real trade. Miss any of those and it's a WAIT, not a trade.</div>
          </div>
        </div>
      )}

      {/* Row 1 — the read */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 12 }}>
        <Card title="MARKET BIAS"><Big v={bias} c={regime.color} /><Sub v={`Regime ${regime.score}/100`} /></Card>
        <Card title="AI CONFIDENCE">
          <Big v={`${confidence}%`} c={confidence >= 75 ? C.green : confidence >= 55 ? C.amber : C.red} />
          <div style={{ height: 6, borderRadius: 3, background: C.surface, marginTop: 8, overflow: "hidden" }}>
            <div style={{ width: `${confidence}%`, height: "100%", background: regime.color }} /></div>
        </Card>
        <Card title="CASH RECOMMENDATION"><Big v={cashRec.split(" · ")[0]} c={C.text} /><Sub v={cashRec.split(" · ")[1] || ""} /></Card>
        <Card title="RISK LEVEL"><Big v={risk.t} c={risk.c} /><Sub v={vix ? `VIX ${vix.toFixed(1)}` : "VIX n/a"} /></Card>
      </div>

      {/* Row 2 — indices + fear/greed + breadth */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 12 }}>
        <Card title="SPY"><Big v={trendTxt(spy)} c={trendCol(spy)} /><Sub v={spy ? `$${Number(spy.price || spy.regularMarketPrice || 0).toFixed(2)}` : ""} /></Card>
        <Card title="QQQ"><Big v={trendTxt(qqq)} c={trendCol(qqq)} /><Sub v={qqq ? `$${Number(qqq.price || qqq.regularMarketPrice || 0).toFixed(2)}` : ""} /></Card>
        <Card title="IWM (small caps)"><Big v={trendTxt(iwm)} c={trendCol(iwm)} /></Card>
        <Card title="FEAR & GREED"><Big v={fg?.value ?? fg?.score ?? "—"} c={C.amber} /><Sub v={fg?.label || fg?.rating || fg?.classification || ""} /></Card>
        <Card title="MARKET BREADTH"><Big v={breadth?.advancers != null ? `${breadth.advancers}/${breadth.decliners}` : (breadth?.breadth ?? "—")} c={C.text} /><Sub v="advancers / decliners" /></Card>
      </div>

      {/* Intraday index chart (real Alpaca data) */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim }}>MARKET · INTRADAY</div>
          <div style={{ display: "flex", gap: 4 }}>{["SPY", "QQQ", "IWM"].map(x => <button key={x} onClick={() => setIdxSym(x)} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 6, cursor: "pointer", border: `1px solid ${idxSym === x ? C.accent : C.border}`, background: idxSym === x ? C.accent : C.surface, color: idxSym === x ? "#fff" : C.textSec }}>{x}</button>)}</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>{["5M", "1H", "1D"].map(x => <button key={x} onClick={() => setIdxTf(x)} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 6, cursor: "pointer", border: `1px solid ${idxTf === x ? C.accent : C.border}`, background: idxTf === x ? C.accent : C.surface, color: idxTf === x ? "#fff" : C.textSec }}>{x}</button>)}</div>
        </div>
        {idxBars.length > 1 ? (() => {
          const cl = idxBars.map(b => b.close); const hi = Math.max(...cl), lo = Math.min(...cl), sp = (hi - lo) || 1;
          const W = 720, H = 140, P = 6; const xf = i => P + i / (idxBars.length - 1) * (W - P * 2); const yf = v => P + (hi - v) / sp * (H - P * 2);
          const up = cl[cl.length - 1] >= cl[0];
          return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
            <polyline points={cl.map((v, i) => `${xf(i)},${yf(v)}`).join(" ")} fill="none" stroke={up ? C.green : C.red} strokeWidth="2" />
            <text x={P} y={yf(hi) + 9} fontSize="9" fill={C.textDim} fontFamily={MONO}>${hi.toFixed(2)}</text>
            <text x={P} y={yf(lo)} fontSize="9" fill={C.textDim} fontFamily={MONO}>${lo.toFixed(2)}</text>
          </svg>;
        })() : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, padding: "16px 0", textAlign: "center" }}>Loading intraday…</div>}
      </div>

      {/* Row 3 — sectors + movers + news */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1.2fr", gap: 12, alignItems: "start" }}>
        <Card title="SECTOR STRENGTH (today)">
          {sectors.length ? sectors.map(s => (
            <div key={s.symbol} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontFamily: SANS, fontSize: 12.5 }}>
              <span style={{ color: C.text }}>{s.name}</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: s.chg >= 0 ? C.green : C.red }}>{s.chg >= 0 ? "+" : ""}{s.chg.toFixed(2)}%</span>
            </div>
          )) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Sector data loading…</div>}
        </Card>
        <Card title="TOP MOVERS">
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.green, marginBottom: 4 }}>GAINERS</div>
          {gainers.length ? gainers.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12, padding: "2px 0" }}>
              <span style={{ color: C.text }}>{m.symbol || m.ticker}</span><span style={{ color: C.green }}>+{Number(m.changesPercentage ?? m.changePercent ?? 0).toFixed(1)}%</span></div>
          )) : <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>—</div>}
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.red, margin: "8px 0 4px" }}>LOSERS</div>
          {losers.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12, padding: "2px 0" }}>
              <span style={{ color: C.text }}>{m.symbol || m.ticker}</span><span style={{ color: C.red }}>{Number(m.changesPercentage ?? m.changePercent ?? 0).toFixed(1)}%</span></div>
          ))}
        </Card>
        <Card title="BREAKING NEWS">
          {(news || []).slice(0, 7).map((n, i) => (
            <a key={i} href={n.url || n.link || "#"} target="_blank" rel="noreferrer" style={{ display: "block", fontFamily: SANS, fontSize: 12, color: C.text, textDecoration: "none", padding: "5px 0", borderBottom: `1px solid ${C.border}`, lineHeight: 1.4 }}>
              {(n.title || n.headline || "").slice(0, 110)}</a>
          ))}
          {!news.length && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>News loading…</div>}
        </Card>
      </div>

      <div style={{ marginTop: 12, fontFamily: SANS, fontSize: 10, color: C.textDim }}>
        ⚠️ Educational — analysis only. Places no orders and is fully isolated from the Alpaca autopilot. You execute manually in Robinhood.
      </div>
    </div>
  );
}
