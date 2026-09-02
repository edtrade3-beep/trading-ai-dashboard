// Shared helpers for the Robinhood Pro AI cluster (RhProDashboard,
// RhProScanner, RhProWatchlists, RhProHeatMap, RhProCoach, RhProApex).
import { SCAN_UNIVERSE, STOCK_TO_SECTOR } from "./market-helpers.js";
import { computeAntiChase } from "./anti-chase.js";

// Robinhood Pro AI — Feature 2: AI Sniper Scanner. Ranks a universe 0–100 by
// reusing the server trend-screen engine. Analysis only — no orders.
// Re-exports the app-wide consolidated SCAN_UNIVERSE (market-helpers.js) —
// see that file's comment for why this and BEST_OPP_UNIVERSE were merged.
export const RH_UNIVERSE = SCAN_UNIVERSE;

// Stock Quality Score — "is this a good STOCK" (slow-changing, company/trend
// quality), as distinct from computeAPlusScore's Trade Setup Score — "is
// TODAY the right time" (fast-changing, timing/regime). Real, 8 dimensions,
// 100pts (2026-07-28, Phase 3 of the Institutional Scanner work, replacing
// the old 4-factor rhScore formula). Every dimension reuses a real field
// /api/market/trend-screen already returns, plus an optional real
// sectorPerf map (symbol->%chg for the 11 SECTOR_ETFS, fetched by the
// caller — RhProScanner fetches it; call sites that don't pass one get an
// honest neutral mid-point for Sector Strength, never a fabricated number).
export function stockQualityBreakdown(r, sectorPerf) {
  const passCount = Math.max(0, Math.min(8, Number(r?.passCount) || 0));
  const rsRating = Math.max(1, Math.min(99, Number(r?.rsRating) || 1));

  // 1. Trend structure — Minervini 8-point trend template pass count.
  const trendPts = Math.round((passCount / 8) * 20);
  // 2. Relative strength — cross-sectional percentile rank vs the screened universe.
  const rsPts = Math.round((rsRating / 100) * 15);

  // 3. Momentum — real absolute weighted return (not percentile-ranked, so
  // this genuinely differs from RS above: a stock can rank well vs a weak
  // peer group on RS while still having soft absolute momentum, and vice
  // versa). Same weighted-momentum value the server uses to build RS
  // (0.4*63d + 0.2*126d + 0.2*189d + 0.2*252d returns) — now passed through
  // instead of being deleted server-side. Normalized so 0% = mid-low credit,
  // +40% blended return = full credit; real absent data gets an honest
  // mid-point, not a zero.
  const momentum = Number(r?.momentum);
  const momentumPts = Number.isFinite(momentum) ? Math.round(Math.max(0, Math.min(1, (momentum + 0.1) / 0.5)) * 10) : 5;

  // 4. Stage analysis — real Minervini stage string the server already derives.
  const stage = String(r?.stage || "");
  const stagePts = stage.startsWith("Stage 2 — Confirmed") ? 10 : stage.startsWith("Stage 2") ? 7 : stage.startsWith("Stage 1/3") ? 4 : 0;

  // 5. Volume trend — real volume vs the 50-day average (reused from the
  // Trade Setup Score's volume check, but framed here as a quality signal —
  // sustained above-average volume vs a one-day breakout spike).
  const volRatio = Number(r?.volRatio);
  const volTrendPts = Number.isFinite(volRatio) ? Math.round(Math.max(0, Math.min(1, volRatio / 2)) * 15) : 8;

  // 6. Sector strength — real sector-ETF % change vs SPY's % change, looked
  // up via the real STOCK_TO_SECTOR map. Requires the caller to pass a real
  // sectorPerf map ({ XLK: pctChg, ..., SPY: pctChg }); when absent (most
  // call sites don't fetch sector ETFs), gives an honest neutral mid-point —
  // never fabricates a relative-strength number with no real sector data.
  const sectorEtf = STOCK_TO_SECTOR[String(r?.symbol || "").toUpperCase()];
  const sectorChg = sectorPerf && sectorEtf ? Number(sectorPerf[sectorEtf]) : NaN;
  const spyChg = sectorPerf ? Number(sectorPerf.SPY) : NaN;
  const sectorRel = Number.isFinite(sectorChg) && Number.isFinite(spyChg) ? sectorChg - spyChg : NaN;
  const sectorPts = Number.isFinite(sectorRel) ? Math.round(Math.max(0, Math.min(1, (sectorRel + 1.5) / 3)) * 15) : 8;

  // 7. Fundamental strength — real forward-vs-trailing EPS growth when Yahoo
  // has both figures (often absent for thin-coverage names — honest
  // mid-point then, not a fabricated growth number).
  const epsGrowth = Number(r?.epsGrowth);
  const fundamentalPts = Number.isFinite(epsGrowth) ? Math.round(Math.max(0, Math.min(1, (epsGrowth + 10) / 30)) * 10) : 5;

  // 8. Liquidity — real dollar volume (price × regularMarketVolume) as a
  // proxy for how easily this position can be entered/exited without
  // slippage. $1B+/day = full credit.
  const dollarVolume = Number(r?.dollarVolume);
  const liquidityPts = Number.isFinite(dollarVolume) && dollarVolume > 0 ? Math.round(Math.max(0, Math.min(1, dollarVolume / 1e9)) * 5) : 3;

  const rawScore = Math.max(0, Math.min(100, trendPts + rsPts + momentumPts + stagePts + volTrendPts + sectorPts + fundamentalPts + liquidityPts));

  // Real bug fix (2026-08-26, "Trade Desk Tier 3a" — closing the same
  // verdict-contradiction gap classifyCoreVerdict's hard gate already
  // fixed for Market Terminal, am-core-engine.js): Stage 4 already zeroed
  // out its own stagePts sub-component, but the other 7 dimensions could
  // still add up to a moderately high overall score for a real Stage-4
  // downtrend, and real anti-chase extension wasn't checked at all.
  // Clamped to a real low ceiling when gated.
  const stage4 = /Stage\s*4/i.test(stage);
  const abovePivotPct = Number(r?.abovePivotPct);
  const antiChase = Number.isFinite(abovePivotPct) ? computeAntiChase(abovePivotPct) : null;
  const chaseBlocked = antiChase?.band === "EXTENDED" || antiChase?.band === "DO_NOT_CHASE";
  const gated = stage4 || chaseBlocked;
  const score = gated ? Math.min(rawScore, 20) : rawScore;

  const cautions = [];
  if (stage4) cautions.push("🔴 Stage 4 downtrend — real score capped, not a valid long setup.");
  if (chaseBlocked) cautions.push(`🔴 ${antiChase.label} — real score capped, too extended to chase.`);

  const reasons = [
    `${passCount}/8 trend template criteria met`,
    rsRating >= 90 ? `RS ${rsRating} — top-decile market leader` : rsRating >= 70 ? `RS ${rsRating} — market leader` : `RS ${rsRating} — below leader threshold`,
    Number.isFinite(momentum) ? `Weighted momentum ${(momentum * 100).toFixed(1)}% over the trailing year (blended)` : "Momentum data unavailable",
    stage ? `${stage}` : "Stage unavailable",
    Number.isFinite(volRatio) ? `Volume ${volRatio.toFixed(1)}x the 50-day average` : "Volume data unavailable",
    Number.isFinite(sectorRel) ? `Sector ${sectorRel >= 0 ? "outperforming" : "underperforming"} SPY by ${Math.abs(sectorRel).toFixed(1)}pts today` : "Sector performance data unavailable",
    Number.isFinite(epsGrowth) ? `EPS growth (fwd vs TTM): ${epsGrowth >= 0 ? "+" : ""}${epsGrowth}%` : "Forward EPS data unavailable",
    Number.isFinite(dollarVolume) && dollarVolume > 0 ? `$${(dollarVolume / 1e6).toFixed(0)}M real daily dollar volume` : "Dollar volume unavailable",
  ];
  return { score, reasons, cautions, breakdown: { trendPts, rsPts, momentumPts, stagePts, volTrendPts, sectorPts, fundamentalPts, liquidityPts } };
}

export function rhScore(r, sectorPerf) {
  return stockQualityBreakdown(r, sectorPerf).score;
}
// Screen a big universe in small parallel batches — one 60-symbol call times out
// (each symbol fetches Yahoo). Batches of 12 finish fast; failures are tolerated.
export async function rhScreen(symbols) {
  const chunks = [];
  for (let i = 0; i < symbols.length; i += 12) chunks.push(symbols.slice(i, i + 12));
  const parts = await Promise.all(chunks.map(c =>
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(c.join(","))}&withDecision=1`)
      .then(r => r.ok ? r.json() : null)
      .then(d => (d && d.results) || [])
      .catch(() => [])
  ));
  return parts.flat().filter(x => x && !x.error);
}
// Progressive screen: fires each batch and calls onBatch(results) as it returns,
// so the UI fills in as data arrives instead of blocking on the whole universe.
export function rhScreenProgressive(symbols, onBatch, onDone) {
  const chunks = [];
  for (let i = 0; i < symbols.length; i += 10) chunks.push(symbols.slice(i, i + 10));
  let done = 0;
  chunks.forEach(c => {
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(c.join(","))}&withDecision=1`)
      .then(r => r.ok ? r.json() : null)
      .then(d => onBatch(((d && d.results) || []).filter(x => x && !x.error)))
      .catch(() => {})
      .finally(() => { if (++done === chunks.length) onDone(); });
  });
}

// Lightweight markdown renderer for the APEX briefing.
// Colored, sectioned renderer — groups the markdown into cards colored by section.
export function rhMarkdown(text, C, MONO, SANS) {
  const secColor = (h) => { const H = (h || "").toUpperCase();
    if (H.includes("BEST TRADE") || H.includes("WHY") || H.includes("TOP SETUP")) return C.green;
    if (H.includes("REASONS NOT") || H.includes("RISK")) return C.red;
    if (H.includes("MOVING") || H.includes("NEWS")) return "#3b82f6";
    if (H.includes("ACTION")) { return /\bBUY\b/i.test(text.split(h)[1] || "") ? C.green : C.amber; }
    return C.accent; };
  const inline = (s) => String(s).split(/(\*\*[^*]+\*\*|[+-]\d+(?:\.\d+)?%|\d+(?:\.\d+)?×|\bWAIT\b|\bBUY\b|\bSELL\b|\bHOLD\b)/g).map((p, j) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return React.createElement("b", { key: j, style: { color: C.text } }, p.slice(2, -2));
    if (/^\+\d.*%$/.test(p)) return React.createElement("span", { key: j, style: { color: C.green, fontWeight: 700 } }, p);
    if (/^-\d.*%$/.test(p)) return React.createElement("span", { key: j, style: { color: C.red, fontWeight: 700 } }, p);
    if (/^(BUY)$/.test(p)) return React.createElement("b", { key: j, style: { color: C.green } }, p);
    if (/^(SELL|WAIT|HOLD)$/.test(p)) return React.createElement("b", { key: j, style: { color: C.amber } }, p);
    return p;
  });
  const blocks = String(text || "").split(/\n(?=##\s)/);
  return blocks.map((block, bi) => {
    const lines = block.split(/\r?\n/); let header = ""; const body = [];
    lines.forEach(ln => { if (/^##\s/.test(ln) && !header) header = ln.replace(/^#+\s/, ""); else if (ln.trim() && !/^---+$/.test(ln)) body.push(ln); });
    if (!header && !body.length) return null;
    const col = secColor(header);
    // --- Markdown table support: group contiguous "| a | b |" lines into a <table>. ---
    const isRow = (ln) => /^\s*\|.*\|\s*$/.test(ln);
    const isSep = (ln) => /^\s*\|?[\s:|-]+\|?\s*$/.test(ln) && /-/.test(ln) && !/[a-z0-9]/i.test(ln.replace(/[-:|\s]/g, ""));
    const cells = (ln) => ln.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    const renderTable = (rows, key) => {
      let head = null, data = rows;
      if (rows.length >= 2 && isSep(rows[1])) { head = cells(rows[0]); data = rows.slice(2); }
      else if (rows.length && isSep(rows[0])) { data = rows.slice(1); }
      const th = (t, j) => React.createElement("th", { key: j, style: { fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, textAlign: "left", padding: "6px 10px", borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap" } }, t);
      const td = (t, j) => React.createElement("td", { key: j, style: { fontFamily: SANS, fontSize: 12.5, color: C.text, padding: "6px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" } }, inline(t));
      return React.createElement("div", { key, style: { overflowX: "auto", margin: "6px 0 10px" } },
        React.createElement("table", { style: { borderCollapse: "collapse", width: "100%", minWidth: 520 } },
          head && React.createElement("thead", null, React.createElement("tr", null, head.map(th))),
          React.createElement("tbody", null, data.map((r, ri) => React.createElement("tr", { key: ri, style: { background: ri % 2 ? "transparent" : "rgba(127,127,127,0.04)" } }, cells(r).map(td))))
        )
      );
    };
    // Walk the body: emit tables for runs of table rows, normal divs otherwise.
    const out = []; let i = 0;
    while (i < body.length) {
      if (isRow(body[i])) {
        const run = []; while (i < body.length && isRow(body[i])) { run.push(body[i]); i++; }
        out.push(renderTable(run, "t" + i));
      } else {
        const ln = body[i], li = "l" + i;
        out.push(/^[-*]\s/.test(ln)
          ? React.createElement("div", { key: li, style: { fontFamily: SANS, fontSize: 13, color: C.textSec, padding: "3px 0 3px 12px", lineHeight: 1.65 } }, "• ", inline(ln.replace(/^[-*]\s/, "")))
          : React.createElement("div", { key: li, style: { fontFamily: SANS, fontSize: 13.5, fontWeight: /·/.test(ln) ? 700 : 400, color: C.text, padding: "3px 0", lineHeight: 1.65 } }, inline(ln)));
        i++;
      }
    }
    return React.createElement("div", { key: bi, style: { background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${col}`, borderRadius: 10, padding: "12px 16px", marginBottom: 10 } },
      header && React.createElement("div", { style: { fontFamily: MONO, fontSize: 13, fontWeight: 900, color: col, marginBottom: 8, letterSpacing: "0.02em" } }, header),
      out
    );
  }).filter(Boolean);
}
