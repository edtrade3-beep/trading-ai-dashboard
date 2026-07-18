import { useState, useEffect } from "react";
import { cardStyle, buttonChrome } from "./ui-helpers.js";

// ADVISOR AI — a long-horizon CIO-style research brief (src/advisor-ai.js).
// Same "real data + honest gaps" pattern as SmartMoneyBrief/CeoAiCard: one
// Claude call SELECTING symbols from a real, wide A+ scan and explaining
// why — every entry/stop/target/score shown here is re-attached
// server-side from the platform's own trend-template engine, never typed
// by the model, so a hallucinated number can never reach this screen.
// Structured JSON in, structured cards out (no prose-parsing) — rebuilt
// per user request for a clearer, more professional layout with real
// multi-pick coverage per horizon instead of one name each.

const ACTION_META = {
  BUY_NOW:         { label: "BUY NOW",         key: "gold" },
  ACCUMULATE:      { label: "ACCUMULATE",      key: "green" },
  BUY_ON_PULLBACK: { label: "BUY ON PULLBACK", key: "green" },
  WAIT:            { label: "WAIT",            key: "amber" },
  WATCH:           { label: "WATCH",           key: "accent" },
  AVOID:           { label: "AVOID",           key: "red" },
  REDUCE:          { label: "REDUCE",          key: "amber" },
  SELL:            { label: "SELL",            key: "red" },
};

const HORIZONS = [
  { key: "tactical", label: "TACTICAL", sub: "Next 30 Days", icon: "⚡" },
  { key: "swing",    label: "SWING",    sub: "Next 3 Months", icon: "📈" },
  { key: "position", label: "POSITION", sub: "Next 6 Months", icon: "🏗️" },
  { key: "core",     label: "CORE",     sub: "Next 1 Year",   icon: "🏛️" },
];

function SectionLabel({ icon, text, color, C, MONO }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color, letterSpacing: "0.05em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
      <span>{icon}</span><span>{text}</span>
    </div>
  );
}

function StatPill({ label, value, color, C, MONO }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 10px", borderRadius: 8, background: `${color}15`, border: `1px solid ${color}44`, color }}>
      {label}{label ? " " : ""}{value}
    </span>
  );
}

function PickCard({ p, C, MONO, SANS }) {
  const scoreCol = p.score >= 85 ? C.gold : p.score >= 70 ? C.green : p.score >= 55 ? C.amber : C.textDim;
  const actionCol = /BUY|AT ENTRY/i.test(p.action) ? C.green : /WATCH/i.test(p.action) ? C.accent : /WAIT/i.test(p.action) ? C.amber : C.textDim;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "11px 13px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>{p.symbol}</span>
          {p.atBuyPoint && <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 800, color: C.green, background: `${C.green}18`, borderRadius: 4, padding: "1px 5px" }}>AT BUY PT</span>}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: scoreCol }}>{p.score}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.45, marginBottom: 8 }}>{p.why}</div>
      <div style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 10.5, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ color: C.textDim }}>ENTRY <b style={{ color: C.text }}>${p.entry}</b></span>
        <span style={{ color: C.textDim }}>STOP <b style={{ color: C.red }}>${p.stop}</b></span>
        <span style={{ color: C.textDim }}>TGT <b style={{ color: C.green }}>${p.target}</b></span>
        <span style={{ color: C.textDim }}>RS <b style={{ color: C.text }}>{p.rsRating}</b></span>
      </div>
      {/* target3/breakoutEntry/pullbackEntry are computed from the real entry/stop
          above (a real 3:1 R:R extension + real pivot-derived trade-management
          levels), not a second data source — shown as a secondary, quieter row */}
      {(p.target3 != null || p.breakoutEntry != null || p.pullbackEntry != null) && (
        <div style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 9.5, flexWrap: "wrap", marginBottom: 6, color: C.textDim }}>
          {p.pullbackEntry != null && <span>PULLBACK ${p.pullbackEntry}</span>}
          {p.breakoutEntry != null && <span>BREAKOUT ${p.breakoutEntry}</span>}
          {p.target3 != null && <span>TGT3 <b style={{ color: C.green }}>${p.target3}</b></span>}
        </div>
      )}
      {/* Real fundamentals from Yahoo — null fields simply don't render, never a guessed value */}
      {p.fundamentals && (p.fundamentals.pe != null || p.fundamentals.pegRatio != null || p.fundamentals.revenueGrowth != null) && (
        <div style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 10, flexWrap: "wrap", marginBottom: 6, color: C.textDim }}>
          {p.fundamentals.marketCap != null && <span>MCAP <b style={{ color: C.textSec }}>${(p.fundamentals.marketCap / 1e9).toFixed(1)}B</b></span>}
          {p.fundamentals.pe != null && <span>P/E <b style={{ color: C.textSec }}>{p.fundamentals.pe.toFixed(1)}</b></span>}
          {p.fundamentals.pegRatio != null && <span>PEG <b style={{ color: C.textSec }}>{p.fundamentals.pegRatio.toFixed(2)}</b></span>}
          {p.fundamentals.revenueGrowth != null && <span>REV GR <b style={{ color: p.fundamentals.revenueGrowth >= 0 ? C.green : C.red }}>{(p.fundamentals.revenueGrowth * 100).toFixed(1)}%</b></span>}
        </div>
      )}
      {/* Real Wall Street analyst price-target range — bear/base/bull proxy, not AI-generated */}
      {p.priceTargets && (p.priceTargets.bear != null || p.priceTargets.base != null || p.priceTargets.bull != null) && (
        <div style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 10, flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ color: C.textDim }}>ANALYST TARGET</span>
          {p.priceTargets.bear != null && <span style={{ color: C.red }}>${p.priceTargets.bear.toFixed(0)}</span>}
          {p.priceTargets.base != null && <span style={{ color: C.text, fontWeight: 800 }}>${p.priceTargets.base.toFixed(0)}</span>}
          {p.priceTargets.bull != null && <span style={{ color: C.green }}>${p.priceTargets.bull.toFixed(0)}</span>}
          {p.priceTargets.analystCount != null && <span style={{ color: C.textDim }}>({p.priceTargets.analystCount} analysts)</span>}
        </div>
      )}
      {/* AI Confidence — a real composite of technical (this platform's own
          A+ score) + fundamental (transparent point score) + smart-money
          (real, symbol-specific insider/short-interest match), averaged
          only over whichever of those three actually resolved for this
          symbol. Not the full 14-factor engine — basedOn discloses which
          real inputs fed it. */}
      {p.confidence && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 10, flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ fontWeight: 900, color: p.confidence.composite >= 70 ? C.green : p.confidence.composite >= 50 ? C.amber : C.textDim }}>
            CONFIDENCE {p.confidence.composite}
          </span>
          <span style={{ color: C.textDim, fontSize: 9.5 }}>
            ({p.confidence.basedOn.map(k => k === "technical" ? "tech" : k === "fundamental" ? "fund" : k === "portfolioFit" ? "fit" : "smart money").join(" + ")})
          </span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}55`, paddingTop: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>{p.stage} · {p.passCount}/8</span>
        <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: actionCol }}>{p.action}</span>
      </div>
    </div>
  );
}

function AvoidCard({ a, C, MONO, SANS }) {
  return (
    <div style={{ background: `${C.red}0a`, border: `1px solid ${C.red}33`, borderRadius: 9, padding: "10px 13px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.text }}>{a.symbol}</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.red }}>{a.score}/100</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, lineHeight: 1.5 }}>{a.reasons.join(" · ")}</div>
      {a.stage && <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginTop: 4 }}>{a.stage}</div>}
    </div>
  );
}

function SectorBar({ s, maxAbs, C, MONO }) {
  const col = s.rel >= 0.5 ? C.green : s.rel <= -0.5 ? C.red : C.textDim;
  const widthPct = maxAbs > 0 ? Math.max(4, (Math.abs(s.rel) / maxAbs) * 100) : 4;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.text, width: 150, flexShrink: 0 }}>{s.name}</span>
      <div style={{ flex: 1, height: 7, background: C.surface, borderRadius: 4, overflow: "hidden", position: "relative" }}>
        <div style={{
          position: "absolute", top: 0, bottom: 0, borderRadius: 4, background: col, width: `${widthPct}%`,
          left: s.rel >= 0 ? "50%" : `${50 - widthPct}%`,
        }} />
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.border }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: col, width: 68, textAlign: "right", flexShrink: 0 }}>
        {s.rel >= 0 ? "+" : ""}{s.rel.toFixed(2)}%
      </span>
    </div>
  );
}

export default function AdvisorAiTab({ C, MONO, SANS }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | empty | error

  useEffect(() => {
    fetch("/api/ai-hub/advisor-brief").then(r => r.json()).then(d => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else setState("empty");
    }).catch(() => setState("error"));
  }, []);

  const generate = () => {
    setLoading(true); setError(null);
    fetch("/api/ai-hub/advisor-brief/refresh", { method: "POST" }).then(r => r.json()).then(d => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else { setError(d?.error || "Failed to generate brief"); setState("error"); }
    }).catch(e => { setError(e.message || "Network error"); setState("error"); })
      .finally(() => setLoading(false));
  };

  const regimeCol = brief?.regime?.label === "GREEN" ? C.green : brief?.regime?.label === "YELLOW" ? C.amber : C.red;
  // capitalFlow is the real sectors ranking widened with crypto/gold/
  // treasuries/credit — falls back to the older `sectors`-only field for
  // any cached brief generated before this widening shipped.
  const flowRows = brief?.capitalFlow?.length ? brief.capitalFlow : (brief?.sectors || []);
  const maxAbsRel = brief ? Math.max(0.1, ...flowRows.map(s => Math.abs(s.rel))) : 0.1;

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 900, color: C.text }}>🏛️ ADVISOR AI</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            CIO-style research brief — real regime, sector rotation &amp; a wide A+ scan from this platform, plus live web search for macro context
          </div>
        </div>
        <button onClick={generate} disabled={loading}
          style={buttonChrome(C, { padding: "9px 18px", fontSize: 12, fontWeight: 800,
            background: loading ? C.surface : C.gold, color: loading ? C.textDim : "#fff", border: "none" })}>
          {loading ? "RESEARCHING…" : brief ? "↻ NEW BRIEF" : "GENERATE BRIEF"}
        </button>
      </div>

      {state === "error" && error && (
        <div style={{ ...cardStyle(C), padding: 16, borderColor: C.red }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {error}</div>
        </div>
      )}

      {(state === "empty" || (state === "error" && !brief)) && !loading && (
        <div style={{ ...cardStyle(C), padding: 60, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 32, marginBottom: 12 }}>🏛️</div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>Click Generate for a real, honest CIO-style read</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 6 }}>
            Regime · sector rotation · a wide real A+ scan · insider Form 4s · COT · short interest · web-searched macro context
          </div>
        </div>
      )}

      {loading && (
        <div style={{ ...cardStyle(C), padding: 60, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⌛ Scanning setups, reading smart-money data &amp; searching the web… (~60-90s)</div>
        </div>
      )}

      {brief && !loading && (
        <>
          {/* Meta strip */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatPill label="REGIME" value={`${brief.regime?.label} (${brief.regime?.score}/100)`} color={regimeCol} C={C} MONO={MONO} />
            {/* Widened Market Regime Engine — same real score/label, plus the
                real per-factor breakdown and real VIX level computeRegime
                already computes but never surfaced beyond GREEN/YELLOW/RED */}
            {brief.regime?.detail?.state && (
              <StatPill label="" value={brief.regime.detail.state} color={regimeCol} C={C} MONO={MONO} />
            )}
            {brief.regime?.detail?.vixVal != null && (
              <StatPill label="VIX" value={`${brief.regime.detail.vixVal} (${brief.regime.detail.volRegime})`} color={C.textDim} C={C} MONO={MONO} />
            )}
            <StatPill label="SCANNED" value={`${brief.setupsScanned ?? "—"} of ${brief.universeSize ?? "—"} stocks`} color={C.accent} C={C} MONO={MONO} />
            {(brief.sectors || []).slice(0, 2).map((s, i) => (
              <StatPill key={s.symbol} label={i === 0 ? "LEADING" : "LAGGING"} value={s.name} color={i === 0 ? C.green : C.red} C={C} MONO={MONO} />
            ))}
          </div>
          {(brief.regime?.detail?.factorsPassed?.length > 0 || brief.regime?.detail?.factorsFailed?.length > 0) && (
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>
              {brief.regime.detail.factorsPassed.length > 0 && <span style={{ color: C.green }}>✓ {brief.regime.detail.factorsPassed.join(", ")}</span>}
              {brief.regime.detail.factorsPassed.length > 0 && brief.regime.detail.factorsFailed.length > 0 && <span> · </span>}
              {brief.regime.detail.factorsFailed.length > 0 && <span style={{ color: C.red }}>✗ {brief.regime.detail.factorsFailed.join(", ")}</span>}
            </div>
          )}

          {/* Executive summary hero */}
          <div style={{ background: `linear-gradient(135deg, ${C.goldBg}, ${C.card} 60%)`, border: `1px solid ${C.gold}55`, borderRadius: 12, padding: "16px 18px" }}>
            <SectionLabel icon="📋" text="EXECUTIVE SUMMARY" color={C.gold} C={C} MONO={MONO} />
            <div style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.6 }}>{brief.executiveSummary || "—"}</div>
          </div>

          {/* CEO Executive Brief — a one-page-dashboard re-assembly of data
              already computed elsewhere in this same brief (regime, capital
              flow, action plan, avoid list, ranked fundamentals, picks, risk
              command center, scenarios) — no new AI call, nothing here is a
              number the model typed. Fields are individually optional since
              some (bestSwingTrade, highestRiskAsset, etc.) only resolve when
              the underlying real data supports them. */}
          {brief.ceoBrief && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="🧭" text="CEO EXECUTIVE BRIEF" color={C.gold} C={C} MONO={MONO} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <StatPill label="CASH STANCE" value={brief.ceoBrief.cashStance?.label}
                  color={brief.ceoBrief.cashStance?.label === "Fully deployed" ? C.green : brief.ceoBrief.cashStance?.label === "Defensive" ? C.red : C.amber} C={C} MONO={MONO} />
                {brief.ceoBrief.cashStance?.currentCashPct != null && (
                  <StatPill label="CURRENT CASH" value={`${brief.ceoBrief.cashStance.currentCashPct}%`} color={C.textDim} C={C} MONO={MONO} />
                )}
                {brief.ceoBrief.bestSector && <StatPill label="BEST FLOW" value={brief.ceoBrief.bestSector.name} color={C.green} C={C} MONO={MONO} />}
                {brief.ceoBrief.worstSector && <StatPill label="WORST FLOW" value={brief.ceoBrief.worstSector.name} color={C.red} C={C} MONO={MONO} />}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, lineHeight: 1.5, marginBottom: 12 }}>{brief.ceoBrief.cashStance?.desc}</div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 12 }}>
                {[
                  ["📈 Best Growth", brief.ceoBrief.bestGrowthStock, s => `${s.symbol} · ${s.revenueGrowthPct}% rev growth`],
                  ["💰 Best Value", brief.ceoBrief.bestValueStock, s => `${s.symbol} · PEG ${s.pegRatio}`],
                  ["📊 Best Swing", brief.ceoBrief.bestSwingTrade, s => `${s.symbol} · ${s.score}/100`],
                  ["🏛️ Best Long-Term", brief.ceoBrief.bestLongTermInvestment, s => `${s.symbol} · ${s.score}/100`],
                  ["⚠️ Highest Risk Asset", brief.ceoBrief.highestRiskAsset, s => s.type === "held" ? `${s.symbol} · β ${s.beta.toFixed(2)}, ${s.weightPct}% of book` : `${s.symbol} · ${s.score}/100 (avoid list)`],
                ].map(([label, val, fmt]) => (
                  <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 5 }}>{label.toUpperCase()}</div>
                    {val ? (
                      <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: C.text }}>{fmt(val)}</div>
                    ) : (
                      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, fontStyle: "italic" }}>No real data fits right now</div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.green, letterSpacing: "0.05em", marginBottom: 6 }}>TOP OPPORTUNITIES</div>
                  {brief.ceoBrief.topOpportunities?.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {brief.ceoBrief.topOpportunities.map(o => (
                        <div key={o.symbol} style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>
                          <b style={{ color: C.text }}>{o.symbol}</b> — {ACTION_META[o.action]?.label || o.action}
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, fontStyle: "italic" }}>None flagged this run</div>}
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.red, letterSpacing: "0.05em", marginBottom: 6 }}>TOP RISKS</div>
                  {brief.ceoBrief.topRisks?.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {brief.ceoBrief.topRisks.map(r => (
                        <div key={r.symbol + r.type} style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>
                          <b style={{ color: C.text }}>{r.symbol}</b> — {r.type === "portfolio" ? `${ACTION_META[r.action]?.label || r.action}: ${r.reason}` : r.reason}
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, fontStyle: "italic" }}>None flagged this run</div>}
                </div>
              </div>

              {brief.ceoBrief.invalidationConditions?.length > 0 && (
                <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, lineHeight: 1.5, fontStyle: "italic", borderTop: `1px solid ${C.border}55`, paddingTop: 10 }}>
                  What would invalidate this outlook: {brief.ceoBrief.invalidationConditions.join(" ")}
                </div>
              )}
            </div>
          )}

          {/* What Changed? — real regime-score/leadership deltas vs real past
              snapshots. A horizon with no snapshot that far back yet (this
              history only starts accumulating the day this feature shipped)
              is shown honestly as "not enough history yet", never guessed. */}
          {brief.whatChanged && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="🕰️" text="WHAT CHANGED?" color={C.accent} C={C} MONO={MONO} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                {[["vsYesterday", "Yesterday"], ["vsLastWeek", "Last Week"], ["vsLastMonth", "Last Month"], ["vsLastQuarter", "Last Quarter"]].map(([k, label]) => {
                  const d = brief.whatChanged[k];
                  return (
                    <div key={k} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
                      {d ? (
                        <>
                          <div style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>
                            Regime {d.regimeScoreThen}→{brief.regime?.score} <span style={{ color: d.regimeScoreDelta >= 0 ? C.green : C.red }}>({d.regimeScoreDelta >= 0 ? "+" : ""}{d.regimeScoreDelta})</span>
                          </div>
                          {d.topFlowThen?.length > 0 && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 4 }}>Led by {d.topFlowThen.map(f => f.name).join(", ")}</div>}
                        </>
                      ) : (
                        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, fontStyle: "italic" }}>Not enough history yet</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Picks grid — one card per horizon, each holding multiple real picks */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 12 }}>
            {HORIZONS.map(h => {
              const picks = brief.picks?.[h.key] || [];
              return (
                <div key={h.key} style={{ ...cardStyle(C, { background: C.card }), padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 10 }}>
                    <span style={{ fontSize: 15 }}>{h.icon}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.accent, letterSpacing: "0.04em" }}>{h.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{h.sub}</span>
                  </div>
                  {picks.length === 0 ? (
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, fontStyle: "italic" }}>No real setup fits this horizon right now.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {picks.map(p => <PickCard key={p.symbol} p={p} C={C} MONO={MONO} SANS={SANS} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, fontStyle: "italic", marginTop: -6 }}>
            CONFIDENCE is a real composite of technical (this platform's A+ scan), fundamental, symbol-specific smart-money, and real-portfolio sector fit — only where each actually resolves. Not a full institutional-grade model.
          </div>

          {/* 5-year thematic thesis */}
          {brief.thesis5y?.length > 0 && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="🔭" text="5-YEAR THEMATIC THESIS" color={C.purple} C={C} MONO={MONO} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                {brief.thesis5y.map((t, i) => (
                  <div key={i} style={{ background: `${C.purple}0c`, border: `1px solid ${C.purple}33`, borderRadius: 9, padding: 13 }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 6 }}>{t.theme}</div>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.5, marginBottom: 9 }}>{t.why}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {t.tickers.map(tk => (
                        <span key={tk.symbol} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                          background: C.surface, border: `1px solid ${C.border}`, color: tk.score != null ? C.accent : C.textSec }}>
                          {tk.symbol}{tk.score != null ? ` · ${tk.score}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Capital Flow — real sector + macro-asset-class ranking (crypto/gold/treasuries/credit) */}
          {flowRows.length > 0 && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="📊" text="CAPITAL FLOW · REAL, TODAY VS SPY" color={C.accent} C={C} MONO={MONO} />
              <div>{flowRows.map(s => <SectorBar key={s.symbol} s={s} maxAbs={maxAbsRel} C={C} MONO={MONO} />)}</div>
            </div>
          )}

          {/* Scenario Engine — grounded in the real 5-factor regime system;
              probabilities are a transparent function of today's real
              score, explicitly labeled illustrative, not a statistical fit */}
          {brief.scenarios && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="🔀" text="SCENARIO ENGINE" color={C.purple} C={C} MONO={MONO} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 10 }}>
                {[["best", C.green], ["base", C.textDim], ["worst", C.red]].map(([k, col]) => {
                  const s = brief.scenarios[k];
                  return (
                    <div key={k} style={{ background: `${col}0c`, border: `1px solid ${col}33`, borderRadius: 8, padding: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: col }}>{s.label}</span>
                        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: col }}>{s.probability}%</span>
                      </div>
                      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, lineHeight: 1.45 }}>{s.desc}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, lineHeight: 1.5, fontStyle: "italic" }}>
                {brief.scenarios.shiftConditions?.join(" ")}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginTop: 8 }}>Illustrative probabilities from today's real regime score — not a calibrated statistical forecast.</div>
            </div>
          )}

          {/* AI Avoid List — bottom of the same real scan, real reasons */}
          {brief.avoidList?.length > 0 && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="🚫" text="AVOID LIST · LOWEST-SCORED IN TODAY'S SCAN" color={C.red} C={C} MONO={MONO} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                {brief.avoidList.map(a => <AvoidCard key={a.symbol} a={a} C={C} MONO={MONO} SANS={SANS} />)}
              </div>
            </div>
          )}

          {/* Portfolio Manager — real live Alpaca account, only renders when connected */}
          {brief.portfolio && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="💼" text="PORTFOLIO" color={C.purple} C={C} MONO={MONO} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <StatPill label="EQUITY" value={`$${Math.round(brief.portfolio.equity).toLocaleString()}`} color={C.text} C={C} MONO={MONO} />
                <StatPill label="CASH" value={`$${Math.round(brief.portfolio.cash).toLocaleString()}`} color={C.textDim} C={C} MONO={MONO} />
                <StatPill label="OPEN RISK" value={`${brief.portfolio.openRiskPct}%`} color={brief.portfolio.openRiskPct >= 6 ? C.red : brief.portfolio.openRiskPct >= 4 ? C.amber : C.green} C={C} MONO={MONO} />
                <StatPill label="" value={brief.portfolio.dailyBreakerTripped ? "🔴 DAILY BREAKER TRIPPED" : "✅ Daily breaker OK"} color={brief.portfolio.dailyBreakerTripped ? C.red : C.green} C={C} MONO={MONO} />
                <StatPill label="TOP HOLDING" value={`${brief.portfolio.topHoldingWeightPct}% of book`} color={brief.portfolio.topHoldingWeightPct >= 30 ? C.amber : C.textDim} C={C} MONO={MONO} />
                <StatPill label="P&L" value={`${brief.portfolio.totalUnrealizedPL >= 0 ? "+" : ""}$${Math.round(brief.portfolio.totalUnrealizedPL).toLocaleString()}`} color={brief.portfolio.totalUnrealizedPL >= 0 ? C.green : C.red} C={C} MONO={MONO} />
              </div>
              {brief.portfolio.holdings?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {brief.portfolio.holdings.map(h => (
                    <div key={h.symbol} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", background: C.surface, borderRadius: 6, fontFamily: MONO, fontSize: 11 }}>
                      <span style={{ fontWeight: 800, color: C.text, minWidth: 55 }}>{h.symbol}</span>
                      <span style={{ color: C.textDim, minWidth: 55 }}>{h.weightPct}% book</span>
                      <span style={{ color: C.textDim }}>${h.current}</span>
                      {h.beta != null && <span style={{ color: C.textDim }}>β {h.beta.toFixed(2)}</span>}
                      <span style={{ color: h.unrealizedPLpc >= 0 ? C.green : C.red, marginLeft: "auto" }}>
                        {h.unrealizedPLpc >= 0 ? "+" : ""}{h.unrealizedPLpc.toFixed(1)}% (${h.unrealizedPL >= 0 ? "+" : ""}{h.unrealizedPL.toFixed(0)})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Risk Command Center — only the risk types this app can honestly
              quantify from real data; the rest are listed as not covered
              rather than silently omitted or invented */}
          {brief.riskCommandCenter && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="🛡️" text="RISK COMMAND CENTER" color={C.red} C={C} MONO={MONO} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {brief.riskCommandCenter.concentrationRisk && (
                  <StatPill label="CONCENTRATION" value={`${brief.riskCommandCenter.concentrationRisk} (${brief.riskCommandCenter.topHoldingWeightPct}%)`}
                    color={brief.riskCommandCenter.concentrationRisk === "HIGH" ? C.red : brief.riskCommandCenter.concentrationRisk === "MODERATE" ? C.amber : C.green} C={C} MONO={MONO} />
                )}
                {brief.riskCommandCenter.volatilityRisk && (
                  <StatPill label="VOLATILITY" value={`${brief.riskCommandCenter.volatilityRisk} (β ${brief.riskCommandCenter.weightedBeta})`}
                    color={brief.riskCommandCenter.volatilityRisk === "HIGH" ? C.red : brief.riskCommandCenter.volatilityRisk === "MODERATE" ? C.amber : C.green} C={C} MONO={MONO} />
                )}
                {brief.riskCommandCenter.openRiskPct != null && (
                  <StatPill label="OPEN RISK" value={`${brief.riskCommandCenter.openRiskPct}%`} color={C.textDim} C={C} MONO={MONO} />
                )}
                {/* Real market-wide reads from HYG/UUP/TLT — single-day % moves,
                    not a proper spread/curve calc, shown alongside the real
                    underlying number rather than as a bare label */}
                {brief.riskCommandCenter.creditRisk && (
                  <StatPill label="CREDIT" value={`${brief.riskCommandCenter.creditRisk} (HYG ${brief.riskCommandCenter.creditHygChgPct >= 0 ? "+" : ""}${brief.riskCommandCenter.creditHygChgPct}%)`}
                    color={brief.riskCommandCenter.creditRisk === "ELEVATED" ? C.red : brief.riskCommandCenter.creditRisk === "WATCH" ? C.amber : C.green} C={C} MONO={MONO} />
                )}
                {brief.riskCommandCenter.currencyRisk && (
                  <StatPill label="CURRENCY" value={`${brief.riskCommandCenter.currencyRisk} (UUP ${brief.riskCommandCenter.currencyUupChgPct >= 0 ? "+" : ""}${brief.riskCommandCenter.currencyUupChgPct}%)`}
                    color={brief.riskCommandCenter.currencyRisk === "ELEVATED" ? C.red : brief.riskCommandCenter.currencyRisk === "WATCH" ? C.amber : C.green} C={C} MONO={MONO} />
                )}
                {brief.riskCommandCenter.interestRateRisk && (
                  <StatPill label="RATES" value={`${brief.riskCommandCenter.interestRateRisk} (TLT ${brief.riskCommandCenter.interestRateTltChgPct >= 0 ? "+" : ""}${brief.riskCommandCenter.interestRateTltChgPct}%)`}
                    color={brief.riskCommandCenter.interestRateRisk === "ELEVATED" ? C.red : brief.riskCommandCenter.interestRateRisk === "WATCH" ? C.amber : C.green} C={C} MONO={MONO} />
                )}
              </div>
              {brief.riskCommandCenter.sectorConcentration && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {Object.entries(brief.riskCommandCenter.sectorConcentration).map(([sec, count]) => (
                    <span key={sec} style={{ fontFamily: MONO, fontSize: 10, padding: "3px 8px", borderRadius: 6, background: C.surface, border: `1px solid ${C.border}`, color: C.textSec }}>{sec}: {count}</span>
                  ))}
                </div>
              )}
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
                Not covered (no real data source in this app): {brief.riskCommandCenter.notCovered?.join(", ")}.
              </div>
            </div>
          )}

          {/* Smart money read */}
          {brief.smartMoneyRead && (
            <div style={{ background: `${C.amber}0c`, border: `1px solid ${C.amber}33`, borderRadius: 12, padding: "14px 16px" }}>
              <SectionLabel icon="🕵️" text="SMART MONEY READ" color={C.amber} C={C} MONO={MONO} />
              <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.55 }}>{brief.smartMoneyRead}</div>
            </div>
          )}

          {/* CEO action plan */}
          {brief.actionPlan?.length > 0 && (
            <div style={{ background: `linear-gradient(135deg, ${C.goldBg}, ${C.card} 55%)`, border: `1px solid ${C.gold}44`, borderRadius: 12, padding: "14px 16px" }}>
              <SectionLabel icon="🎯" text="CEO ACTION PLAN" color={C.gold} C={C} MONO={MONO} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {brief.actionPlan.map(a => {
                  const meta = ACTION_META[a.action] || { label: a.action, key: "textDim" };
                  const col = C[meta.key] || C.textDim;
                  return (
                    <div key={a.symbol} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: C.surface, borderRadius: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, padding: "3px 9px", borderRadius: 6, background: `${col}20`, color: col, minWidth: 90, textAlign: "center" }}>{meta.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, minWidth: 52 }}>{a.symbol}</span>
                      {/* REDUCE/SELL are enriched from real portfolio holdings, not a
                          scanned setup score — show real weight/P&L instead */}
                      {a.score != null && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, minWidth: 40 }}>{a.score}/100</span>}
                      {a.confidence && <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: a.confidence.composite >= 70 ? C.green : a.confidence.composite >= 50 ? C.amber : C.textDim }}>conf {a.confidence.composite}</span>}
                      {a.weightPct != null && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, minWidth: 90 }}>{a.weightPct}% of book</span>}
                      {a.unrealizedPLpc != null && <span style={{ fontFamily: MONO, fontSize: 10.5, color: a.unrealizedPLpc >= 0 ? C.green : C.red }}>{a.unrealizedPLpc >= 0 ? "+" : ""}{a.unrealizedPLpc.toFixed(1)}%</span>}
                      {a.held && <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.purple, background: `${C.purple}18`, borderRadius: 4, padding: "1px 5px" }}>HELD</span>}
                      <span style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, flex: 1, minWidth: 160 }}>{a.reason}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, textAlign: "right" }}>
            Generated {new Date(brief.generatedAt).toLocaleString([], { hour: "2-digit", minute: "2-digit" })} · AI-synthesized from real platform data + web search — not financial advice, cross-check before acting
          </div>
        </>
      )}
    </div>
  );
}
