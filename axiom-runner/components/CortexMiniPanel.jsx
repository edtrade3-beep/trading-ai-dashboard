import { useEffect, useRef, useState } from "react";
import { computeSniperDecision } from "./sniper-decision.js";
import { CORE_VERDICT_META } from "./am-core-engine.js";
import { parseCortexQuery } from "./cortex-engine.js";
import WhyBreakdownPanel from "./WhyBreakdownPanel.jsx";

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
export default function CortexMiniPanel({ symbol, onSelectSymbol, setActiveTab, C, MONO, SANS }) {
  const [query, setQuery] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const reqRef = useRef(null);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    reqRef.current = symbol;
    setLoading(true); setError(null); setNotice(null);
    (async () => {
      try {
        const [screenJ, fundJ, newsJ] = await Promise.all([
          fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(symbol)}&withDecision=1`).then((r) => r.json()),
          fetch(`/api/market/fundamentals?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => null),
          fetch(`/api/news/ticker/${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => null),
        ]);
        if (cancelled || reqRef.current !== symbol) return;
        const row = (screenJ.results || [])[0];
        if (!row || row.error) { setError(`No real market data available for ${symbol}.`); setAnalysis(null); return; }
        const sniper = computeSniperDecision(row);
        setAnalysis({ symbol, row, sniper, fundamentals: fundJ && !fundJ.error ? fundJ : null, news: newsJ });
      } catch (e) {
        if (!cancelled) { setError(e.message); setAnalysis(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol]);

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

  const verdictMeta = analysis?.row?.coreVerdict ? CORE_VERDICT_META[analysis.row.coreVerdict] : null;

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
      {error && <div style={{ margin: "0 10px 8px", fontFamily: SANS, fontSize: 11, color: "#c8282a" }}>{error}</div>}
      {loading && <div style={{ margin: "0 10px 8px", fontFamily: SANS, fontSize: 11, color: C.textDim }}>Analyzing {symbol}…</div>}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 10px 10px" }}>
        {analysis && verdictMeta && (
          <div style={{ border: `1px solid ${verdictMeta.color}55`, background: `${verdictMeta.color}12`, borderRadius: 10, padding: 14, textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6 }}>AI VERDICT — {analysis.symbol}</div>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: verdictMeta.color, margin: "4px 0" }}>{verdictMeta.icon} {verdictMeta.label}</div>
            {analysis.row.coreReason && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginTop: 4 }}>{analysis.row.coreReason}</div>}
          </div>
        )}
        {analysis && !verdictMeta && (
          <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, textAlign: "center", marginBottom: 12 }}>
            No real verdict available for {analysis.symbol} right now.
          </div>
        )}

        {analysis && (
          <WhyBreakdownPanel
            symbol={analysis.symbol}
            sniperReasons={analysis.sniper?.reasons}
            fundamentals={analysis.fundamentals}
            news={analysis.news}
            C={C} MONO={MONO} SANS={SANS}
          />
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
