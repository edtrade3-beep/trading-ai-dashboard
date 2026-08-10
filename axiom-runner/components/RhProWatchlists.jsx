import { useState, useEffect } from "react";
import { RH_UNIVERSE, rhScore, rhScreenProgressive } from "./rhpro-shared.jsx";
import { computeRegime, computeAPlusScore, computeNextAction, computePrediction } from "./market-helpers.js";
import { mapToAiAction } from "./ai-actions.js";

export default function RhProWatchlists({ C, MONO, SANS, setActiveTab, macroData }) {
  const regime = computeRegime(macroData);
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(false); const [ranAt, setRanAt] = useState(null);
  const scan = () => {
    setLoading(true); setRows([]);
    let all = [];
    rhScreenProgressive(RH_UNIVERSE,
      (part) => { all = [...all, ...part.map(x => {
        const next = computeNextAction(x);
        const aplus = computeAPlusScore(x, regime);
        // Same unified vocabulary Scanner/Workspace use — computeNextAction's
        // raw BUY/BREAKOUT/WATCH/WAIT/AVOID label is a different wording
        // system than AI_ACTIONS, so mapping it here keeps a stock's action
        // word consistent with what its own Workspace page says.
        const aiAction = mapToAiAction({ nextAction: next.action, institutionalScore: aplus.score });
        return { ...x, score: rhScore(x), aplus, next, aiAction, prediction: computePrediction(x, x) };
      })]; setRows(all); setRanAt(new Date()); },
      () => setLoading(false)
    );
  };
  useEffect(() => { scan(); }, []);
  const analyze = (sym) => { try { localStorage.setItem("mterminal_load_sym", sym); } catch {} setActiveTab && setActiveTab("mterminal"); };

  const st2 = r => (r.stage || "").includes("2");
  const st4 = r => (r.stage || "").includes("4");
  const byScore = (a, b) => b.score - a.score;
  // Mobile audit finding (2026-08-04, "what else looks crowded on
  // mobile") — real duplicate-content crowding, not a layout bug: these 8
  // categories all filter the SAME underlying scan, and several criteria
  // correlate heavily (a high-score Stage-2 actionable-not-extended stock
  // satisfies Top Picks/Pullback/Swing/often Breakout all at once), so the
  // same handful of elite tickers were repeating near-verbatim across the
  // first 4-5 cards — real crowding from the SAME names, not different
  // real coverage. Fix: cross-list dedup, first-list-wins in this array's
  // own declared order (Top Picks is the most authoritative single
  // ranking, so it keeps every name it earns; each list below it only
  // shows names not already surfaced above). No filter threshold or sort
  // changed — same real criteria, same real data — this only changes
  // which of the genuinely-matching names get displayed where.
  const seen = new Set();
  const rawLists = [
    { key: "top", icon: "🏆", title: "AI TOP PICKS", desc: "Highest overall AI score", raw: rows.filter(r => r.score >= 55).sort(byScore) },
    { key: "breakout", icon: "🚀", title: "BREAKOUT CANDIDATES", desc: "At/near a valid pivot", raw: rows.filter(r => r.atBuyPoint || (r.actionable && Number(r.abovePivotPct || -99) >= -3)).sort(byScore) },
    { key: "momentum", icon: "⚡", title: "MOMENTUM LEADERS", desc: "RS ≥ 80 in a Stage 2 uptrend", raw: rows.filter(r => (r.rsRating || 0) >= 80 && st2(r)).sort((a, b) => (b.rsRating || 0) - (a.rsRating || 0)) },
    { key: "pullback", icon: "🎯", title: "PULLBACK OPPORTUNITIES", desc: "Strong stock at its buy zone", raw: rows.filter(r => r.actionable && !r.extended && !st4(r)).sort(byScore) },
    { key: "rvol", icon: "🔊", title: "HIGH RELATIVE VOLUME", desc: "Volume ≥ 1.5× average", raw: rows.filter(r => (r.volRatio || 0) >= 1.5).sort((a, b) => (b.volRatio || 0) - (a.volRatio || 0)) },
    { key: "swing", icon: "📈", title: "SWING CANDIDATES", desc: "Stage 2, 6/8+ template", raw: rows.filter(r => st2(r) && (r.passCount || 0) >= 6).sort(byScore) },
    { key: "volatile", icon: "🌊", title: "VOLATILE / DAY-TRADE", desc: "High volume + wide range", raw: rows.filter(r => (r.volRatio || 0) >= 1.8).sort((a, b) => (b.volRatio || 0) - (a.volRatio || 0)) },
    { key: "avoid", icon: "🚫", title: "AVOID (Stage 4)", desc: "Downtrends — do not buy", raw: rows.filter(st4).sort((a, b) => a.score - b.score) },
  ];
  const lists = rawLists.map(l => {
    const deduped = l.raw.filter(r => !seen.has(r.symbol));
    const items = deduped.slice(0, 10);
    items.forEach(r => seen.add(r.symbol));
    // Distinguishes "genuinely nothing matches this category right now"
    // from "matches exist but already shown in a card above" — the two
    // are different real states and shouldn't share one silent message.
    const allAlreadyShown = l.raw.length > 0 && deduped.length === 0;
    return { key: l.key, icon: l.icon, title: l.title, desc: l.desc, items, allAlreadyShown };
  });

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {/* Renamed from "SMART WATCHLISTS" — real site-reorg finding: this
            shares zero code/data with the real user watchlist
            (data/watchlist.json, QuotesTab.jsx). It's the same scan engine
            as RhProScanner.jsx (RH_UNIVERSE + rhScore/computeAPlusScore/
            computeNextAction), just re-bucketed into named lists below —
            "Ranked Lists" describes that accurately without colliding
            with the unrelated real watchlist feature. */}
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>📋 AI RANKED LISTS</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>auto-sorted from {RH_UNIVERSE.length} stocks · {ranAt ? ranAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "…"}</div>
        <button onClick={scan} disabled={loading} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none", color: "#fff", background: loading ? C.textDim : C.accent, cursor: "pointer" }}>{loading ? "⏳…" : "↻ REFRESH"}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        {lists.map(l => (
          <div key={l.key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text }}>{l.icon} {l.title}</div>
            <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginBottom: 8 }}>{l.desc}</div>
            {l.items.length ? l.items.map(r => (
              <div key={r.symbol} onClick={() => analyze(r.symbol)} title="Analyze"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 6px", borderRadius: 6, cursor: "pointer", fontFamily: MONO, fontSize: 12.5 }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontWeight: 800, color: C.text }}>{r.symbol}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {r.aiAction && (
                    <span title={r.next?.reason} style={{ fontSize: 9, fontWeight: 900, color: r.aiAction.color, border: `1px solid ${r.aiAction.color}`, borderRadius: 4, padding: "1px 5px", cursor: "help" }}>{r.aiAction.label}</span>
                  )}
                  {r.riskState && (
                    <span title="Risk level — from the VCP risk report" style={{ fontSize: 9, fontWeight: 900, color: r.riskState === "LOW" ? C.green : r.riskState === "MEDIUM" ? C.amber : C.red, border: `1px solid ${r.riskState === "LOW" ? C.green : r.riskState === "MEDIUM" ? C.amber : C.red}`, borderRadius: 4, padding: "1px 5px", cursor: "help" }}>{r.riskState}</span>
                  )}
                  {r.confidence != null && (
                    <span title="Breakout-engine confidence" style={{ fontSize: 10, fontWeight: 800, color: r.confidence >= 70 ? C.green : r.confidence >= 40 ? C.amber : C.textDim }}>{r.confidence}%</span>
                  )}
                  {r.prediction && (() => {
                    const p = r.prediction;
                    const dirCol = p.dir.includes("BULL") || p.dir === "LEAN UP" ? C.green : p.dir.includes("BEAR") || p.dir === "LEAN DOWN" ? C.red : C.textDim;
                    const dirIcon = p.dir.includes("BULL") || p.dir === "LEAN UP" ? "📈" : p.dir.includes("BEAR") || p.dir === "LEAN DOWN" ? "📉" : "➡️";
                    return <span title={`Real ~1-week prediction: ${p.why.join(" · ") || "no strong real signal either way"} · target $${p.target} (${p.movePct >= 0 ? "+" : ""}${p.movePct}%)`} style={{ fontSize: 10, fontWeight: 800, color: dirCol, cursor: "help" }}>{dirIcon}</span>;
                  })()}
                  <span style={{ fontSize: 10, color: C.textDim }}>RS {r.rsRating ?? "—"}</span>
                  {/* Dropped the separate A+ badge (2026-08-10, user-flagged
                      confusion: "2 different scores"). It's a different
                      formula (computeAPlusScore) than the number below, which
                      is what actually sorts every list here — showing both
                      made the ranking look arbitrary. r.aplus is still
                      computed (used elsewhere) but no longer rendered. */}
                  <span title="AI Score — sets this card's ranking, highest first" style={{ fontWeight: 900, color: r.score >= 70 ? C.green : r.score >= 50 ? C.amber : C.textDim, cursor: "help" }}>{r.score}</span>
                </span>
              </div>
            )) : <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, padding: "4px 0" }}>{l.allAlreadyShown ? "matches already shown in a card above" : "none right now"}</div>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>Tap any ticker to open the Trade Analyzer. Analysis only — no orders.</div>
    </div>
  );
}
