const { writeJson, readRequestBody } = require("../utils");
const { loadPortfolio, savePortfolio } = require("../portfolio-store");

function sanitizeHolding(raw) {
  const symbol = String(raw.symbol || "").toUpperCase().trim().slice(0, 12);
  const shares = Number(raw.shares);
  const costBasis = Number(raw.costBasis);
  if (!symbol || !Number.isFinite(shares) || shares <= 0) return null;
  if (!Number.isFinite(costBasis) || costBasis <= 0) return null;
  return {
    symbol,
    shares: Math.round(shares * 1000) / 1000,
    costBasis: Math.round(costBasis * 100) / 100,
    addedAt: raw.addedAt || new Date().toISOString(),
    notes: String(raw.notes || "").slice(0, 200),
  };
}

async function handlePortfolio(req, res, requestUrl) {
  const { pathname } = requestUrl;

  // GET /api/portfolio — load saved portfolio
  if (pathname === "/api/portfolio" && req.method === "GET") {
    const data = loadPortfolio();
    return writeJson(res, 200, data);
  }

  // POST /api/portfolio — replace entire holdings array
  if (pathname === "/api/portfolio" && req.method === "POST") {
    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { error: "Invalid JSON body" });
    }

    const raw = Array.isArray(body.holdings) ? body.holdings : Array.isArray(body) ? body : [];
    const holdings = raw.map(sanitizeHolding).filter(Boolean);
    savePortfolio(holdings);
    return writeJson(res, 200, { ok: true, saved: holdings.length });
  }

  // GET /api/portfolio/export.csv
  if (pathname === "/api/portfolio/export.csv" && req.method === "GET") {
    const { holdings } = loadPortfolio();
    const header = "Symbol,Shares,CostBasis,AddedAt,Notes";
    const rows = (holdings || []).map((h) =>
      [h.symbol, h.shares, h.costBasis, h.addedAt || "", h.notes || ""]
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...rows].join("\r\n");
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="portfolio-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    });
    res.end(csv);
    return;
  }

  return writeJson(res, 404, { error: "Unknown portfolio endpoint." });
}

module.exports = handlePortfolio;
