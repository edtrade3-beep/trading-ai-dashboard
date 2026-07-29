"use strict";
// SEC EDGAR — free, no-key, official-source fallback for real insider Form 4
// transactions when Yahoo (the only prior source, providers/yahoo.js's
// fetchYahooInsiderTransactions) is unreachable or IP-blocked (CTO audit,
// 2026-07-29, item #13: single-provider risk for insider trading — Yahoo
// failing looked identical to "genuinely no filings this quarter"). Only
// covers insider transactions. Institutional/13F ownership and short
// interest are explicitly NOT built here: SEC only publishes 13F as bulk
// quarterly files meant for a real data pipeline (no per-symbol API), and
// short interest isn't SEC's data at all (that's FINRA's) — both would be
// separate, larger undertakings, not a quick fallback.
const { fetchJsonSafe, extractXmlTag, cached } = require("../utils");

// SEC's fair-access policy requires every request identify a real
// requester (https://www.sec.gov/os/webmaster-faq#developers) — a generic
// or missing User-Agent gets throttled/blocked. Override via env if the
// account contact should be different.
const SEC_USER_AGENT = process.env.SEC_EDGAR_CONTACT || "AM Trading Platform ed.dixiemotors@gmail.com";
const SEC_HEADERS = { "User-Agent": SEC_USER_AGENT, "Accept-Encoding": "gzip, deflate" };

const CIK_MAP_TTL_MS = 24 * 60 * 60_000; // ticker->CIK barely ever changes
const SUBMISSIONS_TTL_MS = 15 * 60_000;  // recent-filings list, short — a real new Form 4 should show up promptly
const MAX_FORM4_FILINGS = 10;            // bounds real per-symbol network cost (each filing = 1 more fetch)

async function loadCikMap() {
  return cached("sec:cik-map", CIK_MAP_TTL_MS, async () => {
    const data = await fetchJsonSafe("https://www.sec.gov/files/company_tickers.json", SEC_HEADERS);
    const map = {};
    if (data) {
      for (const key of Object.keys(data)) {
        const row = data[key];
        if (row?.ticker && row?.cik_str) map[String(row.ticker).toUpperCase()] = String(row.cik_str).padStart(10, "0");
      }
    }
    return map;
  });
}

async function resolveCik(symbol) {
  const map = await loadCikMap();
  return map[String(symbol).toUpperCase()] || null;
}

async function fetchRecentForm4Meta(cik) {
  return cached(`sec:submissions:${cik}`, SUBMISSIONS_TTL_MS, async () => {
    const data = await fetchJsonSafe(`https://data.sec.gov/submissions/CIK${cik}.json`, SEC_HEADERS);
    const recent = data?.filings?.recent;
    if (!recent?.form) return [];
    const out = [];
    for (let i = 0; i < recent.form.length && out.length < MAX_FORM4_FILINGS; i++) {
      if (recent.form[i] !== "4") continue;
      out.push({
        accession: String(recent.accessionNumber[i] || "").replace(/-/g, ""),
        primaryDocument: recent.primaryDocument[i] || "",
        filingDate: recent.filingDate[i] || "",
      });
    }
    return out;
  });
}

// A nested `<parentTag><value>X</value></parentTag>` pattern recurs
// throughout the Form 4 schema (transactionDate, transactionShares,
// transactionPricePerShare, ...) — extractXmlTag alone can't disambiguate
// which of several same-named <value> tags belongs to which field, so
// scope it to the parent block first.
function nestedValue(block, parentTag) {
  const m = String(block || "").match(new RegExp(`<${parentTag}>([\\s\\S]*?)<\\/${parentTag}>`, "i"));
  return m ? extractXmlTag(m[1], "value") : "";
}

function parseForm4Xml(xml, filingDate) {
  const ownerName = extractXmlTag(xml, "rptOwnerName") || "Unknown";
  const officerTitle = extractXmlTag(xml, "officerTitle");
  const isDirector = extractXmlTag(xml, "isDirector").toLowerCase() === "true";
  const isTenPercentOwner = extractXmlTag(xml, "isTenPercentOwner").toLowerCase() === "true";
  const role = officerTitle || (isDirector ? "Director" : isTenPercentOwner ? "10% Owner" : "");

  const blocks = xml.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/g) || [];
  const transactions = [];
  for (const block of blocks) {
    const shares = Number(nestedValue(block, "transactionShares")) || 0;
    const price = Number(nestedValue(block, "transactionPricePerShare")) || 0;
    // SEC's own A(cquired)/D(isposed) flag — a real structured direction
    // signal, more reliable than pattern-matching transaction-code letters
    // or free text (M/S/P/A/F/G codes don't map cleanly to buy/sell).
    const disposedCode = nestedValue(block, "transactionAcquiredDisposedCode");
    const type = disposedCode === "D" ? "SELL" : disposedCode === "A" ? "BUY" : "";
    if (!type || !shares) continue;
    transactions.push({
      date: nestedValue(block, "transactionDate") || filingDate,
      name: ownerName,
      role,
      type,
      shares,
      value: Math.round(shares * price),
      text: `${type === "SELL" ? "Sale" : "Purchase"} of ${shares.toLocaleString()} shares${price ? ` at $${price.toFixed(2)}` : ""}`,
    });
  }
  return transactions;
}

// Same output shape as providers/yahoo.js's fetchYahooInsiderTransactions —
// a drop-in fallback, not a second data model the UI has to special-case.
// holders stays honestly empty: SEC has no per-symbol "current institutional
// holders" endpoint (13F is only bulk quarterly data), so this never
// fabricates a holders list.
async function fetchSecInsiderTransactions(symbol) {
  const upper = symbol.toUpperCase();
  return cached(`sec:insider:${upper}`, SUBMISSIONS_TTL_MS, async () => {
    const empty = { symbol: upper, transactions: [], holders: [] };
    const cik = await resolveCik(upper);
    if (!cik) return empty;
    const filings = await fetchRecentForm4Meta(cik);
    if (!filings.length) return empty;

    const cikNum = String(Number(cik)); // path segment wants the CIK without leading zeros
    const results = await Promise.allSettled(
      filings.map(async (f) => {
        const doc = f.primaryDocument.includes("/") ? f.primaryDocument.split("/").pop() : f.primaryDocument;
        const url = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${f.accession}/${doc}`;
        const res = await fetch(url, { headers: SEC_HEADERS });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseForm4Xml(xml, f.filingDate);
      })
    );

    const transactions = results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 20);

    return { symbol: upper, transactions, holders: [] };
  });
}

module.exports = { fetchSecInsiderTransactions };
