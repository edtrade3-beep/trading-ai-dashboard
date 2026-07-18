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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}55`, paddingTop: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>{p.stage} · {p.passCount}/8</span>
        <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: actionCol }}>{p.action}</span>
      </div>
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
  const maxAbsRel = brief ? Math.max(0.1, ...(brief.sectors || []).map(s => Math.abs(s.rel))) : 0.1;

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
            <StatPill label="SCANNED" value={`${brief.setupsScanned ?? "—"} of ${brief.universeSize ?? "—"} stocks`} color={C.accent} C={C} MONO={MONO} />
            {(brief.sectors || []).slice(0, 2).map((s, i) => (
              <StatPill key={s.symbol} label={i === 0 ? "LEADING" : "LAGGING"} value={s.name} color={i === 0 ? C.green : C.red} C={C} MONO={MONO} />
            ))}
          </div>

          {/* Executive summary hero */}
          <div style={{ background: `linear-gradient(135deg, ${C.goldBg}, ${C.card} 60%)`, border: `1px solid ${C.gold}55`, borderRadius: 12, padding: "16px 18px" }}>
            <SectionLabel icon="📋" text="EXECUTIVE SUMMARY" color={C.gold} C={C} MONO={MONO} />
            <div style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.6 }}>{brief.executiveSummary || "—"}</div>
          </div>

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

          {/* Sector rankings — real, computed data */}
          {brief.sectors?.length > 0 && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="📊" text="SECTOR RANKINGS · REAL, TODAY VS SPY" color={C.accent} C={C} MONO={MONO} />
              <div>{brief.sectors.map(s => <SectorBar key={s.symbol} s={s} maxAbs={maxAbsRel} C={C} MONO={MONO} />)}</div>
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
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, minWidth: 40 }}>{a.score}/100</span>
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
