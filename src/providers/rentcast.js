"use strict";
// providers/rentcast.js — real RentCast API adapter (2026-09-16, "AI
// Opportunity Hunter" master prompt's Property Engine). Real endpoints,
// verified against RentCast's own live documentation before writing this
// file (developers.rentcast.io) rather than guessed:
//   Base: https://api.rentcast.io/v1
//   Auth: header "X-Api-Key: <key>"
//   GET /avm/value            — value estimate + comparable SALES
//   GET /avm/rent/long-term   — rent estimate + comparable RENTALS
//   GET /listings/sale        — active sale listings search
// Same fetchJsonSafe (src/utils.js) every other provider in this app
// already uses — fails to null on any real error, never throws, never
// fabricates a response.

const { fetchJsonSafe } = require("../utils");

const BASE = "https://api.rentcast.io/v1";

function authHeaders(apiKey) {
  return { Accept: "application/json", "X-Api-Key": apiKey };
}

function qs(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    usp.set(k, String(v));
  }
  return usp.toString();
}

// Real value estimate (AVM) + real comparable sales for one address.
// address: a real full street address string (RentCast's own required
// format — "123 Main St, Austin, TX 78701"). Returns null on any real
// failure (bad address, no coverage, rate limit, missing key) — never a
// fabricated estimate.
async function fetchRentcastValueEstimate(address, apiKey, opts = {}) {
  if (!apiKey || !address) return null;
  const query = qs({ address, compCount: opts.compCount || 10, maxRadius: opts.maxRadius, daysOld: opts.daysOld });
  const data = await fetchJsonSafe(`${BASE}/avm/value?${query}`, authHeaders(apiKey));
  if (!data || !Number.isFinite(Number(data.price))) return null;
  return {
    price: Number(data.price), priceRangeLow: Number(data.priceRangeLow) || null, priceRangeHigh: Number(data.priceRangeHigh) || null,
    subjectProperty: data.subjectProperty || null,
    comparables: Array.isArray(data.comparables) ? data.comparables : [],
  };
}

// Real long-term rent estimate + real comparable rentals for one address.
async function fetchRentcastRentEstimate(address, apiKey, opts = {}) {
  if (!apiKey || !address) return null;
  const query = qs({ address, compCount: opts.compCount || 10, maxRadius: opts.maxRadius, daysOld: opts.daysOld });
  const data = await fetchJsonSafe(`${BASE}/avm/rent/long-term?${query}`, authHeaders(apiKey));
  if (!data || !Number.isFinite(Number(data.rent))) return null;
  return {
    rent: Number(data.rent), rentRangeLow: Number(data.rentRangeLow) || null, rentRangeHigh: Number(data.rentRangeHigh) || null,
    comparables: Array.isArray(data.comparables) ? data.comparables : [],
  };
}

// Real active sale-listing search over a city/state/zip. Returns a real
// array (possibly empty), never null on a real "no results" — null is
// reserved for a genuine fetch failure so callers can tell the two apart.
async function searchRentcastSaleListings({ city, state, zipCode, status = "Active", minPrice, maxPrice, propertyType, limit = 50 } = {}, apiKey) {
  if (!apiKey) return null;
  const query = qs({ city, state, zipCode, status, minPrice, maxPrice, propertyType, limit });
  const data = await fetchJsonSafe(`${BASE}/listings/sale?${query}`, authHeaders(apiKey));
  if (data == null) return null;
  return Array.isArray(data) ? data : Array.isArray(data.listings) ? data.listings : [];
}

module.exports = { fetchRentcastValueEstimate, fetchRentcastRentEstimate, searchRentcastSaleListings, BASE };
