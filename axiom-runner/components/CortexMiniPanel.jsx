import { useEffect, useRef, useState } from "react";
import { getCachedDecision, fetchDecision } from "./decision-store.js";
import { computeSniperDecision } from "./sniper-decision.js";
import { FINAL_VERDICT_META } from "./final-decision-meta.js";
import { parseCortexQuery } from "./cortex-engine.js";
import WhyBreakdownPanel from "./WhyBreakdownPanel.jsx";
import EdgeTimelineSparkline from "./EdgeTimelineSparkline.jsx";
import { DAYTRADE_STATE_LABEL, DAYTRADE_STATE_COLOR, EDGE_MONITOR_META } from "./ActivePositionsCard.jsx";
import { computeAiTradeScore } from "./market-helpers.js";

// CortexMiniPanel — Command Center's right column (2026-08-25, explicit
// user request: unified one-screen layout, "ask anything" + "AI VERDICT"
// on the right). Deliberately NEW code, not a refactor of AMCortexTab.jsx
// (1010 lines, one monolithic function, no existing seam for a clean
// extraction — see the Command Center plan for why pulling a slim panel
// out of it was judged riskier than reuse here). Calls the SAME real
// endpoints AMCortexTab.jsx's computeSymbolAnalysis uses for a symbol
// verdict (trend-screen with withDecision=1, fundamentals) plus a real
// news fetch, and reads the SAME server-computed Master Verdict
// (row.coreVerdict/coreReason, produced by am-core-engine.js's
// computeCoreScore/classifyCoreVerdict — the identical function every
// other verdict surface in this app uses) rather than recomputing it —
// never a second score, never a second verdict.
//
// Scope: this panel handles a single-symbol verdict lookup only (typing a
// symbol, or "Why NVDA?"-style questions parseCortexQuery already
// resolves to a symbol). Scans ("find early entries"), comparisons, and
// free-form follow-up conversation are AMCortexTab.jsx's real, larger
// surface — this panel hands those off there with one tap instead of
// half-duplicating that UI.
// WHY NOT / Risk Level (Phase 3, 2026-08-26, explicit spec ask: "WHAT
// COULD GO WRONG? RISK LEVEL: LOW/MODERATE/HIGH"). Pure real-data
// surfacing — opp.redFlags/opp.criticalFlags already exist on every real
// Opportunity Object (red-flag-engine.js's own computeRedFlags, the same
// gate classifyOpportunityTier already hard-gates on); this adds zero
// new computation, just an explicit label the spec asked for that wasn't
// shown anywhere before.
function riskLevelFor(opp) {
  if (!opp || !Array.isArray(opp.redFlags)) return null;
  const criticalCount = opp.criticalFlags || 0;
  const flags = opp.redFlags;
  const level = criticalCount > 0 ? "HIGH" : flags.length > 0 ? "MODERATE" : "LOW";
  return { level, flags };
}
const RISK_LEVEL_COLOR = { LOW: "#0d9465", MODERATE: "#d6a312", HIGH: "#c8282a" };

// Score Breakdown (Trade Desk redesign Phase 1, §8 — "AI Score Engine"
// transparent bucket breakdown). Zero new scoring: am-core-engine.js's own
// computeCoreScore already returns these exact 12 real weighted buckets
// (opp.breakdown, already flowing through opportunity-engine.js's
// computeOpportunity into row.opportunity — confirmed via code read, no
// server change needed) — this only renders what was already computed and
// already reaching the client, unused until now. Max points per bucket
// match computeCoreScore's own real weights (am-core-engine.js) exactly;
// keep in sync if that engine's weights ever change.
//
// Fixed (2026-08-31 audit): was still the PRE-"Options Confirmation"
// 11-bucket/14pt set — real, confirmed live drift, not cosmetic. The
// server moved to a 12-bucket/13pt set with its own dedicated 10pt
// Options Confirmation bucket several phases ago; this display metadata
// was never updated, so every bar here was miscalibrated (wrong max) and
// the real Options Confirmation bucket was silently invisible (no entry
// in this map at all, so Object.entries never rendered it even though
// the server was already sending opp.breakdown.optionsConfirmation).
const SCORE_BUCKET_META = {
  regime: { label: "MARKET REGIME", max: 13 },
  trend: { label: "TREND", max: 13 },
  structure: { label: "STRUCTURE", max: 10 },
  momentum: { label: "MOMENTUM", max: 7 },
  optionsConfirmation: { label: "OPTIONS CONFIRMATION", max: 10 },
  volume: { label: "VOLUME", max: 8 },
  relativeStrength: { label: "RELATIVE STRENGTH", max: 8 },
  setupQuality: { label: "VCP SETUP", max: 8 },
  entryQuality: { label: "ENTRY QUALITY", max: 8 },
  sector: { label: "SECTOR", max: 7 },
  liquidity: { label: "LIQUIDITY", max: 5 },
  catalyst: { label: "CATALYST", max: 3 },
};
function ScoreBreakdown({ opp, overrideReason, C, MONO, SANS }) {
  const [open, setOpen] = useState(false);
  if (!opp || !opp.breakdown) return null;
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, textAlign: "left" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>
        <span>SCORE BREAKDOWN — {opp.score}/100</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.entries(SCORE_BUCKET_META).map(([key, meta]) => {
            const v = Number(opp.breakdown[key]);
            if (!Number.isFinite(v)) return null;
            const pct = Math.max(0, Math.min(100, (v / meta.max) * 100));
            const barColor = pct >= 70 ? "#0d9465" : pct >= 40 ? "#d6a312" : "#c8282a";
            return (
              <div key={key}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 9.5, color: C.textSec, marginBottom: 2 }}>
                  <span>{meta.label}</span>
                  <span>{v.toFixed(1)}/{meta.max}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: barColor }} />
                </div>
              </div>
            );
          })}
          {/* classifyCoreVerdict's real hard-gate override reason (§8: "the
              system must explain the override" — e.g. a high raw score
              still forced to AVOID by a broken 4H structure). Same real
              text already shown above the TIER/WIN/EV row as coreReason —
              repeated here, next to the buckets, so the override is legible
              in the same place as the numbers it's overriding. */}
          {overrideReason && (
            <div style={{ marginTop: 2, fontFamily: SANS, fontSize: 10, color: C.textDim, fontStyle: "italic" }}>
              Override: {overrideReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// "What Changed?" (Trade Desk redesign Phase 2, spec §20). opp.whatChanged
// is a real diff against this exact symbol's own last-recorded real
// score/verdict (opportunity-snapshot-store.js, server-side, gated to a
// real prior reading at least 5 real minutes old — never a fabricated
// same-visit diff). Only renders when the real change is large enough to
// matter (verdict changed, or score moved >=3 real points) — a 0.4-point
// wobble isn't a real "AI Update," it's noise.
function AiUpdateBanner({ whatChanged, currentScore, currentVerdict, C, MONO, SANS }) {
  if (!whatChanged) return null;
  const meaningfulScoreMove = Number.isFinite(whatChanged.scoreChange) && Math.abs(whatChanged.scoreChange) >= 3;
  if (!whatChanged.verdictChanged && !meaningfulScoreMove) return null;
  const up = Number(whatChanged.scoreChange) > 0;
  return (
    <div style={{ border: `1px solid ${C.amber}66`, background: `${C.amber}14`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.amber, letterSpacing: 0.5, marginBottom: 4 }}>⚡ AI UPDATE</div>
      {Number.isFinite(whatChanged.scoreChange) && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.text, marginBottom: 2 }}>
          Score {whatChanged.previousScore} → {currentScore} <b style={{ color: up ? "#0d9465" : "#c8282a" }}>({up ? "+" : ""}{whatChanged.scoreChange})</b>
        </div>
      )}
      {whatChanged.verdictChanged && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.text, marginBottom: 2 }}>
          Verdict {FINAL_VERDICT_META[whatChanged.previousVerdict]?.label || whatChanged.previousVerdict} → {FINAL_VERDICT_META[currentVerdict]?.label || currentVerdict}
        </div>
      )}
      {whatChanged.biggestMover && (
        <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textSec }}>
          Driven by: {SCORE_BUCKET_META[whatChanged.biggestMover.bucket]?.label || whatChanged.biggestMover.bucket} ({whatChanged.biggestMover.delta > 0 ? "+" : ""}{whatChanged.biggestMover.delta})
        </div>
      )}
      <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim, marginTop: 3, fontStyle: "italic" }}>vs. your last real look, {whatChanged.ageMinutes} min ago</div>
    </div>
  );
}

// Final Decision + Relative Strength card (Trade Desk redesign Phase 1,
// §17 + §22-23). Two real reads only — never a fabricated 5-way BUY/CALL/
// HOLD/PUT/SELL probability grid (per the redesign plan's own explicit
// scope decision: this app has exactly 2 independently-computed real
// leans for a symbol, not 5):
//   1. Stock-side bias — the SAME real verdict/score/probability already
//      shown in the AI VERDICT card above (verdictMeta/opp), repeated here
//      only as a compact one-line summary, never recomputed.
//   2. Options-side lean — computeAiTradeScore (market-helpers.js, the
//      same real function MarketTerminalTab.jsx's "AI Trade Engine" button
//      uses) called with only `row` (this panel's own already-fetched
//      trend-screen row) — trend/momentum/volume/RS/structure are real;
//      options-flow/dark-pool/news/gamma/liquidity honestly degrade to
//      that function's own neutral midpoint since this compact panel
//      doesn't fetch those per-symbol feeds. Disclosed below, not hidden.
// RS: analysis.row.rsRating (real, already on every trend-screen row) plus
// a real day%-vs-SPY/QQQ comparison from macroData (already polled
// app-wide) — no new fetch.
function FinalDecisionAndRS({ analysis, opp, macroData, C, MONO, SANS }) {
  const row = analysis.row;
  const aiTrade = row ? computeAiTradeScore({ row }) : null;
  const rsRating = Number(row?.rsRating);
  const dayPct = Number(row?.dayChangePct);
  const findMacro = (sym) => (macroData || []).find((m) => (m.symbol || "").toUpperCase() === sym);
  const spyPct = Number(findMacro("SPY")?.changesPercentage);
  const qqqPct = Number(findMacro("QQQ")?.changesPercentage);
  const vs = (benchPct, label) => {
    if (!Number.isFinite(dayPct) || !Number.isFinite(benchPct)) return null;
    const diff = dayPct - benchPct;
    const word = diff > 0.15 ? "STRONG" : diff < -0.15 ? "WEAK" : "IN LINE";
    const color = diff > 0.15 ? "#0d9465" : diff < -0.15 ? "#c8282a" : C.textDim;
    return <span key={label}><span style={{ color: C.textDim }}>{label} </span><b style={{ color }}>{word}</b></span>;
  };
  if (!Number.isFinite(rsRating) && !aiTrade) return null;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>FINAL DECISION</div>
      {analysis.row?.assetDecision?.verdict && (
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: C.textDim }}>STOCK</span>
          <b style={{ color: FINAL_VERDICT_META[analysis.row.assetDecision.verdict]?.color || C.text }}>{FINAL_VERDICT_META[analysis.row.assetDecision.verdict]?.label || analysis.row.assetDecision.verdict}</b>
        </div>
      )}
      {aiTrade && (
        // Semantic disclaimer (One Engine consolidation, Phase 2.9 — audit
        // finding: this row lacked the same "not a second buy/sell call"
        // guard MarketTerminalTab.jsx's own "Options: X" badge already
        // carries, born from a real prior user-reported confusion there —
        // AVOID/WATCH are spelled identically in both the stock verdict
        // and options-lean vocabularies, so an options-side "Avoid" could
        // read as contradicting the STOCK row directly above it. Same real
        // title tooltip, same real reasoning, no new score.
        <div title="This is a calls-vs-puts read, not a second buy/sell call on the stock — see STOCK above for that." style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: C.textDim }}>OPTIONS LEAN</span>
          <b style={{ color: aiTrade.recommendation.color }}>{aiTrade.recommendation.label}</b>
        </div>
      )}
      {aiTrade && (
        <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim, fontStyle: "italic", marginBottom: Number.isFinite(rsRating) ? 8 : 0 }}>
          Options lean uses real trend/momentum/volume/RS/structure only — no per-symbol options-flow/dark-pool/news/gamma fetch in this compact view (those default to a neutral midpoint).
        </div>
      )}
      {Number.isFinite(rsRating) && (
        <div style={{ paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: C.textDim }}>RS RATING</span>
            <b style={{ color: rsRating >= 70 ? "#0d9465" : rsRating <= 30 ? "#c8282a" : C.text }}>{rsRating}/99</b>
          </div>
          <div style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 10.5 }}>
            {vs(spyPct, "vs SPY")}
            {vs(qqqPct, "vs QQQ")}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CortexMiniPanel({ symbol, onSelectSymbol, setActiveTab, dayTradeHandoff, macroData, fundamentals, C, MONO, SANS }) {
  const [query, setQuery] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  // Bumping this re-runs the analysis effect below without duplicating its
  // fetch logic — the Retry button's only job. Real fix (2026-09-02): the
  // analysis fetch had no timeout at all, so a hung request left "Analyzing
  // {symbol}…" on screen forever with no way to recover short of switching
  // symbols.
  const [retryTick, setRetryTick] = useState(0);
  const reqRef = useRef(null);

  // Portfolio correlation annotation (Phase 2, 2026-08-26, spec's
  // "Portfolio Awareness": "is this a genuinely new opportunity or simply
  // another version of a position I already own?"). Deliberately
  // button-gated, NOT auto-fired on every symbol change — the real route
  // (src/portfolio-correlation-calc.js's computeSymbolVsPositionsCorrelation)
  // does a real historical-bars fetch per held position, the same
  // "expensive, so button-gated" discipline this exact codebase already
  // established for the sibling /api/ai-hub/portfolio-correlation route.
  // A visible ANNOTATION only — this never feeds back into tier/score/EV,
  // keeping the EV formula's own real math untouched by this real but
  // separate signal.
  const [correlation, setCorrelation] = useState(null);
  const [correlationLoading, setCorrelationLoading] = useState(false);
  useEffect(() => { setCorrelation(null); }, [symbol]);

  // Real "you already hold this" banner (2026-08-26, explicit user report:
  // Sniper Mode's AI VERDICT is a NEW-ENTRY verdict — classifyCoreVerdict
  // always answers "is this a good new long right now," with no idea
  // whether the user already holds the symbol. Searching a symbol you
  // already own showed a big red AVOID at the top, easy to misread as
  // "get out," while the REAL, position-aware read (dayTradeState from
  // position-decision-engine.js) sat calmer and different on a totally
  // separate screen (the Portfolio dock's Active Positions list) — the
  // user had to leave Sniper Mode and scroll to find it. This surfaces
  // that same real, already-computed per-position state (the exact same
  // /api/alpaca/positions overlay ActivePositionsCard.jsx reads) right
  // next to the entry verdict instead, clearly labeled as a DIFFERENT
  // question ("how's my existing position" vs "should I open a new one").
  const [heldPosition, setHeldPosition] = useState(null);
  useEffect(() => {
    if (!symbol) { setHeldPosition(null); return; }
    let cancelled = false;
    fetch("/api/alpaca/positions").then((r) => r.json())
      .then((d) => { if (!cancelled) setHeldPosition((d.positions || []).find((p) => p.symbol === symbol) || null); })
      .catch(() => { if (!cancelled) setHeldPosition(null); });
    return () => { cancelled = true; };
  }, [symbol]);
  const checkCorrelation = () => {
    if (!symbol || correlationLoading) return;
    setCorrelationLoading(true);
    fetch(`/api/ai-hub/symbol-correlation?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => setCorrelation(d))
      .catch(() => setCorrelation({ ok: false, error: "Request failed." }))
      .finally(() => setCorrelationLoading(false));
  };

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    reqRef.current = symbol;

    // loadAnalysis(silent) — extracted so the same real fetch can run both
    // on symbol change (loading spinner, real errors surfaced) and on a
    // periodic silent re-poll (Trade Desk redesign Phase 2, "What
    // Changed?" follow-up: opportunity-snapshot-store.js's own real diff
    // only has something new to show once a genuinely later real look
    // happens — previously that meant the user had to manually reselect
    // the symbol; this lets it surface on its own while they keep looking
    // at the same one). Silent mode never touches loading/error state —
    // a background refresh failing quietly is correct; it must not fight
    // whatever the user is currently looking at with a flicker or a
    // spurious error banner.
    //
    // Routed through decision-store.js (2026-09-05 perf fix — see
    // .claude/plans/proud-yawning-unicorn.md's Trade Desk plan) instead of
    // its own raw fetch to the identical /api/market/trend-screen
    // endpoint. TradeDeskTab.jsx already fetches this same symbol's
    // canonical decision through this exact shared cache — this panel used
    // to independently re-fetch it every symbol change AND every 5-minute
    // poll, a real duplicate of TradeDeskTab.jsx's own comment claiming
    // this was already deduped. `fundamentals` is now a prop (TradeDeskTab
    // already fetches it too) instead of its own independent fetch — only
    // `news` remains a real fetch owned solely by this panel.
    const loadAnalysis = async (silent) => {
      if (!silent) { setLoading(true); setError(null); setNotice(null); }
      try {
        // Paint immediately from whatever's already cached (same
        // "paint fast, refresh behind it" pattern TradeDeskTab.jsx itself
        // uses for canonicalDecision) — genuinely helps perceived latency
        // when TradeDeskTab already resolved this exact symbol.
        const cached = getCachedDecision(symbol);
        if (cached.row && !cached.loading) {
          const sniperCached = computeSniperDecision(cached.row);
          setAnalysis({ symbol, row: cached.row, sniper: sniperCached, fundamentals: fundamentals || null, news: null });
          if (!silent) setLoading(false);
        }

        // fetchDecision's own underlying fetch is shared with other
        // consumers (TradeDeskTab.jsx) via decision-store.js's in-flight
        // dedup — an AbortController here would wrongly cancel it for
        // them too. Race it against a timeout instead: on timeout, THIS
        // panel gives up and shows an error, but the shared request keeps
        // running underneath and still populates the cache for whoever
        // else (or a later retry) is waiting on it.
        const entry = await Promise.race([
          fetchDecision(symbol),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15_000)),
        ]).catch((e) => ({ row: null, error: e.message === "timeout" ? "Request timed out." : "Unable to load market data." }));
        if (cancelled || reqRef.current !== symbol) return;
        if (!entry.row || entry.error) { if (!silent) { setError(entry.error === "Request timed out." ? entry.error : `No real market data available for ${symbol}.`); setAnalysis(null); } return; }
        const sniper = computeSniperDecision(entry.row);
        setAnalysis((current) => ({ symbol, row: entry.row, sniper, fundamentals: fundamentals || null, news: current?.symbol === symbol ? current.news : null }));
        if (!silent) setLoading(false);

        // 15s frontend timeout (matches this app's one existing precedent,
        // axiom-live.jsx's deals-search AbortController) — news is the one
        // real fetch still owned solely by this panel, so it's the one
        // that still needs its own timeout guard.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);
        const newsJ = await fetch(`/api/news/ticker/${encodeURIComponent(symbol)}`, { signal: controller.signal }).then((r) => r.json()).catch(() => null);
        clearTimeout(timer);
        if (!cancelled && reqRef.current === symbol) {
          setAnalysis((current) => current && current.symbol === symbol ? { ...current, news: newsJ } : current);
        }
      } catch (e) {
        if (!cancelled && !silent) {
          setError(e.name === "AbortError" ? "Unable to load market data. Request timed out." : "Unable to load market data.");
          setAnalysis(null);
        }
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };

    loadAnalysis(false);
    // Matches opportunity-snapshot-store.js's own real MIN_AGE_MS (5 min)
    // — polling faster would never surface a new real diff anyway (the
    // server-side gate ignores anything younger than that).
    const iv = setInterval(() => loadAnalysis(true), 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [symbol, retryTick]);

  // Real fix (2026-09-05, Trade Desk perf pass): `fundamentals` is now a
  // prop (TradeDeskTab.jsx's own already-in-flight fetch, no independent
  // request here anymore) that can resolve AFTER the effect above already
  // ran and closed over an earlier value. Patch it into the current
  // analysis as soon as it arrives, rather than waiting for the next
  // symbol change or 5-minute poll to pick it up.
  useEffect(() => {
    setAnalysis((current) => (current && current.symbol === symbol ? { ...current, fundamentals: fundamentals || null } : current));
  }, [fundamentals, symbol]);

  const submit = () => {
    const parsed = parseCortexQuery(query, null);
    if (parsed.intent === "empty") return;
    if (parsed.intent === "symbol" || parsed.intent === "price_to_pay") {
      onSelectSymbol(parsed.symbol);
      setQuery("");
      return;
    }
    setNotice("That needs the full Cortex tab — opening it now.");
    setQuery("");
    setTimeout(() => setActiveTab && setActiveTab("cortex"), 500);
  };

  const verdictMeta = analysis?.row?.assetDecision?.verdict ? FINAL_VERDICT_META[analysis.row.assetDecision.verdict] : null;
  const opp = analysis?.row?.opportunity || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "10px 10px 8px" }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>🧠 CORTEX</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Ask anything…"
            style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "7px 9px", fontFamily: SANS, fontSize: 12, outline: "none" }}
          />
          <button onClick={submit} style={{ border: "none", background: C.accent, color: "#fff", borderRadius: 6, padding: "0 10px", fontFamily: MONO, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>GO</button>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 5, lineHeight: 1.4 }}>
          e.g. "Why {symbol || "NVDA"}?" — scans &amp; comparisons open the full Cortex tab
        </div>
      </div>

      {notice && <div style={{ margin: "0 10px 8px", fontFamily: SANS, fontSize: 11, color: C.textDim }}>{notice}</div>}
      {error && (
        <div style={{ margin: "0 10px 8px", display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 11, color: "#c8282a" }}>
          <span>{error}</span>
          <button onClick={() => setRetryTick((t) => t + 1)} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.accent, background: "none", border: `1px solid ${C.accent}55`, borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}>Retry</button>
        </div>
      )}
      {loading && <div style={{ margin: "0 10px 8px", fontFamily: SANS, fontSize: 11, color: C.textDim }}>Analyzing {symbol}…</div>}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 10px 10px" }}>
        {dayTradeHandoff && dayTradeHandoff.symbol === symbol && (
          // Full-Opportunity-Object handoff from Light Box (Market
          // Opportunity Intelligence Engine upgrade, 2026-08-26, spec:
          // "the Trade Desk should receive the same Opportunity Object...
          // do not duplicate calculations"). Real day-trade entry/stop/
          // target/EV from Light Box's own 15m engine, shown here
          // clearly labeled as a DIFFERENT real timeframe than the AI
          // VERDICT card below (which is Trade Desk's own daily-bar swing
          // read) — never silently recomputed or blended together.
          <div style={{ border: `1px solid #f59e0b55`, background: "#f59e0b0f", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: "#f59e0b", letterSpacing: 0.5, marginBottom: 4 }}>
              🚦 DAY-TRADE OPPORTUNITY FROM LIGHT BOX — {dayTradeHandoff.lifecycle || dayTradeHandoff.state}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textSec, marginBottom: 6 }}>
              Real 15m-timeframe read, not the daily-bar verdict below. {dayTradeHandoff.thesis || ""}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, marginBottom: 8 }}>
              <span><span style={{ color: C.textDim }}>Entry</span> <b style={{ color: C.text }}>{Number.isFinite(dayTradeHandoff.entry) ? `$${dayTradeHandoff.entry.toFixed(2)}` : "—"}</b></span>
              <span><span style={{ color: C.textDim }}>Stop</span> <b style={{ color: "#c8282a" }}>{Number.isFinite(dayTradeHandoff.stop) ? `$${dayTradeHandoff.stop.toFixed(2)}` : "—"}</b></span>
              <span><span style={{ color: C.textDim }}>Target</span> <b style={{ color: "#0d9465" }}>{Number.isFinite(dayTradeHandoff.target) ? `$${dayTradeHandoff.target.toFixed(2)}` : "—"}</b></span>
              <span><span style={{ color: C.textDim }}>EV</span> <b style={{ color: Number.isFinite(dayTradeHandoff.ev) ? (dayTradeHandoff.ev >= 0 ? "#0d9465" : "#c8282a") : C.textDim }}>{Number.isFinite(dayTradeHandoff.ev) ? `${dayTradeHandoff.ev >= 0 ? "+" : ""}${dayTradeHandoff.ev}%` : "insufficient data"}</b></span>
            </div>
            {Number.isFinite(dayTradeHandoff.entry) && Number.isFinite(dayTradeHandoff.stop) && Number.isFinite(dayTradeHandoff.target) && (
              <button
                onClick={() => {
                  const riskPerShare = Math.max(0.01, dayTradeHandoff.entry - dayTradeHandoff.stop);
                  const acct = Number(localStorage.getItem("axiom_acct_size")) || 10000;
                  const riskPct = Number(localStorage.getItem("axiom_risk_pct")) || 1;
                  const shares = Math.floor((acct * riskPct / 100) / riskPerShare);
                  window.dispatchEvent(new CustomEvent("open-quick-trade", { detail: { symbol, shares, stopLoss: dayTradeHandoff.stop, takeProfit: dayTradeHandoff.target } }));
                }}
                style={{ width: "100%", fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "8px 10px", borderRadius: 7, border: "none", background: "#f59e0b", color: "#fff", cursor: "pointer" }}>
                ⚡ Review Day-Trade Plan
              </button>
            )}
          </div>
        )}
        {analysis && heldPosition && (
          <div style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}0f`, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, letterSpacing: 0.5, marginBottom: 4 }}>
              📍 YOU ALREADY HOLD {heldPosition.qty} SH @ ${Number(heldPosition.avgEntry || 0).toFixed(2)}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textSec, marginBottom: heldPosition.dayTradeState || heldPosition.edgeMonitor ? 6 : 0 }}>
              The verdict below answers "is this a good NEW entry right now?" — it is NOT telling you to exit this position. Your real position status:
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {heldPosition.dayTradeState && (
                <span title={heldPosition.dayTradeReason || undefined}
                  style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: DAYTRADE_STATE_COLOR(C, heldPosition.dayTradeState),
                    border: `1px solid ${DAYTRADE_STATE_COLOR(C, heldPosition.dayTradeState)}`, borderRadius: 4, padding: "2px 6px" }}>
                  {DAYTRADE_STATE_LABEL[heldPosition.dayTradeState] || heldPosition.dayTradeState}
                </span>
              )}
              {heldPosition.edgeMonitor && EDGE_MONITOR_META[heldPosition.edgeMonitor.status] && (
                <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: EDGE_MONITOR_META[heldPosition.edgeMonitor.status].color,
                  border: `1px solid ${EDGE_MONITOR_META[heldPosition.edgeMonitor.status].color}`, borderRadius: 4, padding: "2px 6px" }}>
                  {EDGE_MONITOR_META[heldPosition.edgeMonitor.status].icon} {EDGE_MONITOR_META[heldPosition.edgeMonitor.status].label}
                </span>
              )}
            </div>
            {heldPosition.dayTradeReason && (
              <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 5 }}>{heldPosition.dayTradeReason}</div>
            )}
            {!heldPosition.dayTradeState && !heldPosition.edgeMonitor && (
              <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 5 }}>No real-time position read available right now — check the Portfolio dock for full position detail.</div>
            )}
          </div>
        )}
        {opp && <AiUpdateBanner whatChanged={opp.whatChanged} currentScore={analysis?.row?.assetDecision?.opportunityScore ?? opp.score} currentVerdict={analysis?.row?.assetDecision?.verdict || null} C={C} MONO={MONO} SANS={SANS} />}
        {analysis && verdictMeta && (
          <div style={{ border: `1px solid ${verdictMeta.color}55`, background: `${verdictMeta.color}12`, borderRadius: 10, padding: 14, textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6 }}>AI VERDICT — {analysis.symbol}</div>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: verdictMeta.color, margin: "4px 0" }}>{verdictMeta.icon} {verdictMeta.label}</div>
            {analysis.row.coreReason && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginTop: 4 }}>{analysis.row.coreReason}</div>}
            {opp && (
              // Real probability x EV read (Market Opportunity Engine Phase
              // 1, §17: "separate probability from confidence" — an honest
              // "—" when the real historical sample is too thin, never a
              // fabricated number. Tier is the spec's 5-bucket vocabulary,
              // a real, distinct read from the verdict above it (a WATCH
              // verdict extended past the anti-chase band still reads
              // EXTENDED here, for example).
              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${verdictMeta.color}33`, fontFamily: MONO, fontSize: 10.5, flexWrap: "wrap" }}>
                {/* STAGE (Central Opportunity & Options Engine goal,
                    2026-08-30) — the real EARLY/DEVELOPING/CONFIRMED/LATE/
                    FAILED/EXIT label (opp.stage, opportunity-engine.js's
                    toOpportunityStage) was already computed and flowing
                    through this exact opp object, just never rendered
                    here. Distinct from TIER (ACTIONABLE/DEVELOPING/WAIT/
                    EXTENDED/INVALIDATED) — this is the coarser, spec-
                    named vocabulary. */}
                {opp.stage && <span style={{ color: C.textDim }}>STAGE <b style={{ color: opp.stage === "EARLY" ? "#0d9465" : opp.stage === "LATE" || opp.stage === "FAILED" ? "#c8282a" : C.text }}>{opp.stage}</b></span>}
                <span style={{ color: C.textDim }}>TIER <b style={{ color: C.text }}>{opp.tier}</b></span>
                <span style={{ color: C.textDim }}>WIN <b style={{ color: C.text }}>{opp.probability != null ? `${opp.probability}%` : "—"}</b></span>
                <span style={{ color: C.textDim }}>EV <b style={{ color: opp.expectedValue > 0 ? "#0d9465" : opp.expectedValue < 0 ? "#c8282a" : C.text }}>{opp.expectedValue != null ? `${opp.expectedValue > 0 ? "+" : ""}${opp.expectedValue}%` : "—"}</b></span>
                {/* Expected R:R (goal section 13) — real, computed from
                    the same real entry/stop/target the Trade Plan block
                    below already shows, not a new number. */}
                {(() => {
                  const entry = opp.executableEntry ?? opp.entry;
                  if (!Number.isFinite(entry) || !Number.isFinite(opp.stop) || !Number.isFinite(opp.target) || entry <= opp.stop) return null;
                  const rr = (opp.target - entry) / (entry - opp.stop);
                  return <span style={{ color: C.textDim }}>R:R <b style={{ color: C.text }}>{rr.toFixed(1)}:1</b></span>;
                })()}
              </div>
            )}
            {opp && <EdgeTimelineSparkline symbol={analysis.symbol} C={C} MONO={MONO} SANS={SANS} />}
            {opp && (() => {
              const risk = riskLevelFor(opp);
              if (!risk) return null;
              const color = RISK_LEVEL_COLOR[risk.level];
              return (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${verdictMeta.color}33`, textAlign: "left" }}>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color, marginBottom: risk.flags.length ? 4 : 0 }}>
                    RISK LEVEL: {risk.level}
                  </div>
                  {risk.flags.slice(0, 3).map((f, i) => (
                    <div key={f.key || i} style={{ fontFamily: SANS, fontSize: 10, color: f.critical ? "#c8282a" : C.textSec, marginBottom: 1 }}>
                      {f.critical ? "🔴" : "⚠"} {f.reason || f.label}
                    </div>
                  ))}
                  {risk.flags.length > 3 && (
                    <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim }}>+{risk.flags.length - 3} more</div>
                  )}
                </div>
              );
            })()}
            {opp && <ScoreBreakdown opp={opp} overrideReason={analysis.row.coreReason} C={C} MONO={MONO} SANS={SANS} />}
          </div>
        )}

        {opp && Number.isFinite(opp.executableEntry ?? opp.entry) && Number.isFinite(opp.stop) && Number.isFinite(opp.target) && (
          // Trade Plan -> Review -> Confirm -> Order (Phase 2, 2026-08-26).
          // Reuses the SAME real "open-quick-trade" event + shares formula
          // MarketTerminalTab.jsx's own "Execute via Quick Trade" button
          // and TradePlannerTab.jsx's execute button already use — real
          // user-configured risk% (localStorage "axiom_risk_pct", the
          // SAME real per-user setting those two use, never a hardcoded
          // universal %), same real position-sizing formula. This does
          // NOT place an order itself — it hands off to QuickTradePanel's
          // own already-real confirm-gate + POST /api/quick-trade/order,
          // the one real execution surface in this app. No new order path.
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>TRADE PLAN</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, marginBottom: 8 }}>
              <span><span style={{ color: C.textDim }}>Entry</span> <b style={{ color: C.text }}>${(opp.executableEntry ?? opp.entry).toFixed(2)}</b></span>
              <span><span style={{ color: C.textDim }}>Stop</span> <b style={{ color: "#c8282a" }}>${opp.stop.toFixed(2)}</b></span>
              <span><span style={{ color: C.textDim }}>Target</span> <b style={{ color: "#0d9465" }}>${opp.target.toFixed(2)}</b></span>
            </div>
            {/* Invalidation (goal section 13, "what could invalidate it")
                — the real stop price already shown above, restated as a
                plain-English condition. Not a new number. */}
            <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginBottom: 8 }}>
              <b style={{ color: "#c8282a" }}>Invalidated if:</b> price closes back below ${opp.stop.toFixed(2)} — the real stop this plan is built on.
            </div>
            <button
              onClick={() => {
                const entry = opp.executableEntry ?? opp.entry;
                const riskPerShare = Math.max(0.01, entry - opp.stop);
                const acct = Number(localStorage.getItem("axiom_acct_size")) || 10000;
                const riskPct = Number(localStorage.getItem("axiom_risk_pct")) || 1;
                const shares = riskPerShare > 0 ? Math.floor((acct * riskPct / 100) / riskPerShare) : 0;
                window.dispatchEvent(new CustomEvent("open-quick-trade", { detail: { symbol: analysis.symbol, shares, stopLoss: opp.stop, takeProfit: opp.target } }));
              }}
              style={{ width: "100%", fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "8px 10px", borderRadius: 7, border: "none", background: C.accent, color: "#fff", cursor: "pointer" }}>
              ⚡ Review Trade Plan
            </button>
          </div>
        )}
        {analysis && !verdictMeta && (
          <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, textAlign: "center", marginBottom: 12 }}>
            No real verdict available for {analysis.symbol} right now.
          </div>
        )}

        {analysis && <FinalDecisionAndRS analysis={analysis} opp={opp} macroData={macroData} C={C} MONO={MONO} SANS={SANS} />}

        {analysis && (
          <div style={{ marginBottom: 12 }}>
            {!correlation && (
              <button onClick={checkCorrelation} disabled={correlationLoading}
                style={{ width: "100%", fontFamily: MONO, fontSize: 10.5, fontWeight: 800, padding: "7px 10px", borderRadius: 7,
                  border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, cursor: correlationLoading ? "default" : "pointer" }}>
                {correlationLoading ? "Checking your real positions…" : `📊 Check vs My Portfolio`}
              </button>
            )}
            {correlation && correlation.ok === false && correlation.reason === "no-alpaca-key" && (
              <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, textAlign: "center", padding: "6px 0" }}>No brokerage connected — nothing to compare against.</div>
            )}
            {correlation && correlation.ok === false && correlation.reason !== "no-alpaca-key" && (
              <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, textAlign: "center", padding: "6px 0" }}>Couldn't check portfolio correlation right now.</div>
            )}
            {correlation && correlation.ok && correlation.correlations && (
              correlation.correlations.length === 0 ? (
                <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, textAlign: "center", padding: "6px 0" }}>
                  {correlation.candidateInsufficientData ? `Not enough real price history for ${symbol} yet to compare.` : "No real overlap with your current holdings — a genuinely new opportunity."}
                </div>
              ) : (
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", background: C.card }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 4 }}>REAL CORRELATION TO YOUR HOLDINGS</div>
                  {correlation.correlations.slice(0, 3).map((c) => (
                    <div key={c.symbol} style={{ fontFamily: MONO, fontSize: 11, display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                      <span style={{ color: C.text, fontWeight: 700 }}>{c.symbol}</span>
                      <span style={{ color: Math.abs(c.correlation) >= 0.7 ? "#c8282a" : Math.abs(c.correlation) >= 0.4 ? "#d6a312" : C.textDim, fontWeight: 700 }}>r = {c.correlation > 0 ? "+" : ""}{c.correlation}</span>
                    </div>
                  ))}
                  {correlation.correlations[0] && Math.abs(correlation.correlations[0].correlation) >= 0.7 && (
                    <div style={{ fontFamily: SANS, fontSize: 10, color: "#c8282a", marginTop: 4 }}>⚠ Highly correlated with your existing {correlation.correlations[0].symbol} position — this may not be a genuinely new, diversifying opportunity.</div>
                  )}
                </div>
              )
            )}
          </div>
        )}

        {analysis && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>🔍 WHY</div>
            <WhyBreakdownPanel
              symbol={analysis.symbol}
              sniperReasons={analysis.sniper?.reasons}
              fundamentals={analysis.fundamentals}
              news={analysis.news}
              options={opp?.options}
              C={C} MONO={MONO} SANS={SANS}
            />
          </div>
        )}

        {!analysis && !loading && !error && (
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, textAlign: "center", padding: "20px 0" }}>
            Search a symbol to see the real Master Verdict and why.
          </div>
        )}
      </div>
    </div>
  );
}
