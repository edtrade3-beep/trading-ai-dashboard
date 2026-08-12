import { useState, useEffect } from "react";

// RhFutureValueTab.jsx — "🚀 FUTURE STOCKS" / "💎 UNDERVALUED STOCKS"
// (explicit user request, 2026-08-11: "Add TWO separate sections to my
// trading platform ... Never confuse 'good company' with 'good stock
// price'"). Every score/number here traces to real FMP fundamentals
// (src/future-value-scoring.js, src/routes/future-value-scan.js) — no
// invented DCF, no fabricated moat number. Kept deliberately simple per the
// same "SIMPLE VERSION" instruction the Watchlists redesign already
// follows: one headline score + real fair-value read per card, everything
// else lives behind Deep Scan.
//
// DEEP SCAN retired its own local verdict/modal here (2026-08-12
// consolidation, explicit user request: "act as professional investor and
// institution fund manager... consolidate the redundant scores... make
// Cortex the one decision layer, fold the rest into its Deep Scan as
// evidence") — this tab's real futureScore/valueScore/fairValue data
// already flows into AM Cortex's own Deep Scan "Valuation" tab, so DEEP
// SCAN now jumps straight there instead of computing a second, separate
// BUY/WAIT/AVOID verdict from the same numbers.

const ZONE_LABEL = { IDEAL_BUY_ZONE: "🟢 Ideal buy zone", ACCEPTABLE: "🟡 Acceptable", TOO_EXPENSIVE: "🔴 Too expensive" };

function scoreColor(C, n) {
  if (n == null) return C.textDim;
  return n >= 65 ? C.green : n >= 45 ? C.amber : C.red;
}

function Card({ C, MONO, SANS, r, kind, onDeepScan }) {
  const headline = kind === "undervalued" ? r.valueScore : r.futureScore;
  const headlineLabel = kind === "undervalued" ? "VALUE" : "FUTURE";
  const mos = r.fairValue?.marginOfSafetyPct;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text }}>{r.symbol}</span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>${Number(r.price).toFixed(2)}</span>
      </div>
      {r.name && <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{headlineLabel} SCORE</span>
        <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: scoreColor(C, headline) }}>{headline ?? "—"}</span>
      </div>
      {r.fairValue && (
        <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginBottom: 8 }}>
          Fair value ${r.fairValue.fairValue} · {ZONE_LABEL[r.fairValue.zone] || "—"}
          {mos != null && <> · {mos >= 0 ? `${mos.toFixed(0)}% below fair value` : `${Math.abs(mos).toFixed(0)}% above fair value`}</>}
        </div>
      )}
      <button onClick={() => onDeepScan(r.symbol)}
        style={{ width: "100%", fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 0", borderRadius: 6, border: "1px solid #d6a312", background: "#d6a31214", color: "#d6a312", cursor: "pointer" }}>
        ⊕ DEEP SCAN
      </button>
    </div>
  );
}

function Section({ C, MONO, SANS, icon, title, desc, rows, kind, onDeepScan }) {
  if (!rows.length) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>{icon} {title}</div>
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 10 }}>{desc}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
        {rows.map((r) => <Card key={r.symbol} C={C} MONO={MONO} SANS={SANS} r={r} kind={kind} onDeepScan={onDeepScan} />)}
      </div>
    </div>
  );
}


export default function RhFutureValueTab({ C, MONO, SANS, setActiveTab }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true); setError(null);
    fetch("/api/scanner/future-value")
      .then((r) => r.json())
      .then((j) => { if (!j.ok) { setError(j.error || "Scan failed."); setData(null); } else setData(j); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // DEEP SCAN jumps into AM Cortex's own Deep Scan (2026-08-12
  // consolidation) — same real localStorage handoff (cortex_open_symbol)
  // the Telegram deep-link and Scanner/Watchlists' ⚡ buttons use, instead
  // of computing a second, separate verdict from the same real data.
  const openInCortex = (symbol) => {
    try { localStorage.setItem("cortex_open_symbol", symbol.toUpperCase()); } catch {}
    setActiveTab && setActiveTab("cortex");
  };

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>🚀💎 FUTURE / UNDERVALUED</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>
          {data ? `${data.scanned} real stocks scored` : loading ? "scanning…" : ""}
        </div>
        <button onClick={load} disabled={loading} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none", color: "#fff", background: loading ? C.textDim : C.accent, cursor: "pointer" }}>{loading ? "⏳…" : "↻ REFRESH"}</button>
      </div>

      {error && <div style={{ fontFamily: SANS, fontSize: 12, color: "#c8282a", marginBottom: 12 }}>{error} — this needs an FMP API key configured on the server.</div>}
      {!error && !loading && data && !data.future.length && !data.undervalued.length && !data.overlap.length && (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real fundamentals data scored yet — try Refresh.</div>
      )}

      {data && (
        <>
          <Section C={C} MONO={MONO} SANS={SANS} icon="🏆" title="FUTURE + UNDERVALUED" desc="Great real business AND a real attractive price — the highest-priority list." rows={data.overlap} kind="future" onDeepScan={openInCortex} />
          <Section C={C} MONO={MONO} SANS={SANS} icon="🚀" title="FUTURE STOCKS" desc="Real durable growth + moat + financial strength — regardless of today's price." rows={data.future} kind="future" onDeepScan={openInCortex} />
          <Section C={C} MONO={MONO} SANS={SANS} icon="💎" title="UNDERVALUED STOCKS" desc="Cheap relative to real fundamentals — priced below real analyst fair value." rows={data.undervalued} kind="undervalued" onDeepScan={openInCortex} />
        </>
      )}

      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>
        Every score here comes from real fundamentals (FMP) — no invented valuation model. Detailed reasoning lives inside Deep Scan.
      </div>
      {/* Bottom safety margin (2026-08-11) — same real risk already found
          and fixed on the Scanner tab: the fixed-position FAB cluster
          hovers over the bottom ~90px of every mobile viewport regardless
          of scroll position, and a card's DEEP SCAN button can otherwise
          land right underneath it at a natural scroll-stop. */}
      <div style={{ height: 90 }} />
    </div>
  );
}
