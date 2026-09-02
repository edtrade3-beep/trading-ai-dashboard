import { useState, useEffect } from "react";
import { RH_UNIVERSE, rhScreenProgressive } from "./rhpro-shared.jsx";
import { computeRegime, computeInstitutionalGrade, computeAPlusScore, computePrediction, SECTOR_ETFS, STOCK_TO_SECTOR } from "./market-helpers.js";
import { mapToAiAction } from "./ai-actions.js";
// Cortex slide-over (2026-08-14, same linked-panel treatment SmartScanTab.jsx
// got — "wire them together... professional way like bloomberg", extended
// to every other "Open in Cortex" entry point rather than leaving this one
// as a full-page jump while Smart Scan's stays in place).
import AMCortexTab from "./AMCortexTab.jsx";

export default function RhProWatchlists({ C, MONO, SANS, setActiveTab, macroData, sectorData, watchlistSymbols, setTerminalSymbol }) {
  const regime = computeRegime(macroData);

  // Real forward-return win-probability log (2026-08-27, "wire prediction
  // rate into Sniper Scanner + Watchlists") — same real source
  // RhProScanner/MarketTerminalTab already fetch, market-wide, once.
  const [track, setTrack] = useState(null);
  useEffect(() => {
    fetch("/api/market/aplus-track").then(r => r.json()).then(d => { if (d?.ok) setTrack(d); }).catch(() => {});
  }, []);

  // Same real per-symbol sector-rank lookup MarketTerminalTab.jsx (Workspace)
  // uses for its own Institutional Grade — computed purely client-side from
  // the 11 sector ETF quotes already fetched app-wide, zero extra network
  // cost. Passing this in is one of the 3 fixes (below) that make a stock's
  // score here identical to what its own Workspace page shows.
  const sectorInfoFor = (symbol) => {
    const etf = STOCK_TO_SECTOR[symbol];
    if (!etf || !(sectorData || []).length) return null;
    const ranked = [...SECTOR_ETFS]
      .map((se) => ({ ...se, chg: (sectorData.find((s) => s.symbol === se.symbol)?.changesPercentage) ?? 0 }))
      .sort((a, b) => b.chg - a.chg);
    const rank = ranked.findIndex((se) => se.symbol === etf) + 1;
    const info = ranked.find((se) => se.symbol === etf);
    return rank > 0 ? { name: info?.name || etf, rank, of: ranked.length, chg: info?.chg } : null;
  };

  // Score-mismatch fix (2026-08-10, user-flagged "shows 88 ... opens to 79
  // ... make sure they match no confusion"). This page used to show a
  // different formula (rhScore/stockQualityBreakdown) than the Institutional
  // Grade Workspace shows for the same stock. Now both call the exact same
  // computeInstitutionalGrade with the exact same real inputs: passCount/smc
  // (already in every trend-screen row), technicals.adx (now computed in
  // light/bulk-scan mode too, see market.js), the same regime, and the same
  // sectorInfo lookup above. optionsFlow is the one dimension that genuinely
  // requires a live per-symbol fetch — passed null on first paint (honest
  // neutral 8/15 pts, same graceful degrade computeInstitutionalGrade always
  // uses), then backfilled in place by enrichWithOptionsFlow below once the
  // real per-symbol flow reads land, at which point the number is byte-for-
  // byte the same computation Workspace would show for that symbol.
  const gradeRow = (x, optionsFlow) => {
    const canonical = x.assetDecision?.verdict;
    const next = canonical ? {
      action: canonical === "STRONG_BUY" || canonical === "BUY" ? "BUY" : canonical,
      color: canonical === "STRONG_BUY" || canonical === "BUY" ? "#0d9465" : canonical === "AVOID" ? "#c8282a" : "#d6a312",
      reason: (x.assetDecision?.reasons || ["Canonical final verdict."])[0],
    } : { action: "LOADING…", color: "#94a3b8", reason: "Canonical decision unavailable." };
    const grade = computeInstitutionalGrade(x, x.technicals, regime, sectorInfoFor(x.symbol), optionsFlow || null);
    const aiAction = mapToAiAction({ nextAction: next.action, institutionalScore: grade.score });
    // aplus (Trade Setup Score) + action alias (2026-08-11, "same setup for
    // ai sniper scanner pro for watchlists") — used by this file's own
    // score badge below (row.aplus?.score) and row.action; Scanner's rows
    // already compute both under those exact names, Watchlist's didn't. Same real
    // computeAPlusScore this app uses everywhere else — not a new formula,
    // just computing it here too so the modal renders identically
    // regardless of which page opened it.
    const aplus = computeAPlusScore(x, regime);
    return { ...x, score: grade.score, grade, aplus, next, aiAction, action: aiAction, prediction: computePrediction(x, x, { track, aplusScore: aplus?.score }) };
  };

  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(false); const [ranAt, setRanAt] = useState(null);
  const [flowLoading, setFlowLoading] = useState(false);
  // AI Sniper button — retired its own modal (2026-08-12 consolidation,
  // "make Cortex the one decision layer"). Jumps into Cortex's full
  // analysis via the same real localStorage handoff (cortex_open_symbol)
  // the Telegram deep-link uses.
  const [cortexPanelSymbol, setCortexPanelSymbol] = useState(null);
  const openInCortex = (symbol) => {
    try { localStorage.setItem("cortex_open_symbol", symbol.toUpperCase()); } catch {}
    setCortexPanelSymbol(symbol.toUpperCase());
  };

  const st2 = r => (r.stage || "").includes("2");
  const st4 = r => (r.stage || "").includes("4");
  const byScore = (a, b) => b.score - a.score;
  // Cut from 8 categories to 5 (explicit user spec, 2026-08-11: "YOUR
  // SCREEN... Keep these sections: AI TOP PICKS / BREAKOUT / PULLBACK /
  // MOMENTUM / AVOID... Don't make the dashboard show more information.
  // Make it make the decision easier"). Dropped High Relative Volume,
  // Swing Candidates, and Volatile/Day-Trade — real categories, but not
  // ones the user's own simplified model asked to keep; their signal
  // still exists inside the Sniper Deep Scan (VOLUME question, entry-type
  // classification) rather than as a 6th/7th/8th card on this page.
  //
  // Mobile audit finding (2026-08-04, "what else looks crowded on
  // mobile") — real duplicate-content crowding, not a layout bug: these
  // categories all filter the SAME underlying scan, and several criteria
  // correlate heavily (a high-score Stage-2 actionable-not-extended stock
  // satisfies Top Picks/Pullback/often Breakout all at once), so the same
  // handful of elite tickers were repeating near-verbatim across the
  // first few cards — real crowding from the SAME names, not different
  // real coverage. Fix: cross-list dedup, first-list-wins in this array's
  // own declared order (Top Picks is the most authoritative single
  // ranking, so it keeps every name it earns; each list below it only
  // shows names not already surfaced above). No filter threshold or sort
  // changed — same real criteria, same real data — this only changes
  // which of the genuinely-matching names get displayed where.
  // Extracted to a plain function (was inline in render) so scan()'s
  // completion handler can compute the exact same deduped/truncated symbol
  // set to know which displayed tickers need a real options-flow fetch,
  // without re-deriving the logic twice.
  const buildLists = (rowsArr) => {
    const seen = new Set();
    const rawLists = [
      { key: "top", icon: "🏆", title: "AI TOP PICKS", desc: "Highest overall AI score", raw: rowsArr.filter(r => r.score >= 55).sort(byScore) },
      { key: "breakout", icon: "🚀", title: "BREAKOUT", desc: "At/near a valid pivot", raw: rowsArr.filter(r => r.atBuyPoint || (r.actionable && Number(r.abovePivotPct || -99) >= -3)).sort(byScore) },
      { key: "pullback", icon: "🎯", title: "PULLBACK", desc: "Strong stock at its buy zone", raw: rowsArr.filter(r => r.actionable && !r.extended && !st4(r)).sort(byScore) },
      { key: "momentum", icon: "⚡", title: "MOMENTUM", desc: "RS ≥ 80 in a Stage 2 uptrend", raw: rowsArr.filter(r => (r.rsRating || 0) >= 80 && st2(r)).sort((a, b) => (b.rsRating || 0) - (a.rsRating || 0)) },
      { key: "avoid", icon: "🚫", title: "AVOID", desc: "Downtrends — do not buy", raw: rowsArr.filter(st4).sort((a, b) => a.score - b.score) },
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
    return { lists, shownSymbols: [...seen] };
  };

  // Backfills the one dimension that genuinely needs a live per-symbol
  // fetch (real options-flow bias) for just the tickers actually on screen
  // — not the full 100-stock scan universe — so this stays a few real
  // requests, not ~100. Each fetch is the identical single-symbol call
  // Workspace's own page makes (`options-flow?symbols=<one>&limit=1`), run
  // with capped concurrency so the badges update in place as each resolves
  // rather than blocking the whole page on a slow provider call.
  const enrichWithOptionsFlow = async (finalRows) => {
    const { shownSymbols } = buildLists(finalRows);
    if (!shownSymbols.length) return;
    setFlowLoading(true);
    const queue = [...shownSymbols];
    const worker = async () => {
      while (queue.length) {
        const sym = queue.shift();
        try {
          const j = await fetch(`/api/market/options-flow?symbols=${encodeURIComponent(sym)}&limit=1`).then(r => r.json());
          const flow = j && !j.error ? j.summary || null : null;
          setRows(prev => prev.map(r => (r.symbol === sym ? gradeRow(r, flow) : r)));
        } catch { /* real flow read failed — row keeps its honest neutral placeholder */ }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    setFlowLoading(false);
  };

  const scan = () => {
    setLoading(true); setRows([]);
    let all = [];
    rhScreenProgressive(RH_UNIVERSE,
      (part) => { all = [...all, ...part.map(x => gradeRow(x, null))]; setRows(all); setRanAt(new Date()); },
      () => { setLoading(false); enrichWithOptionsFlow(all); }
    );
  };
  useEffect(() => { scan(); }, []);
  const analyze = (sym) => { try { localStorage.setItem("mterminal_load_sym", sym); } catch {} setActiveTab && setActiveTab("mterminal"); };

  const { lists } = buildLists(rows);

  return (
    <>
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {/* Renamed from "SMART WATCHLISTS" — real site-reorg finding: this
            shares zero code/data with the real user watchlist
            (data/watchlist.json, QuotesTab.jsx). It's the same scan engine
            as RhProScanner.jsx (RH_UNIVERSE + computeInstitutionalGrade/
            computeNextAction), just re-bucketed into named lists below —
            "Ranked Lists" describes that accurately without colliding
            with the unrelated real watchlist feature. */}
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>📋 AI RANKED LISTS</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>
          auto-sorted from {RH_UNIVERSE.length} stocks · {ranAt ? ranAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "…"}
          {flowLoading && " · refining scores with live options data…"}
        </div>
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
                  {/* One score, same formula/inputs as Workspace's own
                      Institutional Grade — fixes the "88 here, 79 when I
                      open it" mismatch (2026-08-10). */}
                  <span title={`Same score you'll see on ${r.symbol}'s Workspace page${r.grade ? " — " + r.grade.reasons.slice(0, 3).join(" · ") : ""}`} style={{ fontWeight: 900, color: r.score >= 70 ? C.green : r.score >= 50 ? C.amber : C.textDim, cursor: "help" }}>{r.score}</span>
                  {/* AI Cortex button — icon-only here since these cards are
                      much narrower than the Scanner's table row. */}
                  <button onClick={e => { e.stopPropagation(); openInCortex(r.symbol); }}
                    title="Open the full AI Cortex analysis for this symbol — WHY / SETUP / LEVELS / RISK / VERDICT"
                    style={{ fontSize: 11, lineHeight: 1, border: "1px solid #d6a312", background: "#d6a31214", color: "#d6a312", borderRadius: 4, padding: "2px 5px", cursor: "pointer" }}>🧠</button>
                </span>
              </div>
            )) : <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, padding: "4px 0" }}>{l.allAlreadyShown ? "matches already shown in a card above" : "none right now"}</div>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>Tap any ticker to open the Trade Analyzer. Analysis only — no orders.</div>
    </div>

    {/* ── Cortex slide-over — same linked-panel pattern as SmartScanTab.jsx ── */}
    {cortexPanelSymbol && (
      <div onClick={() => setCortexPanelSymbol(null)}
        style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.45)", zIndex: 1300, display: "flex", justifyContent: "flex-end" }}>
        <div onClick={e => e.stopPropagation()}
          style={{ width: "min(900px, 100%)", height: "100%", background: C.bg, boxShadow: "-8px 0 40px rgba(0,0,0,0.25)",
            display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px",
            borderBottom: `1px solid ${C.border}`, background: C.card, flexShrink: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>🧠 CORTEX — {cortexPanelSymbol}</div>
            <button onClick={() => setCortexPanelSymbol(null)}
              style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.textDim, background: "transparent",
                border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>✕ Close</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
            <AMCortexTab key={cortexPanelSymbol} C={C} MONO={MONO} SANS={SANS} macroData={macroData} sectorData={sectorData}
              watchlistSymbols={watchlistSymbols} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
