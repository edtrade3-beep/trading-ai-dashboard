const { writeJson } = require("../utils");

async function proxyFinancialModelingPrep(requestUrl, res) {
  const upstreamPath = requestUrl.pathname.replace("/api/fmp", "");
  if (!upstreamPath.startsWith("/api/") && !upstreamPath.startsWith("/stable/")) {
    return writeJson(res, 400, { error: "Invalid FMP path." });
  }
  const upstreamUrl = `https://financialmodelingprep.com${upstreamPath}${requestUrl.search}`;
  try {
    const response = await fetch(upstreamUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
    const bodyText = await response.text();
    res.writeHead(response.status, { "Content-Type": contentType, "Cache-Control": "no-store" });
    res.end(bodyText);
  } catch (error) {
    writeJson(res, 502, {
      error: "FMP proxy failed",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function proxyTwelveData(requestUrl, res) {
  const upstreamPath = requestUrl.pathname.replace("/api/td", "");
  if (!upstreamPath.startsWith("/")) {
    return writeJson(res, 400, { error: "Invalid Twelve Data path." });
  }
  const upstreamUrl = `https://api.twelvedata.com${upstreamPath}${requestUrl.search}`;
  try {
    const response = await fetch(upstreamUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
    const bodyText = await response.text();
    res.writeHead(response.status, { "Content-Type": contentType, "Cache-Control": "no-store" });
    res.end(bodyText);
  } catch (error) {
    writeJson(res, 502, {
      error: "Twelve Data proxy failed",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

// M3U playlist proxy — fetches any M3U/M3U8 URL server-side to bypass browser CORS
async function proxyM3U(requestUrl, res) {
  const target = requestUrl.searchParams.get("url");
  if (!target) return writeJson(res, 400, { error: "url param required" });
  let parsed;
  try { parsed = new URL(target); } catch { return writeJson(res, 400, { error: "Invalid URL" }); }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return writeJson(res, 400, { error: "Only http/https allowed" });
  }
  try {
    const r = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IPTV-proxy/1.0)", "Accept": "*/*" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await r.text();
    res.writeHead(r.status, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "max-age=300",
    });
    res.end(body);
  } catch (e) {
    writeJson(res, 502, { error: "M3U proxy failed", details: e.message });
  }
}

async function handleProxy(req, res, requestUrl) {
  if (requestUrl.pathname.startsWith("/api/fmp/")) {
    return proxyFinancialModelingPrep(requestUrl, res);
  }
  if (requestUrl.pathname.startsWith("/api/td/")) {
    return proxyTwelveData(requestUrl, res);
  }
  if (requestUrl.pathname === "/api/proxy/m3u" && req.method === "GET") {
    return proxyM3U(requestUrl, res);
  }
  return writeJson(res, 404, { error: "Not found." });
}

module.exports = handleProxy;
