import { useState, useEffect } from "react";
import { cardStyle, buttonChrome } from "./ui-helpers.js";

// MARKET HEALTH — Chief Market Strategist / Risk Officer scope, moved out
// of Command Center into its own tab. All real, free, zero-AI-cost data:
// breadth (% of sectors above 50/200-day MA), Fear & Greed composite,
// distribution-day risk score, a deterministic Divergence Engine, and a
// transparent Risk-Flag count — see src/command-center-ai.js's
// buildDivergenceFlags/buildRiskFlags for the real rule-based logic.
// Reads the same persisted Command Center brief this data already lives
// in (GET /api/command-center) and the same refresh endpoint (POST
// /api/command-center/refresh) — no new backend, no new AI call.
function SectionLabel({ icon, text, color, C, MONO }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color, letterSpacing: "0.05em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
      <span>{icon}</span><span>{text}</span>
    </div>
  );
}

export default function MarketHealthTab({ C, MONO, SANS }) {
  const [brief, setBrief] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | empty | error
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

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

  const { breadth, sentiment, distributionRisk, divergenceFlags, riskFlags, notCoveredFreeData, regime } = brief || {};

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 900, color: C.text }}>🩺 MARKET HEALTH</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            Real breadth, sentiment, distribution risk, and divergence checks — free data, zero AI cost, updates whenever Command Center refreshes
          </div>
        </div>
        <button onClick={refresh} disabled={refreshing} style={buttonChrome(C, { padding: "9px 18px", fontSize: 12, fontWeight: 800, background: refreshing ? C.surface : C.gold, color: refreshing ? C.textDim : "#fff", border: "none" })}>
          {refreshing ? "REFRESHING…" : "↻ REFRESH"}
        </button>
      </div>

      {state === "loading" && !brief && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: 30 }}>Loading…</div>}
      {state === "empty" && !brief && (
        <div style={{ ...cardStyle(C, { background: C.card }), padding: 40, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.text, fontWeight: 700, marginBottom: 6 }}>No data yet — click Refresh</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Requires a real Advisor AI brief to exist first — generate one on the Advisor AI tab if this comes back empty.</div>
        </div>
      )}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {error}</div>}

      {brief && (
        <>
          {regime && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "6px 12px", borderRadius: 8,
                background: `${regime.label === "GREEN" ? C.green : regime.label === "YELLOW" ? C.amber : C.red}18`,
                border: `1px solid ${regime.label === "GREEN" ? C.green : regime.label === "YELLOW" ? C.amber : C.red}44`,
                color: regime.label === "GREEN" ? C.green : regime.label === "YELLOW" ? C.amber : C.red }}>
                {regime.label} ({regime.score}/100)
              </span>
              {regime.detail?.volRegime && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "6px 12px" }}>VIX regime: {regime.detail.volRegime}</span>}
            </div>
          )}

          <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
              {breadth && (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>BREADTH</div>
                  <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: breadth.above50Pct >= 50 ? C.green : C.red }}>{breadth.above50Pct}%</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>above 50-day MA · A/D {breadth.adRatio}</div>
                </div>
              )}
              {sentiment && (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>FEAR &amp; GREED</div>
                  <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: sentiment.score >= 75 ? C.green : sentiment.score <= 25 ? C.red : C.amber }}>{sentiment.score}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{sentiment.label}</div>
                </div>
              )}
              {distributionRisk && (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>DISTRIBUTION RISK</div>
                  <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: distributionRisk.riskScore >= 70 ? C.red : distributionRisk.riskScore >= 40 ? C.amber : C.green }}>{distributionRisk.riskScore}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{distributionRisk.alert}</div>
                </div>
              )}
              {riskFlags && (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>RISK FLAGS</div>
                  <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: riskFlags.triggeredCount >= 4 ? C.red : riskFlags.triggeredCount >= 2 ? C.amber : C.green }}>{riskFlags.triggeredCount}/{riskFlags.total}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>triggered</div>
                </div>
              )}
            </div>

            {divergenceFlags?.length > 0 && (
              <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <SectionLabel icon="⚠" text="DIVERGENCE FLAGS" color={C.amber} C={C} MONO={MONO} />
                {divergenceFlags.map((d, i) => (
                  <div key={i} style={{ fontFamily: SANS, fontSize: 12, color: C.text, background: `${C.amber}0c`, border: `1px solid ${C.amber}33`, borderRadius: 6, padding: "6px 10px" }}>
                    <b>{d.flag}</b> — {d.detail}
                  </div>
                ))}
              </div>
            )}
            {(!divergenceFlags || divergenceFlags.length === 0) && (
              <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.textDim, marginBottom: 10 }}>No divergences detected — internals agree with the headline regime read.</div>
            )}

            {riskFlags?.checks?.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginBottom: 8 }}>
                <button onClick={() => setShowDetail((v) => !v)}
                  style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  {showDetail ? "▾ HIDE RISK-FLAG DETAIL" : "▸ SHOW RISK-FLAG DETAIL"}
                </button>
                {showDetail && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {riskFlags.checks.map((c, i) => (
                      <span key={i} style={{ fontFamily: MONO, fontSize: 10.5, color: c.triggered ? C.red : C.textDim, background: C.surface, border: `1px solid ${c.triggered ? C.red : C.border}44`, borderRadius: 6, padding: "4px 8px" }}>
                        {c.triggered ? "🔴" : "⚪"} {c.label}: {String(c.detail)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {notCoveredFreeData?.length > 0 && (
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, background: `${C.textDim}0a`, borderRadius: 6, padding: "8px 10px" }}>
                ℹ️ Not available from free data: {notCoveredFreeData.join(" · ")}
              </div>
            )}
          </div>

          {!breadth && !sentiment && !distributionRisk && !riskFlags && (
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: 30 }}>
              No market-health data in the current Command Center brief yet — click Refresh to generate one.
            </div>
          )}
        </>
      )}
    </div>
  );
}
