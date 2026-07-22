import { useState, useEffect } from "react";
import { cardStyle } from "./ui-helpers.js";

// WATCHLIST RANKING — Module 11. Combines three already-real signals that
// never fed a ranked view before this session: quote-momentum.js's real
// delta5m/delta30m, StockTwits' real fetchTrending() "most discussed" list,
// and this session's new sentiment-trend store for "highest conviction."
// Ranks the user's actual trading watchlist (data/watchlist.json), not
// X Intel's separate entity watchlist (Fed/Treasury/company accounts).
function RankList({ title, rows, C, MONO, renderValue, emptyMsg }) {
  return (
    <div style={{ ...cardStyle(C, { background: C.card }), padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.text, marginBottom: 8 }}>{title}</div>
      {rows?.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {rows.map((r) => (
            <div key={r.symbol} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12, padding: "5px 8px", background: C.surface, borderRadius: 5 }}>
              <span style={{ color: C.text, fontWeight: 800 }}>{r.symbol}</span>
              <span style={{ color: C.textSec, fontVariantNumeric: "tabular-nums" }}>{renderValue(r)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{emptyMsg}</div>
      )}
    </div>
  );
}

export default function XIntelWatchlist({ C, MONO, SANS }) {
  const [rankings, setRankings] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    fetch("/api/x-intel/watchlist-rankings").then((r) => r.json()).then((d) => {
      if (d.ok) { setRankings(d.rankings); setState("ok"); } else setState("error");
    }).catch(() => setState("error"));
  }, []);

  const emptyMsg = "No symbols on your watchlist yet — add some on the Watchlist tab.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Loading…</div>}
      {rankings && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <RankList title="🚀 STRONGEST MOMENTUM (30m)" rows={rankings.strongestMomentum} C={C} MONO={MONO} emptyMsg={emptyMsg}
            renderValue={(r) => `${r.delta30m > 0 ? "+" : ""}${r.delta30m}%`} />
          <RankList title="📉 MOST DETERIORATING (30m)" rows={rankings.mostDeteriorating} C={C} MONO={MONO} emptyMsg={emptyMsg}
            renderValue={(r) => `${r.delta30m > 0 ? "+" : ""}${r.delta30m}%`} />
          <RankList title="💬 MOST DISCUSSED (StockTwits, real)" rows={rankings.mostDiscussed} C={C} MONO={MONO} emptyMsg="No StockTwits trending overlap with your watchlist right now."
            renderValue={(r) => `${r.watchlistCount?.toLocaleString?.() || r.watchlistCount} watching`} />
          <RankList title="🎯 HIGHEST CONVICTION (real sentiment)" rows={rankings.highestConviction} C={C} MONO={MONO} emptyMsg="No real sentiment history yet — builds up after the next AI-search run."
            renderValue={(r) => `${r.bullishPct}% bullish, ${r.avgConfidence ?? "—"} conf`} />
        </div>
      )}
    </div>
  );
}
