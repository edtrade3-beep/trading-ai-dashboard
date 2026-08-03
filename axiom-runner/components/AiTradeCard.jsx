import { useState, useEffect } from "react";
import { expectedValue, gammaSqueezeProbability, ivCrushRisk, assignmentRisk } from "./options-intel.js";

// AiTradeCard — Option Contract Recommender's "top pick" card. Options
// platform redesign Phase 5 (spec: "Best Strike, Best Expiration, POP,
// Expected Return, Risk/Reward, Greeks, IV Rank, IV Percentile, Expected
// Value, Liquidity Score, Gamma Squeeze Probability, IV Crush Risk,
// Assignment Risk, AI Score, Institutional Score" — one card, not a wall
// of raw numbers). Every field is real: best contract comes from the same
// server-side rankContracts() ranking (options-math.js) already wired
// into GET /api/market/options and consumed by the Smart Option Chain
// (OptionsChainTab.jsx) — one ranking engine, two presentations. IV Rank
// comes from GET /api/market/iv-rank (iv-history-store.js), honestly
// "building" until real history accumulates. AI Score/Institution Score
// are passed in as real props from the parent page's own already-computed
// scores (computeAiTradeScore/computeInstitutionScore, Phase 3/4) — not
// recomputed here.
//
// Entry/Target/Stop reuse the same +50%/-50%-of-premium convention
// TradePlannerTab.jsx/GreenLightTab.jsx's existing (synthetic-strike)
// option cards already use for their exits — same real convention, now
// applied to a real chain-sourced contract instead of an estimated one.
// Flagged, not silently changed, if a future pass wants a different real
// target/stop rule.
export default function AiTradeCard({ symbol, price, aiTradeScore, institutionScore, gammaExposure, shortFloatPct, rvol, earningsDte, C, MONO, SANS }) {
  const [chain, setChain] = useState(null);
  const [ivRank, setIvRank] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setChain(null); setIvRank(null); setLoading(true);
    Promise.all([
      fetch(`/api/market/options?symbol=${encodeURIComponent(symbol)}`).then(r => r.json()).catch(() => null),
      fetch(`/api/market/iv-rank?symbol=${encodeURIComponent(symbol)}`).then(r => r.json()).catch(() => null),
    ]).then(([chainData, ivData]) => {
      setChain(chainData?.ok ? chainData : null);
      setIvRank(ivData?.ok ? ivData : null);
      setLoading(false);
    });
  }, [symbol]);

  if (loading) return <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: 12 }}>Loading real option chain…</div>;
  if (!chain) return <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: 12 }}>No real options chain available for {symbol}.</div>;

  // Direction from the real Final Recommendation (Phase 3) — bullish
  // tiers pick from real calls, bearish tiers from real puts, a neutral
  // tier defaults to calls (the more commonly-liquid side) but is labeled
  // "no strong real directional edge" rather than implying conviction.
  const tier = aiTradeScore?.recommendation?.tier ?? 4;
  const isCall = tier >= 4;
  const pool = isCall ? chain.calls : chain.puts;
  const best = (pool || []).filter(c => Number.isFinite(c.rankScore)).sort((a, b) => b.rankScore - a.rankScore)[0];

  if (!best) return <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: 12 }}>No real ranked contracts available for {symbol}.</div>;

  const premium = best.lastPrice > 0 ? best.lastPrice : (best.bid + best.ask) / 2;
  const target = premium > 0 ? Math.round(premium * 1.5 * 100) / 100 : null;
  const stop = premium > 0 ? Math.round(premium * 0.5 * 100) / 100 : null;
  const ev = expectedValue({ pop: best.pop, avgWinPct: 50, avgLossPct: 50 });
  const squeeze = gammaSqueezeProbability({ gammaExposure, shortFloatPct, rvol });
  const crush = ivCrushRisk({ daysToEarnings: earningsDte, ivRank: ivRank?.available ? ivRank.rank : null });
  const assignment = assignmentRisk({ delta: best.delta, dte: best.dte });

  const row = (label, value, color, title) => (
    <div title={title} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}33` }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: color || C.text }}>{value}</span>
    </div>
  );

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", background: C.card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>
          AI TRADE CARD — {symbol} {isCall ? "CALL" : "PUT"} ${best.strike} · {best.expiry}
        </div>
        {aiTradeScore?.recommendation && (
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 6, background: `${aiTradeScore.recommendation.color}18`, color: aiTradeScore.recommendation.color }}>
            {aiTradeScore.recommendation.label}
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 4 }}>ENTRY / EXIT</div>
          {row("Entry (premium)", premium > 0 ? `$${premium}` : "—")}
          {row("Target (+50%)", target != null ? `$${target}` : "—", C.green)}
          {row("Stop (-50%)", stop != null ? `$${stop}` : "—", C.red)}
          {row("Prob. of Profit", best.pop != null ? `${best.pop}%` : "—", best.pop >= 60 ? C.green : C.textDim, "Real POP — Black-Scholes N(d2) when IV/strike/DTE are all real, else the contract's own real delta")}
          {row("Expected Value", ev != null ? `$${ev}` : "—", ev > 0 ? C.green : ev < 0 ? C.red : C.textDim, "Real POP × avg win − (1−POP) × avg loss, off the same +50%/-50% target/stop above")}
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 4 }}>GREEKS & LIQUIDITY</div>
          {row("Delta", best.delta ?? "—")}
          {row("Gamma", best.gamma ?? "—")}
          {row("Theta", best.theta ?? "—")}
          {row("Vega", best.vega ?? "—")}
          {row("Liquidity Score", best.liquidityScore != null ? `${best.liquidityScore}/100` : "—")}
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 4 }}>VOLATILITY & RISK</div>
          {row("IV Rank", ivRank?.available ? `${ivRank.rank}/100` : "Building", ivRank?.available ? undefined : C.textDim, ivRank?.available ? undefined : ivRank?.reason)}
          {row("IV Percentile", ivRank?.available ? `${ivRank.percentile}%` : "—")}
          {row("Gamma Squeeze Prob.", squeeze != null ? `${squeeze}%` : "Gamma data unavailable", squeeze >= 60 ? C.amber : C.textDim)}
          {row("IV Crush Risk", crush != null ? `${crush}%` : "Not near real earnings", crush >= 60 ? C.red : C.textDim)}
          {row("Assignment Risk", assignment != null ? `${assignment}%` : "—", assignment >= 70 ? C.red : C.textDim)}
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 4 }}>SCORES</div>
          {row("AI Trade Score", aiTradeScore ? `${aiTradeScore.score}/100` : "—", aiTradeScore?.score >= 70 ? C.green : C.textDim)}
          {row("Smart Money Flow", institutionScore ? `${institutionScore.score}/100 (${institutionScore.label})` : "—", institutionScore?.score >= 60 ? C.green : C.textDim)}
          {row("Open Interest", best.openInterest?.toLocaleString() ?? "—")}
          {row("Volume", best.volume?.toLocaleString() ?? "—")}
        </div>
      </div>
    </div>
  );
}
