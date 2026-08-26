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
//
// Collapsible accordion, not a permanently-expanded 4-box grid (2026-08-26,
// explicit user request: Trade Desk's right column — Market Context/
// Cortex/AI Verdict/Trade Plan/this panel — was "messy": in a narrow
// ~280px column the old grid fell back to 4 fully-open boxes stacked
// top to bottom, a wall of small bullet text below the actual decision
// (AI Verdict/Trade Plan). TECHNICAL opens by default (the category that
// most directly explains the verdict above it); the other 3 collapse to
// a one-line header showing a real ▲/▼ bull/bear count, so the real
// content is still one click away, never removed.
import { useState } from "react";
import { computeFundamentalsRead } from "./market-helpers.js";

const DEFAULT_OPEN = { TECHNICAL: true, FUNDAMENTAL: false, NEWS: false, OPTIONS: false };

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
  const [open, setOpen] = useState(DEFAULT_OPEN);
  const categories = [
    { key: "TECHNICAL", data: readForTechnical(sniperReasons) },
    { key: "FUNDAMENTAL", data: fundamentals !== undefined ? (computeFundamentalsRead(fundamentals) || { bull: [], bear: [] }) : null },
    { key: "NEWS", data: news !== undefined ? readForNews(news) : null },
    { key: "OPTIONS", data: options !== undefined ? readForOptions(options) : null },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {categories.map((cat) => {
        const isOpen = open[cat.key];
        const bullN = cat.data?.bull?.length || 0;
        const bearN = cat.data?.bear?.length || 0;
        return (
          <div key={cat.key} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, overflow: "hidden" }}>
            <button
              onClick={() => setOpen((o) => ({ ...o, [cat.key]: !o[cat.key] }))}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: "none", padding: "7px 10px", textAlign: "left" }}
            >
              <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6 }}>{cat.key}</span>
              {cat.data == null && <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>Loading…</span>}
              {cat.data?.unavailable && <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>unavailable</span>}
              {cat.data && !cat.data.unavailable && (bullN > 0 || bearN > 0) && (
                <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700 }}>
                  {bullN > 0 && <span style={{ color: "#22d47e" }}>▲{bullN}</span>}
                  {bullN > 0 && bearN > 0 && " "}
                  {bearN > 0 && <span style={{ color: "#ef4444" }}>▼{bearN}</span>}
                </span>
              )}
              {cat.data?.flag && <span style={{ fontFamily: SANS, fontSize: 10, color: "#d6a312" }}>⚠</span>}
              {cat.data && !cat.data.unavailable && !bullN && !bearN && !cat.data.flag && (
                <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>flat</span>
              )}
              <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: C.textDim }}>{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div style={{ padding: "0 10px 8px" }}>
                {cat.data?.unavailable && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>{cat.data.note}</div>}
                {cat.data && !cat.data.unavailable && !bullN && !bearN && !cat.data.flag && (
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
            )}
          </div>
        );
      })}
    </div>
  );
}
