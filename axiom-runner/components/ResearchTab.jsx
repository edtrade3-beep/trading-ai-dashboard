// ResearchTab.jsx
// ── LIVE SECTION (2026-08-30, "/upgrade-search" spec: "UPGRADE THE EXISTING
// SEARCH/RESEARCH TAB. DO NOT CREATE A SEPARATE RESEARCH ENGINE.") ─────────
// The top of this tab is now a live feed over src/research-intel-ai.js —
// real web-search-grounded findings (reusing the same callAnthropicWithSearch
// chokepoint Command Center already uses), refreshed daily (server.js
// 8:35 ET slot) plus on-demand via the Refresh button below, GET/POST
// /api/research/intel[/refresh]. This produces RESEARCH/EVIDENCE only — no
// verdict, no entry/stop/target — the existing central engine
// (am-core-engine.js/opportunity-engine.js) is untouched and still owns the
// trading decision.
//
// ── STATIC SECTION (2026-08-30, original build) ────────────────────────────
// Below the live feed, the original one-time-synthesized macro/valuation/
// AI-capex report (5 parallel research streams) stays as a collapsed, dated
// reference — nothing from the original build was deleted, just demoted
// now that the live system above is the primary surface.

import { useState, useEffect, useCallback } from "react";

const AS_OF = "Aug 28–30, 2026";

const TAG_STYLE = (C) => ({
  real:        { bg: C.greenBg,  fg: C.green },
  derived:     { bg: C.accentGlow, fg: C.accent },
  scenario:    { bg: C.amberBg,  fg: C.amber },
  assumption:  { bg: C.card,     fg: C.textDim },
  unavailable: { bg: C.redBg,    fg: C.red },
});

function Tag({ C, MONO, kind, children }) {
  const s = TAG_STYLE(C)[kind] || TAG_STYLE(C).assumption;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", fontFamily: MONO, fontSize: 9.5,
      fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase",
      padding: "2px 6px", borderRadius: 4, background: s.bg, color: s.fg, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function Section({ C, MONO, SANS, num, title, children }) {
  return (
    <section style={{ marginTop: 40, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.accent, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>{num}</div>
      <h2 style={{ fontFamily: SANS, fontSize: 21, fontWeight: 800, color: C.text, margin: "0 0 14px" }}>{title}</h2>
      {children}
    </section>
  );
}

function StatTile({ C, MONO, label, value, detail, tone }) {
  const color = tone === "bad" ? C.red : tone === "warn" ? C.amber : tone === "good" ? C.green : C.text;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, color: C.textDim, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {detail && <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 3 }}>{detail}</div>}
    </div>
  );
}

function VerdictCard({ C, MONO, SANS, accent, badge, headline, rows }) {
  return (
    <div style={{ background: C.card, border: `1.5px solid ${accent}`, borderRadius: 12, padding: "20px 20px 18px", marginBottom: 14 }}>
      <span style={{
        display: "inline-block", fontFamily: MONO, fontWeight: 800, fontSize: 11.5, letterSpacing: 0.5,
        color: "#fff", background: accent, padding: "4px 10px", borderRadius: 6, marginBottom: 12,
      }}>{badge}</span>
      <div style={{ fontFamily: SANS, fontSize: 16.5, fontWeight: 700, color: C.text, marginBottom: 14, lineHeight: 1.4 }}>{headline}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        {rows.map((r, i) => (
          <div key={i}>
            <div style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, color: accent, fontWeight: 700, marginBottom: 3 }}>{r.k}</div>
            <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.5 }}>{r.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Live Research Intelligence components ──────────────────────────────
const STATUS_STYLE = (C) => ({
  NEW: { bg: C.accentGlow, fg: C.accent, label: "NEW" },
  STRENGTHENED: { bg: C.greenBg, fg: C.green, label: "STRENGTHENED" },
  WEAKENED: { bg: C.amberBg, fg: C.amber, label: "WEAKENED" },
  INVALIDATED: { bg: C.redBg, fg: C.red, label: "INVALIDATED" },
  UNCHANGED: { bg: C.card, fg: C.textDim, label: "UNCHANGED" },
});
function StatusBadge({ C, MONO, status }) {
  const s = STATUS_STYLE(C)[status] || STATUS_STYLE(C).NEW;
  return (
    <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, padding: "2px 7px", borderRadius: 4, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>{s.label}</span>
  );
}

const CLASS_META = {
  EARLY_OPPORTUNITY: { icon: "🟢", label: "EARLY OPPORTUNITY" },
  DEVELOPING: { icon: "🟢", label: "DEVELOPING" },
  CONFIRMED: { icon: "🟡", label: "CONFIRMED" },
  CROWDED: { icon: "🟠", label: "CROWDED" },
  LATE_DO_NOT_CHASE: { icon: "🔴", label: "LATE / DO NOT CHASE" },
  NEGATIVE_CATALYST: { icon: "🔴", label: "NEGATIVE CATALYST" },
};

function RiskChip({ C, MONO, risk }) {
  if (!risk) return null;
  const fg = risk === "HIGH" ? C.red : risk === "MEDIUM" ? C.amber : C.green;
  const bg = risk === "HIGH" ? C.redBg : risk === "MEDIUM" ? C.amberBg : C.greenBg;
  return <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: bg, color: fg }}>{risk} RISK</span>;
}

function ScoreDial({ C, MONO, label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{Number.isFinite(value) ? value : "—"}</div>
      <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, color: C.textDim }}>{label}</div>
    </div>
  );
}

function ResearchCardView({ C, MONO, SANS, card }) {
  const meta = CLASS_META[card.classification] || CLASS_META.DEVELOPING;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: C.text, lineHeight: 1.35 }}>{meta.icon} {card.headline}</div>
        <StatusBadge C={C} MONO={MONO} status={card.status} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: C.textDim, textTransform: "uppercase" }}>{card.category}</span>
        <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.textDim }}>· {meta.label}</span>
        {card.dataQuality && <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>· {card.dataQuality}</span>}
        {card.policyStatus && <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>· policy: {card.policyStatus}</span>}
      </div>
      {card.whatChanged && <div style={{ fontSize: 12.5, color: C.textSec, marginBottom: 6 }}><b style={{ color: C.text }}>What changed:</b> {card.whatChanged}</div>}
      {card.whyItMatters && <div style={{ fontSize: 12.5, color: C.textSec, marginBottom: 6 }}><b style={{ color: C.text }}>Why it matters:</b> {card.whyItMatters}</div>}
      {card.marketExpectation && <div style={{ fontSize: 12.5, color: C.textSec, marginBottom: 6 }}><b style={{ color: C.text }}>Market expects:</b> {card.marketExpectation}</div>}
      {card.mispriced && <div style={{ fontSize: 12.5, color: C.textSec, marginBottom: 6 }}><b style={{ color: C.text }}>May be mispriced:</b> {card.mispriced}</div>}
      {(card.beneficiaries?.length || card.losers?.length) ? (
        <div style={{ fontSize: 12.5, color: C.textSec, marginBottom: 6 }}>
          {card.beneficiaries?.length ? <><b style={{ color: C.green }}>Beneficiaries:</b> {card.beneficiaries.join(", ")}  </> : null}
          {card.losers?.length ? <><b style={{ color: C.red }}>Losers:</b> {card.losers.join(", ")}</> : null}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 18, alignItems: "center", margin: "10px 0" }}>
        <ScoreDial C={C} MONO={MONO} label="Opportunity" value={card.opportunity} />
        <ScoreDial C={C} MONO={MONO} label="Confidence" value={card.confidence} />
        <RiskChip C={C} MONO={MONO} risk={card.risk} />
        {card.timing && <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>⏱ {card.timing}</span>}
      </div>
      {card.confirms && <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 3 }}><b>Confirms:</b> {card.confirms}</div>}
      {card.invalidates && <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 3 }}><b>Invalidates:</b> {card.invalidates}</div>}
      {card.sources?.length ? <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 8, borderTop: `1px dashed ${C.border}`, paddingTop: 6 }}>Sources: {card.sources.join(" · ")}</div> : null}
    </div>
  );
}

function TechCardView({ C, MONO, SANS, t }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.accent}55`, borderRadius: 10, padding: "14px 16px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: C.text }}>🔬 {t.technology}</div>
        <StatusBadge C={C} MONO={MONO} status={t.status} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 8 }}>{t.maturity} · adoption: {t.adoptionTimeline || "—"}</div>
      {t.problemSolved && <div style={{ fontSize: 12.5, color: C.textSec, marginBottom: 6 }}><b style={{ color: C.text }}>Solves:</b> {t.problemSolved}</div>}
      {t.whyNow && <div style={{ fontSize: 12.5, color: C.textSec, marginBottom: 6 }}><b style={{ color: C.text }}>Why now:</b> {t.whyNow}</div>}
      {t.marketSize && <div style={{ fontSize: 12.5, color: C.textSec, marginBottom: 6 }}><b style={{ color: C.text }}>Market size:</b> {t.marketSize}</div>}
      {t.publicCompanies?.length ? <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b style={{ color: C.text }}>Public companies:</b> {t.publicCompanies.join(", ")}</div> : null}
      {t.supplyChain?.length ? <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b style={{ color: C.text }}>Supply chain:</b> {t.supplyChain.join(", ")}</div> : null}
      {(t.winners?.length || t.losers?.length) ? (
        <div style={{ fontSize: 12.5, color: C.textSec, marginBottom: 6 }}>
          {t.winners?.length ? <><b style={{ color: C.green }}>Winners:</b> {t.winners.join(", ")}  </> : null}
          {t.losers?.length ? <><b style={{ color: C.red }}>Losers:</b> {t.losers.join(", ")}</> : null}
        </div>
      ) : null}
      {t.risks?.length ? <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 4 }}><b>Risks:</b> {t.risks.join("; ")}</div> : null}
      {t.sources?.length ? <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 8, borderTop: `1px dashed ${C.border}`, paddingTop: 6 }}>Sources: {t.sources.join(" · ")}</div> : null}
    </div>
  );
}

function NarrativeShiftBanner({ C, MONO, SANS, shift }) {
  return (
    <div style={{ background: C.amberBg, border: `1.5px solid ${C.amber}`, borderRadius: 10, padding: "12px 16px", marginBottom: 10 }}>
      <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 12, color: C.amber, marginBottom: 6 }}>🚨 NARRATIVE SHIFT — {shift.dimension}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 4 }}>{shift.priorState} → {shift.state}</div>
      {shift.whyItMatters && <div style={{ fontSize: 12.5, color: C.textSec }}>{shift.whyItMatters}</div>}
    </div>
  );
}

function LiveIntel({ C, MONO, SANS }) {
  const [intel, setIntel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch("/api/research/intel").then((r) => r.json())
      .then((d) => { if (d.ok) setIntel(d.intel); else setError(d.error || "Failed to load research."); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = () => {
    setRefreshing(true); setError(null);
    fetch("/api/research/intel/refresh", { method: "POST" }).then((r) => r.json())
      .then((d) => { if (d.ok) setIntel(d.intel); else setError(d.error || "Refresh failed."); })
      .catch((e) => setError(e.message))
      .finally(() => setRefreshing(false));
  };

  const shifts = (intel?.narrativeShifts || []).filter((s) => s.shifted);
  const cards = intel?.cards || [];
  const visibleCards = showUnchanged ? cards : cards.filter((c) => c.status !== "UNCHANGED");
  const unchangedCount = cards.length - cards.filter((c) => c.status !== "UNCHANGED").length;
  const tech = intel?.techDiscoveries || [];

  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.accent, fontWeight: 700, marginBottom: 6 }}>Live · Early Intelligence Layer</div>
          <h2 style={{ fontFamily: SANS, fontWeight: 800, fontSize: 20, margin: 0, color: C.text }}>What's changing before the crowd sees it</h2>
        </div>
        <button onClick={refresh} disabled={refreshing} style={{
          fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 8,
          border: `1px solid ${C.accent}`, background: refreshing ? C.card : C.accent, color: refreshing ? C.accent : "#fff",
          cursor: refreshing ? "default" : "pointer", whiteSpace: "nowrap",
        }}>{refreshing ? "Researching…" : "↻ Refresh Research"}</button>
      </div>

      {loading && <div style={{ fontSize: 13, color: C.textDim }}>Loading research intelligence…</div>}
      {!loading && error && <div style={{ fontSize: 13, color: C.red, background: C.redBg, borderRadius: 8, padding: "10px 14px" }}>{error}</div>}
      {!loading && !error && !intel && (
        <div style={{ fontSize: 13, color: C.textDim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
          No research generated yet. This runs automatically once a day (8:35 AM ET), or click "Refresh Research" to generate one now.
          {" "}Requires <code>ANTHROPIC_API_KEY</code> to be configured.
        </div>
      )}

      {!loading && intel && (
        <>
          {intel.dailyQuestion && (
            <div style={{ background: C.accentGlow, border: `1px solid ${C.accent}`, borderRadius: 10, padding: "14px 18px", marginBottom: 16, fontSize: 13.5, color: C.text, lineHeight: 1.6 }}>
              <b style={{ color: C.accent }}>Today's question — where's the opportunity before the crowd:</b> {intel.dailyQuestion}
            </div>
          )}

          {shifts.map((s, i) => <NarrativeShiftBanner key={i} C={C} MONO={MONO} SANS={SANS} shift={s} />)}

          {visibleCards.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: unchangedCount ? 8 : 20 }}>
              {visibleCards.map((c, i) => <ResearchCardView key={i} C={C} MONO={MONO} SANS={SANS} card={c} />)}
            </div>
          )}
          {!visibleCards.length && !unchangedCount && <div style={{ fontSize: 12.5, color: C.textDim, marginBottom: 16 }}>No material findings in the last run.</div>}
          {unchangedCount > 0 && (
            <button onClick={() => setShowUnchanged((v) => !v)} style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, background: "none", border: "none", cursor: "pointer", padding: "4px 0 20px", textDecoration: "underline" }}>
              {showUnchanged ? "Hide" : "Show"} {unchangedCount} unchanged item{unchangedCount === 1 ? "" : "s"} from before
            </button>
          )}

          {tech.length > 0 && (
            <>
              <h3 style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, margin: "8px 0 12px", color: C.text }}>Emerging Technology Watch</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 8 }}>
                {tech.map((t, i) => <TechCardView key={i} C={C} MONO={MONO} SANS={SANS} t={t} />)}
              </div>
            </>
          )}

          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 14 }}>
            {intel.generatedAt ? `Generated ${new Date(intel.generatedAt).toLocaleString()}` : ""}{intel.priorAt ? ` · previous run ${new Date(intel.priorAt).toLocaleString()}` : ""}
          </div>
        </>
      )}
    </section>
  );
}

const SCENARIOS = [
  {
    n: 1, title: "Growth Slows + Inflation Falls", sub: "Disinflationary soft landing", current: false,
    chain: "Fed cuts resume → yields fall, curve bull-steepens → SPY up (multiple room) → QQQ strong (duration leads) → IWM best relative performer → DXY weakens → Gold flat-to-up → BTC strong (risk-on liquidity)",
    horizon: "Winners: Tech, Discretionary, small-caps, credit. Losers: Staples/Utilities (relative). Durable only if disinflation is productivity-driven, not demand-destruction-driven.",
  },
  {
    n: 2, title: "Growth Slows + Inflation Stays High", sub: "Stagflation-lite", current: true,
    chain: "Fed on hold, real hike risk (3 dissents) → yields elevated/choppy → SPY pressured (multiple compression) → QQQ bifurcated: real-earnings names hold, story names vulnerable → IWM weakest → DXY firm/rising → Gold choppy short-term, structurally supported → BTC pressured, tracks QQQ risk-off",
    horizon: "Winners: Energy, quality/value, earnings-backed AI infra. Losers: unprofitable growth, small-caps, discretionary. Resolves toward #1 or #4 depending on Sep 16 FOMC + next prints.",
  },
  {
    n: 3, title: "Recession + Aggressive Fed Cuts", sub: "", current: false,
    chain: "Fed emergency-style cuts → yields collapse, long bonds rally hard → SPY sharp drawdown from CAPE-42 start → QQQ hit hardest (37% top-10 concentration) → IWM hit hardest of all → DXY spikes then fades → Gold strong (safe haven + real-rate collapse) → BTC sharp drop then recovery",
    horizon: "Winners: Staples, Utilities, Healthcare, long Treasuries, gold. Losers: Discretionary, small-cap industrials, credit-sensitive AI capex names. Historically the best entry point of the six, if it occurs.",
  },
  {
    n: 4, title: "Strong Growth + Sticky Inflation", sub: "", current: false,
    chain: "Fed resumes hikes → yields rise further, long-duration pain → SPY pressured despite good earnings → QQQ most exposed to duration unless earnings offset → IWM mixed → DXY strong → Gold pressured (real rates rise) → BTC pressured",
    horizon: "Winners: Energy, Financials. Losers: Long-duration growth, REITs, small-caps. Multiple compression is the dominant risk from today's starting valuation.",
  },
  {
    n: 5, title: "AI Productivity Boom + Falling Inflation", sub: "", current: false,
    chain: "Fed cuts as productivity-driven disinflation confirms → yields fall → SPY strong (best-of-both) → QQQ very strong, capex visibly self-funding → IWM strong, gains broaden → DXY moderate/soft → Gold mixed → BTC strong",
    horizon: "Winners: Broad tech, industrial automation, power/infrastructure, semis. This scenario resolves the debt-service arithmetic (§3) favorably — watch for broadening productivity/wage data, not just capex headlines.",
  },
  {
    n: 6, title: "AI Capex Slowdown / Bubble Unwind", sub: "", current: false,
    chain: "Fed uncertain, may cut into growth-shock → initial flight-to-quality, long end may stay elevated on fiscal concerns → SPY sharp drawdown (concentration) → QQQ severe drawdown → IWM sympathy selloff, less structurally exposed → DXY volatile → Gold strong (debt/credibility hedge) → BTC crashes then possible decoupling",
    horizon: "Winners: Debt-free balance sheets, defensive value, gold. Losers: Hyperscaler-capex-linked semis/power/data-center names. Trigger: any hyperscaler guiding AI capex down next earnings cycle.",
  },
];

const WATCH_ROWS = [
  ["FOMC decision", "Sep 16, 2026", "Hike/hawkish-hold confirms Scenario 2. Dovish pivot shifts toward Scenario 1."],
  ["Core PCE", "Next monthly release", "Break below 3.0% = disinflation confirmed. Hold ≥ 3.3% = stickiness confirmed."],
  ["Nonfarm payrolls", "Next print", "Third weak/negative print confirms labor deterioration. Rebound = July was noise."],
  ["Hyperscaler capex guidance", "Q3 2026 earnings", "Continued acceleration supports Scenario 5. Any guide-down is the first hard signal for Scenario 6."],
  ["Nvidia Data Center revenue", "Next quarterly print", "Holding >100% YoY keeps the thesis intact. Deceleration toward 20–30% → re-underwrite the selective LONG."],
  ["Credit card delinquency rate", "Not yet sourced — gap", "Rising delinquencies would confirm consumer-stress bifurcation implied by falling savings + rising balances."],
  ["IG / HY credit spreads", "Not yet sourced — gap", "Cleanest available signal for distinguishing an ordinary slowdown from real credit stress."],
  ["Long-end Treasury auctions", "Next scheduled auctions", "Weak demand / tailing auctions would confirm fiscal-supply pressure on long yields."],
];

const SECTOR_ROWS = [
  ["AI / Semiconductors", "Real, verified: Nvidia Data Center revenue +117% YoY; hyperscaler capex roughly doubling YoY across Microsoft/Google/Amazon, accelerating at Meta.", "real"],
  ["Power / Utilities / Nuclear", "Hyperscaler nuclear PPAs are widely reported, but current 2026 status/figures could not be independently re-verified this pass.", "assumption"],
  ["Robotics / Industrial Automation", "Not reached this research pass — no real current data retrieved.", "unavailable"],
  ["Defense, Healthcare, Cybersecurity, Energy", "Not reached this research pass.", "unavailable"],
  ["Sector rotation / market breadth", "Direct source fetches (S&P DJI, Finviz, Reuters) were blocked or empty this pass.", "unavailable"],
];

const GAPS = [
  "Wage growth, inflation expectations (Michigan/NY Fed), PPI — not retrieved this pass.",
  "Consumer spending detail (PCE by category), ISM PMI, business/consumer confidence — not retrieved.",
  "Debt-to-GDP ratio, Treasury issuance mix, foreign Treasury holdings trend, NY Fed term-premium estimate — blocked by source access this pass.",
  "AI capex financing mix (debt vs. free cash flow), enterprise AI productivity/ROI data, hyperscaler AI-product revenue run-rates — not retrieved.",
  "Power/data-center demand figures, current nuclear PPA status, robotics economy data — not retrieved.",
  "Sector rotation, market breadth, credit spreads — source fetches blocked this pass.",
  "Current tariff rates / specific 2026 fiscal policy actions — no verifiable current specifics found.",
  "Credit card delinquency rate — not retrieved (balance and savings-rate data were available; delinquency was not).",
];

export default function ResearchTab({ C, MONO, SANS }) {
  const tagKind = (k) => k;
  const [showStatic, setShowStatic] = useState(false);
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 80px", fontFamily: SANS, color: C.text }}>
      <LiveIntel C={C} MONO={MONO} SANS={SANS} />

      <button onClick={() => setShowStatic((v) => !v)} style={{
        fontFamily: MONO, fontSize: 11.5, color: C.textDim, background: "none", border: `1px solid ${C.border}`,
        borderRadius: 8, padding: "8px 14px", cursor: "pointer", marginBottom: showStatic ? 20 : 40,
      }}>{showStatic ? "▾" : "▸"} {showStatic ? "Hide" : "Show"} previous manual snapshot report (Aug 28–30, 2026)</button>

      {showStatic && (
      <>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.accent, fontWeight: 700, marginBottom: 10 }}>
        Research Desk
      </div>
      <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: "clamp(24px, 4vw, 32px)", lineHeight: 1.2, margin: "0 0 12px", color: C.text }}>
        Where Is the Money, and How Early Are We?
      </h1>
      <p style={{ fontSize: 14.5, color: C.textSec, maxWidth: 640, margin: "0 0 16px" }}>
        A macro, valuation, and opportunity-scenario report built from five parallel live-research streams
        (Fed &amp; rates, federal debt &amp; bonds, S&amp;P/Nasdaq valuation, AI capex, employment &amp; sectors),
        synthesized into one working verdict. Point-in-time snapshot, not a live feed — re-run before the
        next FOMC decision.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontFamily: MONO, fontSize: 11.5, color: C.textDim, marginBottom: 8 }}>
        <span><b style={{ color: C.textSec }}>As of</b> {AS_OF}</span>
        <span><b style={{ color: C.textSec }}>Method</b> Multi-stream live web research, primary sources preferred</span>
      </div>

      {/* legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", margin: "16px 0" }}>
        <span style={{ fontSize: 11.5, color: C.textDim }}>Data confidence:</span>
        <Tag C={C} MONO={MONO} kind="real">Real data</Tag>
        <Tag C={C} MONO={MONO} kind="derived">Derived</Tag>
        <Tag C={C} MONO={MONO} kind="scenario">Scenario logic</Tag>
        <Tag C={C} MONO={MONO} kind="assumption">Assumption</Tag>
        <Tag C={C} MONO={MONO} kind="unavailable">Unavailable</Tag>
      </div>

      {/* 01 verdict */}
      <Section C={C} MONO={MONO} SANS={SANS} num="01 · THE VERDICT" title="Broad Beta: WAIT. Selective: LONG (earnings-backed AI infra only).">
        <p style={{ fontSize: 13.5, color: C.textSec, marginBottom: 14 }}>
          The evidence supports a bifurcated call, not one clean market-wide BUY or SELL. Index-level valuation
          is stretched further than at almost any point outside 1999–2000 — and the single largest driver of
          that stretch (Nvidia) has real earnings growth currently outrunning its own price.
        </p>
        <VerdictCard C={C} MONO={MONO} SANS={SANS} accent={C.accent} badge="BROAD SPY / QQQ BETA → WAIT"
          headline="Do not add broad index exposure at current valuation and macro posture."
          rows={[
            { k: "Why Now", v: "CAPE 42.2 (2.4× its historical mean), negative equity risk premium (≈ −1.4%), 37.3% of index weight in 10 stocks — while GDP growth just decelerated 2.1%→1.5% and payrolls just printed negative." },
            { k: "Confirms It", v: "A hawkish Sep 16 FOMC outcome, a third weak/negative payrolls print, or core PCE holding ≥3.3%." },
            { k: "Invalidates It", v: "A confirmed dovish pivot, core PCE breaking below 3.0%, or two consecutive payroll prints back above +100K." },
            { k: "Best Vehicle", v: "Cash / short-duration T-bills for undeployed capital; avoid adding broad-index or small-cap (IWM) beta." },
            { k: "Exit Condition", v: "Data-dependent, not fixed-duration — re-underwrite at Sep 16 FOMC and the next core PCE + payrolls prints." },
          ]}
        />
        <VerdictCard C={C} MONO={MONO} SANS={SANS} accent={C.green} badge="SELECTIVE: EARNINGS-BACKED AI INFRA → LONG"
          headline="The one segment where real growth still exceeds the multiple."
          rows={[
            { k: "Why Now", v: "Nvidia's forward P/E (18.0×) sits below the S&P 500's own trailing P/E (29.7×), despite 83–117% YoY revenue growth and accelerating Q3 guidance." },
            { k: "Confirms It", v: "Continued hyperscaler capex guidance increases in Q3 2026 earnings; Nvidia Data Center revenue holding >100% YoY next print." },
            { k: "Invalidates It", v: "Any hyperscaler guiding capex down next cycle, or Nvidia Data Center growth decelerating toward 20–30%." },
            { k: "Entry / Stop", v: "Entry: current levels, scaled (not full size — financing/monetization data gaps remain). Stop: a confirmed hyperscaler capex guide-down." },
            { k: "Risk / Reward", v: "Favorable if the capex-to-revenue chain holds — but Nvidia is also 7.9% of the S&P 500 itself, so this is a concentration bet, not a diversifier." },
          ]}
        />
        <div style={{ borderLeft: `3px solid ${C.amber}`, background: C.amberBg, borderRadius: "0 8px 8px 0", padding: "12px 16px", fontSize: 13, lineHeight: 1.6 }}>
          <b>Primary question, answered directly:</b> the best-evidenced opportunity right now is narrow, not
          broad — real AI-infrastructure earnings growth still outrunning its own multiple, inside a broader
          index priced for perfection it may not get. <b>Late-stage in the AI-infrastructure re-rating</b>
          (multiples already re-rated) but <b>early-to-mid in the earnings-delivery cycle</b> (revenue still
          accelerating). Trade the earnings delivery, not the broad multiple. Exit discipline: the moment
          hyperscaler capex guidance turns down, this stops being a growth story and starts being Scenario 6.
        </div>
      </Section>

      {/* 02 regime */}
      <Section C={C} MONO={MONO} SANS={SANS} num="02 · CURRENT REGIME" title="Growth Slowing, Inflation Sticky, Fed Genuinely Split">
        <p style={{ fontSize: 13.5, color: C.textSec, marginBottom: 14 }}>
          Every hard data point retrieved this pass points the same direction: the U.S. economy is in
          <b> Scenario 2 — growth slows, inflation stays high</b> — the least comfortable of the six scenarios
          below, and the one requiring the most selectivity.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 8, marginBottom: 16 }}>
          <StatTile C={C} MONO={MONO} label="Fed Funds Target" value="3.50–3.75%" detail="held 5 meetings · next FOMC Sep 16" />
          <StatTile C={C} MONO={MONO} label="Real GDP (Q2 '26)" value="+1.5%" tone="warn" detail="annualized, down from +2.1% Q1" />
          <StatTile C={C} MONO={MONO} label="Core PCE YoY" value="3.3%" tone="warn" detail="stuck, Fed's preferred gauge" />
          <StatTile C={C} MONO={MONO} label="Headline CPI YoY" value="3.4%" detail="2nd straight monthly deceleration" />
          <StatTile C={C} MONO={MONO} label="Nonfarm Payrolls" value="−23K" tone="bad" detail="July; −103K combined revision" />
          <StatTile C={C} MONO={MONO} label="Unemployment Rate" value="4.1%" detail="fell on shrinking participation, not hiring" />
          <StatTile C={C} MONO={MONO} label="10Y / 30Y Treasury" value="4.72% / 5.21%" detail="curve normal, 2s10s ≈ +37bp" />
          <StatTile C={C} MONO={MONO} label="Federal Debt" value="$40.08T" detail="as of Aug 27 · $32.31T held by public" />
          <StatTile C={C} MONO={MONO} label="Net Interest Expense" value="~$800B+/yr" tone="bad" detail="FY26 YTD (10mo) ≈ $690.5B" />
          <StatTile C={C} MONO={MONO} label="DXY" value="99.7" detail="rebounding from 3-mo low 98.8" />
          <StatTile C={C} MONO={MONO} label="Gold" value="$4,454/oz" detail="+29% YoY, −3.2% on Fed hawkishness" />
          <StatTile C={C} MONO={MONO} label="WTI Crude" value="$83.44/bbl" detail="−4% weekly, Gulf flows partly recover" />
        </div>
        <p style={{ fontSize: 13.5, color: C.textSec, marginBottom: 10 }}>
          <b style={{ color: C.text }}>The Jackson Hole tension:</b> Fed Chair Kevin Warsh said inflation is "not
          meaningfully slowing," and three FOMC members dissented in July favoring a hike <Tag C={C} MONO={MONO} kind="real">real</Tag> —
          markets moved to roughly 50% odds of a September hike, not a cut. That sits awkwardly against the same
          week's CPI print cooling to 3.4%. <Tag C={C} MONO={MONO} kind="derived">derived</Tag> The Fed is reacting to the stickier core
          PCE measure (3.3%, unchanged), not the friendlier CPI print — a market pricing on CPI alone could be
          caught offside into Sep 16.
        </p>
        <p style={{ fontSize: 13.5, color: C.textSec }}>
          <b style={{ color: C.text }}>Labor market:</b> JOLTS (June 2026) shows openings down (7.359M, −178K) but
          quits/layoffs essentially flat — a "low-hire, low-fire" stall, not a layoff spike. <Tag C={C} MONO={MONO} kind="real">real</Tag> Retail
          (−19.4K) and government (−53K) led July job losses; healthcare (+22K) was the bright spot. <Tag C={C} MONO={MONO} kind="real">real</Tag> A
          specific current figure for AI-attributable layoffs could not be verified. <Tag C={C} MONO={MONO} kind="unavailable">unavailable</Tag>
        </p>
      </Section>

      {/* 03 interaction */}
      <Section C={C} MONO={MONO} SANS={SANS} num="03 · THE INTERACTION TO WATCH" title="Debt + High Rates + AI Capex + Productivity + Employment + Inflation">
        <p style={{ fontSize: 13.5, color: C.textSec, marginBottom: 12 }}>
          Net interest expense on federal debt is running at roughly <b>$800B+/yr</b> <Tag C={C} MONO={MONO} kind="real">real</Tag> — while the
          30-year Treasury sits at 5.21% without the Fed hiking long rates directly, more consistent with
          term-premium/fiscal-supply pressure than pure monetary tightening. <Tag C={C} MONO={MONO} kind="derived">derived</Tag> AI infrastructure
          buildout is capital-intensive and increasingly reported (not independently re-verified this pass) to
          lean on debt/off-balance-sheet financing. <Tag C={C} MONO={MONO} kind="unavailable">unverified this pass</Tag> If long-end yields stay
          elevated for fiscal reasons even as the Fed eventually cuts short rates, the cost of capital for
          debt-financed data-center buildout doesn't necessarily fall in lockstep with Fed policy.
        </p>
        <p style={{ fontSize: 13.5, color: C.textSec }}>
          Real GDP growth is decelerating and payrolls just turned negative <Tag C={C} MONO={MONO} kind="real">real</Tag> — which puts real
          weight on whether Scenario 5 (AI productivity lifting growth while disinflating) is actually showing up
          in the hard data, versus AI capex being a large, concentrated, partly self-referential loop (hyperscaler
          capex → Nvidia chip revenue → hyperscaler earnings) that hasn't yet visibly broadened into aggregate
          productivity, wage, or employment gains. Nvidia's Data Center revenue (+117% YoY) is real and verified
          <Tag C={C} MONO={MONO} kind="real">real</Tag> — enterprise AI productivity data, hyperscaler AI-product revenue run-rates, and the
          capex financing mix were not. <Tag C={C} MONO={MONO} kind="unavailable">unavailable</Tag> The defensible read: AI capex and its direct chip-revenue
          link are real and accelerating; its claim on solving the debt-service arithmetic via broad productivity
          gains is not yet demonstrated — an open question, not a resolved one.
        </p>
      </Section>

      {/* 04 scenarios */}
      <Section C={C} MONO={MONO} SANS={SANS} num="04 · SIX SCENARIOS" title="Fed → Bonds → Equities → Dollar → Gold → BTC → Sectors">
        <p style={{ fontSize: 13, color: C.textDim, marginBottom: 14 }}>
          Built on real starting conditions above; the cross-asset chains are standard macro transmission logic,
          not fabricated data <Tag C={C} MONO={MONO} kind="scenario">scenario logic</Tag> — stress-test against these, don't treat as predictions.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12 }}>
          {SCENARIOS.map((s) => (
            <div key={s.n} style={{
              background: C.card, border: `1px solid ${s.current ? C.accent : C.border}`,
              boxShadow: s.current ? `inset 0 0 0 1px ${C.accent}` : "none",
              borderRadius: 10, padding: "14px 16px 12px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: C.text, lineHeight: 1.35 }}>
                  {s.n} · {s.title}
                  {s.sub && <span style={{ display: "block", fontWeight: 400, color: C.textDim, fontSize: 12 }}>{s.sub}</span>}
                </div>
                {s.current && <Tag C={C} MONO={MONO} kind="real">Current</Tag>}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textSec, lineHeight: 1.8, marginBottom: 8 }}>{s.chain}</div>
              <div style={{ fontSize: 11.5, color: C.textDim, borderTop: `1px dashed ${C.border}`, paddingTop: 8 }}>{s.horizon}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* 05 valuation */}
      <Section C={C} MONO={MONO} SANS={SANS} num="05 · VALUATION & MISPRICING" title="Where the Market May Be Pricing It Wrong">
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
            <thead>
              <tr>
                {["Metric", "Level", "Context"].map(h => (
                  <th key={h} style={{ textAlign: "left", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", color: C.textDim, background: C.card, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Shiller CAPE (S&P 500)", "42.2", "vs. mean 17.4 / median 16.1 — 2nd-highest reading on record after 1999–2000"],
                ["Trailing P/E (S&P 500)", "29.7", "well above long-run norms"],
                ["Equity risk premium", "≈ −1.4%", "earnings yield below the 10Y — rare, last seen persistently ~1999–2001"],
                ["Top-10 index concentration", "37.3%", "index-level valuation is largely a statement about ~9 names"],
                ["NVDA forward P/E", "18.0", "below the index's own trailing P/E, against 83–117% YoY growth"],
                ["MSFT forward P/E", "26.0", "vs. 17.8% revenue growth — a more ordinary multiple-to-growth ratio"],
              ].map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} style={{ padding: "9px 12px", borderBottom: i < 5 ? `1px solid ${C.border}` : "none", fontFamily: j === 1 ? MONO : SANS, color: C.textSec, fontVariantNumeric: "tabular-nums" }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 13.5, color: C.textSec, marginBottom: 8 }}>
          <b style={{ color: C.text }}>1. Index-wide vs. name-specific mispricing.</b> Index-level CAPE/ERP signals
          genuine excess, but it's not evenly distributed — NVDA's own multiple compressed even as its price
          rose, because earnings grew faster. "The market is expensive" and "NVDA is expensive" are not the same
          claim. <Tag C={C} MONO={MONO} kind="derived">derived</Tag>
        </p>
        <p style={{ fontSize: 13.5, color: C.textSec, marginBottom: 8 }}>
          <b style={{ color: C.text }}>2. Gold's rate-driven dip vs. its structural driver.</b> Gold fell 3.2% in
          a single session on hawkish Fed repricing, even as the structural backdrop behind its +29% YoY run
          (a $40T+ debt load, $800B+/yr interest) didn't change that day. <Tag C={C} MONO={MONO} kind="derived">derived</Tag> <Tag C={C} MONO={MONO} kind="scenario">opinion, not a signal</Tag>
        </p>
        <p style={{ fontSize: 13.5, color: C.textSec }}>
          <b style={{ color: C.text }}>3. Long-end Treasury yields.</b> The 30Y at 5.21% with a non-inverted curve
          is consistent with either "sticky inflation priced correctly" or "term premium/fiscal supply pushing
          yields above what growth/inflation alone would justify" — a current NY Fed term-premium estimate
          couldn't be obtained to adjudicate. <Tag C={C} MONO={MONO} kind="unavailable">unavailable</Tag>
        </p>
      </Section>

      {/* 06 sectors */}
      <Section C={C} MONO={MONO} SANS={SANS} num="06 · FUTURE SECTORS" title="What the Data Actually Supports">
        <p style={{ fontSize: 13, color: C.textDim, marginBottom: 12 }}>The weakest-evidenced section of this report, reported that way deliberately rather than filled in with plausible-sounding claims.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SECTOR_ROWS.map(([sector, note, tag], i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ minWidth: 190, fontWeight: 700, fontSize: 13, color: C.text }}>{sector}</div>
              <div style={{ flex: 1, fontSize: 12.5, color: C.textSec, minWidth: 220 }}>{note}</div>
              <Tag C={C} MONO={MONO} kind={tagKind(tag)}>{tag}</Tag>
            </div>
          ))}
        </div>
      </Section>

      {/* 07 early warning */}
      <Section C={C} MONO={MONO} SANS={SANS} num="07 · EARLY WARNING INDICATORS" title="What to Track Next, and Why">
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 560 }}>
            <thead>
              <tr>
                {["Indicator", "Next data point", "What it would confirm / break"].map(h => (
                  <th key={h} style={{ textAlign: "left", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", color: C.textDim, background: C.card, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WATCH_ROWS.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} style={{ padding: "9px 12px", borderBottom: i < WATCH_ROWS.length - 1 ? `1px solid ${C.border}` : "none", color: C.textSec }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 08 investment map */}
      <Section C={C} MONO={MONO} SANS={SANS} num="08 · FINAL INVESTMENT MAP" title="">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <div style={{ background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: C.green, marginBottom: 8 }}>Top Opportunity</div>
            <div style={{ fontSize: 13, color: C.textSec }}>Earnings-backed AI infrastructure (Nvidia and its direct chip/infra chain) — real revenue growth still outrunning its own multiple. Selective, sized for concentration risk, not full conviction.</div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: C.textDim, marginBottom: 8 }}>Watchlist</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.textSec }}>
              <li style={{ marginBottom: 6 }}>Power/utilities/nuclear tied to data-center demand — real thesis, needs current-data re-verification.</li>
              <li style={{ marginBottom: 6 }}>Gold on rate-driven dips — structural debt/deficit support intact through hawkish pullbacks.</li>
              <li>Long-duration Treasuries — premature until Sep 16 FOMC or growth data deteriorate further.</li>
            </ul>
          </div>
          <div style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: C.red, marginBottom: 8 }}>Avoid / Reduce</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.textSec }}>
              <li style={{ marginBottom: 6 }}>Broad passive SPY/QQQ beta at full size — CAPE 42, negative ERP, 37% top-10 concentration.</li>
              <li style={{ marginBottom: 6 }}>Small-caps (IWM) — most exposed to "still-high-for-longer" real rates and a stalling labor market.</li>
              <li>Credit-sensitive consumer discretionary — real retail sales decline, rising credit card balances, low savings rate.</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* 09 gaps */}
      <Section C={C} MONO={MONO} SANS={SANS} num="09 · DATA GAPS & SOURCES" title="">
        <p style={{ fontSize: 13, color: C.textDim, marginBottom: 10 }}>In keeping with this platform's real-data-only discipline, every gap below is reported as a gap — nothing was estimated to fill it.</p>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 12.5, color: C.textSec }}>
          {GAPS.map((g, i) => <li key={i} style={{ marginBottom: 6 }}>{g}</li>)}
        </ul>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
          Federal Reserve (Jackson Hole remarks, FOMC schedule) · U.S. Treasury Fiscal Data API (debt outstanding,
          interest expense, MTS deficit data) · BLS-sourced employment/CPI data via tradingeconomics.com (direct
          BLS access blocked) · multpl.com (Shiller CAPE, S&P P/E, dividend yield, 10Y rate) · stockanalysis.com
          (SPY holdings/concentration, NVDA/MSFT financials) · Microsoft FY26 Q4 earnings release · Nvidia Q2
          FY2027 press release · Meta/Alphabet/Amazon Q2 2026 filings via stockanalysis.com.
        </div>
      </Section>

      <div style={{ marginTop: 50, paddingTop: 20, borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
        AM Trading Platform — Research Desk · Compiled from five parallel live-research streams, Aug 30, 2026.<br />
        Reflects data available at time of research; known gaps are disclosed above, not filled with estimates.
        Re-run before the Sep 16, 2026 FOMC decision.
      </div>
      </>
      )}
    </div>
  );
}
