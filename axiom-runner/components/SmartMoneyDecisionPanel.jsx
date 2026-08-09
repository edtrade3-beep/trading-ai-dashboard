import { useState, useEffect, useCallback } from "react";
import RadialGauge from "./RadialGauge.jsx";
import SmartMoneyPanel from "./SmartMoneyPanel.jsx";
import { computeInstitutionalSummary, computeBestInstitutionalZone } from "./market-helpers.js";

// Smart Money "AI Institutional Decision Engine" (explicit user spec,
// 2026-08-04, mockup attached: "Do not improve the existing layout —
// replace it"). Originally shipped as its own standalone page/sidebar tab
// (2026-08-05), then folded back into the Chart page as an embedded panel
// the same day per explicit user request ("move smart money tab under ai
// summary under the chart in chart tab") — no more separate page, no
// header/search UI of its own (the Chart page already has the symbol/price
// context), just the real decision content itself. A first-time user should
// know within 5 seconds whether to trade, why, where to enter/exit/target,
// and whether the market supports it. Fixed reading order every time: Hero
// Verdict -> Institutional Summary -> Trade Plan -> 3 Traffic Lights ->
// everything else is supporting evidence, collapsed by default (Section 8).
// Every number traces to /api/market/smart-money's real payload or reports
// an honest "—" — no invented "S+" grade (real ceiling is A+, see
// institutionalLetterGrade), no invented "Market Wind" (real substitute:
// getMarketSessionET's session read, both confirmed with the user).
//
// Headline verdict (2026-08-09, decision-clarity audit) — this panel used
// to compute its own verdict server-side (computeNextAction + a ported
// copy of the institutional-grade formula), which could genuinely disagree
// with the page's own Hero verdict for the same symbol (different decision
// logic, not just a rendering difference). Callers on Workspace now pass
// `heroAction` (the same primaryAction object the Hero card renders) so
// the headline here is always the same call, by construction — everything
// below the headline (confidence, setup grade, bias, trade plan, traffic
// lights, key reasons) is still this panel's own real institutional-flow
// evidence, unchanged.

const GUIDE_STEPS = [
  { t: "1s", label: "The Call", desc: "Same verdict as the page above" },
  { t: "1s", label: "Institutional Summary", desc: "Why, in plain English" },
  { t: "1s", label: "Trade Plan", desc: "Entry, stop, target" },
  { t: "2s", label: "3 Traffic Lights", desc: "Trend, Institutional, Market" },
];

function GuideRail({ C, MONO, SANS, isMobile }) {
  return (
    <div style={{
      display: "flex", flexDirection: isMobile ? "row" : "column", flexWrap: "wrap",
      gap: isMobile ? 10 : 14, padding: isMobile ? "10px 12px" : "14px 12px",
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      height: "fit-content",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", width: isMobile ? "100%" : "auto" }}>
        READ IT IN 5 SECONDS
      </div>
      {GUIDE_STEPS.map((s, i) => (
        <div key={s.label} style={{ display: "flex", gap: 8, alignItems: "flex-start", minWidth: isMobile ? 140 : "auto" }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.accent, background: `${C.accent}18`, borderRadius: 6, padding: "1px 6px", flexShrink: 0 }}>{i + 1}</div>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.text }}>{s.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{s.t} · {s.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrafficLight({ C, MONO, SANS, label, state, detail }) {
  const col = state === "green" ? C.green : state === "yellow" ? C.amber : state === "red" ? C.red : C.textDim;
  const dot = state === "green" ? "🟢" : state === "yellow" ? "🟡" : state === "red" ? "🔴" : "⚪";
  return (
    <div style={{ flex: 1, minWidth: 140, textAlign: "center", padding: "12px 10px", borderRadius: 10, border: `1px solid ${col}55`, background: `${col}0e` }}>
      <div style={{ fontSize: 26 }}>{dot}</div>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginTop: 4 }}>{label}</div>
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, color: col, marginTop: 2 }}>{detail}</div>
    </div>
  );
}

export default function SmartMoneyDecisionPanel({ symbol, C, MONO, SANS, setActiveTab, isMobile, heroAction }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = useCallback(async (sym) => {
    if (!sym) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/market/smart-money?symbol=${encodeURIComponent(sym)}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Failed to load");
      setData(d);
    } catch (e) { setError(e.message); setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(symbol); }, [symbol, load]);

  const summaryLines = data ? computeInstitutionalSummary(data) : [];
  const bestZone = data ? computeBestInstitutionalZone(data) : null;

  // heroAction (2026-08-09) — when the parent page passes its own already-
  // computed primaryAction down, that's the headline here too, so this
  // panel can never show a different buy/sell call than the rest of the
  // page for the same symbol at the same instant. Falls back to this
  // panel's own real verdict only when mounted standalone with no
  // heroAction prop (defensive, not the normal path on Workspace).
  const verdictLabel = heroAction ? heroAction.label : data?.verdict;
  const verdictColor = heroAction ? heroAction.color : (!data ? C.textDim : data.verdict === "BUY NOW" ? C.green : data.verdict === "AVOID" ? C.red : C.amber);
  const verdictIcon = heroAction
    ? (heroAction.tier >= 7 ? "🟢" : heroAction.tier === 6 ? "⚪" : heroAction.tier >= 3 ? "🟡" : "🔴")
    : (!data ? "⚪" : data.verdict === "BUY NOW" ? "🟢" : data.verdict === "AVOID" ? "🔴" : "🟡");

  const trendLight = data ? (data.trend.passCount >= 7 ? "green" : data.trend.passCount >= 6 ? "yellow" : "red") : null;
  const instLight = data ? (data.marketControl === "BUYERS" ? "green" : data.marketControl === "MIXED" ? "yellow" : "red") : null;
  const marketLight = data?.marketBias?.bias ? (data.marketBias.bias === "Bullish" ? "green" : data.marketBias.bias === "Neutral" ? "yellow" : "red") : null;
  const lights = [trendLight, instLight, marketLight].filter(Boolean);
  const greens = lights.filter((l) => l === "green").length;
  const yellows = lights.filter((l) => l === "yellow").length;
  const reds = lights.filter((l) => l === "red").length;
  const readingRule = lights.length < 3 ? "Loading…"
    : reds >= 2 ? "AVOID — multiple red flags"
    : reds >= 1 ? "HIGH RISK — one red flag"
    : yellows >= 2 ? "WAIT — two yellow flags"
    : yellows >= 1 ? "REDUCE SIZE — one yellow flag"
    : "EXECUTE — all 3 aligned";
  const readingRuleColor = lights.length < 3 ? C.textDim : reds >= 1 ? C.red : yellows >= 1 ? C.amber : C.green;

  const setup = data?.setup;
  const rr = setup && setup.entry > setup.stop ? Math.round(((setup.target2 - setup.entry) / (setup.entry - setup.stop)) * 10) / 10 : null;

  const sizeThisTrade = () => {
    if (!setup) return;
    try {
      localStorage.setItem("tradeplanner_load_plan", JSON.stringify({
        symbol, entry: Number(setup.entry), stop: Number(setup.stop),
        target: Number.isFinite(Number(setup.target2)) ? Number(setup.target2) : null,
        aplus: null, next: null, source: "Smart Money",
      }));
    } catch {}
    setActiveTab && setActiveTab("tradeplanner");
  };

  const copyPlan = () => {
    if (!setup) return;
    const text = `${symbol} — Entry $${setup.entry} · Stop $${setup.stop} · Target $${setup.target2}${rr != null ? ` · R:R ${rr}` : ""}`;
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" };
  const statBlock = (label, val, color, title) => (
    <div title={title} style={{ minWidth: 100 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: color || C.text, marginTop: 2 }}>{val}</div>
    </div>
  );

  if (!symbol) return null;

  return (
    <div>
      {loading && !data && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "8px 0" }}>⟳ Loading real Smart Money data…</div>}
      {error && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, padding: "8px 0" }}>⚠ {error}</div>}

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "200px 1fr", gap: 14, alignItems: "start" }}>
          <GuideRail C={C} MONO={MONO} SANS={SANS} isMobile={isMobile} />

          <div>
            {/* SECTION 1 — Hero Card (1 second). Verdict/confidence/grade all
                real, from /api/market/smart-money's computeNextAction /
                computeInstitutionalGrade / institutionalLetterGrade. If
                WAIT/AVOID, a real trader should stop reading here — the
                sections below still render as honest supporting evidence,
                never hidden. */}
            <div style={{ marginBottom: 14, border: `1px solid ${verdictColor}66`, borderRadius: 14, padding: "18px 20px", background: `${verdictColor}0d` }}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: verdictColor, display: "flex", alignItems: "center", gap: 10 }}>
                    <span>{verdictIcon}</span>{verdictLabel}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textDim, marginTop: 4, maxWidth: 380 }}>
                    {heroAction && <span style={{ opacity: 0.75 }}>Same call as the page verdict above — </span>}
                    {data.verdictReason}
                  </div>
                </div>
                <RadialGauge C={C} MONO={MONO} value={data.confidence} label="CONFIDENCE" color={verdictColor} size={130} />
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  {statBlock("SETUP GRADE", data.letterGrade, verdictColor)}
                  {statBlock("BIAS", data.bias, data.bias === "BULLISH" ? C.green : data.bias === "BEARISH" ? C.red : C.textDim)}
                  {statBlock("MARKET CONTROL", data.marketControl, data.marketControl === "BUYERS" ? C.green : data.marketControl === "SELLERS" ? C.red : C.amber)}
                  {statBlock("RISK", data.risk, data.risk === "LOW" ? C.green : data.risk === "HIGH" ? C.red : C.amber)}
                  {statBlock("WIN PROBABILITY", data.winProb?.winRate != null ? `${data.winProb.winRate}%` : data.winProb?.count != null ? `n=${data.winProb.count} (need 10)` : "—",
                    data.winProb?.winRate != null ? (data.winProb.winRate >= 55 ? C.green : data.winProb.winRate >= 45 ? C.amber : C.red) : C.textDim,
                    data.winProb?.winRate != null ? `Real forward ${data.winProb.horizon}-day win rate, n=${data.winProb.count}` : "Below the honest sample floor for this score band")}
                </div>
              </div>
            </div>

            {/* SECTION 2 + 7 — Institutional Summary (plain English, real
                template sentences) alongside Key Reasons (top 5 real
                reasons from the same institutional grade breakdown). */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.3fr 1fr", gap: 12, marginBottom: 14 }}>
              <div style={card}>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>INSTITUTIONAL SUMMARY</div>
                {summaryLines.map((l, i) => (
                  <div key={i} style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: 4 }}>{l}</div>
                ))}
              </div>
              <div style={card}>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>KEY REASONS</div>
                {(data.keyReasons || []).map((r, i) => (
                  <div key={i} style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, lineHeight: 1.5, marginBottom: 4, display: "flex", gap: 6 }}>
                    <span style={{ color: C.textDim }}>{i + 1}.</span>{r}
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION 3 — Trade Plan (1 second). Same real chart.setup
                numbers the Chart-page Execution Card shows — must match,
                not diverge. Position size deliberately omitted (relocated
                to Trade Planner's real risk-based sizing this session) in
                favor of the same real handoff button used elsewhere.
                Holding Time stays an honest "—" — no real per-stock
                time-to-target dataset exists in this app. */}
            {setup && (
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 10 }}>TRADE PLAN</div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12 }}>
                  {statBlock("ENTRY", `$${setup.entry}`, C.text)}
                  {statBlock("STOP", `$${setup.stop}`, C.red)}
                  {statBlock("TARGET", `$${setup.target2}`, C.green)}
                  {statBlock("R:R", rr != null ? `${rr}` : "—", C.accent)}
                </div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12, paddingTop: 10, borderTop: `1px solid ${C.border}55` }}>
                  {statBlock("POSITION SIZE", "Size below →", C.textDim, "Relocated to Trade Planner's real risk-based sizing")}
                  {statBlock("HOLDING TIME", "—", C.textDim, "Not built — no real per-stock time-to-target dataset exists in this app")}
                  {statBlock("TRADE TYPE", data.entryType?.type || "—", data.entryType?.color || C.textDim, data.entryType?.reason)}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={copyPlan} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.text, cursor: "pointer" }}>📋 Copy Plan</button>
                  <button onClick={sizeThisTrade} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent, cursor: "pointer" }}>📐 Size this trade →</button>
                </div>
              </div>
            )}

            {/* SECTION 4 — Quick Check (2 seconds). Exactly 3 traffic lights,
                no interpretation required — the reading rule below does the
                interpreting. */}
            <div style={{ ...card, marginBottom: 14 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 10 }}>QUICK CHECK</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <TrafficLight C={C} MONO={MONO} SANS={SANS} label="TREND" state={trendLight} detail={`${data.trend.passCount}/8 criteria`} />
                <TrafficLight C={C} MONO={MONO} SANS={SANS} label="INSTITUTIONAL" state={instLight} detail={data.marketControl} />
                <TrafficLight C={C} MONO={MONO} SANS={SANS} label="MARKET" state={marketLight} detail={data.marketBias?.bias?.toUpperCase() || "—"} />
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: readingRuleColor, textAlign: "center" }}>{readingRule}</div>
            </div>

            {/* SECTION 5 — Market Context. Real classifyMacroStatus reads,
                real per-symbol sector rank, real 4-instrument breadth proxy,
                real market-session read (the honest substitute for the
                mockup's fabricated "Market Wind: TAILWIND"). */}
            <div style={{ ...card, marginBottom: 14 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 10 }}>MARKET CONTEXT</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
                {[
                  ["SPY", data.marketContext.spy],
                  ["QQQ", data.marketContext.qqq],
                  ["IWM", data.marketContext.iwm],
                  ["VIX", data.marketContext.vix],
                  ["DXY", data.marketContext.dxy],
                ].map(([sym2, v]) => (
                  <div key={sym2}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim }}>{sym2}</div>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: v.status === "green" ? C.green : v.status === "red" ? C.red : C.amber }}>{v.label}</div>
                  </div>
                ))}
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim }}>SECTOR</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>
                    {data.marketContext.sector ? `${data.marketContext.sector.name} #${data.marketContext.sector.rank}/${data.marketContext.sector.of}` : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim }}>BREADTH</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: data.marketContext.breadthProxy.label === "HEALTHY" ? C.green : data.marketContext.breadthProxy.label === "WEAK" ? C.red : C.amber }}>
                    {data.marketContext.breadthProxy.label} ({data.marketContext.breadthProxy.upCount}/{data.marketContext.breadthProxy.of})
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim }}>SESSION</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{data.marketContext.session}</div>
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim }}>OVERALL MARKET</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: data.marketContext.overall === "BULLISH" ? C.green : data.marketContext.overall === "BEARISH" ? C.red : C.amber }}>
                    {data.marketContext.overall || "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 6 — Best Institutional Zone. Merges Order Blocks/
                FVGs/VWAP/Volume Profile/Liquidity into one real actionable
                zone; stop/targets reuse the exact same Trade Plan numbers
                above (never re-derived). */}
            {bestZone && (
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 10 }}>BEST INSTITUTIONAL ZONE</div>
                {bestZone.zone ? (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.green, marginBottom: 4 }}>
                      ${bestZone.zone.bot} – ${bestZone.zone.top}
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 10 }}>Real nearest bullish {bestZone.source}</div>
                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 10 }}>
                      {statBlock("STOP LOSS", bestZone.stop != null ? `$${bestZone.stop}` : "—", C.red)}
                      {statBlock("TARGET 1", bestZone.target1 != null ? `$${bestZone.target1}` : "—", C.green)}
                      {statBlock("TARGET 2", bestZone.target2 != null ? `$${bestZone.target2}` : "—", C.green)}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {bestZone.reasons.map((r) => (
                        <span key={r.label} style={{ fontFamily: SANS, fontSize: 11.5, color: r.pass ? C.text : C.textDim, opacity: r.pass ? 1 : 0.5 }}>
                          {r.pass ? "✓" : "✗"} {r.label}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real bullish Order Block or Fair Value Gap nearby right now.</div>
                )}
              </div>
            )}

            {/* SECTION 8 — Advanced Smart Money Analysis, collapsed by
                default. Reuses SmartMoneyPanel.jsx wholesale (its own real
                /api/market/smc + /api/market/darkpool fetch) — not rebuilt,
                per the redesign plan. Professional traders can expand;
                everyone else never needs to. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 10px" }}>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em" }}>DETAILED SMART MONEY ANALYSIS</div>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <button onClick={() => setShowAdvanced((v) => !v)}
                style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, background: "transparent", border: `1px solid ${C.accent}55`, borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}>
                {showAdvanced ? "Hide ▴" : "Show ▾"}
              </button>
            </div>
            {showAdvanced && (
              <SmartMoneyPanel symbol={symbol} chart={{ price: data.price }} C={C} MONO={MONO} SANS={SANS} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
