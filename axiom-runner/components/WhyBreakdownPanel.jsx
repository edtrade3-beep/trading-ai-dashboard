// WhyBreakdownPanel — categorized bullish/bearish WHY (2026-08-25, Command
// Center, explicit user request: "every stocks bearish why bearish
// fundamental and technical or news same thing for bulish"). Four real,
// already-computable categories, no new scoring anywhere:
//
// - TECHNICAL: sniperReasons, the real ✓/✗ checklist from
//   computeSniperDecision (sniper-decision.js) — the same evidence already
//   shown in Cortex's Sniper Timing card and Market Terminal's Decision
//   Workspace, just split here into bull (✓) / bear (✗) instead of one
//   checklist.
// - FUNDAMENTAL: computeFundamentalsRead(fundamentals) (market-helpers.js)
//   — already real, already wired into the full Cortex tab via
//   /api/market/fundamentals.
// - NEWS: GET /api/news/ticker/:symbol (news-intel.js -> news/store.js's
//   getTickerAggregation, Postgres-backed) — real, but its first wiring
//   into any bullish/bearish WHY read anywhere in this app.
// - OPTIONS (Market Opportunity Engine Phase 1, 2026-08-25, spec §13's
//   explicit non-negotiable: "never automatically interpret unusual call
//   activity as bullish"): opportunity-engine.js's real
//   checkOptionsConfirmsStructure — CONFIRMS/CONTRADICTS/NEUTRAL/NO_DATA,
//   already cross-checked against the real technical verdict server-side,
//   not re-interpreted here. A CONTRADICTS read is deliberately shown
//   under neither bull nor bear (own note line) — flagging a real
//   disagreement is the whole point, not forcing it into one column.
//
// A category with no real bullets is shown as genuinely unavailable/flat —
// never padded with a fabricated reason to avoid an empty column.
import { computeFundamentalsRead } from "./market-helpers.js";

function readForOptions(options) {
  if (!options || options.status === "NO_DATA") return { unavailable: true, note: options?.note || "No real options flow data available." };
  if (options.status === "CONTRADICTS") return { bull: [], bear: [], flag: options.note };
  if (options.status === "CONFIRMS") return { bull: [options.note], bear: [] };
  return { bull: [], bear: [], flag: options.note };
}

function readForNews(news) {
  // `news` is only ever undefined while the caller's own fetch is still in
  // flight (handled by the `news !== undefined` gate below) — once it
  // resolves, even a failed fetch is a real, definite "unavailable" state,
  // never a stuck "Loading…".
  if (!news || !news.ok) return { unavailable: true, note: "News data unavailable." };
  if (news.status === "DEGRADED") return { unavailable: true, note: "News data unavailable (no database configured)." };
  if (!news.articleCount) return { unavailable: true, note: "No material real news coverage found." };
  const bull = [], bear = [];
  const side = news.trend === "BEARISH" ? bear : bull;
  if (news.trend === "BULLISH") bull.push(`${news.bullish} bullish vs ${news.bearish} bearish article${news.articleCount === 1 ? "" : "s"} (last ${news.articleCount})`);
  else if (news.trend === "BEARISH") bear.push(`${news.bearish} bearish vs ${news.bullish} bullish article${news.articleCount === 1 ? "" : "s"} (last ${news.articleCount})`);
  else bull.push(`Mixed real coverage — ${news.bullish} bullish / ${news.bearish} bearish`);
  if (news.latestHeadline) side.push(`Latest: "${news.latestHeadline}"`);
  return { bull, bear };
}

function readForTechnical(sniperReasons) {
  const bull = [], bear = [];
  (sniperReasons || []).forEach((r) => { (r.ok ? bull : bear).push(r.text); });
  return { bull, bear };
}

export default function WhyBreakdownPanel({ symbol, sniperReasons, fundamentals, news, options, C, MONO, SANS }) {
  const categories = [
    { key: "TECHNICAL", data: readForTechnical(sniperReasons) },
    { key: "FUNDAMENTAL", data: fundamentals !== undefined ? (computeFundamentalsRead(fundamentals) || { bull: [], bear: [] }) : null },
    { key: "NEWS", data: news !== undefined ? readForNews(news) : null },
    { key: "OPTIONS", data: options !== undefined ? readForOptions(options) : null },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
      {categories.map((cat) => (
        <div key={cat.key} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", background: C.card, minHeight: 54 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 5 }}>{cat.key}</div>
          {cat.data == null && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>Loading…</div>}
          {cat.data?.unavailable && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>{cat.data.note}</div>}
          {cat.data && !cat.data.unavailable && !cat.data.bull.length && !cat.data.bear.length && !cat.data.flag && (
            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>No strong real signal either way.</div>
          )}
          {cat.data?.bull?.map((t, i) => (
            <div key={`b${i}`} style={{ fontFamily: SANS, fontSize: 10.5, color: "#22d47e", marginBottom: 2, lineHeight: 1.35 }}>▲ {t}</div>
          ))}
          {cat.data?.bear?.map((t, i) => (
            <div key={`r${i}`} style={{ fontFamily: SANS, fontSize: 10.5, color: "#ef4444", marginBottom: 2, lineHeight: 1.35 }}>▼ {t}</div>
          ))}
          {cat.data?.flag && (
            <div style={{ fontFamily: SANS, fontSize: 10.5, color: "#d6a312", lineHeight: 1.35 }}>⚠ {cat.data.flag}</div>
          )}
        </div>
      ))}
    </div>
  );
}
