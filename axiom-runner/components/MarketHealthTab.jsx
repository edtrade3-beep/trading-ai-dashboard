import { useState, useEffect } from "react";
import { cardStyle, buttonChrome } from "./ui-helpers.js";

// MARKET HEALTH — Chief Market Strategist / Risk Officer scope. All real,
// free, zero-AI-cost data: breadth (% of sectors above 50/200-day MA),
// Fear & Greed composite, distribution-day risk score, a deterministic
// Divergence Engine, a transparent Risk-Flag count, and a composite Risk
// Stance verdict — see src/command-center-ai.js's buildDivergenceFlags/
// buildRiskFlags/computeRiskStance for the real rule-based logic. Reads
// the same persisted Command Center brief this data already lives in
// (GET /api/command-center) and the same refresh endpoint (POST
// /api/command-center/refresh) — no new backend, no new AI call.
//
// Styled as a real risk-desk readout, not a dashboard widget grid: one
// headline verdict, a dense data strip, and a real flag table always
// visible — an institutional risk memo doesn't hide its own evidence
// behind a "show detail" click.

const STANCE_COLOR = { "RISK-OFF": "#c8282a", DEFENSIVE: "#d97706", NEUTRAL: "#94a3b8", "RISK-ON": "#0d9465" };
const SEVERITY_COLOR = { major: "#c8282a", moderate: "#d97706", minor: "#94a3b8" };

function Metric({ label, value, sub, color, C, MONO }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{sub}</div>
    </div>
  );
}

export default function MarketHealthTab({ C, MONO, SANS }) {
  const [brief, setBrief] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | empty | error
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    fetch("/api/command-center").then((r) => r.json()).then((d) => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); } else setState("empty");
    }).catch(() => setState("error"));
  };
  useEffect(load, []);

  const refresh = () => {
    setRefreshing(true); setError(null);
    fetch("/api/command-center/refresh", { method: "POST" }).then((r) => r.json()).then((d) => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else { setError(d?.error || "Unknown error"); setState("error"); }
    }).catch((e) => { setError(e.message || "Network error"); setState("error"); }).finally(() => setRefreshing(false));
  };

  const { breadth, sentiment, distributionRisk, divergenceFlags, riskFlags, riskStance, regimeShift, notCoveredFreeData, regime, generatedAt } = brief || {};
  const stanceColor = riskStance ? (STANCE_COLOR[riskStance.label] || C.textDim) : C.textDim;
  const shiftColor = regimeShift?.justShifted ? (SEVERITY_COLOR[regimeShift.severity] || C.textDim) : null;

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 900, color: C.text, letterSpacing: "0.02em" }}>MARKET HEALTH</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 2 }}>
            REAL DATA · ZERO AI COST · {generatedAt ? `AS OF ${new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "NOT YET GENERATED"}
          </div>
        </div>
        <button onClick={refresh} disabled={refreshing} style={buttonChrome(C, { padding: "9px 18px", fontSize: 12, fontWeight: 800, borderRadius: 4, background: refreshing ? C.surface : C.gold, color: refreshing ? C.textDim : "#fff", border: "none" })}>
          {refreshing ? "REFRESHING…" : "↻ REFRESH"}
        </button>
      </div>

      {state === "loading" && !brief && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: 30 }}>Loading…</div>}
      {state === "empty" && !brief && (
        <div style={{ ...cardStyle(C, { background: C.card }), borderRadius: 4, padding: 40, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.text, fontWeight: 700, marginBottom: 6 }}>No data yet — click Refresh</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Requires a real Advisor AI brief to exist first — generate one on the Advisor AI tab if this comes back empty.</div>
        </div>
      )}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {error}</div>}

      {brief && (
        <>
          {/* Regime-shift alert — real persistence tracker over the actual
              history store (command-center-history-store.js), grouped by
              real calendar day. Fires only on a genuine end-of-day flip,
              never on intraday noise, and scales its intensity by how long
              the prior regime really ran (a shift after 3 days reads very
              differently from one after 60+). Leads the page when present
              — it's the single most important real fact on hand. */}
          {regimeShift?.justShifted && (
            <div style={{ background: `${shiftColor}12`, border: `1px solid ${shiftColor}66`, borderLeft: `4px solid ${shiftColor}`, borderRadius: 4, padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: shiftColor, letterSpacing: "0.08em" }}>
                  ⚠ REGIME SHIFT — {regimeShift.severity?.toUpperCase()}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>
                  {regimeShift.priorRegime} → {regime?.label}
                </span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textSec, marginTop: 4 }}>
                Prior regime ({regimeShift.priorRegime}) held for <b style={{ color: C.text }}>{regimeShift.priorRegimeDays} consecutive real day{regimeShift.priorRegimeDays === 1 ? "" : "s"}</b> before today's flip — from {regimeShift.historyDepthDays} real tracked days of history.
              </div>
            </div>
          )}

          {/* Headline verdict — the single line a real risk memo opens
              with. Real formula shown beneath, not an AI opinion. */}
          {riskStance && (
            <div style={{ background: `${stanceColor}0e`, border: `1px solid ${stanceColor}55`, borderLeft: `4px solid ${stanceColor}`, borderRadius: 4, padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em" }}>RISK STANCE</span>
                  <span style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: stanceColor, letterSpacing: "0.03em" }}>{riskStance.label}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {regime && (
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 4,
                      background: `${regime.label === "GREEN" ? C.green : regime.label === "YELLOW" ? C.amber : C.red}18`,
                      border: `1px solid ${regime.label === "GREEN" ? C.green : regime.label === "YELLOW" ? C.amber : C.red}44`,
                      color: regime.label === "GREEN" ? C.green : regime.label === "YELLOW" ? C.amber : C.red }}>
                      REGIME {regime.label} {regime.score}/100
                    </span>
                  )}
                  {regime?.detail?.volRegime && (
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 4, background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}>
                      VIX {regime.detail.volRegime.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 8 }}>
                {riskStance.inputs.map((i, idx) => (
                  <span key={i.label}>{idx > 0 ? "  +  " : ""}{i.label} <b style={{ color: C.text }}>{i.value}</b> ({i.weight})</span>
                ))}
                <span> = <b style={{ color: stanceColor }}>{riskStance.score}</b></span>
              </div>
            </div>
          )}

          {/* Dense data strip — 4 real metrics, no card padding to spare,
              a real risk-desk readout not a widget grid. */}
          <div style={{ ...cardStyle(C, { background: C.card }), borderRadius: 4, padding: "16px 18px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 18 }}>
              {breadth && (
                <Metric label="BREADTH" value={`${breadth.above50Pct}%`} sub={`above 50d MA · A/D ${breadth.adRatio}`}
                  color={breadth.above50Pct >= 50 ? C.green : C.red} C={C} MONO={MONO} />
              )}
              {sentiment && (
                <Metric label="FEAR &amp; GREED" value={sentiment.score} sub={sentiment.label}
                  color={sentiment.score >= 75 ? C.green : sentiment.score <= 25 ? C.red : C.amber} C={C} MONO={MONO} />
              )}
              {distributionRisk && (
                <Metric label="DISTRIBUTION RISK" value={distributionRisk.riskScore} sub={distributionRisk.alert}
                  color={distributionRisk.riskScore >= 70 ? C.red : distributionRisk.riskScore >= 40 ? C.amber : C.green} C={C} MONO={MONO} />
              )}
              {riskFlags && (
                <Metric label="RISK FLAGS" value={`${riskFlags.triggeredCount}/${riskFlags.total}`} sub="triggered"
                  color={riskFlags.triggeredCount >= 4 ? C.red : riskFlags.triggeredCount >= 2 ? C.amber : C.green} C={C} MONO={MONO} />
              )}
              {regimeShift && (
                <Metric label="REGIME AGE" value={`${regimeShift.daysInCurrentRegime}d`}
                  sub={regimeShift.justShifted ? `just flipped from ${regimeShift.priorRegime}` : `real days in ${regime?.label || "current regime"}`}
                  color={regimeShift.justShifted ? shiftColor : C.textSec} C={C} MONO={MONO} />
              )}
            </div>
          </div>

          {/* Divergence flags — treated as alert rows, not soft chips. */}
          <div style={{ ...cardStyle(C, { background: C.card }), borderRadius: 4, padding: "14px 18px" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.text, letterSpacing: "0.06em", marginBottom: 10 }}>DIVERGENCE ENGINE</div>
            {divergenceFlags?.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {divergenceFlags.map((d, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", background: `${C.amber}0c`, borderLeft: `3px solid ${C.amber}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, flexShrink: 0 }}>⚠</span>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>{d.flag}</div>
                      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, marginTop: 2 }}>{d.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.textDim, padding: "4px 10px", borderLeft: `3px solid ${C.green}44` }}>No divergences — internals agree with the headline regime read.</div>
            )}
          </div>

          {/* Risk-flag scorecard — a real table, always visible. An
              institutional risk memo doesn't hide its own evidence
              behind a "show detail" click. */}
          {riskFlags?.checks?.length > 0 && (
            <div style={{ ...cardStyle(C, { background: C.card }), borderRadius: 4, padding: "14px 18px" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.text, letterSpacing: "0.06em", marginBottom: 10 }}>RISK-FLAG SCORECARD</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: C.textDim, fontWeight: 700 }}>FLAG</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: C.textDim, fontWeight: 700 }}>STATUS</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: C.textDim, fontWeight: 700 }}>REAL VALUE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riskFlags.checks.map((c, i) => (
                      <tr key={i} style={{ borderBottom: i < riskFlags.checks.length - 1 ? `1px solid ${C.border}66` : "none" }}>
                        <td style={{ padding: "6px 8px", color: C.text }}>{c.label}</td>
                        <td style={{ padding: "6px 8px", fontWeight: 800, color: c.triggered ? C.red : C.green }}>{c.triggered ? "TRIGGERED" : "CLEAR"}</td>
                        <td style={{ padding: "6px 8px", color: C.textSec, fontVariantNumeric: "tabular-nums" }}>{String(c.detail)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Data coverage footnote — honest disclosure, styled as a real
              source footnote rather than an inline info callout. */}
          {notCoveredFreeData?.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 4 }}>DATA COVERAGE — NOT AVAILABLE FREE</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, lineHeight: 1.6 }}>
                {notCoveredFreeData.map((n, i) => <div key={i}>· {n}</div>)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
