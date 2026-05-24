"use strict";
/**
 * cotFetcher.js
 * Downloads official CFTC Commitments of Traders ZIP files and extracts
 * the embedded CSV using only Node built-ins (zlib for DEFLATE).
 *
 * CFTC ZIP URL format:
 *   TFF  futures only:  https://www.cftc.gov/files/dea/history/fin_fut_txt_YYYY.zip
 *   DISAGG futures:     https://www.cftc.gov/files/dea/history/fut_disagg_txt_YYYY.zip
 *   Legacy futures:     https://www.cftc.gov/files/dea/history/deacot_YYYY.zip
 */

const zlib = require("node:zlib");

// ── ZIP extraction (DEFLATE) — no external deps ───────────────────────────────

function extractFirstFileFromZip(buffer) {
  // Minimal ZIP local-file-header reader (PKZIP 2.0 spec)
  // Signature: PK\x03\x04 = 0x04034B50 little-endian
  if (buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("Buffer is not a ZIP archive");
  }

  const method         = buffer.readUInt16LE(8);   // 0=Store, 8=Deflate
  const compSize       = buffer.readUInt32LE(18);
  const fileNameLen    = buffer.readUInt16LE(26);
  const extraLen       = buffer.readUInt16LE(28);
  const dataStart      = 30 + fileNameLen + extraLen;
  const compressedData = buffer.subarray(dataStart, dataStart + compSize);

  if (method === 0) {
    return compressedData.toString("utf8");
  }
  if (method === 8) {
    return zlib.inflateRawSync(compressedData).toString("utf8");
  }
  throw new Error(`Unsupported ZIP compression method: ${method}`);
}

// ── CFTC URL builder ──────────────────────────────────────────────────────────

const BASE = "https://www.cftc.gov/files/dea/history";

function buildCftcUrl(reportType, year) {
  const y = year || new Date().getFullYear();
  switch (reportType) {
    case "TFF":    return `${BASE}/fin_fut_txt_${y}.zip`;
    case "DISAGG": return `${BASE}/fut_disagg_txt_${y}.zip`;
    case "LEGACY": return `${BASE}/deacot_${y}.zip`;
    default: throw new Error(`Unknown report type: ${reportType}`);
  }
}

// ── Download helpers ──────────────────────────────────────────────────────────

async function downloadBuffer(url, timeoutMs = 90_000) {
  const res = await fetch(url, {
    headers: { "User-Agent": "COTBiasEngine/1.0 (+finance-platform)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Download and extract the raw CSV text for a given report type and year.
 * Falls back to prior year if the current-year URL returns 404.
 */
async function fetchCOTCsv(reportType, year) {
  const y = year || new Date().getFullYear();
  const url = buildCftcUrl(reportType, y);

  try {
    console.log(`[COT] Downloading ${reportType} ${y}: ${url}`);
    const buffer = await downloadBuffer(url);
    const csv = extractFirstFileFromZip(buffer);
    console.log(`[COT] Extracted ${(csv.length / 1024).toFixed(0)} KB of ${reportType} CSV`);
    return { csv, year: y, url, stale: false };
  } catch (err) {
    // If current year fails (not yet published), try previous year
    if (y === new Date().getFullYear()) {
      console.warn(`[COT] ${y} ${reportType} failed (${err.message}), trying ${y - 1}`);
      const prevUrl = buildCftcUrl(reportType, y - 1);
      const buffer = await downloadBuffer(prevUrl);
      const csv = extractFirstFileFromZip(buffer);
      return { csv, year: y - 1, url: prevUrl, stale: true };
    }
    throw err;
  }
}

module.exports = { fetchCOTCsv, buildCftcUrl };
