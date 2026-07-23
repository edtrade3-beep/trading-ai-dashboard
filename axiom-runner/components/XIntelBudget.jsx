import { useState, useEffect } from "react";
import { cardStyle } from "./ui-helpers.js";

// BUDGET — two separate real budget lines. (1) Anthropic API spend,
// whole-account, for every AI feature EXCEPT X Intelligence Engine now
// (Command Center, Advisor AI, CEO AI, AI Coach, etc.) — from
// src/anthropic-usage-store.js, built from real usage.{input_tokens,
// output_tokens} Anthropic returns on every real API response. (2) Real
// X.com API spend, X-Intelligence-only, from src/x-api-usage-store.js,
// built from real post-read counts on every real X API response.
// Anthropic was fully removed from X Intelligence Engine per explicit
// user direction (2026-07) — it no longer contributes to line (1) at all,
// and gets its own separate $25/month cap in line (2) instead. Nothing on
// this page is estimated or simulated.
const MODE_COLOR = { normal: "#0d9465", saver: "#d97706" };

function Metric({ label, value, sub, color, C, MONO }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{sub}</div>}
    </div>
  );
}

export default function XIntelBudget({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [xApiData, setXApiData] = useState(null);

  useEffect(() => {
    fetch("/api/x-intel/budget").then((r) => r.json()).then((d) => {
      if (d.ok) { setData(d); setState("ok"); } else setState("error");
    }).catch(() => setState("error"));
    fetch("/api/x-intel/x-api-budget").then((r) => r.json()).then((d) => { if (d.ok) setXApiData(d); }).catch(() => {});
  }, []);

  if (state === "loading") return <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Loading…</div>;
  if (!data) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Could not load budget data.</div>;

  const pctUsed = Math.min(100, (data.month.costUSD / data.budgetUSD) * 100);
  const projPct = Math.min(150, (data.projection / data.budgetUSD) * 100);
  const modeColor = MODE_COLOR[data.mode.mode] || C.textDim;
  const overBudget = data.projection > data.budgetUSD;

  const xPctUsed = xApiData ? Math.min(100, (xApiData.month.costUSD / xApiData.budgetUSD) * 100) : 0;
  const xOverBudget = xApiData ? xApiData.projection > xApiData.budgetUSD : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, background: `${C.textDim}0a`, borderRadius: 8, padding: "8px 12px" }}>
        Real Anthropic API spend, whole-account, for every AI feature EXCEPT X Intelligence Engine (see the separate X API card below — Anthropic was fully removed from X Intel per explicit user direction). Every number below comes from real token/search counts on real API responses, logged the moment each call completes.
      </div>

      {/* Mode banner */}
      <div style={{ background: `${modeColor}0e`, border: `1px solid ${modeColor}55`, borderLeft: `4px solid ${modeColor}`, borderRadius: 4, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em" }}>MODE</span>
          <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color: modeColor, letterSpacing: "0.03em" }}>
            {data.mode.mode === "saver" ? "⚠ CREDIT SAVER" : "✓ NORMAL"}
          </span>
        </div>
        {data.mode.reason && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, marginTop: 6 }}>{data.mode.reason}</div>}
        {data.mode.mode === "saver" && (
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 8 }}>
            Real reductions active: Command Center maxSearches 3→2 · Advisor AI maxSearches 4→2. X Intelligence Engine no longer spends Anthropic budget at all — see the separate X API card below for its real, independent budget. Free RSS feeds and real-time alerts unaffected.
          </div>
        )}
      </div>

      {/* Data strip */}
      <div style={{ ...cardStyle(C, { background: C.card }), borderRadius: 4, padding: "16px 18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 18 }}>
          <Metric label="TODAY" value={`$${data.today.costUSD.toFixed(3)}`} sub={`${data.today.callCount} call${data.today.callCount === 1 ? "" : "s"}`} color={C.text} C={C} MONO={MONO} />
          <Metric label="THIS MONTH" value={`$${data.month.costUSD.toFixed(2)}`} sub={`${data.month.callCount} calls`} color={pctUsed >= 90 ? C.red : pctUsed >= 50 ? C.amber : C.green} C={C} MONO={MONO} />
          <Metric label="REMAINING" value={`$${data.remaining.toFixed(2)}`} sub={`of $${data.budgetUSD}`} color={data.remaining <= 0 ? C.red : C.text} C={C} MONO={MONO} />
          <Metric label="MONTH-END PROJECTION" value={`$${data.projection.toFixed(2)}`} sub={overBudget ? "over budget" : "on track"} color={overBudget ? C.red : C.green} C={C} MONO={MONO} />
          <Metric label="AVG DAILY SPEND" value={`$${data.avgDaily.toFixed(3)}`} sub="this month" color={C.text} C={C} MONO={MONO} />
        </div>

        {/* Real progress bars */}
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginBottom: 3 }}>MONTH-TO-DATE ({pctUsed.toFixed(1)}%)</div>
            <div style={{ height: 8, borderRadius: 4, background: C.surface, overflow: "hidden" }}>
              <div style={{ width: `${pctUsed}%`, height: "100%", background: pctUsed >= 90 ? C.red : pctUsed >= 50 ? C.amber : C.green }} />
            </div>
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginBottom: 3 }}>PROJECTED ({projPct.toFixed(1)}% of budget)</div>
            <div style={{ height: 8, borderRadius: 4, background: C.surface, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, projPct)}%`, height: "100%", background: overBudget ? C.red : C.green }} />
            </div>
          </div>
        </div>
      </div>

      {/* Cost by feature */}
      <div style={{ ...cardStyle(C, { background: C.card }), borderRadius: 4, padding: "14px 18px" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.text, letterSpacing: "0.06em", marginBottom: 10 }}>COST BY FEATURE — THIS MONTH</div>
        {data.byFeature.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 11.5 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ textAlign: "left", padding: "4px 8px", color: C.textDim, fontWeight: 700 }}>FEATURE</th>
                  <th style={{ textAlign: "right", padding: "4px 8px", color: C.textDim, fontWeight: 700 }}>CALLS</th>
                  <th style={{ textAlign: "right", padding: "4px 8px", color: C.textDim, fontWeight: 700 }}>COST</th>
                </tr>
              </thead>
              <tbody>
                {data.byFeature.map((f, i) => (
                  <tr key={f.feature} style={{ borderBottom: i < data.byFeature.length - 1 ? `1px solid ${C.border}66` : "none" }}>
                    <td style={{ padding: "6px 8px", color: C.text, fontWeight: 700 }}>{f.feature}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: C.textSec, fontVariantNumeric: "tabular-nums" }}>{f.callCount}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: C.text, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>${f.costUSD.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.textDim }}>No real usage logged yet this month — this populates automatically the next time any AI feature in the app makes a real call.</div>
        )}
      </div>

      {/* Warning thresholds */}
      <div style={{ ...cardStyle(C, { background: C.card }), borderRadius: 4, padding: "14px 18px" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.text, letterSpacing: "0.06em", marginBottom: 10 }}>WARNING THRESHOLDS</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.thresholds.map((t) => {
            const crossed = pctUsed >= t;
            return (
              <span key={t} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 6,
                background: crossed ? `${C.red}18` : `${C.textDim}10`, border: `1px solid ${crossed ? C.red : C.border}`,
                color: crossed ? C.red : C.textDim }}>
                {t}% {crossed ? "✓ crossed" : ""}
              </span>
            );
          })}
        </div>
      </div>

      {/* Real X API budget — separate line, X-Intelligence-only */}
      <div style={{ ...cardStyle(C, { background: C.card }), borderRadius: 4, padding: "16px 18px", borderLeft: `4px solid #1d9bf0` }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.text, letterSpacing: "0.06em", marginBottom: 4 }}>🐦 X API BUDGET — X INTELLIGENCE ENGINE ONLY</div>
        {!xApiData ? (
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.textDim, marginTop: 8 }}>Loading…</div>
        ) : (
          <>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 12 }}>
              ${xApiData.costPerRead}/real post read, X's real published pay-per-use rate. A separate $25/month cap from the Anthropic budget above.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 18 }}>
              <Metric label="THIS MONTH" value={`$${xApiData.month.costUSD.toFixed(2)}`} sub={`${xApiData.month.reads} reads`} color={xPctUsed >= 90 ? C.red : xPctUsed >= 50 ? C.amber : C.green} C={C} MONO={MONO} />
              <Metric label="REMAINING" value={`$${xApiData.remaining.toFixed(2)}`} sub={`${xApiData.remainingReads} reads left`} color={xApiData.remaining <= 0 ? C.red : C.text} C={C} MONO={MONO} />
              <Metric label="MONTH-END PROJECTION" value={`$${xApiData.projection.toFixed(2)}`} sub={xOverBudget ? "over budget" : "on track"} color={xOverBudget ? C.red : C.green} C={C} MONO={MONO} />
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginBottom: 3 }}>MONTH-TO-DATE ({xPctUsed.toFixed(1)}%)</div>
              <div style={{ height: 8, borderRadius: 4, background: C.surface, overflow: "hidden" }}>
                <div style={{ width: `${xPctUsed}%`, height: "100%", background: xPctUsed >= 90 ? C.red : xPctUsed >= 50 ? C.amber : "#1d9bf0" }} />
              </div>
            </div>
            {xApiData.remainingReads <= 0 && (
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.red, marginTop: 10 }}>Real monthly X API read budget exhausted — X Intel scans are paused until next month.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
