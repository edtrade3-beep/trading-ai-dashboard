// ── Explainable A+ Score ── explicit user spec: never show a bare A+ number.
// Every score must be clickable, opening a real breakdown: each of the 9
// real dimensions computeAPlusScore() actually computes (market-helpers.js),
// its current points, max points, the real reason string already returned
// alongside it, the biggest real point deficits, honest improvement notes
// tied to what each dimension actually measures, and a rule-based summary
// (this app already labels deterministic scoring "AI" elsewhere — Green
// Light's "AI Score", "AI SNIPER SCANNER" — so "AI Summary" here is
// consistent with that existing convention, not a new claim of an LLM call).
//
// DIMENSIONS order MUST match computeAPlusScore's breakdown key order AND
// its reasons[] array order (market-helpers.js:121-140) — both are built
// in this exact sequence: trend, RS, regime, setup, volume, risk,
// volatility, catalyst, fundamental.
const DIMENSIONS = [
  { key: "trendPts", max: 20, label: "Trend Structure", improve: "More of the 8 real Minervini trend-template criteria (price structure, moving-average alignment) need to pass." },
  { key: "rsPts", max: 15, label: "Relative Strength", improve: "RS percentile needs to climb — this stock needs to outperform more of the screened universe." },
  { key: "regimePts", max: 15, label: "Market Regime", improve: "Market-wide, not stock-specific — recovers automatically as SPY/QQQ/VIX conditions turn more favorable." },
  { key: "setupPts", max: 15, label: "Setup / Breakout Quality", improve: "Needs to reach a real buy point with volume confirmation, or get closer to actionable." },
  { key: "volPts", max: 10, label: "Volume Confirmation", improve: "Volume needs to climb toward 2x the 50-day average or higher." },
  { key: "riskPts", max: 10, label: "Risk Tightness", improve: "Entry needs to sit closer to the stop (tighter % risk) for the same fixed 2R target." },
  { key: "volatilityPts", max: 5, label: "Volatility / Base Tightness", improve: "Needs a real VCP base where each pullback contracts tighter than the last." },
  { key: "catalystPts", max: 5, label: "Catalyst / Earnings Risk", improve: "Time-based — points recover once the earnings date passes with no report imminent." },
  { key: "fundamentalPts", max: 5, label: "Fundamental Momentum", improve: "Forward EPS growth vs trailing EPS needs to improve." },
];

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

export default function AiScoreExplainer({ C, MONO, SANS, symbol, aplus, onClose }) {
  const b = band(aplus.score);
  const rows = DIMENSIONS.map((d, i) => ({ ...d, pts: aplus.breakdown[d.key], reason: aplus.reasons[i] }));
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
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, fontWeight: 800, letterSpacing: "0.08em" }}>{symbol} · A+ SCORE</div>
            <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 900, color: b.color, lineHeight: 1.1 }}>{aplus.score}<span style={{ fontSize: 18, color: C.textDim }}> / 100</span></div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: b.color, fontWeight: 700, marginTop: 2 }}>{b.label} — {b.sub}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: C.textDim, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

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
        <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, lineHeight: 1.6, marginBottom: 4 }}>{summary}</div>
      </div>
    </div>
  );
}
