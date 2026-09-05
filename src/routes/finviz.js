const { writeJson } = require("../utils");
const { fetchFinvizStats, fetchFinvizChartBuffer } = require("../providers/finviz");

async function handleFinviz(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  // GET /api/finviz/quote?symbol=AAPL
  if (pathname === "/api/finviz/quote") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return writeJson(res, 400, { error: "symbol is required" });
    try {
      const data = await fetchFinvizStats(symbol);
      return writeJson(res, 200, data);
    } catch (err) {
      return writeJson(res, 502, { error: err.message });
    }
  }

  // GET /api/finviz/chart?symbol=AAPL&period=d   (period: d/w/m)
  if (pathname === "/api/finviz/chart") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const period = searchParams.get("period") || "d";
    if (!symbol) return writeJson(res, 400, { error: "symbol is required" });
    try {
      const { buf, contentType } = await fetchFinvizChartBuffer(symbol, period);
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": buf.length,
        "Cache-Control": "public, max-age=180",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(buf);
    } catch (err) {
      return writeJson(res, 502, { error: err.message });
    }
    return;
  }

  return writeJson(res, 404, { error: "Unknown Finviz endpoint" });
}

module.exports = handleFinviz;
