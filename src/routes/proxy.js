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

async function handleProxy(req, res, requestUrl) {
  if (requestUrl.pathname.startsWith("/api/fmp/")) {
    return proxyFinancialModelingPrep(requestUrl, res);
  }
  if (requestUrl.pathname.startsWith("/api/td/")) {
    return proxyTwelveData(requestUrl, res);
  }
  return writeJson(res, 404, { error: "Not found." });
}

module.exports = handleProxy;
