// ── Explainable scores ── explicit user spec: never show a bare score number.
// Every score must be clickable, opening a real breakdown: each real
// dimension the scoring function actually computes (market-helpers.js /
// rhpro-shared.jsx), its current points, max points, the real reason string
// already returned alongside it, the biggest real point deficits, honest
// improvement notes tied to what each dimension actually measures, and a
// rule-based summary (this app already labels deterministic scoring "AI"
// elsewhere — Green Light's "AI Score", "AI SNIPER SCANNER" — so "AI
// Summary" here is consistent with that existing convention, not a new
// claim of an LLM call).
//
// Two real dimension configs (Phase 3 of the Institutional Scanner work,
// 2026-07-28) — kept as two separate configs, not merged, since Trade Setup
// Score and Stock Quality Score now measure genuinely different things
// (timing vs company/trend quality). Each config's key order MUST match its
// scoring function's breakdown key order AND reasons[] array order.
export const TRADE_SETUP_DIMENSIONS = [
  { key: "regimePts", max: 20, label: "Market Regime", improve: "Market-wide, not stock-specific — recovers automatically as SPY/QQQ/VIX conditions turn more favorable." },
  { key: "entryPts", max: 15, label: "Entry Timing", improve: "Needs to sit closer to the real pivot buy zone (0-5% above pivot) — not yet broken out, or already extended." },
  { key: "breakoutPts", max: 10, label: "Breakout Confirmation", improve: "Needs to reach a real buy point with volume confirmation, or get closer to actionable." },
  { key: "volPts", max: 10, label: "Volume Confirmation", improve: "Volume needs to climb toward 2x the 50-day average or higher." },
  { key: "riskPts", max: 20, label: "Risk Discipline", improve: "Entry needs to sit closer to the stop (tighter % risk) for the same fixed 2R target." },
  { key: "supportPts", max: 10, label: "Support / Structure", improve: "Needs to trade closer to the real 52-week high — less overhead resistance between here and new highs." },
  // Reweighted 5->15 (2026-08-14, VCP engine integration Phase 2) — was a
  // crude tightening-flag proxy, now the real standalone 0-100 VCP Setup
  // Score (vcpReport(), src/routes/market.js), scaled to this dimension's
  // share of the 100-point total.
  { key: "vcpPts", max: 15, label: "VCP Setup Score", improve: "Needs a real VCP base where each pullback contracts tighter than the last, with volume drying up into the apex." },
];
const TRADE_SETUP_LABEL = "TRADE SETUP SCORE";

export const STOCK_QUALITY_DIMENSIONS = [
  { key: "trendPts", max: 20, label: "Trend Structure", improve: "More of the 8 real Minervini trend-template criteria (price structure, moving-average alignment) need to pass." },
  { key: "rsPts", max: 15, label: "Relative Strength", improve: "RS percentile needs to climb — this stock needs to outperform more of the screened universe." },
  { key: "momentumPts", max: 10, label: "Momentum", improve: "Real weighted blended return (63/126/189/252-day) needs to strengthen." },
  { key: "stagePts", max: 10, label: "Stage Analysis", improve: "Needs to reach a real confirmed Stage 2 uptrend." },
  { key: "volTrendPts", max: 15, label: "Volume Trend", improve: "Volume needs to climb toward 2x the 50-day average or higher." },
  { key: "sectorPts", max: 15, label: "Sector Strength", improve: "This stock's real sector ETF needs to outperform SPY by a wider margin." },
  { key: "fundamentalPts", max: 10, label: "Fundamental Strength", improve: "Forward EPS growth vs trailing EPS needs to improve." },
  { key: "liquidityPts", max: 5, label: "Liquidity", improve: "Real daily dollar volume needs to climb toward $1B+ for full credit." },
];
const STOCK_QUALITY_LABEL = "STOCK QUALITY SCORE";

// Institutional Grade — 3rd, additive score (explicit user request,
// 2026-07-29, "one combined institutional-style grade"). See
// computeInstitutionalGrade in market-helpers.js for why each dimension is
// weighted the way it is. Key order MUST match that function's breakdown
// key order AND reasons[] array order, same rule as the two configs above.
export const INSTITUTIONAL_GRADE_DIMENSIONS = [
  { key: "trendPts", max: 20, label: "Trend Structure", improve: "More of the 8 real Minervini trend-template criteria need to pass." },
  { key: "technicalPts", max: 15, label: "Technical Confirmation", improve: "Real ADX trend strength/direction needs to turn more clearly bullish." },
  { key: "smartMoneyPts", max: 15, label: "Smart Money", improve: "Needs a real bullish break of structure or order block nearby." },
  { key: "optionsFlowPts", max: 15, label: "Options Flow", improve: "Real options notional needs to skew more call-weighted." },
  { key: "fundamentalPts", max: 15, label: "Fundamentals", improve: "Forward EPS growth vs trailing EPS needs to improve." },
  { key: "macroPts", max: 10, label: "Macro Regime", improve: "Market-wide, not stock-specific — recovers as SPY/QQQ/VIX conditions turn more favorable." },
  { key: "sectorPts", max: 10, label: "Sector Strength", improve: "This stock's real sector ETF needs to rank higher among the 11 S&P sectors today." },
];
const INSTITUTIONAL_GRADE_LABEL = "INSTITUTIONAL GRADE";

// Real, known overlap — Institutional Grade's own Macro Regime(10) and
// Sector Strength(10) sub-dimensions above ARE the same real numbers
// behind the standalone Market/Sector scores in the six-score row
// (deriveTopLevelScores, market-helpers.js). Shown here so a user opening
// Institutional's own "Why?" isn't left wondering why two of its seven
// inputs look identical to two sibling scores — they're not double
// jeopardy, Institutional was just built to weigh them as part of its own
// broader read. Same "these can legitimately disagree, not a bug" framing
// already shipped for Trend & Base Rating vs the AI Score Card.
export const INSTITUTIONAL_GRADE_NOTE = "Institutional Grade already weighs Market and Sector as two of its seven inputs (Macro Regime + Sector Strength above) — they're also shown as their own scores elsewhere so you can see why Institutional moved, not as additional independent signals.";

// Technical / Timing — the two genuinely NEW derived scores in the
// six-score consolidation (2026-07-29); everything else in that row is a
// passthrough of an existing real score. Key order MUST match
// deriveTopLevelScores' technical.breakdown / timing.breakdown key order
// AND their reasons[] array order, same rule as the three configs above.
export const TECHNICAL_DIMENSIONS = [
  { key: "adxPts", max: 60, label: "Trend Strength (ADX)", improve: "Real ADX trend strength/direction needs to turn more clearly bullish — the same read Institutional Grade's own Technical Confirmation dimension uses." },
  { key: "rangePts", max: 40, label: "Range Position", improve: "Needs to sit in a healthier spot within its real recent Donchian/Bollinger range — not pinned at an extreme." },
];
const TECHNICAL_LABEL = "TECHNICAL";

export const TIMING_DIMENSIONS = [
  { key: "entryPts", max: 50, label: "Entry Timing", improve: "Needs to sit closer to the real pivot buy zone (0-5% above pivot) — not yet broken out, or already extended." },
  { key: "breakoutPts", max: 38, label: "Breakout Confirmation", improve: "Needs to reach a real buy point with volume confirmation, or get closer to actionable." },
  { key: "vcpPts", max: 12, label: "VCP Setup Score", improve: "Needs a real VCP base where each pullback contracts tighter than the last, with volume drying up into the apex." },
];
const TIMING_LABEL = "TIMING";

// AI Trade Engine — options platform redesign Phase 3 (spec: "AI Score
// 0-100" with a Trend/Momentum/Volume/Relative Strength/Options Flow/Dark
// Pool/News/Gamma/Liquidity/Institutional Activity breakdown). A NEW
// 10-dimension composite (computeAiTradeScore, market-helpers.js) — not a
// rename of Institutional Grade above, which stays untouched. Key order
// MUST match that function's breakdown key order AND reasons[] array
// order, same rule as every other config here.
export const AI_TRADE_ENGINE_DIMENSIONS = [
  { key: "trendPts", max: 15, label: "Trend", improve: "More of the 8 real Minervini trend-template criteria need to pass." },
  { key: "momentumPts", max: 10, label: "Momentum", improve: "Real weighted momentum needs to strengthen." },
  { key: "volumePts", max: 10, label: "Volume", improve: "Volume needs to climb toward 2x the 50-day average or higher." },
  { key: "rsPts", max: 10, label: "Relative Strength", improve: "RS percentile needs to climb — this stock needs to outperform more of the screened universe." },
  { key: "optionsFlowPts", max: 10, label: "Options Flow", improve: "Real options notional needs to skew more call-weighted." },
  { key: "darkPoolPts", max: 10, label: "Dark Pool", improve: "Needs more real block-print activity (this reads real institutional participation, not direction — the data doesn't expose buy/sell side)." },
  { key: "newsPts", max: 10, label: "News", improve: "Real recent headlines need to skew more bullish than bearish." },
  { key: "gammaPts", max: 10, label: "Gamma", improve: "Needs a real Polygon options chain to compute — unavailable without a configured POLYGON_API_KEY, or price needs to sit closer to the real gamma flip point." },
  { key: "liquidityPts", max: 5, label: "Liquidity", improve: "Needs a real options chain fetched for this symbol to score contract liquidity — not yet wired on this page." },
  { key: "institutionalPts", max: 10, label: "Institutional Activity", improve: "Needs a real bullish break of structure or order block nearby." },
];
const AI_TRADE_ENGINE_LABEL = "AI TRADE ENGINE";

// Foundation Score — Technical Foundation & V-Recovery Engine (2026-08-19,
// explicit user spec). A separate dimension from every score above:
// "how strong is the stock" (A+ Score) vs "how technically ready is the
// stock" (Foundation Score) — see src/foundation-engine.js's
// computeFoundationScore. Key order MUST match that function's breakdown
// key order (Object.keys(FOUNDATION_WEIGHTS)) AND its reasons[] array
// order, same rule as every other config here.
export const FOUNDATION_DIMENSIONS = [
  { key: "baseDuration", max: 15, label: "Base Duration", improve: "Needs more real trading days spent stabilizing since the low, relative to how severe the prior decline was." },
  { key: "tightness", max: 15, label: "Price Tightness", improve: "Daily range (ATR) needs to compact further toward a real, controlled trading band." },
  { key: "support", max: 15, label: "Support Quality", improve: "Needs real, held tests of support with a clean higher-low sequence, no revisit of the original low." },
  { key: "volatility", max: 15, label: "Volatility Contraction", improve: "Weekly range needs to progressively contract week over week, not expand." },
  { key: "supply", max: 10, label: "Overhead Supply", improve: "Needs less real volume concentrated above the current price between here and the prior high." },
  { key: "absorption", max: 10, label: "Supply Absorption", improve: "Needs more real, held tests of the nearest supply zone with shrinking pullbacks and declining down-day volume." },
  { key: "higherLows", max: 10, label: "Higher Lows", improve: "Real swing lows since the major low need to trend consistently higher." },
  { key: "volume", max: 5, label: "Volume Behavior", improve: "Up-day (demand) volume needs to build while down-day (selling) volume keeps declining." },
  { key: "pivot", max: 5, label: "Pivot Quality", improve: "Needs a real, valid VCP pivot to develop (see the Technical section's VCP/base detail)." },
];
export const FOUNDATION_LABEL = "TECHNICAL FOUNDATION SCORE";

// News Impact Score — News Intelligence layer (2026-08-19, explicit user
// spec). Key order MUST match computeNewsImpactScore's breakdown key order
// (market-helpers.js) AND its reasons[] array order, same rule as every
// other config here.
export const NEWS_IMPACT_DIMENSIONS = [
  { key: "articleVolume", max: 25, label: "Article Volume", improve: "Needs more real recent coverage tracked for this symbol." },
  { key: "sentimentBalance", max: 25, label: "Sentiment Balance", improve: "Needs a more one-sided real bullish/bearish split across recent articles — a genuinely mixed read caps this dimension low by design." },
  { key: "latestCatalyst", max: 25, label: "Catalyst Strength", improve: "Needs a more market-moving real catalyst (earnings, M&A, FDA, guidance) rather than a routine/minor headline." },
  { key: "freshness", max: 25, label: "Freshness", improve: "Needs a more recent real article — this decays as coverage ages." },
];
export const NEWS_IMPACT_LABEL = "NEWS IMPACT SCORE";

// Back-compat default — existing call sites (Trade Planner) that don't pass
// a dimensions/title prop keep the original A+ Score framing untouched.
const DIMENSIONS = TRADE_SETUP_DIMENSIONS;
const DEFAULT_LABEL = "A+ SCORE";

function band(score) {
  if (score >= 80) return { label: "Excellent", sub: "High probability setup.", color: "#0d9465" };
  if (score >= 70) return { label: "Good", sub: "Tradeable with proper risk management.", color: "#22a06b" };
  if (score >= 60) return { label: "Average", sub: "Needs additional confirmation.", color: "#d6a312" };
  if (score >= 40) return { label: "Weak", sub: "Several important conditions are missing.", color: "#e07b1a" };
  return { label: "Avoid", sub: "Low-probability setup.", color: "#c8282a" };
}

// A+ score badge — the ONLY way an A+ score should render anywhere in
// Trade Planner: never a bare number, always clickable into the breakdown.
export function AplusBadge({ C, MONO, aplus, onClick, size = "md" }) {
  const b = band(aplus.score);
  const fontSize = size === "lg" ? 20 : 16;
  return (
    <button onClick={onClick} title="Click to see why this score, and what would raise it"
      style={{ fontFamily: MONO, fontSize, fontWeight: 900, color: b.color, background: `${b.color}16`,
        border: `1px solid ${b.color}55`, borderRadius: 7, padding: "4px 12px", cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 6 }}>
      {aplus.score}/100 <span style={{ fontSize: fontSize - 6, opacity: 0.8 }}>▸ why?</span>
    </button>
  );
}

export default function AiScoreExplainer({ C, MONO, SANS, symbol, aplus, onClose, dimensions = DIMENSIONS, label = DEFAULT_LABEL, note }) {
  const b = band(aplus.score);
  const rows = dimensions.map((d, i) => ({ ...d, pts: aplus.breakdown[d.key], reason: aplus.reasons[i] }));
  const deficits = rows.map(r => ({ ...r, gap: r.max - r.pts })).filter(r => r.gap > 0).sort((a, b2) => b2.gap - a.gap);
  const potentialScore = Math.min(100, aplus.score + deficits.reduce((s, r) => s + r.gap, 0));

  const strengths = rows.filter(r => r.pts >= r.max * 0.8).map(r => r.label);
  const weaknesses = deficits.slice(0, 2).map(r => r.label);
  const summary = strengths.length
    ? `Strong on ${strengths.slice(0, 2).join(" and ")}${weaknesses.length ? `, but held back by ${weaknesses.join(" and ")}` : ""}. ${
        aplus.score >= 70 ? "A tradeable setup with proper risk management." : "Worth watching, not yet a high-conviction entry."
      }`
    : `Weak across most real dimensions${weaknesses.length ? ` — especially ${weaknesses.join(" and ")}` : ""}. Not a high-probability setup right now.`;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.58)", zIndex: 10500, display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto",
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 24px 60px rgba(15,27,45,0.30)", padding: 22 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, fontWeight: 800, letterSpacing: "0.08em" }}>{symbol} · {label}</div>
            <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 900, color: b.color, lineHeight: 1.1 }}>{aplus.score}<span style={{ fontSize: 18, color: C.textDim }}> / 100</span></div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: b.color, fontWeight: 700, marginTop: 2 }}>{b.label} — {b.sub}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: C.textDim, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {note && (
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, lineHeight: 1.5, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", marginBottom: 16 }}>
            ℹ️ {note}
          </div>
        )}

        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>SCORE BREAKDOWN</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {rows.map(r => {
            const ok = r.pts >= r.max * 0.7;
            const rowCol = ok ? "#0d9465" : r.pts >= r.max * 0.4 ? "#d6a312" : "#c8282a";
            return (
              <div key={r.key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>{ok ? "✅" : "⚠"} {r.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: rowCol }}>{r.pts} / {r.max}</span>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, lineHeight: 1.5 }}>{r.reason}</div>
              </div>
            );
          })}
        </div>

        {deficits.length > 0 && (
          <>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>BIGGEST FACTORS REDUCING SCORE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
              {deficits.slice(0, 4).map(r => (
                <div key={r.key} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12 }}>
                  <span style={{ color: C.text }}>❌ {r.label}</span>
                  <span style={{ color: "#c8282a", fontWeight: 800 }}>−{r.gap} pts</span>
                </div>
              ))}
            </div>

            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>WHAT NEEDS TO IMPROVE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {deficits.slice(0, 4).map(r => (
                <div key={r.key} style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>
                  <span style={{ color: "#0d9465", fontWeight: 800 }}>✔ {r.label}</span> <span style={{ color: C.textDim }}>(+{r.gap})</span> — {r.improve}
                </div>
              ))}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 18, textAlign: "center", background: C.card, borderRadius: 8, padding: "8px 0" }}>
              Potential score if every real gap closed: {aplus.score} → {potentialScore}
            </div>
          </>
        )}

        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>AI SUMMARY</div>
        <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, lineHeight: 1.6, marginBottom: aplus.cautions?.length ? 10 : 4 }}>{summary}</div>
        {aplus.cautions?.length > 0 && aplus.cautions.map((c, i) => (
          <div key={i} style={{ fontFamily: SANS, fontSize: 11.5, color: "#e07b1a", lineHeight: 1.5, marginBottom: 2 }}>{c}</div>
        ))}
      </div>
    </div>
  );
}
