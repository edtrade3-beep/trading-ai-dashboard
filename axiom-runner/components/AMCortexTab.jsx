import { useState, useRef, useEffect } from "react";
import { RH_UNIVERSE, rhScreenProgressive } from "./rhpro-shared.jsx";
import { computeRegime, computeAPlusScore, computeInstitutionalGrade, computeInstitutionScore, computeFundamentalsRead, classifyEntryType, SECTOR_ETFS, STOCK_TO_SECTOR } from "./market-helpers.js";
import { computeSniperDecision } from "./sniper-decision.js";
import { CORE_VERDICT_META } from "./am-core-engine.js";
import { FundamentalsPanel, OptionsFlowPanel, NewsPanel, InvestorsPanel } from "./terminal-panels.jsx";
import {
  parseCortexQuery, computeHeatRisk, computeCortexVerdict, computePriceToPay, summarizeBuyPrice, whyEvidence,
  computeTechnicalScore, computeTrimSignal, computePremiumRead, verdictWinProbFor, computeBottomSignal,
  rankAplusSetups, rankBreakouts, rankStrongNotExtended, rankBestRewardRisk, rankInstitutionalAccumulation,
  rankImprovingFundamentals, SCAN_LABELS,
} from "./cortex-engine.js";

// AM Cortex — "AI Trading Intelligence Engine" (explicit user request,
// 2026-08-11): "ASK → SCAN → EXPLAIN → SCORE → PLAN... Do NOT build a
// generic AI chatbot. AM Cortex is the intelligence layer above my
// existing trading engines... The AI must not invent market data or
// technical signals. Use deterministic calculations and real data
// wherever possible." Every score/verdict here comes from this app's real
// existing engines (Sniper Decision, A+ Score, Institutional Grade, the
// Future/Value scoring engine) via cortex-engine.js's pure functions —
// Cortex adds query parsing + a structured decision layout, not new data.
//
// PHASE 1 of a 21-section spec. Built: single-stock analysis (WHY/SETUP/
// LEVELS/RISK/VERDICT + Deep Scan), Heat Risk classification, A+ Score
// breakdown, Price-to-Pay framework, and scan-routing for undervalued/
// future/A+ setups/VCP breakout/institutional accumulation queries.
// Explicitly DEFERRED (not built yet): Portfolio Cortex, Market Cortex,
// Trade Builder, Stock Comparison table — each is its own standalone
// feature; flagged to the user rather than half-built here.

const EXAMPLES = [
  "Why is NVDA moving?",
  "Should I buy NVDA here?",
  "What price should I pay for NVDA?",
  "Find undervalued stocks",
  "Find future growth stocks",
  "Find A+ setups",
  "Find institutional accumulation",
  "Find stocks breaking out of VCP",
];

const DEEP_TABS = [
  ["technical", "Technical"], ["minervini", "VCP / Minervini"], ["fundamental", "Fundamental"],
  ["valuation", "Valuation"], ["institutional", "Institutional"], ["catalyst", "Catalyst"], ["risk", "Risk"],
];

function StatRow({ C, MONO, SANS, label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12 }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <span style={{ fontFamily: MONO, fontWeight: 800, color: color || C.text }}>{value ?? "DATA UNAVAILABLE"}</span>
    </div>
  );
}

function ScoreBar({ C, MONO, label, pts, max }) {
  const pct = max > 0 ? Math.round((pts / max) * 100) : 0;
  const color = pct >= 75 ? "#0d9465" : pct >= 45 ? "#d6a312" : "#c8282a";
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginBottom: 3 }}>
        <span>{label}</span><span style={{ color: C.text, fontWeight: 800 }}>{pts}/{max}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: C.border, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

export default function AMCortexTab({ C, MONO, SANS, macroData, sectorData, watchlistSymbols, setActiveTab, setTerminalSymbol }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showDeep, setShowDeep] = useState(false);
  const [deepTab, setDeepTab] = useState("technical");
  const [showWhy, setShowWhy] = useState(false);
  const [track, setTrack] = useState(null); // real global forward-return log, fetched once
  const knownSymbols = useRef(new Set([...RH_UNIVERSE, ...(watchlistSymbols || [])]));

  useEffect(() => {
    fetch("/api/market/aplus-track").then((r) => r.json()).then((j) => { if (j.ok) setTrack(j); }).catch(() => {});
  }, []);

  const regime = computeRegime(macroData);
  const sectorInfoFor = (symbol) => {
    const etf = STOCK_TO_SECTOR[symbol];
    if (!etf || !(sectorData || []).length) return null;
    const ranked = [...SECTOR_ETFS]
      .map((se) => ({ ...se, chg: (sectorData.find((s) => s.symbol === se.symbol)?.changesPercentage) ?? 0 }))
      .sort((a, b) => b.chg - a.chg);
    const rank = ranked.findIndex((se) => se.symbol === etf) + 1;
    const info = ranked.find((se) => se.symbol === etf);
    return rank > 0 ? { name: info?.name || etf, rank, of: ranked.length, chg: info?.chg } : null;
  };

  async function analyzeSymbol(symbol, openDeep) {
    setLoading(true); setError(null); setShowDeep(!!openDeep); setShowWhy(false);
    try {
      const [screenJ, fvJ, fundJ, analystJ, socialJ, darkPoolJ, optionsFlowJ, insiderJ, shortInterestJ] = await Promise.all([
        fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(symbol)}&withDecision=1`).then((r) => r.json()),
        fetch(`/api/scanner/future-value?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => null),
        // Raw fundamentals (real bull/bear reasons — computeFundamentalsRead
        // needs pe/pegRatio/revenueGrowth/earningsGrowth/profitMargin, not
        // the future-value engine's already-blended scores).
        fetch(`/api/market/fundamentals?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => null),
        // Real analyst strongBuy/buy/hold/sell/strongSell consensus counts.
        fetch(`/api/market/analyst?tickers=${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => null),
        // Real StockTwits bull/bear social sentiment.
        fetch(`/api/market/social?ticker=${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => null),
        // Real accumulation/distribution phase inputs (computeInstitutionScore
        // below) — same real dark pool/options-flow/insider/short-interest
        // routes MarketTerminalTab.jsx already uses for this exact score.
        fetch(`/api/market/darkpool?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/market/options-flow?symbols=${encodeURIComponent(symbol)}&limit=1`).then((r) => r.json()).catch(() => null),
        fetch(`/api/market/insider?ticker=${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/market/short-interest?tickers=${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => null),
      ]);
      const row = (screenJ.results || [])[0];
      if (!row || row.error) { setError(`No real market data available for ${symbol}.`); setResult(null); return; }
      const sniper = computeSniperDecision(row);
      const aplus = computeAPlusScore(row, regime);
      const grade = computeInstitutionalGrade(row, row.technicals, regime, sectorInfoFor(symbol), null);
      const heat = computeHeatRisk(row, sniper);
      const verdict = computeCortexVerdict({ sniper, heat, aplusScore: aplus.score });
      const priceToPay = computePriceToPay(row, sniper);
      const evidence = whyEvidence(sniper, aplus);
      const entryType = classifyEntryType(row, aplus.score);
      const futureValue = fvJ && fvJ.ok ? fvJ.row : null;
      const technicalScore = computeTechnicalScore(row, sniper);
      const trimSignal = computeTrimSignal(row, sniper, heat);
      const premiumRead = computePremiumRead(futureValue);
      const fundamentalsRead = fundJ && !fundJ.error ? computeFundamentalsRead(fundJ) : { bull: [], bear: [] };
      const analyst = analystJ?.ok ? (analystJ.results || [])[0] : null;
      const social = socialJ?.ok ? socialJ : null;
      const darkPool = darkPoolJ?.ok ? darkPoolJ : null;
      const optionsFlow = optionsFlowJ && !optionsFlowJ.error ? optionsFlowJ.summary || null : null;
      const insiderData = insiderJ?.ok ? insiderJ : null;
      const shortInterest = shortInterestJ?.ok ? (shortInterestJ.results || [])[0] || null : null;
      const institutionScore = (darkPool || optionsFlow || insiderData || shortInterest)
        ? computeInstitutionScore({ darkPool, optionsFlow, insiderData, shortInterest }) : null;
      setResult({
        type: "symbol", symbol, row, sniper, aplus, grade, heat, verdict, priceToPay, evidence, entryType, futureValue,
        technicalScore, trimSignal, premiumRead, fundamentalsRead, analyst, social, institutionScore,
      });
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  async function runScan(scanType, maxPrice) {
    setLoading(true); setError(null); setShowDeep(false); setResult(null);
    try {
      if (["undervalued", "future", "overlap", "improving_fundamentals"].includes(scanType)) {
        const j = await fetch("/api/scanner/future-value").then((r) => r.json());
        if (!j.ok) { setError((j.error || "Scan failed.") + " — this needs an FMP API key configured on the server."); return; }
        let rows;
        if (scanType === "undervalued") rows = j.undervalued;
        else if (scanType === "future") rows = j.future;
        else if (scanType === "overlap") rows = j.overlap;
        else rows = rankImprovingFundamentals([...j.future, ...j.undervalued, ...j.overlap]);
        if (maxPrice) rows = rows.filter((r) => Number(r.price) <= maxPrice);
        setResult({ type: "scan", scanType, kind: "future-value", rows });
        return;
      }
      let all = [];
      await new Promise((resolve) => {
        rhScreenProgressive(RH_UNIVERSE, (part) => { all = [...all, ...part]; }, () => resolve());
      });
      let ranked;
      if (scanType === "breakout") ranked = rankBreakouts(all, regime, { maxPrice });
      else if (scanType === "strong_not_extended") ranked = rankStrongNotExtended(all, regime, { maxPrice });
      else if (scanType === "institutional") ranked = rankInstitutionalAccumulation(all, { maxPrice });
      else if (scanType === "best_rr") ranked = rankBestRewardRisk(all, regime, { maxPrice });
      else ranked = rankAplusSetups(all, regime, { maxPrice });
      setResult({ type: "scan", scanType, kind: "technical", rows: ranked });
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  const submit = (openDeep) => {
    const parsed = parseCortexQuery(query, knownSymbols.current);
    if (parsed.intent === "empty") { setError("Type a question or a symbol first."); return; }
    if (parsed.intent === "symbol" || parsed.intent === "price_to_pay") { analyzeSymbol(parsed.symbol, openDeep); return; }
    if (parsed.intent === "scan") { runScan(parsed.scanType, parsed.maxPrice); return; }
    if (parsed.intent === "compare") { setError("Stock comparison is coming in a later Cortex phase — try one symbol at a time for now."); return; }
    setError('Couldn\'t understand that — try a symbol ("Why is NVDA moving?") or a scan ("Find undervalued stocks").');
  };

  const analyzeFromList = (symbol) => { setQuery(symbol); analyzeSymbol(symbol, false); };
  const openChart = (symbol) => { try { localStorage.setItem("mterminal_load_sym", symbol); } catch {} setTerminalSymbol && setTerminalSymbol(symbol); setActiveTab && setActiveTab("mterminal"); };

  // External "open this symbol" trigger (2026-08-12, consolidation —
  // "make Cortex the one decision layer, fold the rest into its Deep Scan
  // as evidence"). Same real localStorage handoff convention this app
  // already uses everywhere else (mterminal_load_sym, the old
  // rhpro_sniper_open_symbol) — Scanner/Watchlists' ⚡ buttons and the
  // Telegram Sniper deep-link now land here instead of the retired
  // SniperDecisionModal/RhFutureValueTab's own verdict screen. Read +
  // cleared once on mount so a later manual visit doesn't re-open a
  // stale symbol.
  useEffect(() => {
    let sym = null;
    try {
      sym = localStorage.getItem("cortex_open_symbol");
      if (sym) localStorage.removeItem("cortex_open_symbol");
    } catch {}
    if (sym) { setQuery(sym); analyzeSymbol(sym, false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: "8px 4px" }}>
      {/* ASK box */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 10 }}>🧠 AM CORTEX</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(false); }}
            placeholder="Ask about a stock, market, setup, or opportunity..."
            style={{ flex: "1 1 320px", fontFamily: SANS, fontSize: 13, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text }}
          />
          <button onClick={() => submit(false)} disabled={loading} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "10px 18px", borderRadius: 8, border: "none", color: "#fff", background: loading ? C.textDim : C.accent, cursor: "pointer" }}>
            {loading ? "⏳…" : "ANALYZE"}
          </button>
          <button onClick={() => submit(true)} disabled={loading} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "10px 18px", borderRadius: 8, border: `1px solid #d6a312`, color: "#d6a312", background: "#d6a31214", cursor: "pointer" }}>
            🔬 DEEP SCAN
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => { setQuery(ex); }} style={{ fontFamily: SANS, fontSize: 10.5, padding: "4px 9px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, cursor: "pointer" }}>
              {ex}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#c8282a", marginBottom: 14 }}>{error}</div>}

      {/* ── SYMBOL RESULT ── */}
      {result?.type === "symbol" && (() => {
        const { symbol, row, sniper, aplus, grade, heat, verdict, priceToPay, evidence, entryType, futureValue, technicalScore, trimSignal, premiumRead, fundamentalsRead, analyst, social, institutionScore } = result;
        const chgPct = Number(row.dayChangePct);
        const buyPrice = summarizeBuyPrice(priceToPay, verdict, sniper, aplus.score);
        const bottomSignal = computeBottomSignal(sniper, institutionScore, social);
        return (
          <div style={{ border: `2px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ background: C.card, padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em" }}>🧠 CORTEX</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 3 }}>
                <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color: C.text }}>{symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>${Number(row.price).toFixed(2)}</span>
                {Number.isFinite(chgPct) && <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: chgPct >= 0 ? "#0d9465" : "#c8282a" }}>{chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%</span>}
              </div>
            </div>

            <div style={{ padding: 18 }}>
              {/* WHY */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textDim, marginBottom: 4 }}>WHY</div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.5 }}>{sniper.reason || "No dominant real driver identified right now."}</div>
              </div>

              {/* BUY PRICE — one clear real number/range, not a table to parse */}
              <div style={{ background: buyPrice.ok === false ? `${heat.color}12` : `${C.accent}12`, border: `1px solid ${buyPrice.ok === false ? heat.color : C.accent}55`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textDim, marginBottom: 4 }}>🎯 BUY PRICE</div>
                <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 900, color: buyPrice.ok === false ? heat.color : C.accent }}>{buyPrice.label}</div>
                <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, marginTop: 4, lineHeight: 1.4 }}>{buyPrice.reason}</div>
                {buyPrice.lowerOption && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim }}>💡 WANT IT CHEAPER? <span style={{ color: C.text }}>{buyPrice.lowerOption.label}</span></div>
                    <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 2, lineHeight: 1.4 }}>{buyPrice.lowerOption.reason}</div>
                  </div>
                )}
              </div>

              {/* SETUP */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textDim, marginBottom: 6 }}>SETUP</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
                  <StatRow C={C} MONO={MONO} SANS={SANS} label="A+ Score (setup)" value={`${aplus.score}/100`} color={aplus.score >= 70 ? "#0d9465" : aplus.score >= 50 ? "#d6a312" : "#c8282a"} />
                  <StatRow C={C} MONO={MONO} SANS={SANS} label="Technical Score" value={`${technicalScore}/100`} color={technicalScore >= 70 ? "#0d9465" : technicalScore >= 50 ? "#d6a312" : "#c8282a"} />
                  <StatRow C={C} MONO={MONO} SANS={SANS} label="Fundamental Score" value={futureValue ? `${futureValue.qualityScore}/100` : null} color={futureValue?.qualityScore >= 65 ? "#0d9465" : C.textDim} />
                  <StatRow C={C} MONO={MONO} SANS={SANS} label="Trend" value={sniper.gates.trendBullish ? "Bullish" : "Not confirmed"} color={sniper.gates.trendBullish ? "#0d9465" : "#c8282a"} />
                  <StatRow C={C} MONO={MONO} SANS={SANS} label="Relative Strength (vs. market)" value={Number.isFinite(row.rsRating) ? `RS ${row.rsRating}` : null} color={row.rsRating >= 80 ? "#0d9465" : row.rsRating >= 60 ? "#d6a312" : "#c8282a"} />
                  <StatRow C={C} MONO={MONO} SANS={SANS} label="Volume" value={sniper.gates.volumeConfirmed ? "Confirming" : "Not confirming"} color={sniper.gates.volumeConfirmed ? "#0d9465" : C.textDim} />
                  <StatRow C={C} MONO={MONO} SANS={SANS} label="Institutional" value={`${grade.score}/100`} color={grade.score >= 65 ? "#0d9465" : grade.score >= 45 ? "#d6a312" : "#c8282a"} />
                  <StatRow C={C} MONO={MONO} SANS={SANS} label="Phase (Accum / Dist)"
                    value={institutionScore ? institutionScore.label : null}
                    color={!institutionScore ? C.textDim : institutionScore.score >= 60 ? "#0d9465" : institutionScore.score <= 40 ? "#c8282a" : "#d6a312"} />
                  <StatRow C={C} MONO={MONO} SANS={SANS} label="Setup Type" value={entryType?.type || "No Entry Type Yet"} color={entryType ? entryType.color : C.textDim} />
                </div>
              </div>

              {/* LEVELS */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textDim, marginBottom: 6 }}>LEVELS</div>
                {priceToPay ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
                    <StatRow C={C} MONO={MONO} SANS={SANS} label="Current" value={`$${priceToPay.current?.toFixed(2)}`} />
                    <StatRow C={C} MONO={MONO} SANS={SANS} label="Ideal Entry" value={`$${priceToPay.idealEntryLow} – $${priceToPay.idealEntryHigh}`} />
                    <StatRow C={C} MONO={MONO} SANS={SANS} label="Breakout Entry" value={priceToPay.breakoutEntry != null ? `$${priceToPay.breakoutEntry}` : null} />
                    <StatRow C={C} MONO={MONO} SANS={SANS} label="Invalidation" value={priceToPay.invalidation != null ? `$${priceToPay.invalidation}` : null} color="#c8282a" />
                    <StatRow C={C} MONO={MONO} SANS={SANS} label="Target" value={priceToPay.target != null ? `$${priceToPay.target}` : null} color="#0d9465" />
                    <StatRow C={C} MONO={MONO} SANS={SANS} label="Reward/Risk" value={priceToPay.rr != null ? `${priceToPay.rr.toFixed(1)} : 1` : null} />
                  </div>
                ) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>DATA UNAVAILABLE — no real pivot detected for a level framework.</div>}
              </div>

              {/* TRIM SIGNAL */}
              {trimSignal && (
                <div style={{ background: trimSignal.urgent ? "#d6a31214" : `${C.accent}0a`, border: `1px solid ${trimSignal.urgent ? "#d6a31255" : C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textDim, marginBottom: 3 }}>✂️ WHEN TO START TRIMMING</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: trimSignal.urgent ? "#d6a312" : C.text }}>{trimSignal.label}</div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 3 }}>{trimSignal.reason}</div>
                </div>
              )}

              {/* RISK */}
              <div style={{ background: `${heat.color}12`, border: `1px solid ${heat.color}55`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textDim, marginBottom: 3 }}>RISK</div>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: heat.color }}>{heat.icon} {heat.label}</div>
                <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, marginTop: 3 }}>{heat.reason}</div>
              </div>

              {/* MASTER VERDICT — the real am-core-engine.js verdict, same
                  engine driving the Workspace banner, Scanner grade,
                  Autopilot, and every alert in this app (Discover/Cortex
                  Additive Verdict, 2026-08-23). Shown above Cortex's own
                  verdict card below, which stays completely real and
                  unchanged — including its own historical win-rate track
                  record — as the specialized, tracked supplementary read,
                  per the user's own "additive only" decision (never touch
                  Cortex's tracked verdict strings, that historical data
                  matters). */}
              {row.coreVerdict && (() => {
                const cm = CORE_VERDICT_META[row.coreVerdict] || {};
                return (
                  <div style={{ background: `${cm.color}18`, border: `2px solid ${cm.color || C.border}`, borderRadius: 12, padding: 18, textAlign: "center", marginBottom: 10 }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textDim, marginBottom: 4 }}>MASTER VERDICT</div>
                    <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: cm.color }}>{cm.icon} {cm.label || row.coreVerdict}</div>
                    <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, marginTop: 6, lineHeight: 1.5 }}>{row.coreReason}</div>
                  </div>
                );
              })()}

              {/* CORTEX VERDICT — Cortex's own specialized read (Sniper +
                  Heat Risk + A+ Score), real and unchanged, including its
                  own real historical win-rate track record below. */}
              <div style={{ background: `${verdict.color}14`, border: `1px solid ${verdict.color}66`, borderRadius: 12, padding: 18, textAlign: "center", marginBottom: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textDim, marginBottom: 4 }}>CORTEX VERDICT</div>
                <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: verdict.color }}>{verdict.icon} {verdict.verdict}</div>
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, marginTop: 6, lineHeight: 1.5 }}>{verdict.reason}</div>
                {(() => {
                  const wp = verdictWinProbFor(track, verdict.verdict);
                  if (!wp) return null;
                  return (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${verdict.color}33` }}>
                      {wp.winRate != null
                        ? `Real track record: ${wp.winRate}% positive over ${wp.horizon}d, ${wp.count} real "${verdict.verdict}" observations since ${wp.trackingStartedAt}`
                        : `Real track record: only ${wp.count} "${verdict.verdict}" observation${wp.count === 1 ? "" : "s"} logged so far — too early to trust a win rate (need 10+). Tracking started ${wp.trackingStartedAt || "today"}.`}
                    </div>
                  );
                })()}
              </div>

              <button onClick={() => setShowWhy((v) => !v)} style={{ width: "100%", fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textSec, background: "transparent", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: 8 }}>
                WHY? {showWhy ? "▴" : "▾"}
              </button>
              {showWhy && (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                  {evidence.length ? evidence.map((e, i) => (
                    <div key={i} style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, padding: "3px 0" }}>{i + 1}. {e}</div>
                  )) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>DATA UNAVAILABLE</div>}
                </div>
              )}

              {/* A+ SCORE breakdown (real engine, section 5) */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 10 }}>A+ SCORE — {aplus.score}/100</div>
                <ScoreBar C={C} MONO={MONO} label="Market Regime" pts={aplus.breakdown.regimePts} max={20} />
                <ScoreBar C={C} MONO={MONO} label="Entry Timing" pts={aplus.breakdown.entryPts} max={15} />
                <ScoreBar C={C} MONO={MONO} label="Breakout Confirmation" pts={aplus.breakdown.breakoutPts} max={10} />
                <ScoreBar C={C} MONO={MONO} label="Volume" pts={aplus.breakdown.volPts} max={10} />
                <ScoreBar C={C} MONO={MONO} label="Risk Discipline" pts={aplus.breakdown.riskPts} max={20} />
                <ScoreBar C={C} MONO={MONO} label="Support / Structure" pts={aplus.breakdown.supportPts} max={10} />
                <ScoreBar C={C} MONO={MONO} label="VCP Setup Score" pts={aplus.breakdown.vcpPts} max={15} />
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button onClick={() => setShowDeep((v) => !v)} style={{ flex: 1, fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "10px 0", borderRadius: 8, border: `1px solid #d6a312`, color: "#d6a312", background: "#d6a31214", cursor: "pointer" }}>
                  🔬 {showDeep ? "HIDE DEEP SCAN" : "DEEP SCAN"}
                </button>
                <button onClick={() => openChart(symbol)} style={{ flex: 1, fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "10px 0", borderRadius: 8, border: "none", color: "#fff", background: C.accent, cursor: "pointer" }}>
                  📈 CHART
                </button>
              </div>

              {/* DEEP SCAN */}
              {showDeep && (
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
                    {DEEP_TABS.map(([id, label]) => (
                      <button key={id} onClick={() => setDeepTab(id)} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, padding: "5px 10px", borderRadius: 6, cursor: "pointer", border: `1px solid ${deepTab === id ? C.accent : C.border}`, background: deepTab === id ? C.accent : "transparent", color: deepTab === id ? "#fff" : C.textSec }}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {deepTab === "technical" && (() => {
                    const adx = row.technicals?.adx;
                    return (
                      <div>
                        <StatRow C={C} MONO={MONO} SANS={SANS} label="ADX (trend strength)" value={adx ? `${adx.adx} — ${adx.strength}, ${adx.direction}` : null} color={adx?.direction === "Bullish" ? "#0d9465" : adx?.direction === "Bearish" ? "#c8282a" : C.textDim} />
                        <StatRow C={C} MONO={MONO} SANS={SANS} label="20-day VWAP" value={sniper.vwap20 != null ? `$${sniper.vwap20.toFixed(2)} — price is ${sniper.gates.aboveVwap ? "above" : "below"}` : null} color={sniper.gates.aboveVwap ? "#0d9465" : "#c8282a"} />
                        <StatRow C={C} MONO={MONO} SANS={SANS} label="RSI (14)" value={Number.isFinite(row.rsi) ? row.rsi.toFixed(1) : null} />
                        <StatRow C={C} MONO={MONO} SANS={SANS} label="52-week range" value={(row.lo52 != null && row.hi52 != null) ? `$${row.lo52.toFixed(2)} – $${row.hi52.toFixed(2)}` : null} />
                        <StatRow C={C} MONO={MONO} SANS={SANS} label="50-day MA" value={row.ma50 != null ? `$${Number(row.ma50).toFixed(2)}` : null} />
                        <StatRow C={C} MONO={MONO} SANS={SANS} label="Volume vs 50d avg" value={row.volRatio != null ? `${row.volRatio.toFixed(2)}x` : null} color={sniper.gates.volumeConfirmed ? "#0d9465" : C.textDim} />
                        <StatRow C={C} MONO={MONO} SANS={SANS} label="1-day / 1-week change" value={`${row.dayChangePct != null ? row.dayChangePct.toFixed(2) + "%" : "—"} / ${row.weekChangePct != null ? row.weekChangePct.toFixed(2) + "%" : "—"}`} />
                      </div>
                    );
                  })()}

                  {deepTab === "minervini" && (
                    <div>
                      {Array.isArray(row.criteria) && row.criteria.length ? row.criteria.map((c) => (
                        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12 }}>
                          <span style={{ color: c.pass ? "#0d9465" : "#c8282a", fontWeight: 700 }}>{c.pass ? "✓" : "✗"} {c.label}</span>
                          <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, whiteSpace: "nowrap" }}>{String(c.value)}</span>
                        </div>
                      )) : <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>DATA UNAVAILABLE — {row.passCount ?? "?"}/8 pass overall.</div>}
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="VCP grade" value={row.vcpGrade && row.vcpGrade !== "-" ? row.vcpGrade : null} />
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="Base tightening" value={row.tightening ? "Yes — each pullback shallower than the last" : "No"} color={row.tightening ? "#0d9465" : C.textDim} />
                      {/* Real VCP Engine detail — already computed server-side
                          (vcpBreakoutEngine/vcpReport, src/routes/market.js)
                          but never surfaced here before now. 2026-08-14 VCP
                          engine extension, Phase 1: expose existing data,
                          no new detection logic. */}
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="VCP Setup Score" value={Number.isFinite(row.vcpScore) ? `${row.vcpScore}/100` : null}
                        color={row.vcpScore >= 80 ? "#0d9465" : row.vcpScore >= 60 ? "#5ab552" : row.vcpScore >= 40 ? "#d6a312" : "#c8282a"} />
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="VCP Verdict" value={row.vcpVerdict || null}
                        color={row.vcpVerdict === "A+ SETUP" ? "#0d9465" : row.vcpVerdict === "WATCHLIST" ? "#5ab552" : row.vcpVerdict === "WEAK SETUP" ? "#d6a312" : "#c8282a"} />
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="Breakout State" value={row.state || null}
                        color={row.state === "CONFIRMED" ? "#0d9465" : row.state === "BREAKOUT_ACTIVE" ? "#5ab552" : row.state === "SETUP_READY" ? "#d6a312" : row.state === "FAILED" ? "#c8282a" : C.textDim} />
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="Real Pivot (final contraction high)" value={row.vcpPivotPrice ? `$${row.vcpPivotPrice}` : null} />
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="Distance to Pivot" value={Number.isFinite(row.vcpPivotDistancePct) ? `${row.vcpPivotDistancePct >= 0 ? row.vcpPivotDistancePct + "% below" : Math.abs(row.vcpPivotDistancePct) + "% above"}` : null} />
                      {Array.isArray(row.vcpDepths) && row.vcpDepths.length > 0 && (
                        <StatRow C={C} MONO={MONO} SANS={SANS} label="Contractions" value={row.vcpDepths.map((d, i) => `C${i + 1}: -${d}%`).join("  →  ")} />
                      )}
                    </div>
                  )}

                  {deepTab === "fundamental" && (
                    <div>
                      {(fundamentalsRead?.bull?.length || fundamentalsRead?.bear?.length) ? (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textDim, marginBottom: 6 }}>WHY — REAL FUNDAMENTAL BULL/BEAR READ</div>
                          {fundamentalsRead.bull.map((t, i) => <div key={`bull${i}`} style={{ fontFamily: SANS, fontSize: 12, color: "#0d9465", padding: "3px 0" }}>🟢 {t}</div>)}
                          {fundamentalsRead.bear.map((t, i) => <div key={`bear${i}`} style={{ fontFamily: SANS, fontSize: 12, color: "#c8282a", padding: "3px 0" }}>🔴 {t}</div>)}
                        </div>
                      ) : null}
                      <div style={{ margin: "-6px" }}><FundamentalsPanel symbol={symbol} C={C} MONO={MONO} SANS={SANS} /></div>
                    </div>
                  )}

                  {deepTab === "valuation" && (
                    futureValue ? (
                      <div>
                        <StatRow C={C} MONO={MONO} SANS={SANS} label="Value Score" value={`${futureValue.valueScore}/100`} color={futureValue.valueScore >= 65 ? "#0d9465" : futureValue.valueScore >= 40 ? "#d6a312" : "#c8282a"} />
                        <StatRow C={C} MONO={MONO} SANS={SANS} label="Future Score" value={`${futureValue.futureScore}/100`} color={futureValue.futureScore >= 65 ? "#0d9465" : "#d6a312"} />
                        <StatRow C={C} MONO={MONO} SANS={SANS} label="Moat Proxy (margin + ROIC)" value={futureValue.moatScore != null ? `${futureValue.moatScore}/100` : null} />
                        {futureValue.fairValue && (
                          <>
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="Conservative Fair Value" value={`$${futureValue.fairValue.conservative}`} />
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="Fair Value (real analyst median)" value={`$${futureValue.fairValue.fairValue}`} />
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="Bull Case" value={`$${futureValue.fairValue.bull}`} />
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="Max Price To Pay" value={`$${futureValue.fairValue.maxPriceToPay}`} color="#d6a312" />
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="Margin of Safety" value={futureValue.fairValue.marginOfSafetyPct != null ? `${futureValue.fairValue.marginOfSafetyPct}%` : null} />
                          </>
                        )}
                        {premiumRead && (
                          <div style={{ marginTop: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 900, color: C.textDim }}>CAN I PAY A PREMIUM?</div>
                            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, marginTop: 2 }}>{premiumRead.verdict}</div>
                            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 3 }}>{premiumRead.reason}</div>
                          </div>
                        )}
                        {futureValue.growth && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 900, color: C.textDim, marginBottom: 4 }}>WHAT GROWTH LOOKS LIKE (real)</div>
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="Revenue growth" value={futureValue.growth.revenueGrowth != null ? `${(futureValue.growth.revenueGrowth * 100).toFixed(1)}%` : null} />
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="Earnings growth" value={futureValue.growth.earningsGrowth != null ? `${(futureValue.growth.earningsGrowth * 100).toFixed(1)}%` : null} />
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="3yr revenue/share growth" value={futureValue.growth.threeYRevenueGrowthPerShare != null ? `${(futureValue.growth.threeYRevenueGrowthPerShare * 100).toFixed(0)}%` : null} />
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="5yr net income/share growth" value={futureValue.growth.fiveYNetIncomeGrowthPerShare != null ? `${(futureValue.growth.fiveYNetIncomeGrowthPerShare * 100).toFixed(0)}%` : null} />
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="Share count trend" value={futureValue.sharesGrowth != null ? (futureValue.sharesGrowth < 0 ? "Shrinking (buybacks)" : "Growing (dilution)") : null} color={futureValue.sharesGrowth < 0 ? "#0d9465" : futureValue.sharesGrowth > 0 ? "#c8282a" : null} />
                          </div>
                        )}
                        {analyst && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 900, color: C.textDim, marginBottom: 4 }}>WHAT INVESTORS THINK (real analyst consensus)</div>
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="Consensus" value={analyst.recommendation || null} />
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="Analysts covering" value={analyst.numAnalysts || null} />
                            {Array.isArray(analyst.trend) && analyst.trend[0] && (
                              <StatRow C={C} MONO={MONO} SANS={SANS} label="Buy / Hold / Sell" value={`${analyst.trend[0].strongBuy + analyst.trend[0].buy} buy · ${analyst.trend[0].hold} hold · ${analyst.trend[0].sell + analyst.trend[0].strongSell} sell`} />
                            )}
                          </div>
                        )}
                      </div>
                    ) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>DATA UNAVAILABLE — no real fundamentals coverage for this symbol.</div>
                  )}

                  {deepTab === "institutional" && (
                    <div style={{ margin: "-6px" }}>
                      <div style={{ padding: "0 6px", marginBottom: 8 }}>
                        <StatRow C={C} MONO={MONO} SANS={SANS} label="Institutional Grade" value={`${grade.score}/100`} color={grade.score >= 65 ? "#0d9465" : "#d6a312"} />
                      </div>
                      <div style={{ padding: "0 6px", marginBottom: 12 }}>
                        <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 900, color: C.textDim, marginBottom: 4 }}>REAL ACCUMULATION / DISTRIBUTION PHASE</div>
                        {institutionScore ? (
                          <>
                            <StatRow C={C} MONO={MONO} SANS={SANS} label="Phase"
                              value={`${institutionScore.label} (${institutionScore.score}/100)`}
                              color={institutionScore.score >= 60 ? "#0d9465" : institutionScore.score <= 40 ? "#c8282a" : "#d6a312"} />
                            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginTop: 6, lineHeight: 1.6 }}>
                              {institutionScore.reasons.map((r, i) => <div key={i}>• {r}</div>)}
                            </div>
                            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 6, fontStyle: "italic" }}>{institutionScore.disclosure}</div>
                          </>
                        ) : (
                          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>DATA UNAVAILABLE — no real dark pool, options flow, insider, or short-interest data for this symbol right now.</div>
                        )}
                      </div>
                      <InvestorsPanel symbol={symbol} C={C} MONO={MONO} SANS={SANS} />
                      <OptionsFlowPanel symbol={symbol} C={C} MONO={MONO} SANS={SANS} />
                    </div>
                  )}

                  {deepTab === "catalyst" && (
                    <div>
                      {social?.stocktwits && social.stocktwits.total > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 900, color: C.textDim, marginBottom: 4 }}>REAL SOCIAL SENTIMENT (StockTwits)</div>
                          <StatRow C={C} MONO={MONO} SANS={SANS} label="Bullish" value={`${social.stocktwits.bullCount} posts`} color="#0d9465" />
                          <StatRow C={C} MONO={MONO} SANS={SANS} label="Bearish" value={`${social.stocktwits.bearCount} posts`} color="#c8282a" />
                          <StatRow C={C} MONO={MONO} SANS={SANS} label="Bull %" value={social.stocktwits.bullPct != null ? `${Math.round(social.stocktwits.bullPct)}%` : null} />
                          {social.redditMentions > 0 && <StatRow C={C} MONO={MONO} SANS={SANS} label="r/wallstreetbets mentions (7d)" value={social.redditMentions} />}
                        </div>
                      )}
                      <div style={{ margin: "-6px" }}><NewsPanel symbol={symbol} C={C} MONO={MONO} SANS={SANS} /></div>
                    </div>
                  )}

                  {deepTab === "risk" && (
                    <div>
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="Risk level" value={row.riskState} color={row.riskState === "LOW" ? "#0d9465" : row.riskState === "MEDIUM" ? "#d6a312" : row.riskState === "HIGH" ? "#c8282a" : null} />
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="Risk to stop" value={row.riskPct != null ? `${row.riskPct}%` : null} />
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="Extended above pivot" value={sniper.gates.extended ? "Yes — chasing risk" : "No"} color={sniper.gates.extended ? "#c8282a" : "#0d9465"} />
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="Real early get-out signs" value={sniper.gates.reversalTopRisk ? `Yes — ${sniper.reversal?.verdict}` : "No"} color={sniper.gates.reversalTopRisk ? "#c8282a" : "#0d9465"} />
                      {/* Real top/bottom PRICES, not just a percentage distance —
                          explicit user follow-up, 2026-08-13: "I still need to
                          know when the bottom and top prices" (after a Telegram
                          alert only said "Near 52w high (-1.3%)" with no dollar
                          figure). computeReversalDetector already computes these
                          real 52-week levels; they were just never displayed. */}
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="Top price (52w high)" value={sniper.reversal?.hi52 != null ? `$${sniper.reversal.hi52.toFixed(2)}` : null} color="#c8282a" />
                      <StatRow C={C} MONO={MONO} SANS={SANS} label="Bottom price (52w low)" value={sniper.reversal?.lo52 != null ? `$${sniper.reversal.lo52.toFixed(2)}` : null} color="#0d9465" />

                      {/* Real Bottom Signal — multi-factor, explicit user
                          follow-up, 2026-08-13: "I need bottom not based on
                          52 weeks low only based on all factors even when
                          you start see movement on price narrative
                          sentiment changed buyers stepped in options
                          changes." Combines 3 independently-real dimensions
                          (technical structure, institutional flow, current
                          sentiment) — see computeBottomSignal for exactly
                          what's real vs. honestly unavailable per dimension. */}
                      <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: `${bottomSignal.color}12`, border: `1px solid ${bottomSignal.color}55` }}>
                        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: bottomSignal.color, marginBottom: 8 }}>🔻 REAL BOTTOM SIGNAL — {bottomSignal.label} ({bottomSignal.agreeCount}/3)</div>
                        {bottomSignal.dims.map((d, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6, fontFamily: SANS, fontSize: 12 }}>
                            <span style={{ color: d.present ? "#0d9465" : C.textDim, fontWeight: 900, flexShrink: 0 }}>{d.present ? "✓" : "—"}</span>
                            <span style={{ color: C.textSec }}><b style={{ color: C.text }}>{d.name}:</b> {d.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── SCAN RESULT ── */}
      {result?.type === "scan" && (() => {
        const meta = SCAN_LABELS[result.scanType] || { icon: "🔎", title: result.scanType };
        const rows = result.rows || [];
        return (
          <div>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 4 }}>{meta.icon} {meta.title}</div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 12 }}>{rows.length} real match{rows.length === 1 ? "" : "es"}</div>
            {!rows.length && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real matches right now.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
              {rows.map((x) => {
                const symbol = x.row?.symbol || x.symbol;
                const price = x.row?.price ?? x.price;
                const score = result.kind === "future-value" ? (result.scanType === "undervalued" ? x.valueScore : x.futureScore) : (x.aplus?.score ?? x.accScore ?? x.rr);
                const scoreLabel = result.kind === "future-value" ? (result.scanType === "undervalued" ? "VALUE" : "FUTURE") : (result.scanType === "institutional" ? "ACCUMULATION" : result.scanType === "best_rr" ? "R:R" : "A+");
                return (
                  <div key={symbol} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text }}>{symbol}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>${Number(price).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>{scoreLabel}</span>
                      <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>{typeof score === "number" ? (result.scanType === "best_rr" ? `${score.toFixed(1)}:1` : Math.round(score)) : "—"}</span>
                    </div>
                    <button onClick={() => analyzeFromList(symbol)} style={{ width: "100%", fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 0", borderRadius: 6, border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent, cursor: "pointer" }}>
                      🧠 ANALYZE
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {!result && !error && (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, textAlign: "center", padding: "30px 0" }}>
          Ask a question above, or try one of the examples.
        </div>
      )}
    </div>
  );
}
