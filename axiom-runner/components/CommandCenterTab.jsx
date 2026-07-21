import { useState, useEffect } from "react";
import { cardStyle, buttonChrome } from "./ui-helpers.js";

// AI MARKET COMMAND CENTER — src/command-center-ai.js.
// Same "real data + honest gaps" architecture as ADVISOR AI/CEO AI: mostly
// a synthesis of what those two already computed (ADVISOR's real trade
// ideas/risk breakdown/sector rotation, CEO's daily verdict), plus exactly
// two genuinely new things — a classified, web-search-grounded event feed
// (severity/confidence/duration/sector/political-rhetoric-vs-policy tags,
// directional-only asset impact, never a fabricated precise % move) and a
// real, code-graded Track Record of this desk's own past trade ideas.
// Every entry/stop/target/position-size shown here is re-attached
// server-side from this platform's own trend-template scan — never typed
// by the model.

const CATEGORY_COLOR = {
  Fed: "#7c5cff", inflation: "#d6a312", tariffs: "#c8282a", taxes: "#c8282a",
  war: "#c8282a", sanctions: "#c8282a", AI: "#2563eb", semiconductors: "#2563eb",
  energy: "#0d9465", healthcare: "#0d9465", banking: "#7c5cff", crypto: "#f59e0b",
  elections: "#7c5cff", earnings: "#22c55e", other: "#94a3b8",
};

function SectionLabel({ icon, text, color, C, MONO }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color, letterSpacing: "0.05em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
      <span>{icon}</span><span>{text}</span>
    </div>
  );
}

function AssetImpactRow({ assetImpact, C, MONO }) {
  if (!assetImpact) return null;
  const order = ["spy", "qqq", "dia", "iwm", "vix", "dxy", "gold", "oil", "btc"];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {order.map((k) => {
        const v = assetImpact[k];
        if (!v) return null;
        const arrow = v.direction === "up" ? "▲" : v.direction === "down" ? "▼" : "—";
        const col = v.direction === "up" ? C.green : v.direction === "down" ? C.red : C.textDim;
        const weight = v.magnitude === "high" ? 900 : v.magnitude === "medium" ? 700 : 500;
        return (
          <span key={k} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: weight, color: col, padding: "2px 6px", borderRadius: 5, background: `${col}12` }}>
            {k.toUpperCase()} {arrow}
          </span>
        );
      })}
    </div>
  );
}

function EventCard({ e, C, MONO, SANS }) {
  const col = CATEGORY_COLOR[e.category] || C.textDim;
  const sevCol = e.severity >= 7 ? C.red : e.severity >= 4 ? C.amber : C.textDim;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: col, background: `${col}18`, borderRadius: 5, padding: "2px 7px", letterSpacing: "0.04em" }}>{e.category.toUpperCase()}</span>
          {e.political && (
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: e.statementType === "confirmed_policy" ? C.green : e.statementType === "proposed_policy" ? C.amber : C.textDim,
              background: `${e.statementType === "confirmed_policy" ? C.green : e.statementType === "proposed_policy" ? C.amber : C.textDim}18`, borderRadius: 5, padding: "2px 7px" }}>
              {e.statementType === "confirmed_policy" ? "CONFIRMED POLICY" : e.statementType === "proposed_policy" ? "PROPOSED POLICY" : "RHETORIC"}
              {e.implementationProbabilityPct != null ? ` · ${e.implementationProbabilityPct}% likely` : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, fontFamily: MONO, fontSize: 10, color: C.textDim }}>
          <span>SEV <b style={{ color: sevCol }}>{e.severity}/10</b></span>
          <span>CONF <b style={{ color: C.text }}>{e.confidence}%</b></span>
          {e.expectedDurationDays != null && <span>~{e.expectedDurationDays}d</span>}
        </div>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{e.headline}</div>
      {e.summary && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{e.summary}</div>}
      {e.historicalAnalog && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, fontStyle: "italic", marginTop: 6 }}>Historical analog: {e.historicalAnalog}</div>}
      {e.affectedSectors?.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
          {e.affectedSectors.map((s) => (
            <span key={s} style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 6px" }}>{s}</span>
          ))}
        </div>
      )}
      <AssetImpactRow assetImpact={e.assetImpact} C={C} MONO={MONO} />
    </div>
  );
}

function TradeIdeaCard({ idea, C, MONO, SANS }) {
  const isLong = idea.direction === "LONG";
  const dirCol = isLong ? C.green : C.red;
  return (
    <div style={{ background: C.surface, border: `1px solid ${dirCol}44`, borderRadius: 9, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>{idea.symbol}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: dirCol, background: `${dirCol}18`, borderRadius: 5, padding: "2px 7px" }}>{idea.direction}</span>
          {idea.held && (
            <span title={idea.heldWeightPct != null ? `${idea.heldWeightPct}% of book${idea.heldUnrealizedPLpc != null ? `, ${idea.heldUnrealizedPLpc >= 0 ? "+" : ""}${idea.heldUnrealizedPLpc.toFixed(1)}% unrealized` : ""}` : undefined}
              style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, background: `${C.accent}18`, borderRadius: 5, padding: "2px 7px" }}>
              📌 HELD{idea.heldWeightPct != null ? ` ${idea.heldWeightPct}%` : ""}
            </span>
          )}
        </div>
        {idea.confidence != null && (
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: idea.confidence >= 70 ? C.green : idea.confidence >= 50 ? C.amber : C.textDim }}>{idea.confidence}/100</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 10.5, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ color: C.textDim }}>ENTRY <b style={{ color: C.text }}>${idea.entry}</b></span>
        <span style={{ color: C.textDim }}>STOP <b style={{ color: C.red }}>${idea.stop}</b></span>
        {idea.target1 != null && <span style={{ color: C.textDim }}>T1 <b style={{ color: C.green }}>${idea.target1}</b></span>}
        {idea.target2 != null && <span style={{ color: C.textDim }}>T2 <b style={{ color: C.green }}>${idea.target2}</b></span>}
        {idea.positionSizeShares != null && <span style={{ color: C.textDim }}>SIZE <b style={{ color: C.text }}>{idea.positionSizeShares} sh</b></span>}
      </div>
      {/* Real deterministic scan facts — this platform's own trend-template
          rule set, not AI opinion. */}
      {(idea.passCount != null || idea.rsRating != null || idea.stage) && (
        <div style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 10.5, flexWrap: "wrap", marginBottom: 8, padding: "6px 9px", background: `${C.textDim}0a`, borderRadius: 6 }}>
          {idea.passCount != null && <span style={{ color: C.textDim }}>TREND <b style={{ color: idea.passCount >= 7 ? C.green : idea.passCount >= 5 ? C.amber : C.red }}>{idea.passCount}/8</b></span>}
          {idea.rsRating != null && <span style={{ color: C.textDim }}>RS <b style={{ color: idea.rsRating >= 70 ? C.green : C.text }}>{idea.rsRating}</b></span>}
          {idea.stage && <span style={{ color: C.textDim }}>STAGE <b style={{ color: C.text }}>{idea.stage}</b></span>}
        </div>
      )}
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 6 }}>{idea.holdingPeriod}</div>
      {idea.reason && <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, lineHeight: 1.4, marginBottom: 6 }}>{idea.reason}</div>}
      {idea.supportingEvidence && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, lineHeight: 1.4, marginBottom: 3 }}><b style={{ color: C.green }}>+</b> {idea.supportingEvidence}</div>
      )}
      {idea.risks && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, lineHeight: 1.4, marginBottom: 3 }}><b style={{ color: C.red }}>−</b> {idea.risks}</div>
      )}
      {idea.historicalAnalog && (
        <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, fontStyle: "italic", marginBottom: 6 }}>↳ {idea.historicalAnalog}</div>
      )}
      {/* Confidence scorecard — the real sub-scores behind the composite
          number above, shown as a formula rather than an opinion. */}
      {idea.confidenceScorecard && Object.values(idea.confidenceScorecard).some((v) => v != null) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
          {[["TECH", idea.confidenceScorecard.technical], ["FUND", idea.confidenceScorecard.fundamental], ["SMART $", idea.confidenceScorecard.smartMoney], ["FIT", idea.confidenceScorecard.portfolioFit]]
            .filter(([, v]) => v != null)
            .map(([label, v]) => (
              <span key={label} style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>{label} <b style={{ color: v >= 70 ? C.green : v >= 40 ? C.amber : C.red }}>{v}</b></span>
            ))}
          {idea.confidenceNotCovered?.length > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>· not covered: {idea.confidenceNotCovered.join(", ")}</span>
          )}
        </div>
      )}
    </div>
  );
}

function TrackRecordSection({ tr, C, MONO, SANS }) {
  if (!tr) return null;
  return (
    <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
      <SectionLabel icon="📋" text="TRACK RECORD — REAL, CODE-GRADED OUTCOMES" color={C.accent} C={C} MONO={MONO} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 10 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: tr.hitRatePct == null ? C.textDim : tr.hitRatePct >= 55 ? C.green : tr.hitRatePct >= 40 ? C.amber : C.red }}>
            {tr.hitRatePct == null ? "—" : `${tr.hitRatePct}%`}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>HIT RATE ({tr.closedCount} closed)</div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>{tr.openCount}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>OPEN / IN PROGRESS</div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>{tr.totalGenerated}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>TOTAL IDEAS LOGGED</div>
        </div>
      </div>
      {tr.recent?.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tr.recent.slice(0, 8).map((p) => {
            const statusCol = p.status === "hit" ? C.green : p.status === "stopped" ? C.red : p.status === "expired" ? C.textDim : C.amber;
            return (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, fontSize: 11, padding: "6px 10px", background: C.surface, borderRadius: 6 }}>
                <span style={{ color: C.text, fontWeight: 700 }}>{p.symbol} <span style={{ color: C.textDim, fontWeight: 400 }}>{p.direction}</span></span>
                <span style={{ color: statusCol, fontWeight: 800 }}>{p.status.toUpperCase()}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No trade ideas logged yet — Track Record fills in as Command Center generates real ideas over time.</div>
      )}
    </div>
  );
}

export default function CommandCenterTab({ C, MONO, SANS }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | empty | error

  useEffect(() => {
    fetch("/api/command-center").then((r) => r.json()).then((d) => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else setState("empty");
    }).catch(() => setState("error"));
  }, []);

  const generate = () => {
    setLoading(true); setError(null);
    fetch("/api/command-center/refresh", { method: "POST" }).then((r) => r.json()).then((d) => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else { setError(d?.error || "Failed to generate report"); setState("error"); }
    }).catch((e) => { setError(e.message || "Network error"); setState("error"); })
      .finally(() => setLoading(false));
  };

  const regimeCol = brief?.regime?.label === "GREEN" ? C.green : brief?.regime?.label === "YELLOW" ? C.amber : C.red;

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 900, color: C.text }}>🛰️ AI MARKET COMMAND CENTER</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            Classified event feed, real trade ideas with position sizing, and a real graded track record — synthesized from ADVISOR AI + CEO AI + live web search
          </div>
        </div>
        <button onClick={generate} disabled={loading}
          style={buttonChrome(C, { padding: "9px 18px", fontSize: 12, fontWeight: 800,
            background: loading ? C.surface : C.gold, color: loading ? C.textDim : "#fff", border: "none" })}>
          {loading ? "ANALYZING…" : brief ? "↻ REFRESH" : "GENERATE REPORT"}
        </button>
      </div>

      {state === "error" && error && (
        <div style={{ ...cardStyle(C), padding: 16, borderColor: C.red }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {error}</div>
        </div>
      )}

      {(state === "empty" || (state === "error" && !brief)) && !loading && (
        <div style={{ ...cardStyle(C), padding: 60, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 32, marginBottom: 12 }}>🛰️</div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>Click Generate for a real, event-classified command brief</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 6 }}>
            Requires a real ADVISOR AI brief to exist first — generate one on the Advisor AI tab if this comes back empty.
          </div>
        </div>
      )}

      {loading && (
        <div style={{ ...cardStyle(C), padding: 60, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⌛ Searching real news, classifying events, sizing trade ideas… (~60-90s)</div>
        </div>
      )}

      {brief && !loading && (
        <>
          {/* Regime + Command Score + critical-event count header */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, padding: "6px 14px", borderRadius: 8, background: `${regimeCol}18`, border: `1px solid ${regimeCol}44`, color: regimeCol }}>
              {brief.regime?.label} ({brief.regime?.score}/100)
            </span>
            {brief.commandScore?.score != null && (
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, padding: "6px 14px", borderRadius: 8,
                background: `${brief.commandScore.score >= 70 ? C.green : brief.commandScore.score >= 45 ? C.amber : C.red}18`,
                border: `1px solid ${brief.commandScore.score >= 70 ? C.green : brief.commandScore.score >= 45 ? C.amber : C.red}44`,
                color: brief.commandScore.score >= 70 ? C.green : brief.commandScore.score >= 45 ? C.amber : C.red }}>
                🎯 COMMAND SCORE {brief.commandScore.score}/100
              </span>
            )}
            {brief.criticalEventCount > 0 && (
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 8, background: `${C.red}18`, border: `1px solid ${C.red}44`, color: C.red }}>
                🔴 {brief.criticalEventCount} CRITICAL EVENT{brief.criticalEventCount > 1 ? "S" : ""}
              </span>
            )}
            {brief.ceoVerdict && (
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                CEO AI: <b style={{ color: C.text }}>{brief.ceoVerdict.verdict}</b> ({brief.ceoVerdict.confidence} confidence)
              </span>
            )}
          </div>

          {/* Command Score formula — the real inputs and their equal
              weights, not a black-box number. */}
          {brief.commandScore?.inputs?.some((i) => i.value != null) && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: -6 }}>
              {brief.commandScore.inputs.filter((i) => i.value != null).map((i) => (
                <span key={i.label}>{i.label} <b style={{ color: C.text }}>{i.value}</b> <span style={{ opacity: 0.6 }}>({i.weightPct}%)</span></span>
              )).reduce((acc, el, idx) => idx === 0 ? [el] : [...acc, <span key={`sep${idx}`} style={{ opacity: 0.4 }}> + </span>, el], [])}
              <span> = <b style={{ color: C.text }}>{brief.commandScore.score}/100</b></span>
            </div>
          )}

          {/* Executive summary */}
          {brief.executiveSummary && (
            <div style={{ background: `${C.gold}0c`, border: `1px solid ${C.gold}33`, borderRadius: 12, padding: "14px 16px" }}>
              <SectionLabel icon="📝" text="AI EXECUTIVE SUMMARY" color={C.gold} C={C} MONO={MONO} />
              <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.55 }}>{brief.executiveSummary}</div>
              {brief.ceoVerdict?.biggestRisk && (
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.red, marginTop: 8 }}><b>Biggest risk:</b> {brief.ceoVerdict.biggestRisk}</div>
              )}
              {brief.ceoVerdict?.flipCondition && (
                <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginTop: 4 }}>Flip condition: {brief.ceoVerdict.flipCondition}</div>
              )}
            </div>
          )}

          {/* Classified event feed */}
          {brief.events?.length > 0 && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="📰" text="BREAKING NEWS — CLASSIFIED EVENT FEED" color={C.accent} C={C} MONO={MONO} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {brief.events.map((e, i) => <EventCard key={i} e={e} C={C} MONO={MONO} SANS={SANS} />)}
              </div>
            </div>
          )}

          {/* Top bullish / bearish trade ideas */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="🟢" text="TOP BULLISH OPPORTUNITIES" color={C.green} C={C} MONO={MONO} />
              {brief.bullishIdeas?.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {brief.bullishIdeas.map((idea) => <TradeIdeaCard key={idea.symbol} idea={idea} C={C} MONO={MONO} SANS={SANS} />)}
                </div>
              ) : <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No high-conviction bullish setups right now.</div>}
            </div>
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="🔴" text="TOP BEARISH / AVOID" color={C.red} C={C} MONO={MONO} />
              {brief.bearishIdeas?.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {brief.bearishIdeas.map((idea) => <TradeIdeaCard key={idea.symbol} idea={idea} C={C} MONO={MONO} SANS={SANS} />)}
                </div>
              ) : <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No names flagged weak enough for a real avoid call right now.</div>}
            </div>
          </div>

          {/* Sector rotation */}
          {brief.sectorRotation?.length > 0 && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="📊" text="SECTOR ROTATION · REAL, TODAY VS SPY" color={C.accent} C={C} MONO={MONO} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {brief.sectorRotation.map((s) => (
                  <span key={s.symbol} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7,
                    background: s.rel >= 0 ? `${C.green}12` : `${C.red}12`, color: s.rel >= 0 ? C.green : C.red }}>
                    {s.symbol} {s.rel >= 0 ? "+" : ""}{s.rel?.toFixed?.(2)}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Institutional activity */}
          {(brief.institutional?.insider || brief.institutional?.darkPool || brief.institutional?.shortChanges) && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="🏦" text="INSTITUTIONAL ACTIVITY" color={C.purple} C={C} MONO={MONO} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {brief.institutional.insider && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.5 }}><b style={{ color: C.text }}>Insider buying:</b> {brief.institutional.insider}</div>}
                {brief.institutional.darkPool && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.5 }}><b style={{ color: C.text }}>Dark pool:</b> {brief.institutional.darkPool}</div>}
                {brief.institutional.shortChanges && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.5 }}><b style={{ color: C.text }}>Short interest:</b> {brief.institutional.shortChanges}</div>}
              </div>
            </div>
          )}

          {/* Portfolio risk summary */}
          {brief.portfolioRisk && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="🛡️" text="PORTFOLIO RISK SUMMARY" color={C.amber} C={C} MONO={MONO} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                {[
                  ["Concentration", brief.portfolioRisk.concentrationRisk],
                  ["Volatility", brief.portfolioRisk.volatilityRisk],
                  ["Credit", brief.portfolioRisk.creditRisk],
                  ["Currency", brief.portfolioRisk.currencyRisk],
                  ["Rates", brief.portfolioRisk.interestRateRisk],
                ].filter(([, v]) => v).map(([label, val]) => (
                  <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, textAlign: "center" }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: val === "HIGH" || val === "ELEVATED" ? C.red : val === "MODERATE" || val === "WATCH" ? C.amber : C.green }}>{val}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>{label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                {brief.portfolioRisk.weightedBeta != null && <span>Weighted Beta <b style={{ color: C.text }}>{brief.portfolioRisk.weightedBeta}</b></span>}
                {brief.portfolioRisk.var95 != null && <span>VaR 95% (1-day) <b style={{ color: C.red }}>-${brief.portfolioRisk.var95.toLocaleString()}</b></span>}
                {brief.portfolioRisk.var99 != null && <span>VaR 99% (1-day) <b style={{ color: C.red }}>-${brief.portfolioRisk.var99.toLocaleString()}</b></span>}
              </div>
              {brief.portfolioRisk.notCovered?.length > 0 && (
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginTop: 8 }}>Not covered (no real data source): {brief.portfolioRisk.notCovered.join(", ")}</div>
              )}
            </div>
          )}

          {/* Scenario / macro outlook */}
          {brief.scenarios && (
            <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
              <SectionLabel icon="🔀" text="MACRO OUTLOOK — SCENARIO ENGINE" color={C.purple} C={C} MONO={MONO} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                {[["best", C.green], ["base", C.textDim], ["worst", C.red]].map(([k, col]) => {
                  const s = brief.scenarios[k];
                  if (!s) return null;
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
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginTop: 8 }}>Illustrative probabilities from today's real regime score — not a calibrated statistical forecast.</div>
            </div>
          )}

          {/* Track record */}
          <TrackRecordSection tr={brief.trackRecord} C={C} MONO={MONO} SANS={SANS} />

          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, textAlign: "right" }}>
            Generated {new Date(brief.generatedAt).toLocaleString([], { hour: "2-digit", minute: "2-digit" })} · Auto-updates ~8:20 AM ET on trading days, or tap Refresh anytime · AI-synthesized from real platform data + web search — not financial advice, cross-check before acting. Never executes trades automatically.
          </div>
        </>
      )}
    </div>
  );
}
