import { useState, useEffect, useRef } from "react";
import { computeRegime, STOCK_TO_SECTOR } from "./market-helpers.js";
import {
  computeScores, computeGreenLight, logTradeNote, addPaperTrade,
  addPaperOption, alpacaOption,
} from "./trading-utils.js";
import RhProJournal from "./rhpro-journal.jsx";

// ── 🤖 Ask Claude — real AI second-opinion on a setup (cheap Haiku call) ──
// State lives in the parent (out/setOut props) so it survives card remounts.
function AISetupReview({ r, regimeScore, C, MONO, SANS, out, setOut }) {
  const num = (v, d = 2) => Number(v || 0).toFixed(d);
  const ask = () => {
    setOut(r.symbol, "loading");
    try {
      fetch("/api/market/ai-setup-review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup: {
          symbol: r.symbol, px: num(r.px), chg: num(r.chg), aScore: r.aScore, grade: r.grade,
          marketScore: regimeScore, marketPass: r.marketPass, sector: r.sector || null, strongSector: r.strongSector,
          relStrength: r.relStrength, rvol: num(r.rvol, 1), bestEntry: r.bestEntry, stop: r.stop, rr: r.rr, atEntry: r.atEntry,
        } }),
      }).then(res => res.json()).then(d => setOut(r.symbol, d && d.ok ? d.review : { error: (d && d.error) || "no response" })).catch(e => setOut(r.symbol, { error: e.message }));
    } catch (e) { setOut(r.symbol, { error: e.message }); }
  };
  return (
    <div style={{ marginTop: 8 }}>
      {out == null && <button onClick={ask} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.accent}`, background: `${C.accent}18`, color: C.accent }}>🤖 ASK CLAUDE — get an AI second opinion</button>}
      {out === "loading" && <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>🤖 Claude is reviewing…</div>}
      {out && out.error && <div style={{ fontFamily: SANS, fontSize: 11, color: C.amber }}>AI review unavailable — {out.error}</div>}
      {typeof out === "string" && out !== "loading" && (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.text, lineHeight: 1.55, whiteSpace: "pre-line", background: `${C.accent}08`, border: `1px solid ${C.accent}33`, borderRadius: 8, padding: "8px 11px" }}>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.accent }}>🤖 CLAUDE'S TAKE</span>{"\n"}{out}
        </div>
      )}
    </div>
  );
}

// ── Autopilot status card — live glance + PAUSE button (top of Green Light) ──
function AutopilotStatusCard({ C, MONO, SANS }) {
  const [acct, setAcct] = React.useState(null);
  const [positions, setPositions] = React.useState([]);
  const [serverMode, setServerMode] = React.useState(false);
  const [tick, setTick] = React.useState(0);   // bump to re-read localStorage after toggle
  React.useEffect(() => {
    const load = () => {
      fetch("/api/alpaca/account").then(r => r.json()).then(d => { if (d?.ok) setAcct(d.account); }).catch(() => {});
      fetch("/api/alpaca/positions").then(r => r.json()).then(d => { if (d?.ok) setPositions(d.positions || []); }).catch(() => {});
      fetch("/api/health").then(r => r.json()).then(d => setServerMode(!!d?.serverAutopilot)).catch(() => {});
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, []);
  const on      = localStorage.getItem("axiom_autopilot") === "on";
  const broker  = localStorage.getItem("axiom_autopilot_broker") || "alpaca";
  const today   = (() => { const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })); return `${et.getFullYear()}-${et.getMonth()}-${et.getDate()}`; })();
  const halted  = localStorage.getItem("axiom_autopilot_halt_date") === today;
  const haltReason = localStorage.getItem("axiom_autopilot_halt_reason") || "";
  const longs   = positions.filter(p => Number(p.qty) > 0).length;
  const shorts  = positions.filter(p => Number(p.qty) < 0).length;
  const dayPnl  = acct ? (Number(acct.equity) - Number(acct.lastEquity || acct.equity)) : 0;
  const money   = n => `${n < 0 ? "-" : "+"}$${Math.abs(Math.round(n)).toLocaleString()}`;
  const maxRisk = Number(localStorage.getItem("axiom_autopilot_maxrisk")) || 6;
  const eqNow   = acct ? Number(acct.equity) : 0;
  const riskDlr = positions.reduce((s, p) => s + Math.abs(Number(p.qty) || 0) * (Number(p.avgEntry) || 0) * 0.05, 0);
  const riskPct = eqNow > 0 ? (riskDlr / eqNow) * 100 : 0;
  const toggle  = () => { localStorage.setItem("axiom_autopilot", on ? "off" : "on"); setTick(t => t + 1); };
  const [review, setReview] = React.useState("");
  const [reviewing, setReviewing] = React.useState(false);
  const deepReview = async () => {
    setReviewing(true); setReview("");
    try {
      const ct = await fetch("/api/alpaca/closed-trades").then(r => r.json()).catch(() => null);
      const trades = (ct?.ok ? ct.trades : []).map(t => ({ symbol: t.symbol, side: t.side, entry: t.entry, exit: t.exit, pnl: t.pnl }));
      const r = await fetch("/api/market/ai-deep-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trades }) });
      const d = await r.json();
      setReview(d.ok ? d.review : `⚠ ${d.error || "error"}`);
    } catch (e) { setReview(`⚠ ${e.message}`); }
    finally { setReviewing(false); }
  };
  const statusCol = halted ? C.red : on ? C.green : C.textDim;
  const cell = (label, val, col) => (
    <div style={{ textAlign: "center", minWidth: 74 }}>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: col || C.text }}>{val}</div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{label}</div>
    </div>
  );
  return (
    <>
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "10px 14px", marginBottom: 12,
      borderRadius: 10, background: `${statusCol}10`, border: `1px solid ${statusCol}55` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>{halted ? "🛑" : on ? "🤖" : "⏸️"}</span>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: statusCol }}>
            AUTOPILOT {halted ? "HALTED" : on ? "ON" : "OFF"}</div>
          <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>{serverMode ? "🖥️ server mode · trades 24/7 (no browser needed)" : `${broker} · paper`}{halted && haltReason ? ` · ${haltReason}` : ""}</div>
        </div>
      </div>
      {cell("TODAY", money(dayPnl), dayPnl > 0 ? C.green : dayPnl < 0 ? C.red : C.text)}
      {cell("OPEN", positions.length, C.text)}
      {cell("LONG / SHORT", `${longs} / ${shorts}`, C.text)}
      {cell(`RISK / ${maxRisk}%`, `${riskPct.toFixed(1)}%`, riskPct >= maxRisk ? C.red : riskPct >= maxRisk * 0.75 ? C.amber : C.green)}
      {acct && cell("EQUITY", `$${Math.round(Number(acct.equity)).toLocaleString()}`, C.text)}
      <button onClick={deepReview} disabled={reviewing} title="Top-tier Fable model judges whether the autopilot has a real edge"
        style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, fontWeight: 800, cursor: reviewing ? "default" : "pointer",
          padding: "9px 14px", borderRadius: 8, border: `1px solid #a855f7`, color: "#a855f7", background: `#a855f714` }}>
        {reviewing ? "⏳ analyzing…" : "🔬 Deep Review"}</button>
      <button onClick={toggle} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer",
        padding: "9px 18px", borderRadius: 8, border: "none", color: "#fff",
        background: on ? C.red : C.green }}>{on ? "⏸ PAUSE" : "▶ RESUME"}</button>
      </div>
      {review && (
        <div style={{ marginTop: -4, marginBottom: 12, padding: "12px 14px", borderRadius: 10,
          background: "#a855f70d", border: "1px solid #a855f744", fontFamily: SANS, fontSize: 13,
          color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: "#a855f7", marginBottom: 6 }}>🔬 DEEP STRATEGY REVIEW · Fable</div>
          {review}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>🔒 API TOKEN</span>
        <input type="password" defaultValue={localStorage.getItem("axiom_api_token") || ""}
          onBlur={e => localStorage.setItem("axiom_api_token", e.target.value.trim())}
          placeholder="only if API_AUTH_TOKEN set in Render"
          style={{ flex: 1, maxWidth: 320, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: MONO, fontSize: 11, color: C.text, padding: "5px 8px", outline: "none" }} />
        <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>must match Render</span>
      </div>
    </>
  );
}

export default function GreenLightTab({ C, MONO, SANS, watchlistData, macroData, openDeepDiveFor, scanResults, sectorData }) {
  const spyQ   = (macroData || []).find(m => m.symbol === "SPY") || (watchlistData || []).find(w => w.symbol === "SPY");
  const spyChg = Number(spyQ?.changesPercentage || 0);
  // Sector strength: rank the 11 SPDR sector ETFs by today's move; top half = "strong" (Step 2 of the A+ spec).
  const sectorsRanked = [...(sectorData || [])].map(s => ({ sym: s.symbol, name: s._sectorName || s.symbol, chg: Number(s.changesPercentage || 0) })).sort((a, b) => b.chg - a.chg);
  const strongSectors = new Set(sectorsRanked.slice(0, Math.ceil(sectorsRanked.length / 2)).map(s => s.sym));
  const [glExpanded, setGlExpanded] = useState(null); // ticker whose details are shown
  const [candOpen, setCandOpen] = useState(null);     // candidate (calls/puts/watch) expanded to full card
  const [aiScan, setAiScan] = useState(null);         // null | "loading" | text | {error}
  const [aiAsk, setAiAsk] = useState({});             // symbol → "loading" | review text | {error}
  const [aiTrig, setAiTrig] = useState("");           // game-plan / coach trigger status
  const [aiBottom, setAiBottom] = useState(null);     // null | "loading" | text | {error}
  const setAiAskFor = (sym, v) => setAiAsk(p => ({ ...p, [sym]: v }));
  const [aiScanAuto, setAiScanAuto] = useState(() => localStorage.getItem("gl_aiscan_auto") === "on");
  const aiScanRef = useRef(0);
  // Deep-dive data (analyst targets, fundamentals, news) — same sources as Smart Scan
  const [glDeep, setGlDeep] = useState({});
  const [glDeepLoad, setGlDeepLoad] = useState(false);
  useEffect(() => {
    const sym = glExpanded;
    if (!sym || glDeep[sym]) return;
    setGlDeepLoad(true);
    Promise.allSettled([
      fetch(`/api/finviz/quote?symbol=${sym}`).then(r => r.json()),
      fetch(`/api/yahoo/fundamentals?symbol=${sym}`).then(r => r.json()),
      fetch(`/api/yahoo/news?tickers=${sym}&limit=4`).then(r => r.json()),
      fetch(`/api/market/chart?symbol=${sym}&interval=1d&range=90d`).then(r => r.json()),
      fetch(`/api/market/chart?symbol=${sym}&interval=5m&range=1d`).then(r => r.json()),
    ]).then(([fvR, fundR, newsR, chartR, intraR]) => {
      const raw  = (fvR.status === "fulfilled" ? fvR.value?.raw : null) || {};
      const fund = fundR.status === "fulfilled" ? fundR.value : null;
      const nv   = newsR.status === "fulfilled" ? newsR.value : null;
      // ── Technicals from candles (RSI / EMA9 / EMA21 / MA50 / MA200 / MACD) ──
      let tech = null;
      try {
        const cd = chartR.status === "fulfilled" ? chartR.value : null;
        const closes = ((cd?.chart?.result?.[0]?.indicators?.quote?.[0]?.close) || []).filter(v => v > 0);
        if (closes.length >= 26) {
          const px = closes.at(-1);
          const emaOf = (len) => { const k = 2 / (len + 1); let e = closes[0]; for (let i = 1; i < closes.length; i++) e = closes[i] * k + e * (1 - k); return e; };
          const ema9 = emaOf(9), ema21 = emaOf(21), ema12 = emaOf(12), ema26 = emaOf(26);
          const ma50 = closes.slice(-Math.min(50, closes.length)).reduce((a, b) => a + b, 0) / Math.min(50, closes.length);
          const ma200 = closes.slice(-Math.min(200, closes.length)).reduce((a, b) => a + b, 0) / Math.min(200, closes.length);
          let gains = 0, losses = 0; const rl = Math.min(14, closes.length - 1);
          for (let i = closes.length - rl; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; d > 0 ? gains += d : losses += Math.abs(d); }
          const rsi = losses === 0 ? 100 : Math.round(100 - 100 / (1 + (gains / rl) / (losses / rl)));
          const macd = ema12 - ema26;
          // VWAP from today's intraday 5-min bars (typical price × volume)
          let vwap = null;
          try {
            const iq = intraR.status === "fulfilled" ? intraR.value?.chart?.result?.[0]?.indicators?.quote?.[0] : null;
            if (iq) {
              const hi = iq.high || [], lo = iq.low || [], cl = iq.close || [], vol = iq.volume || [];
              let pv = 0, vv = 0;
              for (let i = 0; i < cl.length; i++) {
                if (cl[i] > 0 && vol[i] > 0) { const tp = (hi[i] + lo[i] + cl[i]) / 3; pv += tp * vol[i]; vv += vol[i]; }
              }
              if (vv > 0) vwap = pv / vv;
            }
          } catch {}
          tech = { px, rsi, ema9, ema21, ma50, ma200, macdBull: macd >= 0, macd, vwap };
        }
      } catch {}
      const news = Array.isArray(nv) ? nv : (nv?.news || nv?.items || nv?.articles || []);
      const recomNum = parseFloat(raw["Recom"] || "") || null;
      const recomTxt = recomNum == null ? null : recomNum <= 1.5 ? "Strong Buy" : recomNum <= 2.5 ? "Buy" : recomNum <= 3.5 ? "Hold" : recomNum <= 4.5 ? "Sell" : "Strong Sell";
      setGlDeep(prev => ({ ...prev, [sym]: {
        target: parseFloat((raw["Target Price"] || "").replace(/[^0-9.]/g, "")) || null,
        recomTxt, recomNum,
        shortFloat: raw["Short Float"] || null,
        instOwn: raw["Inst Own"] || null,
        roe: fund?.roe != null ? Number(fund.roe) : null,
        de: fund?.debtToEquity != null ? Number(fund.debtToEquity) : null,
        earnings: fund?.earningsDate || null,
        news: (news || []).slice(0, 4),
        tech,
      } }));
      setGlDeepLoad(false);
    }).catch(() => setGlDeepLoad(false));
  }, [glExpanded]);

  // Market regime score (0-100) — feeds the banner and each name's A+ score.
  const regime = computeRegime(macroData);

  // Build results from watchlist + scan data
  const results = (watchlistData || []).map(q => {
    const scanRow = (scanResults || []).find(r => r.ticker === q.symbol);
    const gl = computeGreenLight(q, spyChg, scanRow, regime.score);
    const sec = STOCK_TO_SECTOR[q.symbol];
    return { ...gl, symbol: q.symbol, name: q.name, q, sector: sec || null, strongSector: sec ? strongSectors.has(sec) : null };
  }).filter(r => r.px > 0).sort((a, b) => b.aScore - a.aScore || b.passed - a.passed);

  const green  = results.filter(r => r.signal === "GREEN");
  const yellow = results.filter(r => r.signal === "YELLOW");
  const red    = results.filter(r => r.signal === "RED");
  // Put candidates — momentum breakdowns, ranked by Bear Score (only meaningful on red/weak tape).
  const puts   = results.filter(r => r.bearScore >= 60).sort((a, b) => b.bearScore - a.bearScore).slice(0, 12);
  // Call candidates — ranked by A+ Institutional Score.
  const calls  = results.filter(r => r.aScore >= 80).sort((a, b) => b.aScore - a.aScore).slice(0, 12);
  // Bottom / reversal candidates — capitulation washouts.
  const bottoms = results.filter(r => r.bottomScore >= 60).sort((a, b) => b.bottomScore - a.bottomScore).slice(0, 10);
  // ── MODE: Bull (tradeable calls) · Bear (tradeable puts) · Cash (nothing qualifies) ──
  const tradeableCalls = results.filter(r => r.aPlus).length;   // A+ (≥90) + market pass + at entry
  const tradeablePuts  = results.filter(r => r.bearTradeable).length;                            // Bear Score > 80
  const mode = (tradeableCalls === 0 && tradeablePuts === 0) ? "CASH"
    : tradeableCalls >= tradeablePuts ? "BULL" : "BEAR";
  const modeColor = mode === "BULL" ? C.green : mode === "BEAR" ? C.red : C.textDim;

  // ── AI Scan: one batched Claude call to triage today's setups (cheap) ──
  const runAiScan = () => {
    const top = results.filter(r => r.aScore >= 80).sort((a, b) => b.aScore - a.aScore).slice(0, 12);
    setAiScan("loading");
    fetch("/api/market/ai-scan", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regime: regime.score, setups: top.map(r => ({ symbol: r.symbol, aScore: r.aScore, grade: r.grade, rr: r.rr, rvol: Number(r.rvol || 0).toFixed(1), relStrength: r.relStrength, sector: r.sector, atEntry: r.atEntry })) }) })
      .then(res => res.json()).then(d => setAiScan(d && d.ok ? d.analysis : { error: (d && d.error) || "no response" })).catch(e => setAiScan({ error: e.message }));
  };
  // Auto-run while toggled on: every 30 min (and once on enable), only if there are setups to look at.
  useEffect(() => {
    if (!aiScanAuto) return;
    const tick = () => { if (Date.now() - aiScanRef.current > 25 * 60 * 1000) { aiScanRef.current = Date.now(); runAiScan(); } };
    tick();
    const t = setInterval(tick, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [aiScanAuto]); // eslint-disable-line

  // (Morning Game Plan + Trade Coach now run server-side — see src/ai-coach.js — so they
  //  fire even with the app closed; the client triggers were removed to avoid duplicates.)

  // Auto-buy is handled globally by <AutoPilotEngine> so it runs on every tab.

  const sigBg  = s => s === "GREEN" ? `${C.green}18` : s === "YELLOW" ? `${C.amber}18` : `${C.red}10`;
  const sigCol = s => s === "GREEN" ? C.green : s === "YELLOW" ? C.amber : C.red;
  const sigIcon= s => s === "GREEN" ? "🟢" : s === "YELLOW" ? "🟡" : "🔴";

  const openDive = (sym) => {
    const q = (watchlistData || []).find(w => w.symbol === sym);
    openDeepDiveFor(sym, q ? { price: q.price || 0, changePercent: q.changesPercentage || 0,
      yearHigh: q.yearHigh, yearLow: q.yearLow, priceAvg50: q.priceAvg50, priceAvg200: q.priceAvg200,
      volume: q.volume, avgVolume: q.avgVolume } : null);
  };

  const Row = ({ r }) => (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${sigCol(r.signal)}`,
      borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {/* Signal badge */}
        <div style={{ background: sigBg(r.signal), border: `1px solid ${sigCol(r.signal)}44`,
          borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 80 }}>
          <div style={{ fontSize: 18 }}>{sigIcon(r.signal)}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: sigCol(r.signal) }}>
            {r.signal === "GREEN" ? "GO" : r.signal === "YELLOW" ? "WAIT" : "SKIP"}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{r.passed}/5</div>
        </div>

        {/* Ticker info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.accent }}>{r.symbol}</span>
            <span style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>${r.px.toFixed(2)}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: r.chg >= 0 ? C.green : C.red }}>
              {r.chg >= 0 ? "+" : ""}{r.chg.toFixed(2)}%
            </span>
            {r.rvol > 1.5 && <span style={{ fontFamily: MONO, fontSize: 10, color: C.amber, background: `${C.amber}18`, borderRadius: 4, padding: "1px 6px" }}>VOL {r.rvol.toFixed(1)}x</span>}
            {r.isLeader && <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: "#fff", background: C.green, borderRadius: 4, padding: "1px 7px" }}>💪 LEADER +{r.relStrength}% vs SPY</span>}
            {(() => { const gc = r.grade === "ELITE" ? "#7c3aed" : r.grade === "A+" ? "#16a34a" : r.grade === "GOOD" ? C.green : r.grade === "WATCH" ? C.amber : C.red;
              const sp = r.scoreParts;
              return <span title={`Trend ${sp.trend}/30 · Momentum ${sp.momentum}/20 · Volume ${sp.volume}/15 · Structure ${sp.structure}/20 · Risk ${sp.risk}/15${r.confRisk ? ` · size ${r.confRisk}%` : ""}`}
                style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: "#fff", background: gc, borderRadius: 4, padding: "1px 7px" }}>{r.grade === "ELITE" ? "⭐" : ""}{r.grade} {r.aScore}</span>; })()}
            {r.confRisk > 0 && <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.accent, background: `${C.accent}14`, border: `1px solid ${C.accent}44`, borderRadius: 4, padding: "1px 6px" }}>size {r.confRisk}%</span>}
            {r.signal !== "RED" && (r.atEntry
              ? <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.green, background: `${C.green}18`, border: `1px solid ${C.green}44`, borderRadius: 4, padding: "1px 7px" }}>🎯 at buy zone</span>
              : <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.amber, background: `${C.amber}18`, border: `1px solid ${C.amber}44`, borderRadius: 4, padding: "1px 7px" }}>⏳ wait for pullback ${r.bestEntry}</span>)}
          </div>
          {/* Checklist */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {r.checks.map((c, i) => (
              <span key={i} title={c.tip}
                style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700,
                  color: c.pass ? C.green : C.red,
                  background: c.pass ? `${C.green}15` : `${C.red}10`,
                  border: `1px solid ${c.pass ? C.green : C.red}33`,
                  borderRadius: 4, padding: "2px 7px" }}>
                {c.pass ? "✓" : "✗"} {c.label}
              </span>
            ))}
          </div>
          {/* ── 🤖 AI REVIEW — deterministic verdict before you act ── */}
          {(() => {
            const decision = r.aPlus ? "BUY" : (r.atEntry ? "WAIT" : "SKIP");
            const dCol = decision === "BUY" ? C.green : decision === "WAIT" ? C.amber : C.red;
            const risk = r.aScore >= 95 ? "Very Low" : r.aScore >= 90 ? "Low" : r.aScore >= 85 ? "Medium" : "High";
            const reasons = [
              [r.marketPass, "Market regime green"],
              ...(r.strongSector != null ? [[r.strongSector, `Strong sector (${r.sector})`]] : []),
              [r.scoreParts.trend >= 20, "EMA / trend alignment"],
              [r.rvol >= 1.5, "High relative volume"],
              [r.relStrength >= 1, "Outperforming SPY"],
              [r.rr >= 2.5, "Excellent risk/reward"],
              [r.atEntry, "At the buy zone (not extended)"],
            ];
            return (
              <div style={{ marginTop: 10, background: `${dCol}0c`, border: `1px solid ${dCol}44`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em" }}>🤖 AI REVIEW</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: dCol }}>{decision}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>Confidence <strong style={{ color: dCol }}>{r.aScore}%</strong></span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>Grade <strong style={{ color: dCol }}>{r.grade}</strong></span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>Risk <strong style={{ color: risk === "Very Low" || risk === "Low" ? C.green : risk === "Medium" ? C.amber : C.red }}>{risk}</strong></span>
                  {r.confRisk > 0 && <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent }}>Size <strong>{r.confRisk}%</strong></span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {reasons.map(([ok, txt], i) => (
                    <span key={i} style={{ fontFamily: SANS, fontSize: 10, color: ok ? C.green : C.textDim }}>{ok ? "✓" : "✗"} {txt}</span>
                  ))}
                </div>
                {decision !== "BUY" && <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 5 }}>
                  {decision === "WAIT" ? "Setup is forming but not yet A+ (≥90) with a green market — wait." : "Below A+ threshold or not at entry — skip per the rules."}
                </div>}
              </div>
            );
          })()}
          {/* ── Potential strip: options · target · exit ── */}
          {(() => {
            const bullish = r.signal !== "RED";
            const kind = bullish ? "CALL" : "PUT";
            const col = bullish ? C.green : C.red;
            const atm = r.px >= 200 ? Math.round(r.px / 5) * 5 : r.px >= 50 ? Math.round(r.px) : Math.round(r.px * 2) / 2;
            const premium = +(r.px * 0.04).toFixed(2);
            const be = bullish ? +(atm + premium).toFixed(2) : +(atm - premium).toFixed(2);
            const t2 = Number(r.t2) || r.px * 1.1;
            const optGain = Math.round(((t2 - r.px) / r.px) * 5 * 100); // ~5x leverage if target hits
            return (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center", fontFamily: MONO, fontSize: 10.5 }}>
                <span style={{ color: col, fontWeight: 800, background: `${col}14`, border: `1px solid ${col}44`, borderRadius: 4, padding: "2px 8px" }}>
                  {bullish ? "📈" : "📉"} {kind} ${atm} · ~${premium} · BE ${be}{optGain > 0 ? ` · ≈+${optGain}% if T2` : ""}
                </span>
                <span style={{ color: C.green }}>🎯 Target ${r.t2} (+10%)</span>
                <span style={{ color: C.red }}>🛑 Stop ${r.stop} (ATR)</span>
                <span style={{ color: r.rrPass ? C.green : C.amber, fontWeight: 700 }}>⚖️ R:R {r.rr}:1{r.rrPass ? " ✓" : " (thin)"}</span>
              </div>
            );
          })()}
        </div>

        {/* Trade levels */}
        {(r.signal === "GREEN" || r.signal === "YELLOW") && (
          <div style={{ textAlign: "right", borderLeft: `1px solid ${C.border}`, paddingLeft: 12, minWidth: 170 }}>
            {/* Best entry — highlighted */}
            <div style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}44`, borderRadius: 6, padding: "4px 8px", marginBottom: 6 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>🎯 BEST ENTRY</div>
              <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.accent }}>${r.bestEntry}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: r.entryNote.includes("✅") ? C.green : C.amber }}>{r.entryNote}</div>
            </div>
            {[["STOP", r.stop, C.red], ["T1 +5%", r.t1, C.green], ["T2 +10%", r.t2, C.green]].map(([l,v,col]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{l}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: col }}>${v}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* One-click auto paper buy */}
          <button onClick={(e) => {
              const res = addPaperTrade(r.symbol, r.bestEntry || r.px);
              const btn = e.currentTarget;
              btn.textContent = res === "DUP" ? "already open" : "✓ PAPER BUY!";
              btn.style.background = C.green; btn.style.color = "#fff";
              setTimeout(() => { btn.textContent = "⚡ PAPER BUY"; btn.style.background = `${C.green}18`; btn.style.color = C.green; }, 1800);
            }}
            title="Auto paper buy: sets stop, T1, T2, T3 and exits automatically"
            style={{ background: `${C.green}18`, border: `1px solid ${C.green}55`, color: C.green,
              borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 800,
              padding: "6px 12px", cursor: "pointer" }}>
            ⚡ PAPER BUY
          </button>
          {/* Options buy disabled for now */}
          {(() => {
            if (true) return null;  // options paused
            const bullish = r.signal === "GREEN";
            const bearish = r.signal === "RED" && r.chg < 0;
            if (!bullish && !bearish) return null;
            const kind = bullish ? "CALL" : "PUT";
            const col = bullish ? "#16a34a" : "#dc2626";
            const useAlpaca = (localStorage.getItem("axiom_autopilot_broker") || "sim") === "alpaca";
            const lbl = `${bullish ? "📈" : "📉"} BUY ${kind}${useAlpaca ? " 🦙" : " (sim)"}`;
            return (
              <button onClick={(e) => {
                  const btn = e.currentTarget;
                  if (useAlpaca) {
                    btn.textContent = "⏳ ordering…";
                    alpacaOption(r.symbol, kind.toLowerCase(), 1, r.px).then(res => {
                      if (res?.ok) { btn.textContent = `✓ ${kind} @ $${res.order.strike}`; btn.style.background = col; btn.style.color = "#fff";
                        logTradeNote && logTradeNote("buy", `${bullish ? "📈" : "📉"} ALPACA ${kind} — ${r.symbol}\n1 contract · strike $${res.order.strike} · exp ${res.order.expiry}`); }
                      else { btn.textContent = "✗ " + (res?.error ? "see note" : "failed"); btn.style.background = C.red; btn.style.color = "#fff";
                        logTradeNote && logTradeNote("exit", `⚠️ ALPACA option rejected — ${r.symbol}\n${res?.error || "unknown"} (enable options on your Alpaca paper account)`); }
                      setTimeout(() => { btn.textContent = lbl; btn.style.background = `${col}18`; btn.style.color = col; }, 2600);
                    });
                  } else {
                    const res = addPaperOption(r.symbol, r.px, kind, { glScore: r.passed });
                    btn.textContent = res === "DUP" ? "already open" : `✓ ${kind} BOUGHT!`;
                    btn.style.background = col; btn.style.color = "#fff";
                    setTimeout(() => { btn.textContent = lbl; btn.style.background = `${col}18`; btn.style.color = col; }, 1800);
                  }
                }}
                title={useAlpaca ? `Buy a real ${kind} on your Alpaca PAPER account (near-dated ATM, 1 contract). Requires options enabled on the account.` : `Buy a SIMULATED ${kind} (~5x leverage, modeled). For learning — higher risk.`}
                style={{ background: `${col}18`, border: `1px solid ${col}55`, color: col,
                  borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 12px", cursor: "pointer" }}>
                {lbl}
              </button>
            );
          })()}
          <button onClick={() => setGlExpanded(glExpanded === r.symbol ? null : r.symbol)}
            style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}44`, color: C.accent,
              borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700,
              padding: "6px 12px", cursor: "pointer" }}>
            {glExpanded === r.symbol ? "▲ CLOSE" : "🔬 DEEP DIVE"}
          </button>
        </div>
      </div>

      {/* 🤖 Ask Claude — full width, prominent */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
        <AISetupReview r={r} regimeScore={regime.score} C={C} MONO={MONO} SANS={SANS} out={aiAsk[r.symbol]} setOut={setAiAskFor} />
      </div>

      {/* ── Expandable ticker details ── */}
      {glExpanded === r.symbol && (() => {
        const q = r.q || {};
        const hi52 = Number(q.yearHigh || 0), lo52 = Number(q.yearLow || 0);
        const ma50 = Number(q.priceAvg50 || 0), ma200 = Number(q.priceAvg200 || 0);
        const mcap = Number(q.marketCap || 0);
        const pe   = Number(q.pe || 0);
        const vol  = Number(q.volume || 0), avgVol = Number(q.avgVolume || 0);
        const range52 = (hi52 > lo52 && r.px > 0) ? Math.round((r.px - lo52) / (hi52 - lo52) * 100) : null;
        const fmtCap = mcap > 1e12 ? `$${(mcap/1e12).toFixed(2)}T` : mcap > 1e9 ? `$${(mcap/1e9).toFixed(1)}B` : mcap > 1e6 ? `$${(mcap/1e6).toFixed(0)}M` : "—";
        const fmtVol = v => v > 1e9 ? `${(v/1e9).toFixed(1)}B` : v > 1e6 ? `${(v/1e6).toFixed(1)}M` : v > 1e3 ? `${(v/1e3).toFixed(0)}K` : v;
        const stats = [
          ["Company", q.name || r.symbol],
          ["Market Cap", fmtCap],
          ["P/E Ratio", pe > 0 ? pe.toFixed(1) : "—"],
          ["52W Range", hi52 > 0 ? `$${lo52.toFixed(2)} – $${hi52.toFixed(2)}` : "—"],
          ["52W Position", range52 != null ? `${range52}% ${range52 > 75 ? "(near high)" : range52 < 25 ? "(near low)" : "(mid)"}` : "—"],
          ["Volume", `${fmtVol(vol)} ${avgVol > 0 ? `(avg ${fmtVol(avgVol)})` : ""}`],
          ["vs SPY today", `${r.relStrength >= 0 ? "+" : ""}${r.relStrength}% ${r.isLeader ? "💪 LEADER" : ""}`],
          ["Day Range", q.dayLow && q.dayHigh ? `$${Number(q.dayLow).toFixed(2)} – $${Number(q.dayHigh).toFixed(2)}` : "—"],
        ];
        const d = glDeep[r.symbol];
        const t = d?.tech;
        const mom = (() => { try { return computeScores(r.q || {}).composite; } catch { return null; } })();
        const rsiV = t?.rsi != null ? t.rsi : (r.rsi || null);
        const ld = glDeepLoad ? "…" : "—";
        const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 };
        const hdr = (icon, label, col) => <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: col, letterSpacing: "0.06em", marginBottom: 10 }}>{icon} {label}</div>;
        const Row = ({ l, v, col }) => (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: `1px solid ${C.border}22` }}>
            <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{l}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col || C.text, textAlign: "right" }}>{v}</span>
          </div>
        );
        const vsCol = (above) => above ? C.green : C.red;
        const recCol = d?.recomNum == null ? C.textDim : d.recomNum <= 2.5 ? C.green : d.recomNum <= 3.5 ? C.amber : C.red;
        const upside = d?.target && r.px > 0 ? ((d.target - r.px) / r.px * 100) : null;
        return (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            {/* Entry plan banner */}
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", background: `${C.accent}0e`, border: `1px solid ${C.accent}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
              <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>🎯 ENTRY</div><div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.accent }}>${r.bestEntry}</div></div>
              <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>🛑 STOP</div><div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.red }}>${r.stop}</div></div>
              <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>🎯 T1</div><div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.green }}>${r.t1}</div></div>
              <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>🎯 T2</div><div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.green }}>${r.t2}</div></div>
              <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(r.symbol)}`} target="_blank" rel="noopener"
                style={{ marginLeft: "auto", background: C.accent, color: "#fff", borderRadius: 7, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "8px 16px", textDecoration: "none" }}>
                📺 OPEN CHART
              </a>
            </div>

            {/* 5-check recap */}
            <div style={{ ...card, marginBottom: 12 }}>
              {hdr("✅", `GREEN LIGHT CHECKS · ${r.passed}/5`, r.passed >= 5 ? C.green : C.amber)}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {r.checks.map((c, i) => (
                  <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: c.pass ? C.green : C.red,
                    background: c.pass ? `${C.green}12` : `${C.red}10`, border: `1px solid ${c.pass ? C.green : C.red}33`,
                    borderRadius: 5, padding: "3px 9px" }} title={c.tip}>{c.pass ? "✓" : "✗"} {c.label} · {c.tip}</span>
                ))}
              </div>
            </div>

            {/* Two-column card grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              {/* Technicals */}
              <div style={card}>
                {hdr("⚡", "TECHNICALS", "#0ea5e9")}
                <Row l="RSI (14)" v={rsiV != null ? `${rsiV} ${rsiV < 35 ? "(oversold)" : rsiV > 65 ? "(overbought)" : "(neutral)"}` : ld} col={rsiV == null ? C.textDim : rsiV < 35 ? C.green : rsiV > 65 ? C.red : C.text} />
                <Row l="MACD" v={t ? (t.macdBull ? "Bullish ▲" : "Bearish ▼") : ld} col={t ? (t.macdBull ? C.green : C.red) : C.textDim} />
                <Row l="EMA 9 / 21" v={t ? (t.ema9 >= t.ema21 ? "9 > 21 ▲" : "9 < 21 ▼") : ld} col={t ? vsCol(t.ema9 >= t.ema21) : C.textDim} />
                <Row l="vs EMA21" v={t ? `$${t.ema21.toFixed(2)} ${t.px >= t.ema21 ? "above" : "below"}` : ld} col={t ? vsCol(t.px >= t.ema21) : C.textDim} />
                <Row l="vs MA50" v={t ? `$${t.ma50.toFixed(2)} ${t.px >= t.ma50 ? "above" : "below"}` : ld} col={t ? vsCol(t.px >= t.ma50) : C.textDim} />
                <Row l="vs MA200" v={t ? `$${t.ma200.toFixed(2)} ${t.px >= t.ma200 ? "above" : "below"}` : ld} col={t ? vsCol(t.px >= t.ma200) : C.textDim} />
                <Row l="vs VWAP" v={t?.vwap ? `$${t.vwap.toFixed(2)} ${t.px >= t.vwap ? "above ✓" : "below"}` : (glDeepLoad ? "…" : "—")} col={t?.vwap ? vsCol(t.px >= t.vwap) : C.textDim} />
                <Row l="Momentum" v={mom != null ? `${mom}/100` : "—"} col={mom == null ? C.textDim : mom >= 60 ? C.green : mom <= 40 ? C.red : C.amber} />
                <Row l="Rel volume" v={r.rvol > 0 ? `${r.rvol.toFixed(2)}x ${r.rvol > 1.5 ? "🔥" : ""}` : "—"} col={r.rvol > 1.5 ? C.amber : C.text} />
              </div>

              {/* Analyst & earnings */}
              <div style={card}>
                {hdr("📊", "ANALYST · FUNDAMENTALS", C.accent)}
                <Row l="Analyst rating" v={d?.recomTxt || ld} col={recCol} />
                <Row l="Price target" v={d?.target ? `$${d.target.toFixed(2)}${upside != null ? ` (${upside >= 0 ? "+" : ""}${upside.toFixed(0)}%)` : ""}` : ld} col={upside != null ? (upside >= 0 ? C.green : C.red) : C.text} />
                <Row l="Short float" v={d?.shortFloat || ld} />
                <Row l="Inst. ownership" v={d?.instOwn || ld} />
                <Row l="Return on equity" v={d?.roe != null ? `${(d.roe * 100).toFixed(1)}%` : ld} />
                <Row l="Debt / equity" v={d?.de != null && d.de >= 0 ? d.de.toFixed(2) : ld} />
                <Row l="Earnings date" v={d?.earnings ? (() => { try { return new Date(d.earnings).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return "—"; } })() : ld} col={C.amber} />
              </div>

              {/* Key stats */}
              <div style={card}>
                {hdr("🏢", "KEY STATS", C.purple)}
                {stats.map(([l, v]) => <Row key={l} l={l} v={v} />)}
              </div>

              {/* News */}
              {(d?.news?.length > 0 || glDeepLoad) && (
                <div style={card}>
                  {hdr("📰", "RECENT NEWS", C.cyan || "#06b6d4")}
                  {d?.news?.length ? d.news.map((n, i) => (
                    <a key={i} href={n.url || n.link || "#"} target="_blank" rel="noopener"
                      style={{ display: "block", fontFamily: SANS, fontSize: 12, color: C.textSec, textDecoration: "none", padding: "5px 0", borderBottom: `1px solid ${C.border}22`, lineHeight: 1.4 }}>
                      • {n.title || n.headline || "—"}
                    </a>
                  )) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading…</div>}
                </div>
              )}

              {/* ── OPTIONS — learn + trade in one place ── */}
              {(() => {
                const bullish = r.signal !== "RED";          // GREEN/YELLOW → call; RED → put
                const kind = bullish ? "CALL" : "PUT";
                const col = bullish ? C.green : C.red;
                const px = r.px;
                const atm = px >= 200 ? Math.round(px / 5) * 5 : px >= 50 ? Math.round(px) : Math.round(px * 2) / 2;
                const premium = +(px * 0.04).toFixed(2);     // ~ATM near-dated premium
                const contractCost = Math.round(premium * 100);
                const breakeven = bullish ? +(atm + premium).toFixed(2) : +(atm - premium).toFixed(2);
                return (
                  <div style={{ ...card, gridColumn: "1 / -1", borderLeft: `4px solid ${col}` }}>
                    {hdr(bullish ? "📈" : "📉", `OPTIONS — LEARN + TRADE THIS ${kind}`, col)}
                    {/* The numbers */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "6px 18px", marginBottom: 12 }}>
                      <Row l="Contract" v={`${kind} $${atm}`} col={col} />
                      <Row l="Est. premium" v={`$${premium.toFixed(2)}`} />
                      <Row l="Cost (1 contract)" v={`$${contractCost}`} col={C.amber} />
                      <Row l="Breakeven" v={`$${breakeven}`} />
                      <Row l="Max risk" v={`$${contractCost} (the premium)`} col={C.red} />
                      <Row l="Expiry to use" v="30–60 days out" />
                    </div>
                    {/* Plain-English lesson tied to THIS setup */}
                    <div style={{ background: `${col}0c`, border: `1px solid ${col}33`, borderRadius: 8, padding: "10px 12px", fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.7 }}>
                      📖 <b>What this means:</b> A {kind} on {r.symbol} gives you the right to {bullish ? "BUY" : "SELL"} 100 shares at <b>${atm}</b>. You'd pay about <b>${premium.toFixed(2)}/share = ${contractCost}</b> for one contract.
                      <br/>• You profit if {r.symbol} {bullish ? "rises above" : "falls below"} <b>${breakeven}</b> (your breakeven) before expiration.
                      <br/>• <b>Max loss = ${contractCost}</b> (the whole premium) — it can go to zero.
                      <br/>• ⏳ It loses value <b>every day</b> from time decay, even if the stock is flat — so this is a bet the move happens <b>soon</b>.
                      <br/>• ⚠️ {contractCost > Number(localStorage.getItem("axiom_acct_size") || 5000) * 0.1 ? "This is a big bite of a small account — size down." : "Risk only what you can lose; 1 contract is already leveraged."}
                    </div>
                    {/* Paper trade it */}
                    <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <button onClick={(e) => {
                          const res = addPaperOption(r.symbol, r.px, kind, { glScore: r.passed });
                          const b = e.currentTarget;
                          b.textContent = res === "DUP" ? "already open" : `✓ ${kind} BOUGHT (paper)`;
                          b.style.background = col; b.style.color = "#fff";
                          setTimeout(() => { b.textContent = `${bullish ? "📈" : "📉"} PAPER BUY ${kind}`; b.style.background = `${col}18`; b.style.color = col; }, 2000);
                        }}
                        style={{ background: `${col}18`, border: `1px solid ${col}55`, color: col, borderRadius: 7, fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", cursor: "pointer" }}>
                        {bullish ? "📈" : "📉"} PAPER BUY {kind}
                      </button>
                      <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Simulated — watch it in MY TRADES → 📈 OPTIONS to see how it behaves. Learning, not advice.</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}
    </div>
  );

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text }}>🟢 GREEN LIGHT SYSTEM</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginTop: 3 }}>
            Your personal 5-check trading system — only trade GREEN LIGHT stocks
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {[["🟢", green.length, "READY TO BUY", C.green], ["🟡", yellow.length, "WATCH", C.amber], ["🔴", red.length, "SKIP", C.red]].map(([icon,n,l,col]) => (
            <div key={l} style={{ background: `${col}12`, border: `1px solid ${col}33`, borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 18 }}>{icon}</div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: col }}>{n}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Auto-pilot + paper trades now live in their own 📋 MY TRADES tab */}
      <AutopilotStatusCard C={C} MONO={MONO} SANS={SANS} />

      {/* Market regime score (0-100 across SPY/QQQ/VIX/breadth/trend) */}
      <div style={{ padding: "10px 16px", marginBottom: 16, borderRadius: 8,
        background: `${regime.color}14`, border: `1px solid ${regime.color}55`,
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>{regime.label === "GREEN" ? "✅" : regime.label === "YELLOW" ? "⚠️" : "🚨"}</span>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: regime.color }}>
              MARKET {regime.label} — {regime.label === "GREEN" ? "trade freely" : regime.label === "YELLOW" ? "trade smaller / be selective" : "sit out — weak tape"}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
              Regime score <strong style={{ color: regime.color }}>{regime.score}/100</strong> · SPY {spyChg >= 0 ? "+" : ""}{spyChg.toFixed(2)}%{regime.vixVal ? ` · VIX ${regime.vixVal.toFixed(1)}` : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
          {regime.factors.map(f => (
            <span key={f.label} style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 5,
              color: f.pass ? regime.color : C.textDim, background: f.pass ? `${regime.color}18` : C.surface, border: `1px solid ${f.pass ? regime.color + "44" : C.border}` }}>
              {f.pass ? "✓" : "○"} {f.label}
            </span>
          ))}
        </div>
      </div>

      {/* 5-check grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 12 }}>
        {["Market safe","Above 50D MA","RSI 35–65","Volume active","Near EMA21"].map((r,i) => (
          <div key={r} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.accent }}>#{i+1}</div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.text, marginTop: 2 }}>{r}</div>
          </div>
        ))}
      </div>

      {/* ── MY TRADING RULES — always visible reminder ── */}
      <div style={{ background: `${C.amber}10`, border: `2px solid ${C.amber}44`, borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.amber, marginBottom: 12, letterSpacing: "0.06em" }}>
          📜 MY RULES — FOLLOW THESE OR DON'T TRADE
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {/* Entry */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.green, marginBottom: 6 }}>🟢 BEFORE BUYING</div>
            {[
              "Only buy 🟢 GREEN (4-5/5)",
              "Skip yellow. Skip red.",
              "No trading on red market days",
              "Never chase — no FOMO",
            ].map(r => (
              <div key={r} style={{ fontFamily: SANS, fontSize: 12, color: C.text, padding: "3px 0", display: "flex", gap: 6 }}>
                <span style={{ color: C.green }}>✓</span>{r}
              </div>
            ))}
          </div>
          {/* Size */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.accent, marginBottom: 6 }}>💰 SIZE</div>
            {[
              "Risk only 1% per trade",
              "Use 📐 suggested shares",
              "Never go all-in",
              "Never 'bet big this once'",
            ].map(r => (
              <div key={r} style={{ fontFamily: SANS, fontSize: 12, color: C.text, padding: "3px 0", display: "flex", gap: 6 }}>
                <span style={{ color: C.accent }}>✓</span>{r}
              </div>
            ))}
          </div>
          {/* Exit */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.red, marginBottom: 6 }}>🚪 EXIT</div>
            {[
              "Stop −3% — ALWAYS set it",
              "T1 +5% → sell HALF",
              "T2 +10% → sell the rest",
              "2 losses = STOP for the day",
            ].map(r => (
              <div key={r} style={{ fontFamily: SANS, fontSize: 12, color: C.text, padding: "3px 0", display: "flex", gap: 6 }}>
                <span style={{ color: C.red }}>✓</span>{r}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.amber}33`,
          fontFamily: SANS, fontSize: 12, color: C.amber, fontWeight: 700, textAlign: "center" }}>
          ⭐ Small losses + letting winners run = you get rich. You profit even being wrong 45% of the time — IF you follow the exits.
        </div>
      </div>

      {/* GREEN results */}
      {green.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.green, marginBottom: 10, letterSpacing: "0.06em" }}>
            🟢 READY TO TRADE ({green.length})
          </div>
          {green.map(r => <Row key={r.symbol} r={r} />)}
        </div>
      )}

      {/* ── 🤖 AI SCAN — batched Claude triage of today's setups ── */}
      <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: `${C.accent}08`, border: `1px solid ${C.accent}33` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.accent }}>🤖 AI SCAN</span>
          <button onClick={runAiScan} disabled={aiScan === "loading"}
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 14px", borderRadius: 7, cursor: "pointer", border: `1px solid ${C.accent}`, background: `${C.accent}18`, color: C.accent }}>
            {aiScan === "loading" ? "⏳ analyzing…" : "▶ ANALYZE SETUPS"}
          </button>
          <button onClick={() => { const v = !aiScanAuto; setAiScanAuto(v); localStorage.setItem("gl_aiscan_auto", v ? "on" : "off"); }}
            title="Auto-run the AI scan every ~30 min (cheap — one batched call)"
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 7, cursor: "pointer",
              border: `1px solid ${aiScanAuto ? C.green : C.border}`, background: aiScanAuto ? C.green : "transparent", color: aiScanAuto ? "#fff" : C.textDim }}>
            {aiScanAuto ? "🔁 AUTO: ON" : "AUTO: OFF"}
          </button>
          <button onClick={() => {
            setAiScan("loading");
            const top = results.filter(r => r.aScore >= 80).sort((a, b) => b.aScore - a.aScore).slice(0, 10).map(r => ({ symbol: r.symbol, aScore: r.aScore, sector: r.sector, atEntry: r.atEntry }));
            fetch("/api/market/ai-gameplan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regime: regime.score, setups: top }) })
              .then(res => res.json()).then(d => setAiScan(d && d.ok ? `🌅 MORNING GAME PLAN\n\n${d.plan}` : { error: (d && d.error) || "no response" })).catch(e => setAiScan({ error: e.message }));
          }} title="Generate today's morning game plan and show it here"
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 11px", borderRadius: 7, cursor: "pointer", border: `1px solid ${C.border}`, background: C.surface, color: C.textSec }}>🌅 Game plan</button>
          <button onClick={() => {
            setAiScan("loading");
            const etd = d => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(d));
            fetch("/api/alpaca/closed-trades").then(r => r.json()).then(ct => {
              const today = etd(new Date());
              const todayT = (ct && ct.ok ? ct.trades || [] : []).filter(t => etd(t.closedAt) === today);
              if (!todayT.length) { setAiScan("🎯 AI TRADE COACH\n\nNo closed trades today — nothing to review. Sitting out is a valid result."); return; }
              fetch("/api/market/ai-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trades: todayT.map(t => ({ symbol: t.symbol, side: t.side, entry: t.entry, exit: t.exit, pnl: t.pnl })) }) })
                .then(res => res.json()).then(d => setAiScan(d && d.ok ? `🎯 AI TRADE COACH\n\n${d.coach}` : { error: (d && d.error) || "no response" }));
            }).catch(e => setAiScan({ error: e.message }));
          }} title="Review today's closed trades and show the coaching here"
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 11px", borderRadius: 7, cursor: "pointer", border: `1px solid ${C.border}`, background: C.surface, color: C.textSec }}>🎯 Coach</button>
          <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginLeft: "auto" }}>one batched call · ranks your A+ names + market read</span>
        </div>
        {aiTrig && <div style={{ fontFamily: SANS, fontSize: 11, color: C.accent, marginTop: 8 }}>{aiTrig}</div>}
        {aiScan && aiScan.error && <div style={{ fontFamily: SANS, fontSize: 11, color: C.amber, marginTop: 8 }}>AI scan unavailable — {aiScan.error}</div>}
        {typeof aiScan === "string" && aiScan !== "loading" && (
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.6, whiteSpace: "pre-line", marginTop: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>{aiScan}</div>
        )}
      </div>

      {/* ── Sector strength (Step 2: trade leaders in strong sectors) ── */}
      {sectorsRanked.length > 0 && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: C.card, border: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textSec, letterSpacing: "0.05em", marginBottom: 8 }}>🧭 SECTOR STRENGTH TODAY <span style={{ fontWeight: 500, color: C.textDim }}>— favor leaders in the green half</span></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sectorsRanked.map((s, i) => {
              const strong = i < Math.ceil(sectorsRanked.length / 2);
              const col = s.chg >= 0 ? C.green : C.red;
              return (
                <span key={s.sym} title={s.name} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5,
                  color: col, background: `${col}${strong ? "1a" : "0a"}`, border: `1px solid ${col}${strong ? "55" : "22"}`, opacity: strong ? 1 : 0.6 }}>
                  {strong ? "🟢" : "🔴"} {s.sym} {s.chg >= 0 ? "+" : ""}{s.chg.toFixed(2)}%
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 🩸 BOTTOM SPOTTER — capitulation reversal candidates + AI knife-check ── */}
      {bottoms.length > 0 && (
        <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: "#0891b208", border: "1px solid #0891b233" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: "#0891b2" }}>🩸 BOTTOM SPOTTER ({bottoms.filter(b => b.bottomReady).length} ready)</span>
            <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>✅ READY = washout bouncing & reclaiming · ⏳ WAIT = still falling</span>
            <button onClick={() => {
              setAiBottom("loading");
              const spyQ2 = (macroData || []).find(m => m.symbol === "SPY");
              const vix = (macroData || []).find(m => (m.symbol || "").toUpperCase().includes("VIX"));
              fetch("/api/market/ai-bottom", { method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ market: { regime: regime.score, vix: Number(vix?.price || 0) || null, spyChg: Number(spyQ2?.changesPercentage || 0) },
                  candidates: bottoms.map(r => ({ symbol: r.symbol, bottomScore: r.bottomScore, offHigh: r.offHigh, rvol: Number(r.rvol || 0).toFixed(1), chg: r.chg.toFixed(1) })) }) })
                .then(res => res.json()).then(d => setAiBottom(d && d.ok ? d.analysis : { error: (d && d.error) || "no response" })).catch(e => setAiBottom({ error: e.message }));
            }} disabled={aiBottom === "loading"}
              style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 7, cursor: "pointer", border: "1px solid #0891b2", background: "#0891b218", color: "#0891b2" }}>
              {aiBottom === "loading" ? "⏳ checking news…" : "🤖 IS THIS A BOTTOM?"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 6 }}>
            {bottoms.map(r => (
              <div key={r.symbol} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderRadius: 7,
                background: r.bottomReady ? `${C.green}10` : C.surface, border: `1px solid ${r.bottomReady ? C.green + "55" : C.border}` }}>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: "#0891b2", minWidth: 30 }}>{r.bottomScore}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent }}>{r.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.red }}>{r.offHigh}%</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: r.chg >= 0 ? C.green : C.red }}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(1)}%</span>
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 8.5, fontWeight: 800, padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap",
                  color: r.bottomReady ? "#fff" : C.amber, background: r.bottomReady ? C.green : `${C.amber}18`, border: `1px solid ${r.bottomReady ? C.green : C.amber + "55"}` }}>
                  {r.bottomReady ? "✅ READY" : "⏳ WAIT"}
                </span>
              </div>
            ))}
          </div>
          {aiBottom && aiBottom.error && <div style={{ fontFamily: SANS, fontSize: 11, color: C.amber, marginTop: 8 }}>AI check unavailable — {aiBottom.error}</div>}
          {typeof aiBottom === "string" && aiBottom !== "loading" && (
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.6, whiteSpace: "pre-line", marginTop: 10, background: C.card, border: "1px solid #0891b233", borderRadius: 8, padding: "10px 12px" }}>{aiBottom}</div>
          )}
        </div>
      )}

      {/* ── MODE: Bull / Bear / Cash ── */}
      {mode === "CASH" ? (
        <div style={{ marginBottom: 16, padding: "18px 20px", borderRadius: 12, textAlign: "center",
          background: `${C.textDim}10`, border: `2px dashed ${C.textDim}66` }}>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.textSec, letterSpacing: "0.08em" }}>⚪ CASH MODE</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginTop: 6, lineHeight: 1.6 }}>
            No setups meet criteria. <strong style={{ color: C.text }}>Protect capital. Wait.</strong><br/>
            The best traders sit in cash more than they trade. No A+ setup = no trade.
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          background: `${modeColor}12`, border: `1px solid ${modeColor}55` }}>
          <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: modeColor }}>
            {mode === "BULL" ? "🟢 BULL MODE" : "🔴 BEAR MODE"}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>
            {mode === "BULL" ? "favor calls" : "favor puts"} · Calls <strong style={{ color: C.green }}>{tradeableCalls}</strong> · Puts <strong style={{ color: C.red }}>{tradeablePuts}</strong> tradeable
          </span>
          <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginLeft: "auto" }}>trade with the mode, not against it</span>
        </div>
      )}

      {/* ── CANDIDATES — Calls / Puts / Watch in 3 compact columns ── */}
      {(() => {
        const tag = (txt, col, on) => <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 3, whiteSpace: "nowrap", color: on ? "#fff" : C.textDim, background: on ? col : "transparent", border: `1px solid ${on ? col : C.border}` }}>{txt}</span>;
        const card = (r, { score, sc, ok, checks, rr, tint, badge, lvls }) => candOpen === r.symbol ? (
          <div key={r.symbol} style={{ marginBottom: 5 }}>
            <Row r={r} />
            <button onClick={() => setCandOpen(null)} style={{ width: "100%", marginTop: -8, fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, background: "transparent", border: "none", cursor: "pointer", padding: "2px 0" }}>▲ collapse</button>
          </div>
        ) : (
          <div key={r.symbol} onClick={() => setCandOpen(r.symbol)} title="Click to expand full setup"
            style={{ padding: "6px 8px", borderRadius: 7, marginBottom: 5, cursor: "pointer", background: ok ? `${tint}12` : C.surface, border: `1px solid ${ok ? tint + "55" : C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0, overflow: "hidden" }}>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: sc }}>{score}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent }}>{r.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, whiteSpace: "nowrap" }}>${r.px.toFixed(2)}</span>
              </div>
              {badge}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 4 }}>
              <span style={{ letterSpacing: 1.5, lineHeight: 1 }}>{checks.map((c, i) => <span key={i} style={{ fontSize: 10, color: c.pass ? tint : C.border }}>●</span>)}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: rr >= 2 ? C.green : C.amber, fontWeight: 700, whiteSpace: "nowrap" }}>
                R:R {rr}:1 · <span style={{ color: r.chg >= 0 ? C.green : C.red }}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(1)}%</span>
              </span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.textDim, marginTop: 2 }}>{lvls}</div>
          </div>
        );
        const colWrap = (accent, head, count, sub, body) => (
          <div style={{ border: `1px solid ${accent}33`, borderRadius: 10, padding: "10px 11px", background: `${accent}06` }}>
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: accent, letterSpacing: "0.04em" }}>{head} ({count})</div>
            <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim, margin: "3px 0 9px", lineHeight: 1.4 }}>{sub}</div>
            {body}
          </div>
        );
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12, marginBottom: 20, alignItems: "start" }}>
            {colWrap(C.green, "🟢 CALLS", calls.filter(c => c.aPlus).length, "Score ≥85 · market green · at buy zone (85–89 = half size).",
              calls.length === 0 ? <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>nothing set up ⏳</div>
                : calls.map(r => { const ok = r.aPlus; return card(r, { score: r.aScore, sc: r.aScore >= 90 ? C.green : r.aScore >= 85 ? "#5ab552" : C.textDim, ok, checks: r.checks, rr: r.rr, tint: C.green, badge: tag(ok ? `BUY ${r.confRisk}%` : r.atEntry ? "watch" : "wait entry", C.green, ok), lvls: `🎯 $${r.bestEntry} · 🛑 $${r.stop}` }); }))}
            {colWrap(C.red, "🔻 PUTS", puts.filter(p => p.bearTradeable).length, "Bear Score >80 · R:R ≥2. Trade small, sit in cash if none.",
              puts.length === 0 ? <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>nothing breaking down ✅</div>
                : puts.map(r => { const ok = r.bearTradeable; return card(r, { score: r.bearScore, sc: r.bearScore >= 80 ? C.red : "#d6a312", ok, checks: r.bearChecks, rr: r.putRR, tint: C.red, badge: tag(ok ? "TRADE" : "watch", C.red, ok), lvls: `🛑 $${r.putStop} · 🎯 $${r.putTarget}` }); }))}
            {colWrap(C.amber, "🟡 WATCH", yellow.length, "Almost ready (3/5) — wait for the 4th–5th check.",
              yellow.length === 0 ? <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>nothing on watch</div>
                : yellow.slice(0, 12).map(r => card(r, { score: r.passed * 20, sc: C.amber, ok: false, checks: r.checks, rr: r.rr, tint: C.amber, badge: tag("watch", C.amber, false), lvls: `🎯 $${r.bestEntry} · 🛑 $${r.stop}` })))}
          </div>
        );
      })()}

      {/* RED — collapsed */}
      {red.length > 0 && (
        <div style={{ padding: "10px 14px", background: `${C.red}08`, border: `1px solid ${C.red}22`, borderRadius: 8 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>
            🔴 SKIP TODAY ({red.length}): {red.map(r => r.symbol).join(" · ")}
          </div>
        </div>
      )}

      {results.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", fontFamily: MONO, fontSize: 14, color: C.textDim }}>
          Add stocks to your watchlist to see Green Light scores
        </div>
      )}

      {/* Trade Journal — log your Green Light trades right here */}
      <div style={{ marginTop: 24, borderTop: `2px solid ${C.border}`, paddingTop: 16 }}>
        <RhProJournal C={C} MONO={MONO} SANS={SANS} />
      </div>
    </div>
  );
}

