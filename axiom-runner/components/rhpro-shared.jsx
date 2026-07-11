// Shared helpers for the Robinhood Pro AI cluster (RhProDashboard,
// RhProScanner, RhProWatchlists, RhProHeatMap, RhProCoach, RhProApex).

// Robinhood Pro AI — Feature 2: AI Sniper Scanner. Ranks a universe 0–100 by
// reusing the server trend-screen engine. Analysis only — no orders.
export const RH_UNIVERSE = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","PLTR","SNOW","MU","QCOM",
  "ANET","MRVL","SMCI","ARM","COIN","UBER","ABNB","SHOP","INTU","LRCX",
  "LLY","V","MA","JPM","COST","WMT","HD","AXP","GE","CAT",
  "TSM","VRT","NEE","WMB","CCJ","CEG","DELL","MARA","RIOT","CLSK",
  "CIFR","WULF","IREN","HOOD","NET","DDOG","ZS","CVNA","APP","RDDT",
];
export function rhScore(r) {
  // 0–100 composite: Trend Template (50) + Relative Strength (25) + timing (15) + volume (10).
  const pass = Math.max(0, Math.min(8, Number(r.passCount) || 0));
  const rs = Math.max(1, Math.min(99, Number(r.rsRating) || 1));
  return Math.round(pass / 8 * 50 + rs / 99 * 25 + (r.atBuyPoint ? 15 : 0) + (r.volConfirmed ? 10 : 0));
}
// Screen a big universe in small parallel batches — one 60-symbol call times out
// (each symbol fetches Yahoo). Batches of 12 finish fast; failures are tolerated.
export async function rhScreen(symbols) {
  const chunks = [];
  for (let i = 0; i < symbols.length; i += 12) chunks.push(symbols.slice(i, i + 12));
  const parts = await Promise.all(chunks.map(c =>
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(c.join(","))}`)
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
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(c.join(","))}`)
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
