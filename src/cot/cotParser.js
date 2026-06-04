"use strict";
/**
 * cotParser.js
 * Parses CFTC COT CSV files (TFF, Disaggregated, Legacy) into
 * normalised JS objects. Each result has a common schema so the
 * bias engine can treat all report types identically.
 *
 * Normalised record shape:
 * {
 *   marketName, reportDate,        // string
 *   openInterest,                  // number
 *   // Commercial (legacy / hedge for commodities)
 *   commercialLong, commercialShort, commercialNet,
 *   // Non-commercial / managed money
 *   noncommercialLong, noncommercialShort, noncommercialNet,
 *   // TFF-specific
 *   dealerLong, dealerShort, dealerNet,
 *   assetMgrLong, assetMgrShort, assetMgrNet,
 *   levMoneyLong, levMoneyShort, levMoneyNet,
 *   // Disagg-specific
 *   mmLong, mmShort, mmNet,          // managed money
 *   swapLong, swapShort, swapNet,
 *   producerLong, producerShort, producerNet,
 *   // meta
 *   reportType,                    // "TFF" | "DISAGG" | "LEGACY"
 * }
 */

// ── Minimal CSV parser (handles quoted fields with commas) ────────────────────

function parseCSVLine(line) {
  const fields = [];
  let cur = "";
  let inQ  = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
    } else if (ch === "," && !inQ) {
      fields.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim(); });
    return obj;
  });
  return { headers, rows };
}

function num(v) { return parseInt(String(v || "0").replace(/,/g, ""), 10) || 0; }

// Handle both old (spaces) and new (underscores) CFTC column naming
function col(row, ...names) {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== "") return row[n];
  }
  return "";
}

// ── Report-specific parsers ───────────────────────────────────────────────────

function parseTFFRow(row) {
  const dL  = num(col(row, "Dealer Positions-Long (All)",    "Dealer_Positions_Long_All"));
  const dS  = num(col(row, "Dealer Positions-Short (All)",   "Dealer_Positions_Short_All"));
  const amL = num(col(row, "Asset Mgr. Positions-Long (All)","Asset_Mgr_Positions_Long_All"));
  const amS = num(col(row, "Asset Mgr. Positions-Short (All)","Asset_Mgr_Positions_Short_All"));
  const lmL = num(col(row, "Lev Money Positions-Long (All)", "Lev_Money_Positions_Long_All"));
  const lmS = num(col(row, "Lev Money Positions-Short (All)","Lev_Money_Positions_Short_All"));
  return {
    marketName:         col(row, "Market and Exchange Names", "Market_and_Exchange_Names"),
    reportDate:         col(row, "As of Date in Form YYYY-MM-DD", "Report_Date_as_YYYY-MM-DD"),
    openInterest:       num(col(row, "Open Interest (All)", "Open_Interest_All")),
    dealerLong: dL, dealerShort: dS, dealerNet: dL - dS,
    assetMgrLong: amL, assetMgrShort: amS, assetMgrNet: amL - amS,
    levMoneyLong: lmL, levMoneyShort: lmS, levMoneyNet: lmL - lmS,
    commercialLong: dL, commercialShort: dS, commercialNet: dL - dS,
    noncommercialLong: lmL, noncommercialShort: lmS, noncommercialNet: lmL - lmS,
    mmLong: 0, mmShort: 0, mmNet: 0,
    swapLong: 0, swapShort: 0, swapNet: 0,
    producerLong: 0, producerShort: 0, producerNet: 0,
    reportType: "TFF",
  };
}

function parseDisaggRow(row) {
  const mmL  = num(col(row, "M Money Positions-Long (All)",  "M_Money_Positions_Long_All"));
  const mmS  = num(col(row, "M Money Positions-Short (All)", "M_Money_Positions_Short_All"));
  const swL  = num(col(row, "Swap Positions-Long (All)", "Swap Dealer Positions-Long (All)", "Swap_Positions_Long_All"));
  const swS  = num(col(row, "Swap Positions-Short (All)", "Swap Dealer Positions-Short (All)", "Swap__Positions_Short_All"));
  const prL  = num(col(row, "Prod/Merc/Proc/User Positions-Long (All)",  "Prod_Merc_Positions_Long_All"));
  const prS  = num(col(row, "Prod/Merc/Proc/User Positions-Short (All)", "Prod_Merc_Positions_Short_All"));

  return {
    marketName:        col(row, "Market and Exchange Names", "Market_and_Exchange_Names"),
    reportDate:        col(row, "As of Date in Form YYYY-MM-DD", "Report_Date_as_YYYY-MM-DD"),
    openInterest:      num(col(row, "Open Interest (All)", "Open_Interest_All")),

    // Managed money = primary signal for commodities
    mmLong: mmL, mmShort: mmS, mmNet: mmL - mmS,
    swapLong: swL, swapShort: swS, swapNet: swL - swS,
    producerLong: prL, producerShort: prS, producerNet: prL - prS,

    // Map to common fields
    commercialLong: prL, commercialShort: prS, commercialNet: prL - prS,
    noncommercialLong: mmL, noncommercialShort: mmS, noncommercialNet: mmL - mmS,

    dealerLong: swL, dealerShort: swS, dealerNet: swL - swS,
    assetMgrLong: 0, assetMgrShort: 0, assetMgrNet: 0,
    levMoneyLong: mmL, levMoneyShort: mmS, levMoneyNet: mmL - mmS,

    reportType: "DISAGG",
  };
}

function parseLegacyRow(row) {
  const ncL = num(col(row, "Noncommercial Positions-Long (All)",  "NonComm_Positions_Long_All"));
  const ncS = num(col(row, "Noncommercial Positions-Short (All)", "NonComm_Positions_Short_All"));
  const cL  = num(col(row, "Commercial Positions-Long (All)",     "Comm_Positions_Long_All"));
  const cS  = num(col(row, "Commercial Positions-Short (All)",    "Comm_Positions_Short_All"));

  return {
    marketName:        col(row, "Market and Exchange Names", "Market_and_Exchange_Names"),
    reportDate:        col(row, "As of Date in Form YYYY-MM-DD", "As of Date in Form YYYY-MM-DD", "Report_Date_as_YYYY-MM-DD"),
    openInterest:      num(col(row, "Open Interest (All)", "Open_Interest_All")),

    commercialLong: cL, commercialShort: cS, commercialNet: cL - cS,
    noncommercialLong: ncL, noncommercialShort: ncS, noncommercialNet: ncL - ncS,

    dealerLong: 0, dealerShort: 0, dealerNet: 0,
    assetMgrLong: 0, assetMgrShort: 0, assetMgrNet: 0,
    levMoneyLong: ncL, levMoneyShort: ncS, levMoneyNet: ncL - ncS,
    mmLong: ncL, mmShort: ncS, mmNet: ncL - ncS,
    swapLong: 0, swapShort: 0, swapNet: 0,
    producerLong: cL, producerShort: cS, producerNet: cL - cS,

    reportType: "LEGACY",
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse an entire CFTC CSV string.
 * Returns Map<lowerCaseMarketName, Record[]> sorted by reportDate ascending.
 */
function parseCOTCsv(csvText, reportType) {
  const { rows } = parseCSV(csvText);
  const byMarket = new Map();

  const parseRow = reportType === "TFF"    ? parseTFFRow
                 : reportType === "DISAGG" ? parseDisaggRow
                 :                           parseLegacyRow;

  for (const row of rows) {
    const rec = parseRow(row);
    if (!rec.marketName || !rec.reportDate) continue;

    const key = rec.marketName.toUpperCase();
    if (!byMarket.has(key)) byMarket.set(key, []);
    byMarket.get(key).push(rec);
  }

  // Sort each market's records chronologically
  for (const records of byMarket.values()) {
    records.sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  }

  return byMarket;
}

/**
 * Find records for a specific market pattern inside a parsed map.
 * Uses substring match (case-insensitive) against the CFTC market name.
 */
function findMarketRecords(parsedMap, pattern) {
  const patUpper = pattern.toUpperCase();
  for (const [key, records] of parsedMap.entries()) {
    if (key.includes(patUpper)) return records;
  }
  return [];
}

module.exports = { parseCOTCsv, findMarketRecords };
