import { useState, useEffect } from "react";

// ── AI Watchlist Suggestions — surfaces market-scanner.js's real signal
// results (GET /api/scanner/status, already used by OpportunityQueueCard)
// as symbols worth adding to the watchlist. Zero new backend, zero new
// scoring — just filters out symbols already on the list. One click per
// add, exactly the same setWatchlistSymbols/setWatchlistInput pattern the
// command palette's ticker shortcut already uses — nothing is ever
// auto-added without the user clicking.
export default function AiWatchlistSuggestions({ C, MONO, SANS, watchlistSymbols, setWatchlistSymbols, setWatchlistInput }) {
  const [hits, setHits] = useState([]);

  useEffect(() => {
    fetch("/api/scanner/status").then(r => r.json()).then(d => {
      setHits(Array.isArray(d?.lastHits) ? d.lastHits : []);
    }).catch(() => {});
  }, []);

  const suggestions = hits
    .filter(h => h.signal === "BUY" && !watchlistSymbols.includes(h.symbol))
    .sort((a, b) => (b.composite || 0) - (a.composite || 0))
    .slice(0, 6);

  if (!suggestions.length) return null;

  const add = (sym) => {
    const next = [...watchlistSymbols, sym];
    setWatchlistSymbols(next);
    setWatchlistInput(next.join(","));
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 8 }}>
        🤖 AI SUGGESTS — from today's scanner hits
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {suggestions.map(h => (
          <button key={h.symbol} onClick={() => add(h.symbol)}
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 14, cursor: "pointer",
              border: `1px solid ${C.border}`, background: "transparent", color: C.accent, display: "flex", alignItems: "center", gap: 5 }}>
            + {h.symbol} <span style={{ color: C.textDim, fontWeight: 400 }}>{Math.round(h.composite || 0)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
