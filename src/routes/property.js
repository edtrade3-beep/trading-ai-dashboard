"use strict";
// routes/property.js (2026-09-16, "STOCKS + PROPERTIES" master prompt) —
// real HTTP surface for the Property Engine. Same handler-per-file /
// dispatch-in-router.js convention as routes/future-value-scan.js. Both
// routes read the real RentCast key via config.js's resolveProviderKeys,
// same per-provider key pattern every other provider in this app uses.

const { writeJson } = require("../utils");
const { resolveProviderKeys } = require("../config");
const { analyzeProperty, scanProperties } = require("../property-scanner");

// GET /api/property/analyze?address=&purchasePrice=&repairCost=
async function handlePropertyAnalyze(req, res, requestUrl) {
  try {
    const keys = resolveProviderKeys(requestUrl.searchParams);
    const address = requestUrl.searchParams.get("address") || "";
    const purchasePrice = requestUrl.searchParams.get("purchasePrice");
    const repairCost = requestUrl.searchParams.get("repairCost");
    const result = await analyzeProperty({ address, purchasePrice, repairCost }, keys.rentcast);
    return writeJson(res, 200, result);
  } catch (err) {
    return writeJson(res, 200, { ok: false, error: err instanceof Error ? err.message : "Property analysis unavailable." });
  }
}

// GET /api/property/search?city=&state=&zipCode=&minPrice=&maxPrice=&propertyType=&limit=
async function handlePropertySearch(req, res, requestUrl) {
  try {
    const keys = resolveProviderKeys(requestUrl.searchParams);
    const params = requestUrl.searchParams;
    const limitParam = Number(params.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(50, limitParam) : 20;
    const result = await scanProperties({
      city: params.get("city") || undefined, state: params.get("state") || undefined, zipCode: params.get("zipCode") || undefined,
      minPrice: params.get("minPrice") || undefined, maxPrice: params.get("maxPrice") || undefined,
      propertyType: params.get("propertyType") || undefined, limit,
    }, keys.rentcast);
    return writeJson(res, 200, result);
  } catch (err) {
    return writeJson(res, 200, { ok: false, error: err instanceof Error ? err.message : "Property search unavailable.", properties: [] });
  }
}

module.exports = { handlePropertyAnalyze, handlePropertySearch };
