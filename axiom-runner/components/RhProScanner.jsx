import { useState, useEffect } from "react";
import { RH_UNIVERSE, rhScore, rhScreenProgressive } from "./rhpro-shared.jsx";
import { computeRegime, computeAPlusScore, computeNextAction } from "./market-helpers.js";
import GapScanner from "./GapScanner.jsx";
import DayTradeTab from "./DayTradeTab.jsx";

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
  { id: "avoid", label: "🚫 Avoid List" },
  { id: "gap", label: "⚡ Gap Up/Down" },
  { id: "daytrade", label: "⏱ Day Trade" },
];

export default function RhProScanner({ C, MONO, SANS, macroData, setActiveTab }) {
  const regime = computeRegime(macroData);
  const planTrade = (sym) => { try { localStorage.setItem("tradeplanner_load_sym", sym); } catch {} setActiveTab && setActiveTab("tradeplanner"); };
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(""); const [filter, setFilter] = useState(60); const [ranAt, setRanAt] = useState(null);
  const [category, setCategory] = useState("all");
  const scan = () => {
    setLoading(true); setErr(""); setRows([]);
    let all = [];
    rhScreenProgressive(RH_UNIVERSE,
      (part) => {
        all = [...all, ...part.map(x => ({ ...x, score: rhScore(x), aplus: computeAPlusScore(x, regime), next: computeNextAction(x) }))]
          .sort((a, b) => (b.score - a.score) || ((b.rsRating || 0) - (a.rsRating || 0)));
        setRows(all); setRanAt(new Date());   // render as batches arrive
      },
      () => { setLoading(false); if (!all.length) setErr("No data returned — try RESCAN in a moment."); }
    );
  };
  useEffect(() => { scan(); }, []);

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
  } else if (category === "avoid") {
    categorized = [...rows].filter(r => r.aplus).sort((a, b) => (a.aplus.score || 0) - (b.aplus.score || 0)).slice(0, 10);
    categoryNote = "The real bottom of this scan by A+ Score — same pattern as Dashboard's Stocks to Avoid card.";
  }
  const shown = category === "all" ? categorized.filter(r => filter === "buy" ? r.atBuyPoint : r.score >= filter) : categorized;

  const scoreCol = s => s >= 80 ? C.green : s >= 65 ? "#5ab552" : s >= 50 ? C.amber : C.textDim;
  const cell = { fontFamily: MONO, fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const th = { fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", padding: "6px 10px", textAlign: "left", position: "sticky", top: 0, background: C.card };

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>🎯 AI SNIPER SCANNER</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>{RH_UNIVERSE.length} stocks · ranked 0–100 · {ranAt ? `scanned ${ranAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
        <button onClick={scan} disabled={loading} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none", color: "#fff", background: loading ? C.textDim : C.accent, cursor: loading ? "default" : "pointer" }}>{loading ? "⏳ scanning…" : "↻ RESCAN"}</button>
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
            {["#", "SYMBOL", "AI SCORE", "A+ SCORE", "CONFIDENCE", "RISK", "PRICE", "RS", "TREND (8pt)", "STAGE", "SMC", "ACTION", "ENTRY → STOP"].map(h => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.symbol} style={{ background: i % 2 ? "transparent" : `${C.surface}55` }}>
                <td style={{ ...cell, color: C.textDim }}>{i + 1}</td>
                <td style={{ ...cell, fontWeight: 900, color: C.text }}>
                  {r.symbol}
                  <button onClick={() => planTrade(r.symbol)} title={`Plan this trade — opens Trade Planner with ${r.symbol} loaded`}
                    style={{ marginLeft: 6, fontSize: 10, border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent, borderRadius: 4, padding: "1px 5px", cursor: "pointer" }}>🎯 plan</button>
                </td>
                <td style={cell}><span style={{ fontWeight: 900, color: scoreCol(r.score) }}>{r.score}</span>{r.atBuyPoint && <span style={{ marginLeft: 6, fontSize: 10, color: C.green }}>🎯</span>}</td>
                <td style={cell}>{r.aplus && <span title={r.aplus.reasons.join(" · ")} style={{ fontWeight: 900, color: "#fff", background: r.aplus.score >= 80 ? "#0d9465" : r.aplus.score >= 60 ? "#d6a312" : "#c8282a", borderRadius: 4, padding: "1px 7px", cursor: "help" }}>{r.aplus.score}</span>}</td>
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
            ))}
            {!shown.length && !loading && <tr><td colSpan="13" style={{ ...cell, textAlign: "center", color: C.textDim }}>No setups meet this filter right now — lower the threshold or rescan.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>Score = Trend Template 50% · Relative Strength 25% · buy-zone timing 15% · volume 10%. Analysis only — execute manually.</div>
      </>
      )}
    </div>
  );
}
