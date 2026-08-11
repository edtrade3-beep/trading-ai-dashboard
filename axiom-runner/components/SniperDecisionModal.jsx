import { useState } from "react";
import { computeSniperDecision } from "./sniper-decision.js";
import { classifyEntryType } from "./market-helpers.js";
import { FundamentalsPanel, OptionsFlowPanel } from "./terminal-panels.jsx";

// AI Sniper "Deep Scan" screen — rebuilt per explicit user spec (2026-08-11,
// "SIMPLE VERSION... Don't make the dashboard show more information. Make
// it make the decision easier"). The whole system, in the user's own
// words: "100 stocks → Top 10 → Pick 3 → Deep Scan → BUY / WAIT / AVOID."
// This screen IS the Deep Scan step. It answers exactly 4 questions
// (Trend / Setup / Market / Volume), then gives exactly one of 3 verdicts
// (BUY / WAIT / AVOID) — if BUY, Entry/Stop/Target/R:R.
//
// Underneath, the real 4-state decision engine (ENTER_LONG/WAIT/NO_CHASE/
// AVOID, sniper-decision.js) is UNCHANGED — Telegram alerts and everything
// else still use those real states. This screen only simplifies the
// DISPLAY: NO_CHASE ("good stock, wrong moment, wait for a pullback")
// reads to a trader as "not yet," the same as an unconfirmed trigger, so
// both collapse to WAIT here — the reason text still says exactly why.
//
// Everything else this screen used to always show (confidence/score, the
// Quality-vs-Timing clarifier, the WHY-reasons chip list, the Early
// Reversal Watch banner, a second target) moved out of the always-visible
// view per "ignore the other data unless you click Deep Scan" — reversal
// risk is still the real reason a WAIT/AVOID reason text says what it
// says, it just isn't a separate always-on banner anymore. The 6-tab
// breakdown (Technical/Minervini/Fundamental/Market·Sector/Options·Flow/
// Risk) stays available one more click down for anyone who wants it.
export default function SniperDecisionModal({ C, MONO, SANS, row, regime, sectorInfo, onClose, onOpenPlan }) {
  const [showDeep, setShowDeep] = useState(false);
  const [deepTab, setDeepTab] = useState("technical");
  if (!row) return null;
  const d = computeSniperDecision(row);

  const chgPct = Number(row.dayChangePct ?? row.chgPct);
  const chgKnown = Number.isFinite(chgPct);

  const riskAmt = (d.entry != null && d.stop != null) ? Math.abs(d.entry - d.stop) : null;
  const rewardAmt = (d.entry != null && d.target2 != null) ? Math.abs(d.target2 - d.entry) : null;
  const riskFrac = (riskAmt != null && rewardAmt != null && riskAmt + rewardAmt > 0) ? riskAmt / (riskAmt + rewardAmt) : 0.35;

  // 3-state verdict for display only — see file header.
  const simple = d.action === "ENTER_LONG" ? { label: "BUY", color: "#0d9465", icon: "🟢" }
    : d.action === "AVOID" ? { label: "AVOID", color: "#c8282a", icon: "🔴" }
    : { label: "WAIT", color: "#d6a312", icon: "🟡" };

  // The 4 questions. Setup reuses the app's real classifyEntryType
  // (market-helpers.js, same function Scanner's STRATEGY column uses),
  // collapsed from its 5 real types down to the user's 3 requested buckets
  // — Ideal/Breakout/Early Entry all read as "the breakout family" (at,
  // just past, or coiled right at the pivot); Trend Entry (RS≥80 in a
  // confirmed Stage 2 uptrend) is buying established strength, i.e.
  // Momentum; Pullback Entry maps directly.
  const trendGood = d.gates.trendBullish;
  const entryType = classifyEntryType(row, row.aplus?.score);
  const setupWord = !entryType ? "—"
    : /Trend/.test(entryType.type) ? "Momentum"
    : /Pullback/.test(entryType.type) ? "Pullback"
    : "Breakout";
  const marketGood = regime ? regime.score >= 55 : null; // same YELLOW/GREEN vs ORANGE/RED split computeRegime already uses
  const volumeGood = d.gates.volumeConfirmed;

  const qCard = (label, good, value) => (
    <div style={{ flex: "1 1 130px", minWidth: 110, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 10px", textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: good == null ? C.textDim : good ? "#0d9465" : "#c8282a" }}>{value}</div>
    </div>
  );

  const numBox = (label, value, color) => (
    <div style={{ flex: "1 1 100px", minWidth: 90 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>{value != null ? `$${value.toFixed(2)}` : "—"}</div>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.6)", zIndex: 10600, display: "grid", placeItems: "center", padding: 16, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto",
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 28px 70px rgba(15,27,45,0.35)", padding: 20 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em" }}>⊕ AI SNIPER · DEEP SCAN</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 3 }}>
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color: C.text }}>{row.symbol}</span>
              {row.longName && <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{row.longName}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
              <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: C.text }}>${Number(row.price).toFixed(2)}</span>
              {chgKnown && <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: chgPct >= 0 ? C.green : C.red }}>{chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: C.textDim, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Step 2 — CHECK: the 4 questions only */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {qCard("TREND", trendGood, trendGood ? "Good" : "Bad")}
          {qCard("SETUP", entryType ? true : null, setupWord)}
          {qCard("MARKET", marketGood, marketGood == null ? "—" : marketGood ? "Good" : "Bad")}
          {qCard("VOLUME", volumeGood, volumeGood ? "Good" : "Bad")}
        </div>

        {/* Step 3 — TRADE: one verdict, plain and simple */}
        <div style={{ background: `${simple.color}12`, border: `1px solid ${simple.color}55`, borderRadius: 12, padding: "18px", marginBottom: 14, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 32, fontWeight: 900, color: simple.color, lineHeight: 1.1 }}>{simple.icon} {simple.label}</div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, marginTop: 8, lineHeight: 1.5 }}>{d.reason}</div>
        </div>

        {simple.label === "BUY" ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: riskAmt != null ? 10 : 0 }}>
              {numBox("ENTRY", d.entry, C.text)}
              {numBox("STOP", d.stop, "#c8282a")}
              {numBox("TARGET", d.target2, "#0d9465")}
              <div style={{ flex: "1 1 100px", minWidth: 90 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 3 }}>R:R</div>
                <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 900, color: C.text }}>{d.rr != null ? `${d.rr.toFixed(1)} : 1` : "—"}</div>
              </div>
            </div>
            {riskAmt != null && rewardAmt != null && (
              <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${riskFrac * 100}%`, background: "#c8282a" }} />
                <div style={{ width: `${(1 - riskFrac) * 100}%`, background: "#0d9465" }} />
              </div>
            )}
          </div>
        ) : (
          d.waitingFor && (
            <div style={{ background: `${simple.color}10`, border: `1px solid ${simple.color}44`, borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontFamily: SANS, fontSize: 12.5, color: C.text, textAlign: "center", fontWeight: 700 }}>
              WAITING FOR: {d.waitingFor}
            </div>
          )
        )}

        {onOpenPlan && (
          <button onClick={() => onOpenPlan(row.symbol)} style={{ width: "100%", fontFamily: MONO, fontSize: 12.5, fontWeight: 800, padding: "10px 0", borderRadius: 8, border: "none", color: "#fff", background: C.accent, cursor: "pointer", marginBottom: 12 }}>
            Open Full Chart + Trade Plan →
          </button>
        )}

        {/* One more click down — everything this screen used to always
            show (WHY reasons, reversal detail, technicals, fundamentals,
            options flow) lives here, still fully real, just not in the way
            of the 10-second read. */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          <button onClick={() => setShowDeep(v => !v)}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", font: "inherit", fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textSec, background: "transparent", border: "none", cursor: "pointer", padding: "4px 0" }}>
            <span>MORE DETAIL</span><span>{showDeep ? "▴" : "▾"}</span>
          </button>
          {showDeep && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
                {[
                  ["technical", "Technical"], ["minervini", "Minervini"], ["fundamental", "Fundamental"],
                  ["market", "Market/Sector"], ["options", "Options/Flow"], ["risk", "Risk"],
                ].map(([id, label]) => (
                  <button key={id} onClick={() => setDeepTab(id)}
                    style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
                      border: `1px solid ${deepTab === id ? C.accent : C.border}`, background: deepTab === id ? C.accent : "transparent", color: deepTab === id ? "#fff" : C.textSec }}>
                    {label}
                  </button>
                ))}
              </div>

              {deepTab === "technical" && (() => {
                const adx = row.technicals?.adx;
                const statRow = (label, value, color) => (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12 }}>
                    <span style={{ color: C.textDim }}>{label}</span><span style={{ fontWeight: 800, color: color || C.text }}>{value}</span>
                  </div>
                );
                return (
                  <div>
                    {statRow("ADX (trend strength)", adx ? `${adx.adx} — ${adx.strength}, ${adx.direction}` : "—", adx?.direction === "Bullish" ? "#0d9465" : adx?.direction === "Bearish" ? "#c8282a" : C.textDim)}
                    {statRow("20-day VWAP", d.vwap20 != null ? `$${d.vwap20.toFixed(2)} — price is ${d.gates.aboveVwap ? "above" : "below"}` : "—", d.gates.aboveVwap ? "#0d9465" : "#c8282a")}
                    {statRow("RSI (14)", Number.isFinite(row.rsi) ? row.rsi.toFixed(1) : "—")}
                    {statRow("52-week range", (row.lo52 != null && row.hi52 != null) ? `$${row.lo52.toFixed(2)} – $${row.hi52.toFixed(2)}` : "—")}
                    {statRow("% from 52w high", row.pctFromHigh != null ? `${row.pctFromHigh}%` : "—")}
                    {statRow("50-day MA", row.ma50 != null ? `$${Number(row.ma50).toFixed(2)}` : "—")}
                    {statRow("Volume vs 50d avg (RVOL)", row.volRatio != null ? `${row.volRatio.toFixed(2)}x` : "—", d.gates.volumeConfirmed ? "#0d9465" : C.textDim)}
                    {statRow("1-day / 1-week change", `${row.dayChangePct != null ? row.dayChangePct.toFixed(2) + "%" : "—"} / ${row.weekChangePct != null ? row.weekChangePct.toFixed(2) + "%" : "—"}`)}
                    <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: C.textDim, marginTop: 10, marginBottom: 2 }}>Why real early get-out/get-in signs show up in the WAIT/AVOID reason text above: {d.reversal && !d.reversal.isNeutral ? d.reversal.verdict + (d.reversal.sigs?.length ? " — " + d.reversal.sigs.map(s => s.txt).join(", ") : "") : "no reversal signal right now."}</div>
                  </div>
                );
              })()}

              {deepTab === "minervini" && (
                <div>
                  {Array.isArray(row.criteria) && row.criteria.length ? row.criteria.map(c => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12 }}>
                      <span style={{ color: c.pass ? "#0d9465" : "#c8282a", fontWeight: 700 }}>{c.pass ? "✓" : "✗"} {c.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, whiteSpace: "nowrap" }}>{String(c.value)}</span>
                    </div>
                  )) : <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Criteria detail unavailable — {row.passCount ?? "?"}/8 pass overall.</div>}
                  <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 10, lineHeight: 1.5 }}>Minervini determines stock quality; the Sniper engine above determines entry timing on top of it — never used as an automatic buy signal by itself.</div>
                </div>
              )}

              {deepTab === "fundamental" && (
                <div style={{ margin: "-6px" }}>
                  <FundamentalsPanel symbol={row.symbol} C={C} MONO={MONO} SANS={SANS} />
                </div>
              )}

              {deepTab === "market" && (() => {
                const statRow = (label, value, color) => (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12 }}>
                    <span style={{ color: C.textDim }}>{label}</span><span style={{ fontWeight: 800, color: color || C.text }}>{value}</span>
                  </div>
                );
                return (
                  <div>
                    {regime ? statRow("Market regime", `${regime.label} (${regime.score}/100)`, regime.color) : statRow("Market regime", "—")}
                    {sectorInfo ? statRow("Sector rank", `#${sectorInfo.rank} of ${sectorInfo.of} S&P sectors today`) : statRow("Sector rank", "—")}
                    {row.smc && statRow("Smart Money structure", [row.smc.bos?.label, row.smc.choch?.label].filter(Boolean).join(" · ") || "No real SMC signal right now", row.smc.bos?.type === "BULL_BOS" ? "#0d9465" : row.smc.bos?.type === "BEAR_BOS" ? "#c8282a" : C.textDim)}
                    <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 10, lineHeight: 1.5 }}>Market regime and sector rank are the same market-wide/sector-wide reads used across this app — not stock-specific, and not something this setup controls.</div>
                  </div>
                );
              })()}

              {deepTab === "options" && (
                <div style={{ margin: "-6px" }}>
                  <OptionsFlowPanel symbol={row.symbol} C={C} MONO={MONO} SANS={SANS} />
                </div>
              )}

              {deepTab === "risk" && (() => {
                const statRow = (label, value, color) => (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12 }}>
                    <span style={{ color: C.textDim }}>{label}</span><span style={{ fontWeight: 800, color: color || C.text }}>{value}</span>
                  </div>
                );
                const riskWord = row.riskState === "LOW" ? "Manageable" : row.riskState === "MEDIUM" ? "Moderate" : row.riskState === "HIGH" ? "Elevated" : "—";
                const riskCol = row.riskState === "LOW" ? "#0d9465" : row.riskState === "MEDIUM" ? "#d6a312" : row.riskState === "HIGH" ? "#c8282a" : C.textDim;
                return (
                  <div>
                    {statRow("Risk level", row.riskState ? `${row.riskState} (${riskWord})` : "—", riskCol)}
                    {statRow("Risk to stop", row.riskPct != null ? `${row.riskPct}%` : "—")}
                    {statRow("VCP grade", row.vcpGrade && row.vcpGrade !== "-" ? row.vcpGrade : "—")}
                    {statRow("Base tightening", row.tightening ? "Yes — each pullback shallower than the last" : "No", row.tightening ? "#0d9465" : C.textDim)}
                    {statRow("Extended above pivot", d.gates.extended ? "Yes — chasing risk" : "No", d.gates.extended ? "#c8282a" : "#0d9465")}
                    {statRow("Real early get-out signs", d.gates.reversalTopRisk ? `Yes — ${d.reversal?.verdict}` : "No", d.gates.reversalTopRisk ? "#c8282a" : "#0d9465")}
                    {statRow("Real early get-in signs", d.reversal?.isBottom ? `Yes — ${d.reversal.verdict}` : "No", d.reversal?.isBottom ? "#0d9465" : C.textDim)}
                    <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 10, lineHeight: 1.5 }}>Risk level and stop distance come from this app's real VCP risk report — not a prediction the trade fails, just how much downside exposure it carries.</div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
