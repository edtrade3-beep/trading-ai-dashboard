"use strict";
// property-scanner.js (2026-09-16, "STOCKS + PROPERTIES" master prompt) —
// orchestrates real RentCast fetches (src/providers/rentcast.js) into real
// property-engine.js math. Mirrors top50-scanner.js's own split: pure
// scoring math lives in property-engine.js, real data-fetch + assembly
// lives here — same separation top50-scanner-score.js/top50-scanner.js
// already established for stocks.

const { fetchRentcastValueEstimate, fetchRentcastRentEstimate, searchRentcastSaleListings } = require("./providers/rentcast");
const {
  computeFlipAnalysis, computeRentalAnalysis, computeComparablesQuality,
  computeRentalDealScore, computeFlipDealScore,
} = require("./property-engine");

function formatAddress(listing) {
  if (!listing) return null;
  if (listing.formattedAddress) return listing.formattedAddress;
  const parts = [listing.addressLine1, listing.city, listing.state, listing.zipCode].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

// Real single-property deep analysis — real RentCast value + rent
// estimates, real flip + rental math, both real Property Deal Scores.
// repairCost is optional; flip math reports repairCostRequired:true
// without it rather than assuming $0.
async function analyzeProperty({ address, purchasePrice, repairCost }, apiKey) {
  if (!apiKey) return { ok: false, error: "RentCast not configured" };
  const addr = (address || "").trim();
  if (!addr) return { ok: false, error: "address required" };

  const [valueEstimate, rentEstimate] = await Promise.all([
    fetchRentcastValueEstimate(addr, apiKey),
    fetchRentcastRentEstimate(addr, apiKey),
  ]);
  if (!valueEstimate) return { ok: false, error: "No real RentCast value estimate for this address." };

  const price = Number(purchasePrice) > 0 ? Number(purchasePrice) : valueEstimate.price;
  const arv = valueEstimate.price;
  const saleCompQuality = computeComparablesQuality(valueEstimate.comparables);
  const rentCompQuality = rentEstimate ? computeComparablesQuality(rentEstimate.comparables) : null;

  const flip = computeFlipAnalysis({ purchasePrice: price, repairCost, arv });
  const flipDealScore = flip && !flip.repairCostRequired
    ? computeFlipDealScore({ roi: flip.roi, meetsSeventyPercentRule: flip.meetsSeventyPercentRule, spreadPct: flip.spreadPct, compQuality: saleCompQuality.quality })
    : null;

  const rental = rentEstimate ? computeRentalAnalysis({ purchasePrice: price, rentEstimate: rentEstimate.rent, repairCost: Number(repairCost) || 0 }) : null;
  const rentalDealScore = rental
    ? computeRentalDealScore({ capRate: rental.capRate, cashOnCashReturn: rental.cashOnCashReturn, onePercentRuleMet: rental.onePercentRuleMet, compQuality: rentCompQuality?.quality ?? saleCompQuality.quality })
    : null;

  return {
    ok: true, address: addr, purchasePrice: price,
    valueEstimate: { price: valueEstimate.price, priceRangeLow: valueEstimate.priceRangeLow, priceRangeHigh: valueEstimate.priceRangeHigh, compQuality: saleCompQuality },
    rentEstimate: rentEstimate ? { rent: rentEstimate.rent, rentRangeLow: rentEstimate.rentRangeLow, rentRangeHigh: rentEstimate.rentRangeHigh, compQuality: rentCompQuality } : null,
    flip, flipDealScore, rental, rentalDealScore,
  };
}

// Real active-listing search ranked by rental Deal Score — bulk scans
// can't ask per-property for a real repair-cost figure, so flip scoring
// (which requires one) is left to analyzeProperty() for a single address
// the user picks, never fabricated here to force a flip rank.
async function scanProperties({ city, state, zipCode, minPrice, maxPrice, propertyType, limit = 20 }, apiKey) {
  if (!apiKey) return { ok: false, error: "RentCast not configured", properties: [] };
  const listings = await searchRentcastSaleListings({ city, state, zipCode, minPrice, maxPrice, propertyType, limit: Math.min(100, limit * 3) }, apiKey);
  if (listings == null) return { ok: false, error: "RentCast listing search failed", properties: [] };
  if (!listings.length) return { ok: true, properties: [], scanned: 0 };

  const queue = listings.slice();
  const results = [];
  const CONCURRENCY = 5;
  async function worker() {
    while (queue.length) {
      const listing = queue.shift();
      const address = formatAddress(listing);
      if (!address || !Number(listing.price)) continue;
      const rentEstimate = await fetchRentcastRentEstimate(address, apiKey).catch(() => null);
      if (!rentEstimate) continue;
      const compQuality = computeComparablesQuality(rentEstimate.comparables);
      const rental = computeRentalAnalysis({ purchasePrice: listing.price, rentEstimate: rentEstimate.rent });
      if (!rental) continue;
      const rentalDealScore = computeRentalDealScore({ capRate: rental.capRate, cashOnCashReturn: rental.cashOnCashReturn, onePercentRuleMet: rental.onePercentRuleMet, compQuality: compQuality.quality });
      results.push({
        address, city: listing.city, state: listing.state, zipCode: listing.zipCode,
        price: listing.price, bedrooms: listing.bedrooms, bathrooms: listing.bathrooms,
        squareFootage: listing.squareFootage, propertyType: listing.propertyType,
        daysOnMarket: listing.daysOnMarket, listedDate: listing.listedDate,
        rentEstimate: rentEstimate.rent, capRate: rental.capRate, cashOnCashReturn: rental.cashOnCashReturn,
        monthlyCashFlow: rental.monthlyCashFlow, rentalDealScore, compQuality,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, listings.length) }, worker));

  results.sort((a, b) => (b.rentalDealScore || 0) - (a.rentalDealScore || 0));
  return { ok: true, properties: results.slice(0, limit), scanned: listings.length };
}

module.exports = { analyzeProperty, scanProperties, formatAddress };
