import { useState, useEffect, useMemo } from "react";
import { RH_UNIVERSE, rhScore, stockQualityBreakdown, rhScreenProgressive } from "./rhpro-shared.jsx";
import { computeRegime, computeAPlusScore, computeNextAction, computePrediction } from "./market-helpers.js";
import AiScoreExplainer, { TRADE_SETUP_DIMENSIONS, STOCK_QUALITY_DIMENSIONS } from "./AiScoreExplainer.jsx";
import GapScanner from "./GapScanner.jsx";
import DayTradeTab from "./DayTradeTab.jsx";

// Real win-probability lookup — Phase 3 of the Institutional Scanner work
// (2026-07-28). Reuses /api/market/aplus-track's existing real forward-return
// log (aplus-score-history.js), bucketed by the row's real Trade Setup
// Score band. Prefers a longer real horizon (more representative of a swing
// hold) but falls back to whichever horizon actually has enough real
// samples. Below MIN_WIN_SAMPLE real observations, returns null — the UI
// then shows the honest sample count instead of a fabricated-looking
// percentage (this platform's forward log is one ~60-symbol daily snapshot,
// never thousands of setups).
const MIN_WIN_SAMPLE = 10;
function bucketOf(score) {
  if (score >= 80) return "80-100";
  if (score >= 60) return "60-79";
  if (score >= 40) return "40-59";
  return "0-39";
}
function winProbFor(track, score) {
  if (!track?.horizons) return null;
  const bucket = bucketOf(score);
  for (const h of ["d20", "d10", "d5", "d60"]) {
    const b = track.horizons[h]?.buckets?.[bucket];
    if (b && b.count >= MIN_WIN_SAMPLE) return { winRate: b.winRate, count: b.count, horizon: h.slice(1) };
  }
  // Real data exists but every horizon is under the honest sample floor —
  // surface the largest real count so the UI can say exactly how far short.
  let best = null;
  for (const h of ["d20", "d10", "d5", "d60"]) {
    const b = track.horizons[h]?.buckets?.[bucket];
    if (b && (!best || b.count > best.count)) best = { count: b.count, horizon: h.slice(1) };
  }
  return best ? { winRate: null, count: best.count, horizon: best.horizon } : null;
}

// ── Categorized ranking — Phase 1 of the Institutional Scanner work
// (2026-07-27). Every category here is derived from fields the scan ALREADY
// computes (screenTrendTemplate/buildTrendTemplate, src/routes/market.js) —
// no new scoring logic, no new fetches for the in-memory categories. Gap
// Ups/Downs and Day Trade Candidates reuse the app's existing standalone
// GapScanner.jsx/DayTradeTab.jsx components directly rather than
// reimplementing their real (Alpaca-bar-based) data. "Reversal Watch" is
// deliberately labeled as a simplified heuristic — it's real (pctFromHigh
// and volRatio both come straight off the scan), but it is NOT the same as
// Green Light's full bottomScore, which needs live quote data this scan
// doesn't fetch — never claim more sophistication than what's actually run.
const CATEGORIES = [
  { id: "all", label: "All / Ranked" },
  { id: "breakout", label: "🚀 Breakout" },
  { id: "pullback", label: "↩️ Pullback" },
  { id: "rvol", label: "🔥 High RVOL" },
  { id: "momentum", label: "📈 Momentum Leaders" },
  { id: "reversal", label: "🔄 Reversal Watch" },
  // Early Warning — "before it pops / before it drops" (2026-07-29,
  // explicit user request, extending the same idea already shipped in
  // Smart Scan). RhProScanner's rows come from a different real pipeline
  // (screenTrendTemplate's VCP/pivot analysis, no RSI/52-week data), so
  // this uses that pipeline's own real precursor fields instead of copying
  // Smart Scan's RSI-based thresholds: real VCP base contraction
  // (`tightening`, same field the VCP report itself surfaces) and real
  // distance from the pivot buy point (`abovePivotPct`/`extended`, the
  // exact same >10%-above-pivot "chasing risk" definition already used
  // everywhere else in this app for the extended flag).
  { id: "prepop", label: "🚀 Pre-Pop" },
  { id: "extended", label: "📉 Extended" },
  { id: "avoid", label: "🚫 Avoid List" },
  { id: "gap", label: "⚡ Gap Up/Down" },
  { id: "daytrade", label: "⏱ Day Trade" },
];

export default function RhProScanner({ C, MONO, SANS, macroData, sectorData, setActiveTab }) {
  const regime = computeRegime(macroData);
  // "plan" used to hand off only the symbol, so Trade Planner would silently
  // recompute its OWN ATR-based entry/stop/targets — often disagreeing with
  // the real VCP pivot entry/stop this same row already shows in ENTRY →
  // STOP. Handing off the actual computed row (2026-07-28, "combine chart
  // with plan... give me best result") means chart and plan now agree on
  // one real trade instead of showing two different ones for the same
  // symbol. Falls back to the plain symbol when this row has no valid
  // real entry/stop (Trade Planner then does its own live calc, same as
  // before) instead of forcing a bad plan.
  const planTrade = (r) => {
    try {
      const validPlan = Number.isFinite(Number(r.entry)) && Number.isFinite(Number(r.stop)) && Number(r.entry) > Number(r.stop);
      if (validPlan) {
        localStorage.setItem("tradeplanner_load_plan", JSON.stringify({
          symbol: r.symbol, entry: Number(r.entry), stop: Number(r.stop),
          target: Number.isFinite(Number(r.target2)) ? Number(r.target2) : null,
          aplus: r.aplus || null, next: r.next || null, source: "AI Sniper Scanner",
        }));
      } else {
        localStorage.setItem("tradeplanner_load_sym", r.symbol);
      }
    } catch {}
    setActiveTab && setActiveTab("tradeplanner");
  };
  // Market Terminal combined into Sniper Scanner (2026-07-28, explicit user
  // request) — same real handoff pattern RotationTab/SectorsTab already use
  // to open a symbol's full chart + fundamentals/earnings/analyst/news/SMC
  // panels, reusing MarketTerminalTab as-is rather than duplicating any of
  // its real data or building a second chart.
  const openChart = (sym) => { try { localStorage.setItem("mterminal_load_sym", sym); localStorage.setItem("mterminal_back_to", "rhpro-scan"); } catch {} setActiveTab && setActiveTab("mterminal"); };
  // rawRows holds only the real trend-screen data from the network — score
  // computation is derived separately below (useMemo) so it always reflects
  // the LATEST regime/sector data instead of freezing at scan time. Fixes a
  // real gap: previously Sector Strength (and the whole Trade Setup Score,
  // which depends on regime) could go stale between scans if sectorData/
  // macroData hadn't loaded yet on mount, or if the regime shifted mid-
  // session — now every score recomputes live off current inputs without
  // needing a manual RESCAN.
  const [rawRows, setRawRows] = useState([]); const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(""); const [filter, setFilter] = useState(60); const [ranAt, setRanAt] = useState(null);
  const [category, setCategory] = useState("all");
  const [track, setTrack] = useState(null); // real win-probability forward-return log
  const [explain, setExplain] = useState(null); // { symbol, aplus, dimensions, label } | null
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState(null); // null = default score-ranked order
  const [sortDir, setSortDir] = useState("desc");

  // Real sector-ETF % change map for Stock Quality's Sector Strength
  // dimension — reuses sectorData/macroData, both already fetched app-wide
  // (RhProHeatMap's exact pattern), zero new network cost.
  const chg = x => Number(x?.changesPercentage ?? 0);
  const sectorPerf = {};
  (sectorData || []).forEach(s => { if (s?.symbol) sectorPerf[s.symbol] = chg(s); });
  const spyQuote = (macroData || []).find(m => (m.symbol || "").toUpperCase() === "SPY");
  if (spyQuote) sectorPerf.SPY = chg(spyQuote);
  const sectorPerfKey = JSON.stringify(sectorPerf);

  const scan = () => {
    setLoading(true); setErr(""); setRawRows([]);
    let all = [];
    rhScreenProgressive(RH_UNIVERSE,
      (part) => { all = [...all, ...part]; setRawRows(all); setRanAt(new Date()); },
      () => { setLoading(false); if (!all.length) setErr("No data returned — try RESCAN in a moment."); }
    );
  };
  useEffect(() => { scan(); }, []);
  // Auto-refresh every 10 min during the session, same real "keep it fresh
  // without a click" pattern Best Opportunities already uses (5 min there;
  // 10 here since this is a heavier 60-symbol deep scan with SMC/predict).
  // scan() only ever touches rawRows/loading/err/ranAt via stable setters —
  // no stale-closure risk from the empty dep array.
  useEffect(() => {
    const t = setInterval(scan, 10 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    fetch("/api/market/aplus-track").then(r => r.json()).then(d => { if (d?.ok) setTrack(d); }).catch(() => {});
  }, []);

  const rows = useMemo(() => {
    return rawRows.map(x => {
      const quality = stockQualityBreakdown(x, sectorPerf);
      const aplus = computeAPlusScore(x, regime);
      // Real prediction reused from PredictionsTab's engine, run on this
      // same row (x doubles as both the quote and the trend input — no
      // separate live-quote fetch here, so today's %-change/day-range
      // component honestly defaults to neutral; the dominant Stage/RS/
      // volume-driven scoring still runs in full).
      return { ...x, score: quality.score, quality, aplus, next: computeNextAction(x), prediction: computePrediction(x, x) };
    }).sort((a, b) => (b.score - a.score) || ((b.rsRating || 0) - (a.rsRating || 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, sectorPerfKey, regime?.score]);

  // Category derivation — all real, all off fields the scan already returns.
  let categorized = rows;
  let categoryNote = null;
  if (category === "breakout") {
    categorized = rows.filter(r => r.atBuyPoint && r.volConfirmed);
    categoryNote = "Real buy point (8/8-eligible template + actionable, not extended) with volume ≥1.4x the 50-day average.";
  } else if (category === "pullback") {
    categorized = rows.filter(r => r.actionable && !r.atBuyPoint && !r.extended);
    categoryNote = "Actionable setup, not yet at a confirmed buy point, not extended — the real trend-screen \"WATCH\" bucket.";
  } else if (category === "rvol") {
    categorized = [...rows].filter(r => Number.isFinite(r.volRatio)).sort((a, b) => (b.volRatio || 0) - (a.volRatio || 0));
    categoryNote = "Sorted by real volume vs the 50-day average, highest first.";
  } else if (category === "momentum") {
    categorized = rows.filter(r => (r.rsRating || 0) >= 80 && (r.stage || "").includes("2"));
    categoryNote = "RS ≥ 80 in a confirmed Stage 2 uptrend — the same real definition Pro Watchlists' Momentum Leaders uses.";
  } else if (category === "reversal") {
    categorized = rows.filter(r => (r.pctFromHigh || 0) <= -20 && (r.volRatio || 0) >= 1.4);
    categoryNote = "Simplified heuristic: ≥20% off the 52-week high with volume picking up — real data, but not the same as Green Light's full bottom-score model (that needs live quote data this scan doesn't fetch).";
  } else if (category === "prepop") {
    // Requires BOTH real signals together (was OR — too broad, ~half the
    // universe has a contracting base at any given time on its own).
    // Actionable + tightening + right at the pivot edge is a genuinely
    // higher-conviction "about to break" read than either alone.
    categorized = rows.filter(r => r.actionable && !r.atBuyPoint && !r.extended && r.tightening && r.abovePivotPct != null && r.abovePivotPct < 0 && r.abovePivotPct > -5);
    categoryNote = "Real VCP base contracting AND within 5% below the real pivot buy point, not triggered yet — the base is coiled right at the edge. Before it pops.";
  } else if (category === "extended") {
    categorized = [...rows].filter(r => r.extended).sort((a, b) => (b.abovePivotPct || 0) - (a.abovePivotPct || 0));
    categoryNote = "More than 10% above the real pivot buy point (the same real \"chasing risk\" definition used everywhere else in this app) — often due for a pullback before the next leg. Before it drops.";
  } else if (category === "avoid") {
    categorized = [...rows].filter(r => r.aplus).sort((a, b) => (a.aplus.score || 0) - (b.aplus.score || 0)).slice(0, 10);
    categoryNote = "The real bottom of this scan by A+ Score — same pattern as Dashboard's Stocks to Avoid card.";
  }
  let shown = category === "all" ? categorized.filter(r => filter === "buy" ? r.atBuyPoint : r.score >= filter) : categorized;
  if (search.trim()) {
    const q = search.trim().toUpperCase();
    shown = shown.filter(r => r.symbol.includes(q));
  }

  // Sortable columns — click a header to sort by that real field, click
  // again to flip direction. Extracted here so both "all" and every real
  // category (breakout/pullback/rvol/momentum/reversal/avoid) share the
  // same sort behavior rather than only the default view.
  const SORTABLE = {
    quality: r => r.score,
    setup: r => r.aplus?.score ?? -1,
    win: r => (track ? winProbFor(track, r.aplus?.score ?? r.score)?.winRate : null) ?? -1,
    confidence: r => r.confidence ?? -1,
    price: r => Number(r.price) || 0,
    rs: r => r.rsRating ?? -1,
    trend: r => r.passCount ?? -1,
  };
  if (sortBy && SORTABLE[sortBy]) {
    const acc = SORTABLE[sortBy];
    shown = [...shown].sort((a, b) => (acc(a) - acc(b)) * (sortDir === "asc" ? 1 : -1));
  }
  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  const scoreCol = s => s >= 80 ? C.green : s >= 65 ? "#5ab552" : s >= 50 ? C.amber : C.textDim;
  const cell = { fontFamily: MONO, fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const th = { fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", padding: "6px 10px", textAlign: "left", position: "sticky", top: 0, background: C.card };

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>🎯 AI SNIPER SCANNER PRO</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>{RH_UNIVERSE.length} stocks · ranked 0–100 · full chart on every row · auto-refreshes every 10 min · {ranAt ? `scanned ${ranAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Find symbol…"
          style={{ fontFamily: MONO, fontSize: 12, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, width: 140, marginLeft: "auto" }} />
        <button onClick={scan} disabled={loading} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none", color: "#fff", background: loading ? C.textDim : C.accent, cursor: loading ? "default" : "pointer" }}>{loading ? "⏳ scanning…" : "↻ RESCAN"}</button>
      </div>

      {/* Category tabs — the "AI Ranking" categorized view */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setCategory(cat.id)} style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 7, cursor: "pointer", border: `1px solid ${category === cat.id ? C.accent : C.border}`, background: category === cat.id ? C.accent : C.surface, color: category === cat.id ? "#fff" : C.textSec }}>{cat.label}</button>
        ))}
        <button onClick={() => setActiveTab && setActiveTab("rhpro-heat")} style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 7, cursor: "pointer", border: `1px solid ${C.border}`, background: C.surface, color: C.textSec }}>🌡️ Sectors →</button>
      </div>
      {categoryNote && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 10, lineHeight: 1.5 }}>{categoryNote}</div>}

      {category === "gap" && <GapScanner C={C} MONO={MONO} SANS={SANS} />}
      {category === "daytrade" && <DayTradeTab C={C} MONO={MONO} SANS={SANS} />}

      {category !== "gap" && category !== "daytrade" && (
      <>
      {category === "all" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {[["buy", "🎯 At buy point"], [75, "≥ 75 elite"], [65, "≥ 65 strong"], [50, "≥ 50 all setups"]].map(([v, l]) => (
            <button key={String(v)} onClick={() => setFilter(v)} style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 7, cursor: "pointer", border: `1px solid ${filter === v ? C.accent : C.border}`, background: filter === v ? C.accent : C.surface, color: filter === v ? "#fff" : C.textSec }}>{l}</button>
          ))}
        </div>
      )}
      {err && <div style={{ fontFamily: SANS, fontSize: 12, color: C.red, marginBottom: 10 }}>⚠ {err}</div>}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", maxHeight: "70vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {[
              ["#", null], ["SYMBOL", null], ["STOCK QUALITY", "quality"], ["TRADE SETUP", "setup"], ["WIN%", "win"],
              ["PRED (1WK)", null], ["CONFIDENCE", "confidence"], ["RISK", null], ["PRICE", "price"], ["RS", "rs"],
              ["TREND (8pt)", "trend"], ["STAGE", null], ["SMC", null], ["ACTION", null], ["ENTRY → STOP", null],
            ].map(([h, key]) => (
              <th key={h} style={{ ...th, cursor: key ? "pointer" : "default" }} onClick={key ? () => toggleSort(key) : undefined} title={key ? "Click to sort" : undefined}>
                {h}{sortBy === key && key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {shown.map((r, i) => {
              const win = track ? winProbFor(track, r.aplus?.score ?? r.score) : null;
              return (
              <tr key={r.symbol} style={{ background: i % 2 ? "transparent" : `${C.surface}55` }}>
                <td style={{ ...cell, color: C.textDim }}>{i + 1}</td>
                <td style={{ ...cell, fontWeight: 900, color: C.text }}>
                  {r.symbol}
                  <button onClick={() => openChart(r.symbol)} title={`Open ${r.symbol}'s full chart — trend, fundamentals, earnings, analysts, news, SMC`}
                    style={{ marginLeft: 6, fontSize: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "1px 5px", cursor: "pointer" }}>📈 chart</button>
                  <button onClick={() => planTrade(r)} title={`Plan this trade — opens Trade Planner with ${r.symbol}'s real entry/stop from this scan already filled in`}
                    style={{ marginLeft: 4, fontSize: 10, border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent, borderRadius: 4, padding: "1px 5px", cursor: "pointer" }}>🎯 plan</button>
                </td>
                <td style={cell}>
                  {r.quality && (
                    <button onClick={() => setExplain({ symbol: r.symbol, aplus: r.quality, dimensions: STOCK_QUALITY_DIMENSIONS, label: "STOCK QUALITY SCORE" })}
                      title="Click to see why this score, and what would raise it"
                      style={{ font: "inherit", fontWeight: 900, color: scoreCol(r.score), background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                      {r.score} <span style={{ fontSize: 9, opacity: 0.7 }}>▸</span>
                    </button>
                  )}
                  {r.atBuyPoint && <span style={{ marginLeft: 6, fontSize: 10, color: C.green }}>🎯</span>}
                </td>
                <td style={cell}>{r.aplus && (
                  <button onClick={() => setExplain({ symbol: r.symbol, aplus: r.aplus, dimensions: TRADE_SETUP_DIMENSIONS, label: "TRADE SETUP SCORE" })}
                    title="Click to see why this score, and what would raise it"
                    style={{ font: "inherit", fontWeight: 900, color: "#fff", background: r.aplus.score >= 80 ? "#0d9465" : r.aplus.score >= 60 ? "#d6a312" : "#c8282a", border: "none", borderRadius: 4, padding: "1px 7px", cursor: "pointer" }}>{r.aplus.score}</button>
                )}</td>
                <td style={cell}>
                  {win == null ? <span style={{ color: C.textDim, fontSize: 10 }}>—</span>
                    : win.winRate != null ? <span title={`${win.count} real observations, ${win.horizon}-day forward, same score band`} style={{ fontWeight: 800, color: win.winRate >= 60 ? C.green : win.winRate >= 45 ? C.amber : C.red, cursor: "help" }}>{win.winRate}%</span>
                    : <span title="Real forward-return log, but not enough observations yet in this score band" style={{ fontSize: 10, color: C.textDim, cursor: "help" }}>{win.count}/{MIN_WIN_SAMPLE} obs</span>}
                </td>
                <td style={cell}>
                  {r.prediction && (() => {
                    const p = r.prediction;
                    const dirCol = p.dir.includes("BULL") || p.dir === "LEAN UP" ? C.green : p.dir.includes("BEAR") || p.dir === "LEAN DOWN" ? C.red : C.textDim;
                    const dirIcon = p.dir.includes("BULL") || p.dir === "LEAN UP" ? "📈" : p.dir.includes("BEAR") || p.dir === "LEAN DOWN" ? "📉" : "➡️";
                    return (
                      <span title={`${p.why.join(" · ") || "No strong real signal either way"} · target $${p.target} (${p.movePct >= 0 ? "+" : ""}${p.movePct}%) · ${p.conf}% confidence`}
                        style={{ fontSize: 11, fontWeight: 800, color: dirCol, cursor: "help" }}>
                        {dirIcon} {p.dir}
                      </span>
                    );
                  })()}
                </td>
                <td style={cell}>{r.confidence != null && <span title="Breakout-engine confidence — base quality + how ready the setup is right now" style={{ fontWeight: 800, color: r.confidence >= 70 ? C.green : r.confidence >= 40 ? C.amber : C.textDim }}>{r.confidence}%</span>}</td>
                <td style={cell}>{r.riskState && <span title="From the VCP risk report — base quality + breakout readiness" style={{ fontSize: 10, fontWeight: 900, color: r.riskState === "LOW" ? C.green : r.riskState === "MEDIUM" ? C.amber : C.red, border: `1px solid ${r.riskState === "LOW" ? C.green : r.riskState === "MEDIUM" ? C.amber : C.red}`, borderRadius: 4, padding: "1px 6px" }}>{r.riskState}</span>}</td>
                <td style={{ ...cell, color: C.textSec }}>${Number(r.price || 0).toFixed(2)}</td>
                <td style={{ ...cell, color: (r.rsRating || 0) >= 70 ? C.green : C.textSec }}>{r.rsRating ?? "—"}</td>
                <td style={{ ...cell, color: C.textSec }}>{r.passCount ?? "?"}/8</td>
                <td style={{ ...cell, fontSize: 11, color: (r.stage || "").includes("2") ? C.green : (r.stage || "").includes("4") ? C.red : C.textDim }}>{(r.stage || "").replace(/ —.*/, "").slice(0, 18) || "—"}</td>
                <td style={cell}>
                  {r.smc && (() => {
                    const bull = r.smc.bos?.type === "BULL_BOS";
                    const bear = r.smc.bos?.type === "BEAR_BOS";
                    const tip = [
                      r.smc.bos?.label, r.smc.choch?.label,
                      r.smc.nearestOB ? `Nearest ${r.smc.nearestOB.type === "BULL_OB" ? "bullish" : "bearish"} order block ~$${r.smc.nearestOB.mid}` : null,
                      r.smc.openFVGCount ? `${r.smc.openFVGCount} open fair value gap${r.smc.openFVGCount === 1 ? "" : "s"}` : null,
                      r.smc.nearestLiquidity ? `Nearest liquidity: ${r.smc.nearestLiquidity.label} @ $${r.smc.nearestLiquidity.price}` : null,
                    ].filter(Boolean).join(" · ") || "No real SMC signal right now";
                    return (
                      <span title={tip} style={{ fontSize: 10, fontWeight: 900, cursor: "help", color: bull ? C.green : bear ? C.red : C.textDim, border: `1px solid ${bull ? C.green : bear ? C.red : C.border}`, borderRadius: 4, padding: "1px 6px" }}>
                        {bull ? "BOS ▲" : bear ? "BOS ▼" : "—"}
                      </span>
                    );
                  })()}
                </td>
                <td style={cell}>{r.next && <span title={r.next.reason} style={{ fontSize: 11, fontWeight: 900, color: r.next.color, border: `1px solid ${r.next.color}`, borderRadius: 4, padding: "1px 6px", cursor: "help" }}>{r.next.action}</span>}</td>
                <td style={{ ...cell, fontSize: 11, color: C.textSec }}>{r.entry ? `$${Number(r.entry).toFixed(2)} → $${Number(r.stop).toFixed(2)}` : "—"}</td>
              </tr>
              );
            })}
            {!shown.length && !loading && <tr><td colSpan="15" style={{ ...cell, textAlign: "center", color: C.textDim }}>{search.trim() ? `No symbol matching "${search.trim().toUpperCase()}" in this scan.` : "No setups meet this filter right now — lower the threshold or rescan."}</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>
        Stock Quality = Trend 20 · RS 15 · Momentum 10 · Stage 10 · Volume Trend 15 · Sector Strength 15 · Fundamental 10 · Liquidity 5.
        Trade Setup = Market Regime 20 · Entry Timing 20 · Breakout Confirmation 15 · Volume Confirmation 10 · Risk Discipline 20 · Support 10 · Volatility 5.
        Win% = real forward-return log, same score band, min {MIN_WIN_SAMPLE} observations. Pred = real deterministic ~1-week direction/target off this same scan (Stage/RS/volume), not a paid AI call — hover for why. Analysis only — execute manually.
      </div>
      {explain && <AiScoreExplainer C={C} MONO={MONO} SANS={SANS} symbol={explain.symbol} aplus={explain.aplus} dimensions={explain.dimensions} label={explain.label} onClose={() => setExplain(null)} />}
      </>
      )}
    </div>
  );
}
