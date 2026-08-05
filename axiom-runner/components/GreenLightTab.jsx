import { useState, useEffect, useRef } from "react";
import { computeRegime, computeAPlusScore, STOCK_TO_SECTOR } from "./market-helpers.js";
import {
  computeScores, computeGreenLight, computeDayTradeSignal, logTradeNote, addPaperTrade,
  addPaperOption, alpacaOption,
} from "./trading-utils.js";
import { AI_ACTIONS } from "./ai-actions.js";

// ── Day Trade Mode row — fast in/out, real intraday signals only. Kept as
// its own lightweight component (not a branch inside the swing Row above)
// since almost nothing about that component applies here: no 52-week
// stats, no ATR multi-day stop, no options premium math built for a
// 30-60 day hold. Trade levels are the tight, same-session numbers from
// computeDayTradeSignal; buying tags the paper trade dayTrade:true so
// AutoPilotEngine's EOD-flatten guarantees it closes before the bell. ──
function DayTradeRow({ r, C, MONO, SANS, num, badge, neutralCard, accentCard, sectionLabel, sigCol, setTerminalSymbol, setActiveTab }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ ...accentCard(sigCol(r.signal)), padding: "12px 16px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center", minWidth: 64 }}>
          <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: sigCol(r.signal) }}>
            {r.signal === "GREEN" ? AI_ACTIONS.BUY.label : r.signal === "YELLOW" ? AI_ACTIONS.WAIT.label : AI_ACTIONS.AVOID.label}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, ...num }}>{r.passed}/5</div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: C.accent }}>{r.symbol}</span>
            <span style={{ fontFamily: MONO, fontSize: 13.5, color: C.text, ...num }}>${r.px.toFixed(2)}</span>
            <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: r.chg >= 0 ? C.green : C.red, ...num }}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(2)}%</span>
            <span style={badge(r.grade === "ELITE" ? "#7c3aed" : r.grade === "A+" ? "#16a34a" : r.grade === "GOOD" ? C.green : r.grade === "WATCH" ? C.amber : C.red, true)}>{r.grade} {r.quality}</span>
            {r.rvol >= 1.5 && <span style={badge(C.amber)}>VOL {r.rvol.toFixed(1)}x</span>}
            {r.atEntry ? <span style={badge(C.green)}>at breakout</span> : <span style={badge(C.amber)}>{r.entryNote}</span>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {r.checks.map((c, i) => (
              <span key={i} title={c.tip} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: c.pass ? C.green : C.red,
                background: c.pass ? `${C.green}15` : `${C.red}10`, border: `1px solid ${c.pass ? C.green : C.red}33`, borderRadius: 4, padding: "2px 7px" }}>
                {c.pass ? "✓" : "✗"} {c.label}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, alignItems: "center", fontFamily: MONO, fontSize: 10.5, ...num }}>
            <span style={{ color: C.green }}>Target ${r.target} (R:R {r.rr}:1{r.rrPass ? " ✓" : " thin"})</span>
            <span style={{ color: C.red }}>Stop ${r.stop} (below VWAP)</span>
            <span style={{ color: C.amber, fontWeight: 700 }}>⏱ {r.timeStop}</span>
          </div>
        </div>
        {r.signal === "GREEN" && (
          <div style={{ textAlign: "right", borderLeft: `1px solid ${C.border}`, paddingLeft: 12, minWidth: 140, ...num }}>
            <div style={{ ...neutralCard, borderLeft: `2px solid ${C.accent}`, padding: "4px 8px", marginBottom: 6 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Fast Entry</div>
              <div style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 800, color: C.accent }}>${r.bestEntry}</div>
            </div>
            {[["Stop", r.stop, C.red], ["Target", r.target, C.green]].map(([l, v, col]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{l}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: col }}>${v}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={(e) => {
              const res = addPaperTrade(r.symbol, r.bestEntry || r.px, { stop: r.stop, t1: r.target, t2: r.target, t3: r.target, glScore: r.quality, dayTrade: true });
              const btn = e.currentTarget;
              btn.textContent = res === "DUP" ? "already open" : "✓ DAY TRADE!";
              btn.style.background = C.green; btn.style.color = "#fff";
              setTimeout(() => { btn.textContent = "⚡ DAY TRADE BUY"; btn.style.background = `${C.green}18`; btn.style.color = C.green; }, 1800);
            }}
            title="One-click paper day trade — tight VWAP stop, fast target, auto-flattened by 3:55 PM ET regardless of outcome"
            style={{ background: `${C.green}18`, border: `1px solid ${C.green}55`, color: C.green, borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 12px", cursor: "pointer" }}>
            ⚡ DAY TRADE BUY
          </button>
          <button onClick={(e) => {
              const btn = e.currentTarget;
              const lines = [
                `⚡ ${r.symbol} — $${r.px.toFixed(2)} (${r.chg >= 0 ? "+" : ""}${r.chg.toFixed(2)}%)`,
                `Day Trade Signal: ${r.signal} · ${r.grade} (${r.quality}/100)`,
                `Entry $${r.bestEntry} — ${r.entryNote}`,
                `Stop $${r.stop} · Target $${r.target} (R:R ${r.rr}:1)`,
                `⏱ ${r.timeStop}`,
              ];
              btn.textContent = "…sending";
              fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) })
                .then(res => res.json())
                .then(d => { btn.textContent = d?.ok ? "✓ sent" : "✗ failed"; })
                .catch(() => { btn.textContent = "✗ network error"; })
                .finally(() => { setTimeout(() => { btn.textContent = "✈ TELEGRAM"; }, 5000); });
            }}
            title={`Send ${r.symbol}'s real current day-trade setup to your Telegram right now`}
            style={{ background: `${C.accent}18`, border: `1px solid ${C.accent}55`, color: C.accent, borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 12px", cursor: "pointer" }}>
            ✈ TELEGRAM
          </button>
          {r.signal === "GREEN" && (
            <button onClick={() => {
                try {
                  localStorage.setItem("tradeplanner_load_plan", JSON.stringify({
                    symbol: r.symbol, entry: Number(r.bestEntry), stop: Number(r.stop), target: Number(r.target),
                    aplus: null, next: null, source: "Green Light Day Trade",
                  }));
                } catch {}
                setActiveTab && setActiveTab("tradeplanner");
              }}
              title={`Plan this trade — opens Trade Planner with ${r.symbol}'s real day-trade entry/stop/target already filled in`}
              style={{ background: `${C.accent}14`, border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 12px", cursor: "pointer" }}>
              🎯 PLAN
            </button>
          )}
          <button onClick={() => { const opening = !expanded; setExpanded(opening); if (opening && setTerminalSymbol) setTerminalSymbol(r.symbol); }}
            style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}44`, color: C.accent, borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>
            {expanded ? "▲ CLOSE" : "🔬 CHART"}
          </button>
        </div>
      </div>
      {expanded && (() => {
        // Same real indicator status board as the Day Trade Scanner tab
        // (DayTradeTab.jsx) — EMA9/21/50, VWAP, RVOL, trend/risk/buy/exit
        // reads off the exact same fields, so a symbol looks identical
        // whether you check it here or there.
        const G = "#0d9465", R = "#c8282a", GR = "#6b7280", PU = "#7c5cff";
        const trend = r.bull15 ? ["BULL", G] : (r.aboveVwap ? ["MIXED", "#d6a312"] : ["BEAR", R]);
        const risk = (r.bull15 && r.aboveVwap) ? ["ON", G] : ["OFF", GR];
        const buy = r.signal === "GREEN" ? [AI_ACTIONS.BUY.label, G] : [AI_ACTIONS.WAIT.label, GR];
        const exit = (!r.aboveVwap || !r.bull15) ? [AI_ACTIONS.EXIT.label, R] : [AI_ACTIONS.WAIT.label, GR];
        const rvolCell = [(r.rvol == null ? "—" : r.rvol.toFixed(2)), (r.rvol || 0) >= 1.5 ? G : (r.rvol || 0) >= 1 ? "#d6a312" : R];
        const closeCell = r.closeStrong ? ["STRONG", G] : ["WEAK", R];
        const cell = (label, val, col) => (
          <div style={{ background: col, borderRadius: 4, padding: "6px 4px", textAlign: "center", color: "#fff", minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, opacity: 0.85, letterSpacing: 0.3 }}>{label}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
          </div>
        );
        const px = (v) => v == null ? "—" : "$" + Number(v).toFixed(2);
        return (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 6, letterSpacing: 0.5 }}>INDICATORS</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 10 }}>
              {cell("EMA 9", px(r.ema9), G)}
              {cell("EMA 21", px(r.ema21), G)}
              {cell("EMA 50", px(r.ema50), G)}
              {cell("VWAP", px(r.vwap), r.aboveVwap ? G : R)}
              {cell("RVOL", rvolCell[0], rvolCell[1])}
              {cell("TREND", trend[0], trend[1])}
              {cell("RISK", risk[0], risk[1])}
              {cell("BUY", buy[0], buy[1])}
              {cell("EXIT", exit[0], exit[1])}
              {cell("CLOSE", closeCell[0], closeCell[1])}
            </div>
            <iframe title={`${r.symbol} intraday`} src={`/client/tv-widget.html?w=advanced-chart&s=${encodeURIComponent(r.symbol)}&t=${(C.bg && /^#0|^#1/i.test(C.bg)) ? "dark" : "light"}&h=380&iv=15&st=vwap,volume`}
              style={{ width: "100%", height: 380, border: `1px solid ${C.border}`, borderRadius: 10, display: "block" }} />
          </div>
        );
      })()}
    </div>
  );
}

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
    <div style={{ textAlign: "center", minWidth: 70 }}>
      <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: col || C.text, fontVariantNumeric: "tabular-nums" }}>{val}</div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 1 }}>{label}</div>
    </div>
  );
  return (
    <>
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "11px 16px", marginBottom: 12,
      background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${statusCol}`, borderRadius: 8 }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: statusCol, letterSpacing: "0.02em" }}>
          Autopilot {halted ? "Halted" : on ? "On" : "Off"}</div>
        <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 1 }}>{serverMode ? "server mode · trades 24/7, no browser needed" : `${broker} · paper`}{halted && haltReason ? ` · ${haltReason}` : ""}</div>
      </div>
      {cell("Today", money(dayPnl), dayPnl > 0 ? C.green : dayPnl < 0 ? C.red : C.text)}
      {cell("Open", positions.length, C.text)}
      {cell("Long / Short", `${longs} / ${shorts}`, C.text)}
      {cell(`Risk / ${maxRisk}%`, `${riskPct.toFixed(1)}%`, riskPct >= maxRisk ? C.red : riskPct >= maxRisk * 0.75 ? C.amber : C.green)}
      {acct && cell("Equity", `$${Math.round(Number(acct.equity)).toLocaleString()}`, C.text)}
      <button onClick={deepReview} disabled={reviewing} title="Top-tier Fable model judges whether the autopilot has a real edge"
        style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10.5, fontWeight: 700, cursor: reviewing ? "default" : "pointer",
          padding: "7px 12px", borderRadius: 6, border: `1px solid ${C.border}`, color: C.textSec, background: "transparent" }}>
        {reviewing ? "analyzing…" : "Deep Review"}</button>
      <button onClick={toggle} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer",
        padding: "7px 16px", borderRadius: 6, border: `1px solid ${on ? C.red : C.green}`, color: on ? C.red : C.green,
        background: `${on ? C.red : C.green}12` }}>{on ? "Pause" : "Resume"}</button>
      </div>
      {review && (
        <div style={{ marginTop: -4, marginBottom: 12, padding: "12px 14px", ...neutralCardStyle(C), fontFamily: SANS, fontSize: 12.5,
          color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: C.textDim, letterSpacing: "0.06em", marginBottom: 6, textTransform: "uppercase" }}>Deep Strategy Review · Fable</div>
          {review}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>API TOKEN</span>
        <input type="password" defaultValue={localStorage.getItem("axiom_api_token") || ""}
          onBlur={e => localStorage.setItem("axiom_api_token", e.target.value.trim())}
          placeholder="only if API_AUTH_TOKEN set in Render"
          style={{ flex: 1, maxWidth: 320, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: MONO, fontSize: 11, color: C.text, padding: "5px 8px", outline: "none" }} />
        <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>must match Render</span>
      </div>
    </>
  );
}
const neutralCardStyle = (C) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 });

export default function GreenLightTab({ C, MONO, SANS, watchlistData, macroData, openDeepDiveFor, scanResults, sectorData, setTerminalSymbol, setActiveTab }) {
  const spyQ   = (macroData || []).find(m => m.symbol === "SPY") || (watchlistData || []).find(w => w.symbol === "SPY");
  const spyChg = Number(spyQ?.changesPercentage || 0);
  // Sector strength: rank the 11 SPDR sector ETFs by today's move; top half = "strong" (Step 2 of the A+ spec).
  const sectorsRanked = [...(sectorData || [])].map(s => ({ sym: s.symbol, name: s._sectorName || s.symbol, chg: Number(s.changesPercentage || 0) })).sort((a, b) => b.chg - a.chg);
  const strongSectors = new Set(sectorsRanked.slice(0, Math.ceil(sectorsRanked.length / 2)).map(s => s.sym));
  // Real trend structure for computeGreenLight below — q.priceAvg50/
  // priceAvg200/yearHigh/yearLow (from /api/market/quote, the source of
  // watchlistData) are always 0 for any Alpaca-covered symbol, which
  // silently zeroed out the "Uptrend"/"Downtrend" 5-check factors (capping
  // the true GREEN LIGHT 5/5 signal — and its dedicated Telegram alert —
  // at permanently unreachable), most of the A+ Institutional trend
  // sub-score, and the displayed "% off 52w high" stat (same root cause
  // fixed elsewhere this session).
  const [trendMap, setTrendMap] = useState({});
  const wlSymsKey = [...new Set((watchlistData || []).map(q => q.symbol).filter(Boolean))].sort().join(",");
  useEffect(() => {
    if (!wlSymsKey) return;
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(wlSymsKey)}`)
      .then(r => r.json())
      .then(j => {
        const map = {};
        (j.results || []).forEach(r => { if (!r.error) map[r.symbol] = r; });
        setTrendMap(map);
      })
      .catch(() => {});
  }, [wlSymsKey]);
  // ── Day Trade Mode (2026-08-05, "trade in and out daily fast") — a
  // persisted toggle between the existing swing engine (untouched below)
  // and a real intraday engine scoped to the same watchlist, sourced from
  // the same /api/market/daytrade-scan the Day Trade Scanner tab uses,
  // just filtered to symbols=<watchlist> instead of its 100+ universe. ──
  const [glMode, setGlMode] = useState(() => { try { return localStorage.getItem("gl_mode") || "swing"; } catch { return "swing"; } });
  const setMode = (m) => { setGlMode(m); try { localStorage.setItem("gl_mode", m); } catch {} };
  const [dtRows, setDtRows] = useState([]);
  const [dtState, setDtState] = useState("idle");
  useEffect(() => {
    if (glMode !== "daytrade" || !wlSymsKey) return;
    let cancelled = false;
    const scan = () => {
      fetch(`/api/market/daytrade-scan?symbols=${encodeURIComponent(wlSymsKey)}`)
        .then(r => r.json())
        .then(j => { if (!cancelled) { setDtRows(j?.ok && j.rows ? j.rows : []); setDtState(j?.ok ? (j.rows?.length ? "ok" : "none") : "err"); } })
        .catch(() => { if (!cancelled) setDtState("err"); });
    };
    scan();
    const t = setInterval(scan, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [glMode, wlSymsKey]);
  const dtResults = dtRows.map(row => computeDayTradeSignal(row, spyChg)).filter(Boolean).sort((a, b) => b.quality - a.quality);
  const dtGreen = dtResults.filter(r => r.signal === "GREEN");
  const dtYellow = dtResults.filter(r => r.signal === "YELLOW");
  const dtRed = dtResults.filter(r => r.signal === "RED");
  // Real intraday session (PRE/REGULAR/AFTER-HOURS/CLOSED) — day-trade
  // signals (VWAP/opening-range/RVOL) are only meaningful during regular
  // hours, so the mode banner below is honest about when they apply.
  const [etNow, setEtNow] = useState(() => new Date());
  useEffect(() => { if (glMode !== "daytrade") return; const t = setInterval(() => setEtNow(new Date()), 30000); return () => clearInterval(t); }, [glMode]);
  const marketSession = (() => {
    let h = 0, m = 0, wd = "";
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(etNow).map(p => [p.type, p.value]));
      h = Number(parts.hour); m = Number(parts.minute); wd = parts.weekday;
    } catch { return "CLOSED"; }
    if (wd === "Sat" || wd === "Sun") return "CLOSED";
    const mins = h * 60 + m;
    if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "PRE-MARKET";
    if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "REGULAR";
    if (mins >= 16 * 60 && mins < 20 * 60) return "AFTER-HOURS";
    return "CLOSED";
  })();
  const flattenCountdown = (() => {
    if (marketSession !== "REGULAR") return null;
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(etNow).map(p => [p.type, p.value]));
    const nowMin = Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60;
    const left = 15 * 60 + 55 - nowMin;
    if (left <= 0) return "flattening now";
    const hh = Math.floor(left / 60), mm = Math.floor(left % 60);
    return `${hh > 0 ? `${hh}h ` : ""}${mm}m to flatten`;
  })();

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
      // range=1y (not 90d) — the tech block below computes "MA200" as
      // Math.min(200, closes.length) of whatever this fetch returns. A 90d
      // range only ever returns ~90 closes, so the "MA200" shown (and its
      // above/below bullish/bearish coloring) was silently a ~90-day
      // average standing in for a real 200-day one — enough of a gap to
      // misclassify longer-term trend direction. 1y matches this same
      // codebase's own convention for a real 200-day MA elsewhere
      // (GLBacktestTab, trend-screen's _buildTrendTemplate).
      fetch(`/api/market/chart?symbol=${sym}&interval=1d&range=1y`).then(r => r.json()),
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
    const gl = computeGreenLight(q, spyChg, scanRow, regime.score, trendMap[q.symbol]);
    const sec = STOCK_TO_SECTOR[q.symbol];
    // A+ Score — the platform's separate real 9-dimension composite
    // (market-helpers.js), deliberately NOT merged into Green Light's own
    // computeGreenLight AI Review (aScore/grade/risk) — same "keep parallel
    // scoring systems separate" rule already applied to Watchlist/RhPro.
    // Reuses the same trendMap[symbol] row computeGreenLight itself already
    // consumes above — no new fetch.
    const aplus = computeAPlusScore(trendMap[q.symbol] || {}, regime);
    return { ...gl, symbol: q.symbol, name: q.name, q, sector: sec || null, strongSector: sec ? strongSectors.has(sec) : null, aplus };
  }).filter(r => r.px > 0).sort((a, b) => b.aScore - a.aScore || b.passed - a.passed);

  const green  = results.filter(r => r.signal === "GREEN");
  // Alt Setup (2026-08-03, explicit user request for "more flexible logic" —
  // does it have to be 4/5 to trade) — a real second qualifying path
  // computeGreenLight now reports (BOS breakout / RVOL breakout / Higher
  // Lows continuation / MACD+EMA momentum cross, always gated on the same
  // real market-safe check). A stock that qualifies ONLY through this path
  // (checklist itself is YELLOW/RED) is real and tradeable, so it moves up
  // into Ready to Trade rather than sitting hidden in Watch/Skip — but
  // never silently merged into `green` itself, since that would misreport
  // WHY it qualifies (Row's badge below shows the real reason either way).
  const altQualified = results.filter(r => r.signal !== "GREEN" && r.altSetup);
  const readyToTrade = [...green, ...altQualified];
  const yellow = results.filter(r => r.signal === "YELLOW" && !r.altSetup);
  const red    = results.filter(r => r.signal === "RED" && !r.altSetup);
  // Put candidates — momentum breakdowns, ranked by Bear Score (only meaningful on red/weak tape).
  const puts   = results.filter(r => r.bearScore >= 60).sort((a, b) => b.bearScore - a.bearScore).slice(0, 12);
  // Call candidates — ranked by A+ Institutional Score.
  const calls  = results.filter(r => r.aScore >= 80).sort((a, b) => b.aScore - a.aScore).slice(0, 12);
  // Bottom / reversal candidates — capitulation washouts.
  const bottoms = results.filter(r => r.bottomScore >= 60).sort((a, b) => b.bottomScore - a.bottomScore).slice(0, 10);
  // ── MODE: Bull (tradeable calls) · Bear (tradeable puts) · Cash (nothing qualifies) ──
  const tradeableCalls = results.filter(r => r.qualifiesAPlus).length;   // A+ (≥90) + market pass + at entry
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

  // ── Shared visual tokens (2026-08-03 professional redesign) ──
  // The prior version tinted nearly every section's full background by its
  // status color and led every header with 2-3 decorative emoji, reading as
  // busy rather than institutional. This pass keeps every real number and
  // signal exactly as computed above — only the presentation changes:
  // neutral card surfaces everywhere, color reserved for a thin left-border
  // accent + small inline badges (never a whole tinted panel), quiet
  // uppercase section labels instead of bold colored ones, tabular figures
  // for anything numeric so columns of prices/scores actually align.
  const sectionLabel = { fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: C.textDim, letterSpacing: "0.09em", textTransform: "uppercase" };
  const neutralCard = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 };
  const accentCard = (col) => ({ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${col}`, borderRadius: 8 });
  const num = { fontVariantNumeric: "tabular-nums" };
  const badge = (col, filled) => ({ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
    color: filled ? "#fff" : col, background: filled ? col : `${col}12`, border: `1px solid ${col}40`, whiteSpace: "nowrap" });

  // Real bug fixed 2026-08-04 (readability/bug sweep): readyToTrade =
  // green ∪ altQualified (L271), and altQualified only ever includes
  // non-GREEN rows that have a real r.altSetup — and every altSetup
  // pattern (trading-utils.js: BOS Breakout/RVOL Breakout/Higher Lows
  // Continuation/MACD-EMA Cross) is bullish-only by construction. So every
  // row that ever reaches this Row component is a real bullish candidate,
  // whether via the classic GREEN signal or a real Alt Setup — but 3
  // separate spots below still gated on raw r.signal alone (r.signal !==
  // "RED" / r.signal === "GREEN" || "YELLOW"), which is only ever wrong
  // for the RED+altSetup subset: those rows got the wrong (bearish PUT)
  // options preview in the "Potential strip" AND had their entire Trade
  // Levels panel (entry/stop/T1/T2) hidden — despite being shown here as
  // ready to trade. One shared flag now drives all three checks; for
  // every other row (GREEN, or YELLOW/RED handled elsewhere) this is
  // unconditionally true, so behavior is unchanged there.
  const Row = ({ r }) => {
    const isBullishCandidate = r.signal === "GREEN" || !!r.altSetup;
    return (
    <div style={{ ...accentCard(sigCol(r.signal)), padding: "12px 16px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {/* Signal badge — a row here via a real Alt Setup (not the classic
            4-5/5 checklist) shows that real reason instead of the raw
            checklist-derived Avoid/Wait, which would otherwise contradict
            its place in Ready to Trade. The checklist itself (r.passed/
            r.checks) is untouched and still shown below either way. */}
        <div style={{ textAlign: "center", minWidth: 64 }}>
          {/* Label unified to the shared AI_ACTIONS vocabulary
              (institutional redesign Phase 7, 2026-07-30) — same real
              GREEN/YELLOW/RED signal drives the color (sigCol/sigBg/sigIcon,
              untouched), only the displayed word changed. */}
          {r.altSetup && r.signal !== "GREEN" ? (
            <div title={r.altSetup.reason} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: "#6d5dd3" }}>ALT SETUP</div>
          ) : (
            <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: sigCol(r.signal) }}>
              {r.signal === "GREEN" ? AI_ACTIONS.BUY.label : r.signal === "YELLOW" ? AI_ACTIONS.WAIT.label : AI_ACTIONS.AVOID.label}
            </div>
          )}
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, ...num }}>{r.passed}/5</div>
        </div>

        {/* Ticker info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: C.accent }}>{r.symbol}</span>
            <span style={{ fontFamily: MONO, fontSize: 13.5, color: C.text, ...num }}>${r.px.toFixed(2)}</span>
            <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: r.chg >= 0 ? C.green : C.red, ...num }}>
              {r.chg >= 0 ? "+" : ""}{r.chg.toFixed(2)}%
            </span>
            {r.rvol > 1.5 && <span style={badge(C.amber)}>VOL {r.rvol.toFixed(1)}x</span>}
            {r.isLeader && <span style={badge(C.green, true)}>LEADER +{r.relStrength}% vs SPY</span>}
            {(() => { const gc = r.grade === "ELITE" ? "#7c3aed" : r.grade === "A+" ? "#16a34a" : r.grade === "GOOD" ? C.green : r.grade === "WATCH" ? C.amber : C.red;
              const sp = r.scoreParts;
              return <span title={`Trend ${sp.trend}/30 · Momentum ${sp.momentum}/20 · Volume ${sp.volume}/15 · Structure ${sp.structure}/20 · Risk ${sp.risk}/15${r.confRisk ? ` · size ${r.confRisk}%` : ""}`}
                style={badge(gc, true)}>{r.grade} {r.aScore}</span>; })()}
            {r.altSetup && <span title={r.altSetup.reason} style={badge("#6d5dd3")}>{r.altSetup.type}</span>}
            {r.confRisk > 0 && <span style={badge(C.accent)}>size {r.confRisk}%</span>}
            {isBullishCandidate && (r.atEntry
              ? <span style={badge(C.green)}>at buy zone</span>
              : <span style={badge(C.amber)}>wait for pullback ${r.bestEntry}</span>)}
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
            const decision = r.qualifiesAPlus ? "BUY" : (r.atEntry ? "WAIT" : "SKIP");
            const dCol = decision === "BUY" ? C.green : decision === "WAIT" ? C.amber : C.red;
            // Display label unified to the shared AI_ACTIONS vocabulary
            // (institutional redesign Phase 7, 2026-07-30) — `decision`
            // itself is untouched, still drives dCol/comparisons below.
            const decisionLabel = decision === "BUY" ? AI_ACTIONS.BUY.label : decision === "WAIT" ? AI_ACTIONS.WAIT.label : AI_ACTIONS.AVOID.label;
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
              <div style={{ marginTop: 10, ...neutralCard, borderLeft: `2px solid ${dCol}`, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ ...sectionLabel, fontSize: 9.5 }}>AI Review</span>
                  <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: dCol }}>{decisionLabel}</span>
                  {/* Confidence/Grade dropped here (2026-08-04, real
                      duplicate-rendering fix) — pure restatement of the
                      {r.grade} {r.aScore} badge already on the ticker line
                      above, same score, same row. Risk/Size below are real
                      new information, not shown anywhere else on this row. */}
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>Risk <strong style={{ color: risk === "Very Low" || risk === "Low" ? C.green : risk === "Medium" ? C.amber : C.red }}>{risk}</strong></span>
                  {r.confRisk > 0 && <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent }}>Size <strong>{r.confRisk}%</strong></span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {reasons.map(([ok, txt], i) => (
                    <span key={i} style={{ fontFamily: SANS, fontSize: 10, color: ok ? C.textSec : C.textDim }}>{ok ? "✓" : "✗"} {txt}</span>
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
            const bullish = isBullishCandidate;
            const kind = bullish ? "CALL" : "PUT";
            const col = bullish ? C.green : C.red;
            const atm = r.px >= 200 ? Math.round(r.px / 5) * 5 : r.px >= 50 ? Math.round(r.px) : Math.round(r.px * 2) / 2;
            const premium = +(r.px * 0.04).toFixed(2);
            const be = bullish ? +(atm + premium).toFixed(2) : +(atm - premium).toFixed(2);
            const t2 = Number(r.t2) || r.px * 1.1;
            const optGain = Math.round(((t2 - r.px) / r.px) * 5 * 100); // ~5x leverage if target hits
            return (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, alignItems: "center", fontFamily: MONO, fontSize: 10.5, ...num }}>
                <span style={badge(col)}>
                  {kind} ${atm} · ~${premium} · BE ${be}{optGain > 0 ? ` · ≈+${optGain}% if T2` : ""}
                </span>
                <span style={{ color: C.green }}>Target ${r.t2} (+10%)</span>
                <span style={{ color: C.red }}>Stop ${r.stop} (ATR)</span>
                <span style={{ color: r.rrPass ? C.green : C.amber, fontWeight: 700 }}>R:R {r.rr}:1{r.rrPass ? " ✓" : " (thin)"}</span>
              </div>
            );
          })()}
          {/* Invalidation — the real trend-breaking condition(s), distinct
              from the ATR stop above. r.invalidation === null means no real
              trend data was fetched for this symbol yet (honest "—", not a
              fabricated "trend intact"); an empty array is real information
              (trend data loaded, genuinely zero invalidation signals firing). */}
          {r.invalidation !== null && (
            <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 10.5, color: r.invalidation.length ? C.amber : C.textDim }}>
              <span style={{ fontWeight: 700 }}>Invalidation:</span> {r.invalidation.length ? r.invalidation.join(" · ") : "None — trend intact"}
            </div>
          )}
        </div>

        {/* Trade levels */}
        {isBullishCandidate && (
          <div style={{ textAlign: "right", borderLeft: `1px solid ${C.border}`, paddingLeft: 12, minWidth: 170, ...num }}>
            {/* Best entry — highlighted */}
            <div style={{ ...neutralCard, borderLeft: `2px solid ${C.accent}`, padding: "4px 8px", marginBottom: 6 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Best Entry</div>
              <div style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 800, color: C.accent }}>${r.bestEntry}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: r.entryNote.includes("✅") ? C.green : C.amber }}>{r.entryNote}</div>
            </div>
            {[["Stop", r.stop, C.red], ["T1 +5%", r.t1, C.green], ["T2 +10%", r.t2, C.green]].map(([l,v,col]) => (
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
          {/* Manual "push this setup to Telegram" (explicit user request,
              2026-08-03, annotated screenshot: "add button to push buy to
              telegram") — distinct from the automatic watchlist-greenlight-
              alerts.js entry-reached alert built earlier the same day: that
              one fires unattended on a real false→true entryNote crossing,
              this one lets the user send THIS row's real current read to
              their own phone on demand, whenever they want, regardless of
              whether it's crossed yet. Reuses /api/notify — the same
              generic real Telegram-send endpoint the rest of the platform
              UI already uses (src/router.js), zero new backend. */}
          <button onClick={(e) => {
              const btn = e.currentTarget;
              const defaultTitle = `Send ${r.symbol}'s real current Green Light setup to your Telegram right now`;
              const lines = [
                `📤 ${r.symbol} — $${r.px.toFixed(2)} (${r.chg >= 0 ? "+" : ""}${r.chg.toFixed(2)}%)`,
                `Signal: ${r.signal} · Grade ${r.grade} (${r.aScore}/100)${r.altSetup ? ` · Alt Setup: ${r.altSetup.type}` : ""}`,
                `Best entry $${r.bestEntry} — ${r.entryNote}`,
                `Stop $${r.stop} · T1 $${r.t1} · T2 $${r.t2}`,
              ];
              btn.textContent = "…sending";
              // Short reason shown right in the button label, not just the
              // hover title (2026-08-03, real user report: "when you click
              // on telegram it failes" — root cause was a real 401 from
              // this route's API-token auth gate, src/router.js, but the
              // old generic "✗ failed" gave no way to see why without
              // hovering — easy to miss on a page that re-renders this
              // often, e.g. from live price polling).
              const shortReason = (err) => {
                if (!err) return "✗ failed";
                if (/unauthorized/i.test(err)) return "✗ no API token";
                if (/rate limited/i.test(err)) return "✗ rate limited";
                if (/daily/i.test(err)) return "✗ daily cap hit";
                if (/not configured/i.test(err)) return "✗ Telegram not set up";
                if (/rejected/i.test(err)) return "✗ Telegram rejected it";
                return "✗ failed";
              };
              fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) })
                .then(res => res.json())
                .then(d => {
                  btn.textContent = d?.ok ? "✓ sent" : shortReason(d?.error);
                  btn.title = d?.ok ? defaultTitle : (d?.error || "Send failed — see server logs.");
                })
                .catch(() => { btn.textContent = "✗ network error"; btn.title = "Network error reaching the server."; })
                .finally(() => { setTimeout(() => { btn.textContent = "✈ TELEGRAM"; btn.title = defaultTitle; }, 5000); });
            }}
            title={`Send ${r.symbol}'s real current Green Light setup to your Telegram right now`}
            style={{ background: `${C.accent}18`, border: `1px solid ${C.accent}55`, color: C.accent,
              borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 800,
              padding: "6px 12px", cursor: "pointer" }}>
            ✈ TELEGRAM
          </button>
          {/* Hand off this card's own real entry/stop/target to Trade
              Planner instead of just the symbol (2026-07-28, same fix as
              Sniper Scanner/Best Opportunities — "do the same for best
              opportunities and green light") — so opening the plan for a
              Green Light pick shows the same real levels already on this
              card instead of a different ATR recalculation. Green Light's
              A+ score/checks are a distinct real scoring system on purpose
              (this app's standing "keep parallel scoring systems separate"
              rule) so it isn't force-fit into Trade Setup Score's shape —
              Trade Planner just won't show that badge for these. */}
          {isBullishCandidate && Number.isFinite(Number(r.bestEntry)) && Number.isFinite(Number(r.stop)) && Number(r.bestEntry) > Number(r.stop) && (
            <button onClick={() => {
                try {
                  localStorage.setItem("tradeplanner_load_plan", JSON.stringify({
                    symbol: r.symbol, entry: Number(r.bestEntry), stop: Number(r.stop),
                    target: Number.isFinite(Number(r.t2)) ? Number(r.t2) : null,
                    aplus: null, next: null, source: "Green Light",
                  }));
                } catch {}
                setActiveTab && setActiveTab("tradeplanner");
              }}
              title={`Plan this trade — opens Trade Planner with ${r.symbol}'s real Green Light entry/stop/target already filled in`}
              style={{ background: `${C.accent}14`, border: `1px solid ${C.accent}`, color: C.accent,
                borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 800,
                padding: "6px 12px", cursor: "pointer" }}>
              🎯 PLAN
            </button>
          )}
          {/* One-click options buy — LONG ONLY (buys a CALL, never sells/writes
              options, never a PUT here). Re-enabled 2026-08-04 per explicit
              user request ("add options long only to Green Light") — this
              was paused 2026-06-11 as part of a broader options+short pause
              that no longer applies: the equity long-only guardrail
              (src/routes/alpaca.js) already blocks shorts, and real bearish
              setups now have their own separately-vetted system
              (BearishSetups.jsx, real trade-signals scan) rather than being
              inferred from a Green Light "RED = fails bullish checklist"
              row — RED here means "not enough evidence to go long," not "a
              confirmed short/put setup," so this button stays call-only and
              GREEN-only, matching the tab's own "trade only what clears
              GREEN" framing. */}
          {r.signal === "GREEN" && (() => {
            const col = "#16a34a";
            const useAlpaca = (localStorage.getItem("axiom_autopilot_broker") || "sim") === "alpaca";
            const lbl = `📈 BUY CALL${useAlpaca ? " 🦙" : " (sim)"}`;
            return (
              <button onClick={(e) => {
                  const btn = e.currentTarget;
                  if (useAlpaca) {
                    btn.textContent = "⏳ ordering…";
                    alpacaOption(r.symbol, "call", 1, r.px).then(res => {
                      if (res?.ok) { btn.textContent = `✓ CALL @ $${res.order.strike}`; btn.style.background = col; btn.style.color = "#fff";
                        logTradeNote && logTradeNote("buy", `📈 ALPACA CALL — ${r.symbol}\n1 contract · strike $${res.order.strike} · exp ${res.order.expiry}`); }
                      else { btn.textContent = "✗ " + (res?.error ? "see note" : "failed"); btn.style.background = C.red; btn.style.color = "#fff";
                        logTradeNote && logTradeNote("exit", `⚠️ ALPACA option rejected — ${r.symbol}\n${res?.error || "unknown"} (enable options on your Alpaca paper account)`); }
                      setTimeout(() => { btn.textContent = lbl; btn.style.background = `${col}18`; btn.style.color = col; }, 2600);
                    });
                  } else {
                    const res = addPaperOption(r.symbol, r.px, "CALL", { glScore: r.passed });
                    btn.textContent = res === "DUP" ? "already open" : "✓ CALL BOUGHT!";
                    btn.style.background = col; btn.style.color = "#fff";
                    setTimeout(() => { btn.textContent = lbl; btn.style.background = `${col}18`; btn.style.color = col; }, 1800);
                  }
                }}
                title={useAlpaca ? "Buy a real CALL on your Alpaca PAPER account (near-dated ATM, 1 contract). Requires options enabled on the account." : "Buy a SIMULATED CALL (~5x leverage, modeled). For learning — higher risk. Long only — never sells or writes options."}
                style={{ background: `${col}18`, border: `1px solid ${col}55`, color: col,
                  borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 12px", cursor: "pointer" }}>
                {lbl}
              </button>
            );
          })()}
          <button onClick={() => {
              const opening = glExpanded !== r.symbol;
              setGlExpanded(opening ? r.symbol : null);
              // Real "re-architect Green Light" wiring: expanding a setup also
              // loads it into the Quick Trade panel's selected ticker, so the
              // signal you just reviewed here is one click from real execution
              // instead of Green Light's old localStorage-only fake "buy".
              if (opening && setTerminalSymbol) setTerminalSymbol(r.symbol);
            }}
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
        // r.q's priceAvg50/priceAvg200 are dead for Alpaca-covered symbols
        // (same root cause fixed elsewhere this session) — t.ma50/t.ma200
        // above are real, independently computed from actual 1y chart
        // closes, so reuse them here instead of a second fetch.
        const momScores = (() => { try { return computeScores(t ? { ...(r.q || {}), priceAvg50: t.ma50, priceAvg200: t.ma200 } : (r.q || {})); } catch { return null; } })();
        const mom = momScores?.composite ?? null;
        // Real reasons tooltip (2026-07-29 fix) — this Momentum row used to
        // show a bare 0-100 number with no explanation, same gap as
        // QuotesTab's "S:XX" badge for the identical computeScores() call.
        const momTitle = mom != null ? `Quick Score ${mom}/100 — ${(momScores.reasons || []).join(" · ") || "neutral, not enough real data yet"}` : undefined;
        const rsiV = t?.rsi != null ? t.rsi : (r.rsi || null);
        const ld = glDeepLoad ? "…" : "—";
        const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 };
        const hdr = (icon, label, col) => <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: col || C.textDim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>;
        const Row = ({ l, v, col, title }) => (
          <div title={title} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: `1px solid ${C.border}22`, cursor: title ? "help" : "default" }}>
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
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", ...neutralCard, borderLeft: `3px solid ${C.accent}`, padding: "10px 14px", marginBottom: 12, ...num }}>
              <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Entry</div><div style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 800, color: C.accent }}>${r.bestEntry}</div></div>
              <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Stop</div><div style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 800, color: C.red }}>${r.stop}</div></div>
              <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>T1</div><div style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 800, color: C.green }}>${r.t1}</div></div>
              <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>T2</div><div style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 800, color: C.green }}>${r.t2}</div></div>
              <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(r.symbol)}`} target="_blank" rel="noopener"
                style={{ marginLeft: "auto", background: C.accent, color: "#fff", borderRadius: 6, fontFamily: MONO, fontSize: 11.5, fontWeight: 700, padding: "7px 14px", textDecoration: "none" }}>
                Open Chart
              </a>
            </div>

            {/* 5-check recap */}
            <div style={{ ...card, marginBottom: 12 }}>
              {hdr(null, `Checks · ${r.passed}/5`, r.passed >= 5 ? C.green : C.amber)}
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
                <Row l="Momentum" v={mom != null ? `${mom}/100` : "—"} col={mom == null ? C.textDim : mom >= 60 ? C.green : mom <= 40 ? C.red : C.amber} title={momTitle} />
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
                {hdr("🏢", "KEY STATS", C.accent)}
                {stats.map(([l, v]) => <Row key={l} l={l} v={v} />)}
              </div>

              {/* News */}
              {(d?.news?.length > 0 || glDeepLoad) && (
                <div style={card}>
                  {hdr("📰", "RECENT NEWS", C.accent || "#06b6d4")}
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
                const bullish = isBullishCandidate;          // GREEN, or a real bullish Alt Setup → call; otherwise put
                const kind = bullish ? "CALL" : "PUT";
                const col = bullish ? C.green : C.red;
                const px = r.px;
                const atm = px >= 200 ? Math.round(px / 5) * 5 : px >= 50 ? Math.round(px) : Math.round(px * 2) / 2;
                const premium = +(px * 0.04).toFixed(2);     // ~ATM near-dated premium
                const contractCost = Math.round(premium * 100);
                const breakeven = bullish ? +(atm + premium).toFixed(2) : +(atm - premium).toFixed(2);
                return (
                  <div style={{ ...card, gridColumn: "1 / -1", borderLeft: `3px solid ${col}` }}>
                    {hdr(null, `${kind} — learn + trade this setup`, col)}
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
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontFamily: SANS, fontSize: 12.5, color: C.textSec, lineHeight: 1.7 }}>
                      <b style={{ color: C.text }}>What this means:</b> A {kind} on {r.symbol} gives you the right to {bullish ? "BUY" : "SELL"} 100 shares at <b>${atm}</b>. You'd pay about <b>${premium.toFixed(2)}/share = ${contractCost}</b> for one contract.
                      <br/>• You profit if {r.symbol} {bullish ? "rises above" : "falls below"} <b>${breakeven}</b> (your breakeven) before expiration.
                      <br/>• <b>Max loss = ${contractCost}</b> (the whole premium) — it can go to zero.
                      <br/>• It loses value <b>every day</b> from time decay, even if the stock is flat — so this is a bet the move happens <b>soon</b>.
                      <br/>• {contractCost > Number(localStorage.getItem("axiom_acct_size") || 5000) * 0.1 ? "This is a big bite of a small account — size down." : "Risk only what you can lose; 1 contract is already leveraged."}
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
  };

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>Green Light</div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textDim, marginTop: 2 }}>
            {glMode === "swing" ? "5-check trading system — trade only what clears GREEN" : "Day Trade Mode — fast in, fast out, flat by the close"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {[["swing", "Swing"], ["daytrade", "⚡ Day Trade"]].map(([id, lbl]) => (
              <button key={id} onClick={() => setMode(id)}
                style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, padding: "8px 14px", cursor: "pointer", border: "none",
                  background: glMode === id ? C.accent : "transparent", color: glMode === id ? "#fff" : C.textDim }}>
                {lbl}
              </button>
            ))}
          </div>
          {[[glMode === "swing" ? readyToTrade.length : dtGreen.length, "Ready", C.green], [glMode === "swing" ? yellow.length : dtYellow.length, "Watch", C.amber], [glMode === "swing" ? red.length : dtRed.length, "Skip", C.red]].map(([n,l,col]) => (
            <div key={l} style={{ ...accentCard(col), padding: "7px 16px", textAlign: "center", minWidth: 66 }}>
              <div style={{ ...num, fontFamily: MONO, fontSize: 19, fontWeight: 800, color: col, lineHeight: 1.1 }}>{n}</div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginTop: 1 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Auto-pilot + paper trades now live in their own 📋 MY TRADES tab */}
      <AutopilotStatusCard C={C} MONO={MONO} SANS={SANS} />

      {glMode === "daytrade" ? (
        <>
          {/* ── Session banner — day-trade signals only mean something during
              regular hours, so this is honest about when they apply, plus a
              live countdown to the guaranteed EOD flatten. ── */}
          <div style={{ padding: "11px 16px", marginBottom: 16, ...accentCard(marketSession === "REGULAR" ? C.green : C.textDim),
            display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: marketSession === "REGULAR" ? C.green : C.textDim }}>
                {marketSession}{marketSession !== "REGULAR" && " — signals need regular hours (9:30am–4:00pm ET) to mean anything"}
              </div>
              {marketSession === "REGULAR" && flattenCountdown && (
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.amber, marginTop: 2, fontWeight: 700 }}>⏱ {flattenCountdown} — every open day trade auto-closes at 3:55 PM ET, win or lose</div>
              )}
            </div>
          </div>

          {/* ── Day trade rules — same "always visible reminder" pattern as
              swing's MY RULES, tuned for fast in/out. ── */}
          <div style={{ ...accentCard(C.amber), padding: "14px 18px", marginBottom: 16 }}>
            <div style={{ ...sectionLabel, color: C.text, marginBottom: 10 }}>Day Trade Rules — follow these or don't trade</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              {[
                ["Entry", C.green, ["Only trade GREEN (4-5/5) signals", "Enter at the OR breakout, not before", "No trades before 9:45am (let the range set)"]],
                ["Risk", C.accent, ["Stop = below VWAP — always set", "Target = 1.5R, take it, don't get greedy", "Size smaller than swing — more trades/day"]],
                ["Exit", C.red, ["Every position flattens by 3:55pm ET — automatic", "2 losses = stop for the day", "No revenge trades"]],
              ].map(([h, col, items]) => (
                <div key={h}>
                  <div style={{ ...sectionLabel, color: col, marginBottom: 6 }}>{h}</div>
                  {items.map(t => <div key={t} style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, padding: "3px 0", display: "flex", gap: 6 }}><span style={{ color: col }}>·</span>{t}</div>)}
                </div>
              ))}
            </div>
          </div>

          {dtState === "idle" && <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, padding: "30px 0", textAlign: "center" }}>Scanning your watchlist's intraday signals…</div>}
          {dtState === "err" && <div style={{ fontFamily: MONO, fontSize: 13, color: C.red, padding: "20px 0", textAlign: "center" }}>⚠ Scan failed — try again.</div>}
          {dtState === "none" && <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, padding: "20px 0", textAlign: "center" }}>No intraday data (market likely closed). Come back during regular hours.</div>}

          {dtGreen.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...sectionLabel, color: C.green, marginBottom: 10 }}>Ready to Trade ({dtGreen.length})</div>
              {dtGreen.map(r => <DayTradeRow key={r.symbol} r={r} C={C} MONO={MONO} SANS={SANS} num={num} badge={badge} neutralCard={neutralCard} accentCard={accentCard} sectionLabel={sectionLabel} sigCol={sigCol} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />)}
            </div>
          )}
          {dtYellow.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...sectionLabel, color: C.amber, marginBottom: 10 }}>Watch ({dtYellow.length})</div>
              {dtYellow.map(r => <DayTradeRow key={r.symbol} r={r} C={C} MONO={MONO} SANS={SANS} num={num} badge={badge} neutralCard={neutralCard} accentCard={accentCard} sectionLabel={sectionLabel} sigCol={sigCol} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />)}
            </div>
          )}
          {dtRed.length > 0 && (
            <div style={{ padding: "10px 14px", ...neutralCard }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, ...num }}>
                <span style={{ color: C.red, fontWeight: 700 }}>Skip today</span> ({dtRed.length}): {dtRed.map(r => r.symbol).join(" · ")}
              </div>
            </div>
          )}
          {dtResults.length === 0 && dtState === "ok" && (
            <div style={{ textAlign: "center", padding: "48px 0", fontFamily: MONO, fontSize: 14, color: C.textDim }}>No watchlist symbols returned intraday data.</div>
          )}
        </>
      ) : (
      <>
      {/* Market regime score (0-100 across SPY/QQQ/VIX/breadth/trend) */}
      <div style={{ padding: "11px 16px", marginBottom: 16, ...accentCard(regime.color),
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: regime.color }}>
            Market {regime.label} <span style={{ fontWeight: 500, color: C.textSec }}>— {regime.label === "GREEN" ? "trade freely" : regime.label === "YELLOW" ? "trade smaller, be selective" : regime.label === "ORANGE" ? "high-conviction only, small size" : "sit out, weak tape"}</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 2, ...num }}>
            Regime <strong style={{ color: regime.color, fontWeight: 700 }}>{regime.score}/100</strong> · SPY {spyChg >= 0 ? "+" : ""}{spyChg.toFixed(2)}%{regime.vixVal ? ` · VIX ${regime.vixVal.toFixed(1)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
          {regime.factors.map(f => (
            <span key={f.label} style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 5,
              color: f.pass ? regime.color : C.textDim, background: f.pass ? `${regime.color}12` : "transparent", border: `1px solid ${f.pass ? regime.color + "40" : C.border}` }}>
              {f.pass ? "✓" : "○"} {f.label}
            </span>
          ))}
        </div>
      </div>

      {/* 5-check grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 12 }}>
        {["Market safe","Above 50D MA","RSI 35–65","Volume active","Near EMA21"].map((r,i) => (
          <div key={r} style={{ ...neutralCard, padding: "9px 10px", textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textDim }}>{i+1}</div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.text, marginTop: 2 }}>{r}</div>
          </div>
        ))}
      </div>

      {/* ── MY TRADING RULES — always visible reminder ── */}
      <div style={{ ...accentCard(C.amber), padding: "14px 18px", marginBottom: 16 }}>
        <div style={{ ...sectionLabel, color: C.text, marginBottom: 12 }}>
          My Rules — follow these or don't trade
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {/* Entry */}
          <div>
            <div style={{ ...sectionLabel, color: C.green, marginBottom: 6 }}>Before Buying</div>
            {[
              "Buy GREEN (4-5/5), or a real Alt Setup",
              "No Alt Setup? Skip yellow. Skip red.",
              "No trading on red market days",
              "Never chase — no FOMO",
            ].map(r => (
              <div key={r} style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, padding: "3px 0", display: "flex", gap: 6 }}>
                <span style={{ color: C.green }}>·</span>{r}
              </div>
            ))}
          </div>
          {/* Size */}
          <div>
            <div style={{ ...sectionLabel, color: C.accent, marginBottom: 6 }}>Size</div>
            {[
              "Risk only 1% per trade",
              "Use suggested shares",
              "Never go all-in",
              "Never 'bet big this once'",
            ].map(r => (
              <div key={r} style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, padding: "3px 0", display: "flex", gap: 6 }}>
                <span style={{ color: C.accent }}>·</span>{r}
              </div>
            ))}
          </div>
          {/* Exit */}
          <div>
            <div style={{ ...sectionLabel, color: C.red, marginBottom: 6 }}>Exit</div>
            {[
              "Stop −3% — ALWAYS set it",
              "T1 +5% → sell HALF",
              "T2 +10% → sell the rest",
              "2 losses = STOP for the day",
              "WEAKEST-tagged position? Rotate it for a stronger setup.",
            ].map(r => (
              <div key={r} style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, padding: "3px 0", display: "flex", gap: 6 }}>
                <span style={{ color: C.red }}>·</span>{r}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`,
          fontFamily: SANS, fontSize: 12, color: C.textSec, fontWeight: 600, textAlign: "center" }}>
          Small losses + letting winners run = you get rich. You profit even being wrong 45% of the time — IF you follow the exits.
        </div>
      </div>

      {/* GREEN + real Alt Setup results */}
      {readyToTrade.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...sectionLabel, color: C.green, marginBottom: 10 }}>
            Ready to Trade ({readyToTrade.length})
          </div>
          {readyToTrade.map(r => <Row key={r.symbol} r={r} />)}
        </div>
      )}

      {/* ── AI SCAN — batched Claude triage of today's setups ── */}
      <div style={{ marginBottom: 16, padding: "12px 14px", ...neutralCard }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={sectionLabel}>AI Scan</span>
          <button onClick={runAiScan} disabled={aiScan === "loading"}
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 13px", borderRadius: 6, cursor: "pointer", border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent }}>
            {aiScan === "loading" ? "analyzing…" : "Analyze setups"}
          </button>
          <button onClick={() => { const v = !aiScanAuto; setAiScanAuto(v); localStorage.setItem("gl_aiscan_auto", v ? "on" : "off"); }}
            title="Auto-run the AI scan every ~30 min (cheap — one batched call)"
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
              border: `1px solid ${aiScanAuto ? C.green : C.border}`, background: aiScanAuto ? `${C.green}14` : "transparent", color: aiScanAuto ? C.green : C.textDim }}>
            {aiScanAuto ? "Auto: on" : "Auto: off"}
          </button>
          <button onClick={() => {
            setAiScan("loading");
            const top = results.filter(r => r.aScore >= 80).sort((a, b) => b.aScore - a.aScore).slice(0, 10).map(r => ({ symbol: r.symbol, aScore: r.aScore, sector: r.sector, atEntry: r.atEntry }));
            fetch("/api/market/ai-gameplan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regime: regime.score, setups: top }) })
              .then(res => res.json()).then(d => setAiScan(d && d.ok ? `MORNING GAME PLAN\n\n${d.plan}` : { error: (d && d.error) || "no response" })).catch(e => setAiScan({ error: e.message }));
          }} title="Generate today's morning game plan and show it here"
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: "6px 11px", borderRadius: 6, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textSec }}>Game plan</button>
          <button onClick={() => {
            setAiScan("loading");
            const etd = d => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(d));
            fetch("/api/alpaca/closed-trades").then(r => r.json()).then(ct => {
              const today = etd(new Date());
              const todayT = (ct && ct.ok ? ct.trades || [] : []).filter(t => etd(t.closedAt) === today);
              if (!todayT.length) { setAiScan("AI TRADE COACH\n\nNo closed trades today — nothing to review. Sitting out is a valid result."); return; }
              fetch("/api/market/ai-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trades: todayT.map(t => ({ symbol: t.symbol, side: t.side, entry: t.entry, exit: t.exit, pnl: t.pnl })) }) })
                .then(res => res.json()).then(d => setAiScan(d && d.ok ? `AI TRADE COACH\n\n${d.coach}` : { error: (d && d.error) || "no response" }));
            }).catch(e => setAiScan({ error: e.message }));
          }} title="Review today's closed trades and show the coaching here"
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: "6px 11px", borderRadius: 6, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textSec }}>Coach</button>
          <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginLeft: "auto" }}>one batched call · ranks your A+ names + market read</span>
        </div>
        {aiTrig && <div style={{ fontFamily: SANS, fontSize: 11, color: C.accent, marginTop: 8 }}>{aiTrig}</div>}
        {aiScan && aiScan.error && <div style={{ fontFamily: SANS, fontSize: 11, color: C.amber, marginTop: 8 }}>AI scan unavailable — {aiScan.error}</div>}
        {typeof aiScan === "string" && aiScan !== "loading" && (
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.6, whiteSpace: "pre-line", marginTop: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>{aiScan}</div>
        )}
      </div>

      {/* ── Sector strength (Step 2: trade leaders in strong sectors) ── */}
      {sectorsRanked.length > 0 && (
        <div style={{ marginBottom: 16, padding: "10px 14px", ...neutralCard }}>
          <div style={{ ...sectionLabel, marginBottom: 8 }}>Sector Strength Today <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— favor leaders in the green half</span></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sectorsRanked.map((s, i) => {
              const strong = i < Math.ceil(sectorsRanked.length / 2);
              const col = s.chg >= 0 ? C.green : C.red;
              return (
                <span key={s.sym} title={s.name} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5, ...num,
                  color: col, background: strong ? `${col}14` : "transparent", border: `1px solid ${col}${strong ? "40" : "22"}`, opacity: strong ? 1 : 0.55 }}>
                  {s.sym} {s.chg >= 0 ? "+" : ""}{s.chg.toFixed(2)}%
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── BOTTOM SPOTTER — capitulation reversal candidates + AI knife-check ── */}
      {bottoms.length > 0 && (
        <div style={{ marginBottom: 16, padding: "12px 14px", ...accentCard("#0891b2") }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={sectionLabel}>Bottom Spotter ({bottoms.filter(b => b.bottomReady).length} ready)</span>
            <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>Ready = washout bouncing &amp; reclaiming · Wait = still falling</span>
            <button onClick={() => {
              setAiBottom("loading");
              const spyQ2 = (macroData || []).find(m => m.symbol === "SPY");
              const vix = (macroData || []).find(m => (m.symbol || "").toUpperCase().includes("VIX"));
              fetch("/api/market/ai-bottom", { method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ market: { regime: regime.score, vix: Number(vix?.price || 0) || null, spyChg: Number(spyQ2?.changesPercentage || 0) },
                  candidates: bottoms.map(r => ({ symbol: r.symbol, bottomScore: r.bottomScore, offHigh: r.offHigh, rvol: Number(r.rvol || 0).toFixed(1), chg: r.chg.toFixed(1) })) }) })
                .then(res => res.json()).then(d => setAiBottom(d && d.ok ? d.analysis : { error: (d && d.error) || "no response" })).catch(e => setAiBottom({ error: e.message }));
            }} disabled={aiBottom === "loading"}
              style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 6, cursor: "pointer", border: "1px solid #0891b2", background: "#0891b214", color: "#0891b2" }}>
              {aiBottom === "loading" ? "checking news…" : "Is this a bottom?"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 6 }}>
            {bottoms.map(r => (
              <div key={r.symbol} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderRadius: 6, ...num,
                background: C.surface, border: `1px solid ${r.bottomReady ? C.green + "40" : C.border}` }}>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: "#0891b2", minWidth: 28 }}>{r.bottomScore}</span>
                <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: C.accent }}>{r.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.red }}>{r.offHigh != null ? `${r.offHigh}%` : "—"}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: r.chg >= 0 ? C.green : C.red }}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(1)}%</span>
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 8.5, fontWeight: 700, padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap",
                  color: r.bottomReady ? C.green : C.amber, background: r.bottomReady ? `${C.green}14` : `${C.amber}14`, border: `1px solid ${r.bottomReady ? C.green : C.amber}40` }}>
                  {r.bottomReady ? "READY" : "WAIT"}
                </span>
              </div>
            ))}
          </div>
          {aiBottom && aiBottom.error && <div style={{ fontFamily: SANS, fontSize: 11, color: C.amber, marginTop: 8 }}>AI check unavailable — {aiBottom.error}</div>}
          {typeof aiBottom === "string" && aiBottom !== "loading" && (
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.6, whiteSpace: "pre-line", marginTop: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>{aiBottom}</div>
          )}
        </div>
      )}

      {/* ── MODE: Bull / Bear / Cash ── */}
      {mode === "CASH" ? (
        <div style={{ marginBottom: 16, padding: "16px 20px", borderRadius: 8, textAlign: "center",
          background: C.card, border: `1px dashed ${C.border}` }}>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.textSec, letterSpacing: "0.05em" }}>Cash Mode</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginTop: 6, lineHeight: 1.6 }}>
            No setups meet criteria. <strong style={{ color: C.text }}>Protect capital. Wait.</strong><br/>
            The best traders sit in cash more than they trade. No A+ setup = no trade.
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 16, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", ...accentCard(modeColor) }}>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: modeColor }}>
            {mode === "BULL" ? "Bull Mode" : "Bear Mode"}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec, ...num }}>
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
                {/* A+ Score — separate real 9-dimension composite (market-helpers.js),
                    deliberately NOT merged into this column's own score above
                    (aScore/bearScore/passed*20) — same additive-not-replacing
                    pattern already used on Watchlist/RhPro. */}
                {r.aplus && <span title={r.aplus.reasons.join(" · ")} style={{ fontFamily: MONO, fontSize: 9, fontWeight: 900, color: "#fff", cursor: "help",
                  background: r.aplus.score >= 80 ? "#0d9465" : r.aplus.score >= 60 ? "#d6a312" : "#c8282a", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" }}>A+{r.aplus.score}</span>}
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
          <div style={{ ...accentCard(accent), padding: "10px 11px" }}>
            <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: accent }}>{head} ({count})</div>
            <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim, margin: "3px 0 9px", lineHeight: 1.4 }}>{sub}</div>
            {body}
          </div>
        );
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12, marginBottom: 20, alignItems: "start" }}>
            {colWrap(C.green, "Calls", calls.filter(c => c.qualifiesAPlus).length, "Score ≥85 · market green · at buy zone (85–89 = half size).",
              calls.length === 0 ? <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>nothing set up</div>
                : calls.map(r => { const ok = r.qualifiesAPlus; return card(r, { score: r.aScore, sc: r.aScore >= 90 ? C.green : r.aScore >= 85 ? "#5ab552" : C.textDim, ok, checks: r.checks, rr: r.rr, tint: C.green, badge: tag(ok ? `buy ${r.confRisk}%` : r.atEntry ? "watch" : "wait entry", C.green, ok), lvls: `$${r.bestEntry} · $${r.stop}` }); }))}
            {colWrap(C.red, "Puts", puts.filter(p => p.bearTradeable).length, "Bear Score >80 · R:R ≥2. Trade small, sit in cash if none.",
              puts.length === 0 ? <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>nothing breaking down</div>
                : puts.map(r => { const ok = r.bearTradeable; return card(r, { score: r.bearScore, sc: r.bearScore >= 80 ? C.red : "#d6a312", ok, checks: r.bearChecks, rr: r.putRR, tint: C.red, badge: tag(ok ? "trade" : "watch", C.red, ok), lvls: `$${r.putStop} · $${r.putTarget}` }); }))}
            {colWrap(C.amber, "Watch", yellow.length, "Almost ready (3/5) — wait for the 4th–5th check.",
              yellow.length === 0 ? <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>nothing on watch</div>
                : yellow.slice(0, 12).map(r => card(r, { score: r.passed * 20, sc: C.amber, ok: false, checks: r.checks, rr: r.rr, tint: C.amber, badge: tag("watch", C.amber, false), lvls: `$${r.bestEntry} · $${r.stop}` })))}
          </div>
        );
      })()}

      {/* RED — collapsed */}
      {red.length > 0 && (
        <div style={{ padding: "10px 14px", ...neutralCard }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, ...num }}>
            <span style={{ color: C.red, fontWeight: 700 }}>Skip today</span> ({red.length}): {red.map(r => r.symbol).join(" · ")}
          </div>
        </div>
      )}

      {results.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", fontFamily: MONO, fontSize: 14, color: C.textDim }}>
          Add stocks to your watchlist to see Green Light scores
        </div>
      )}
      </>
      )}

      {/* Trade Journal — was embedded live here as a second real mount of
          RhProJournal; retired 2026-07-29 (institutional redesign) now that
          Journal has its own real sidebar destination — same "exactly one
          mount point" convention already used for every other consolidated
          tool this session. Redirect link instead of silently removing the
          affordance. */}
      {setActiveTab && (
        <div style={{ marginTop: 24, borderTop: `2px solid ${C.border}`, paddingTop: 16, textAlign: "center" }}>
          <button onClick={() => setActiveTab("rhpro-journal")} style={{
            fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent,
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "8px 16px", cursor: "pointer",
          }}>
            📓 Log this trade in Journal →
          </button>
        </div>
      )}
    </div>
  );
}

