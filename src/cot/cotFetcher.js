"use strict";
/**
 * cotFetcher.js
 * Downloads CFTC COT ZIP files and extracts the CSV.
 *
 * Tries current-week URLs first (small, fast, always fresh), then falls back
 * to the annual archive if needed.
 *
 * Current-week (latest report only — tiny file, downloads in 2-3s):
 *   TFF:    https://www.cftc.gov/dea/newcot/FinFutTxt.zip
 *   DISAGG: https://www.cftc.gov/dea/newcot/FuturesOnlyConsolidated.zip
 *   LEGACY: https://www.cftc.gov/dea/newcot/deacot.zip
 *
 * Annual archive (full year history — large, used as fallback):
 *   TFF:    https://www.cftc.gov/files/dea/history/fin_fut_txt_YYYY.zip
 *   DISAGG: https://www.cftc.gov/files/dea/history/fut_disagg_txt_YYYY.zip
 *   LEGACY: https://www.cftc.gov/files/dea/history/deacot_YYYY.zip
 */

const zlib = require("node:zlib");

// ── Robust ZIP extractor using Central Directory ──────────────────────────────
//
// Many CFTC ZIPs set bit 3 of the General Purpose Bit Flag, meaning
// compressed-size in the Local File Header is 0 (stored in a data descriptor
// AFTER the data). Reading the Central Directory always gives correct sizes.

function extractFirstFileFromZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw new Error("Buffer too small to be a ZIP archive");
  }

  // ── Step 1: find End-of-Central-Directory (EOCD) signature 0x06054b50 ──
  // Search backwards from the end (comment may push it back up to 64k)
  const EOCD_SIG  = 0x06054b50;
  const CD_SIG    = 0x02014b50;   // central-directory entry signature
  const LFH_SIG   = 0x04034b50;   // local file header signature

  let eocdOffset = -1;
  const maxSearch = Math.min(buffer.length - 22, 65536);
  for (let i = buffer.length - 22; i >= buffer.length - 22 - maxSearch; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error("ZIP EOCD not found — not a valid ZIP");

  const cdOffset  = buffer.readUInt32LE(eocdOffset + 16); // central dir start
  const cdSize    = buffer.readUInt32LE(eocdOffset + 12); // central dir size
  const numFiles  = buffer.readUInt16LE(eocdOffset + 10); // total entries

  if (numFiles === 0) throw new Error("ZIP has no files");

  // ── Step 2: read first entry in Central Directory ──
  if (buffer.readUInt32LE(cdOffset) !== CD_SIG) {
    throw new Error("Central directory signature mismatch");
  }

  const method       = buffer.readUInt16LE(cdOffset + 10); // 0=store 8=deflate
  const compSize     = buffer.readUInt32LE(cdOffset + 20); // reliable size
  const uncompSize   = buffer.readUInt32LE(cdOffset + 24);
  const fileNameLen  = buffer.readUInt16LE(cdOffset + 28);
  const extraLen     = buffer.readUInt16LE(cdOffset + 30);
  const commentLen   = buffer.readUInt16LE(cdOffset + 32);
  const lfhOffset    = buffer.readUInt32LE(cdOffset + 42); // local file header offset

  // ── Step 3: skip Local File Header to reach compressed data ──
  if (buffer.readUInt32LE(lfhOffset) !== LFH_SIG) {
    throw new Error("Local file header signature mismatch");
  }
  const lfhFileNameLen = buffer.readUInt16LE(lfhOffset + 26);
  const lfhExtraLen    = buffer.readUInt16LE(lfhOffset + 28);
  const dataStart      = lfhOffset + 30 + lfhFileNameLen + lfhExtraLen;
  const compressedData = buffer.subarray(dataStart, dataStart + compSize);

  if (compressedData.length === 0) {
    throw new Error(`Compressed data is 0 bytes (compSize=${compSize}, dataStart=${dataStart}, bufLen=${buffer.length})`);
  }

  // ── Step 4: decompress ──
  if (method === 0) {
    return compressedData.toString("latin1"); // Store (no compression)
  }
  if (method === 8) {
    return zlib.inflateRawSync(compressedData).toString("latin1"); // Deflate
  }
  throw new Error(`Unsupported ZIP method: ${method}`);
}

// ── URL builders ──────────────────────────────────────────────────────────────

// CFTC moved files to sites/default/files path in 2025 — current-week ZIPs removed
// Annual archive is the only reliable source now
// TFF filename changed: fin_fut_txt_YYYY → fut_fin_txt_YYYY
// LEGACY filename changed: deacot_YYYY → deacotYYYY
const CURRENT_WEEK = {
  TFF:    null,   // no working current-week URL
  DISAGG: null,
  LEGACY: null,
};

function annualUrl(reportType, year) {
  const BASE = "https://www.cftc.gov/sites/default/files/files/dea/history";
  switch (reportType) {
    case "TFF":    return `${BASE}/fut_fin_txt_${year}.zip`;
    case "DISAGG": return `${BASE}/fut_disagg_txt_${year}.zip`;
    case "LEGACY": return `${BASE}/deacot${year}.zip`;
    default: throw new Error(`Unknown report type: ${reportType}`);
  }
}

// ── Download helper ───────────────────────────────────────────────────────────

async function downloadBuffer(url, timeoutMs = 60_000) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; COTDataFetcher/1.0)",
      "Accept": "*/*",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Download + extract CSV for a report type.
 * Strategy:
 *   1. Try current-week URL (fast, small) — always has the latest report
 *   2. If that fails, try current-year annual archive
 *   3. If that fails, try previous-year annual archive
 */
async function fetchCOTCsv(reportType) {
  const y    = new Date().getFullYear();
  const urls = [
    { url: CURRENT_WEEK[reportType], label: "current-week", stale: false },
    { url: annualUrl(reportType, y),     label: `annual-${y}`,    stale: false },
    { url: annualUrl(reportType, y - 1), label: `annual-${y-1}`,  stale: true  },
  ];

  let lastErr;
  for (const { url, label, stale } of urls) {
    if (!url) continue; // skip null current-week entries
    try {
      console.log(`[COT] Trying ${reportType} ${label}: ${url}`);
      const buffer = await downloadBuffer(url);
      console.log(`[COT] Downloaded ${(buffer.length / 1024).toFixed(0)} KB`);
      const csv = extractFirstFileFromZip(buffer);
      if (!csv || csv.trim().length < 100) throw new Error("Extracted CSV is empty");
      console.log(`[COT] Extracted ${(csv.length / 1024).toFixed(0)} KB of CSV`);
      return { csv, url, stale };
    } catch (err) {
      console.warn(`[COT] ${reportType} ${label} failed: ${err.message}`);
      lastErr = err;
    }
  }
  throw new Error(`All ${reportType} sources failed. Last error: ${lastErr?.message}`);
}

module.exports = { fetchCOTCsv };
