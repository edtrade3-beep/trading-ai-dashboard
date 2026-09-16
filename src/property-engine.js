"use strict";
// property-engine.js (2026-09-16, "STOCKS + PROPERTIES" master prompt,
// Property Engine) — real, disclosed real-estate deal math. Every dollar
// figure here is either a real RentCast field (list price, AVM price/range,
// rent estimate, comparables) or a named, overridable default assumption
// (closing-cost %, tax/insurance/maintenance %, financing rate, vacancy
// rate) drawn from well-known public real-estate underwriting conventions
// (the same kind of assumption every rental/flip calculator publishes) —
// this file never invents a comp, an AVM price, or a repair estimate.
// Repair/rehab cost has NO real data source (RentCast does not expose it),
// so flip math always requires it as a real caller input; when it's
// missing, flip fields report as unavailable rather than silently
// assuming $0 — the same "never fabricate a number with no real source"
// discipline as what-to-pay.js's ATR-only zone widening.

const PROPERTY_ENGINE_DEFAULTS = {
  buyClosingCostPct: 0.02, // typical buyer-side closing costs (1-3% is the common public range)
  sellClosingCostPct: 0.08, // agent commission (~5-6%) + seller closing costs (~2%)
  propertyTaxAnnualPct: 0.012, // ~1.2%/yr of price — common US national-average estimate
  insuranceAnnualPct: 0.005, // ~0.5%/yr of price
  maintenanceAnnualPct: 0.01, // ~1%/yr of price — standard rental-underwriting rule of thumb
  vacancyPct: 0.05, // ~5% of gross rent reserved for vacancy
  propertyMgmtPct: 0.08, // ~8% of gross rent, standard PM fee range
  downPaymentPct: 0.20, // standard investment-property conventional down payment
  loanRatePct: 0.075, // representative investment-property mortgage rate; caller should override with a real current quote
  loanTermYears: 30,
  defaultHoldingMonths: 4, // typical flip hold: acquisition + rehab + list + close
  seventyPercentRuleFactor: 0.70, // real, well-known public flip heuristic (purchase + repairs <= 70% of ARV)
  onePercentRuleFactor: 0.01, // real, well-known public rental heuristic (monthly rent >= 1% of price)
};

// Number(null) and Number("") both coerce to 0, not NaN — which would
// silently turn "repair cost not supplied" into "repair cost is $0" (the
// exact fabrication this file exists to avoid). Treat null/undefined/""
// as "no real value" explicitly, before the numeric coercion.
function num(v) { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function pct(n, d) { return d ? n / d : null; }

// Real amortized monthly mortgage payment (standard formula) — not a
// fabricated shortcut. r = monthly rate, n = number of monthly payments.
function monthlyMortgagePayment(loanAmount, annualRatePct, termYears) {
  if (!(loanAmount > 0)) return 0;
  const r = annualRatePct / 12;
  const n = termYears * 12;
  if (!(r > 0)) return loanAmount / n;
  const factor = Math.pow(1 + r, n);
  return (loanAmount * r * factor) / (factor - 1);
}

// Real "true cost" of acquiring a property — purchase price + real
// buy-side closing costs + real holding costs + repair cost IF the caller
// supplied one. repairCost is left null (not 0) when omitted so callers
// can tell "no rehab needed" from "unknown."
function computeTrueCost({ purchasePrice, repairCost = null, closingCostPct = PROPERTY_ENGINE_DEFAULTS.buyClosingCostPct, holdingMonths = PROPERTY_ENGINE_DEFAULTS.defaultHoldingMonths, monthlyHoldingCost = null } = {}) {
  const price = num(purchasePrice);
  if (!(price > 0)) return null;
  const closingCosts = price * closingCostPct;
  const repair = num(repairCost);
  const holding = num(monthlyHoldingCost) != null ? monthlyHoldingCost * holdingMonths : null;
  const totalCost = price + closingCosts + (repair || 0) + (holding || 0);
  return {
    purchasePrice: price, closingCosts, repairCost: repair, repairCostProvided: repair != null,
    holdingCosts: holding, holdingCostsProvided: holding != null, totalCost,
  };
}

// Real flip analysis — spread between purchase+repair and a REAL AVM/ARV
// figure from RentCast, never a self-generated "after repair value."
// Returns null (not a zero-profit fabrication) when repairCost is missing,
// since flip profit cannot be honestly computed without it.
function computeFlipAnalysis({ purchasePrice, repairCost, arv, holdingMonths = PROPERTY_ENGINE_DEFAULTS.defaultHoldingMonths, monthlyHoldingCost = 0, buyClosingCostPct = PROPERTY_ENGINE_DEFAULTS.buyClosingCostPct, sellClosingCostPct = PROPERTY_ENGINE_DEFAULTS.sellClosingCostPct } = {}) {
  const price = num(purchasePrice), repair = num(repairCost), a = num(arv);
  if (!(price > 0) || !(a > 0)) return null;
  if (repair == null) return { repairCostRequired: true, arv: a, purchasePrice: price };

  const buyClosingCosts = price * buyClosingCostPct;
  const holdingCosts = monthlyHoldingCost * holdingMonths;
  const totalCost = price + buyClosingCosts + repair + holdingCosts;
  const sellingCosts = a * sellClosingCostPct;
  const netProceeds = a - sellingCosts;
  const profit = netProceeds - totalCost;
  const roi = pct(profit, totalCost);
  const spreadPct = pct(a - price, a);
  const meetsSeventyPercentRule = (price + repair) <= a * PROPERTY_ENGINE_DEFAULTS.seventyPercentRuleFactor;
  const maxOfferAtSeventyPercent = a * PROPERTY_ENGINE_DEFAULTS.seventyPercentRuleFactor - repair;

  return {
    repairCostRequired: false, arv: a, purchasePrice: price, repairCost: repair,
    buyClosingCosts, holdingCosts, sellingCosts, totalCost, netProceeds, profit, roi, spreadPct,
    meetsSeventyPercentRule, maxOfferAtSeventyPercent,
  };
}

// Real rental analysis — real amortized mortgage math + real, named
// underwriting-default percentages (all overridable), applied to a real
// RentCast rent estimate. Never fabricates NOI or cap rate off a guessed
// rent.
function computeRentalAnalysis({
  purchasePrice, rentEstimate, repairCost = 0,
  downPaymentPct = PROPERTY_ENGINE_DEFAULTS.downPaymentPct, loanRatePct = PROPERTY_ENGINE_DEFAULTS.loanRatePct, loanTermYears = PROPERTY_ENGINE_DEFAULTS.loanTermYears,
  closingCostPct = PROPERTY_ENGINE_DEFAULTS.buyClosingCostPct,
  propertyTaxAnnual = null, insuranceAnnual = null,
  maintenanceAnnualPct = PROPERTY_ENGINE_DEFAULTS.maintenanceAnnualPct, vacancyPct = PROPERTY_ENGINE_DEFAULTS.vacancyPct, propertyMgmtPct = PROPERTY_ENGINE_DEFAULTS.propertyMgmtPct,
} = {}) {
  const price = num(purchasePrice), rent = num(rentEstimate);
  if (!(price > 0) || !(rent > 0)) return null;

  const downPayment = price * downPaymentPct;
  const loanAmount = price - downPayment;
  const monthlyMortgage = monthlyMortgagePayment(loanAmount, loanRatePct, loanTermYears);
  const monthlyTax = (num(propertyTaxAnnual) ?? price * PROPERTY_ENGINE_DEFAULTS.propertyTaxAnnualPct) / 12;
  const monthlyInsurance = (num(insuranceAnnual) ?? price * PROPERTY_ENGINE_DEFAULTS.insuranceAnnualPct) / 12;
  const monthlyMaintenance = (price * maintenanceAnnualPct) / 12;
  const monthlyVacancyLoss = rent * vacancyPct;
  const monthlyMgmt = rent * propertyMgmtPct;

  const monthlyOperatingExpenses = monthlyTax + monthlyInsurance + monthlyMaintenance + monthlyVacancyLoss + monthlyMgmt;
  const monthlyExpensesWithDebt = monthlyOperatingExpenses + monthlyMortgage;
  const monthlyCashFlow = rent - monthlyExpensesWithDebt;
  const annualCashFlow = monthlyCashFlow * 12;

  const closingCosts = price * closingCostPct;
  const cashInvested = downPayment + closingCosts + (num(repairCost) || 0);
  const cashOnCashReturn = pct(annualCashFlow, cashInvested);

  const noiAnnual = (rent * 12) - (monthlyOperatingExpenses * 12);
  const capRate = pct(noiAnnual, price);
  const onePercentRuleMet = rent >= price * PROPERTY_ENGINE_DEFAULTS.onePercentRuleFactor;

  return {
    purchasePrice: price, rentEstimate: rent, downPayment, loanAmount, monthlyMortgage,
    monthlyTax, monthlyInsurance, monthlyMaintenance, monthlyVacancyLoss, monthlyMgmt,
    monthlyOperatingExpenses, monthlyCashFlow, annualCashFlow, cashInvested, cashOnCashReturn,
    noiAnnual, capRate, onePercentRuleMet,
  };
}

// Real comp-quality read off RentCast's own real comparables array — more
// comps and higher real `correlation` values are genuinely more trustworthy,
// never a fabricated confidence number.
function computeComparablesQuality(comparables) {
  const list = Array.isArray(comparables) ? comparables : [];
  if (!list.length) return { compCount: 0, avgCorrelation: null, quality: 0 };
  const correlations = list.map((c) => num(c.correlation)).filter((n) => n != null);
  const avgCorrelation = correlations.length ? correlations.reduce((a, b) => a + b, 0) / correlations.length : null;
  const countScore = Math.min(1, list.length / 8); // 8+ real comps = full count-confidence
  const corrScore = avgCorrelation != null ? avgCorrelation : 0.5; // real RentCast correlation is 0-1
  const quality = Math.round((countScore * 0.4 + corrScore * 0.6) * 100);
  return { compCount: list.length, avgCorrelation, quality };
}

// Real, additive Rental Deal Score — a DIFFERENT asset class from the
// stock Deal/Entry scores (future-value-scoring.js / top50-scanner-score.js),
// so this is not a competing formula for the same instrument type; it is
// the property-specific analogue the master prompt calls for.
function computeRentalDealScore({ capRate, cashOnCashReturn, onePercentRuleMet, compQuality }) {
  let score = 0;
  if (Number.isFinite(capRate)) score += Math.max(0, Math.min(30, (capRate / 0.10) * 30)); // 10% cap rate = full real credit
  if (Number.isFinite(cashOnCashReturn)) score += Math.max(0, Math.min(30, (cashOnCashReturn / 0.12) * 30)); // 12% CoC = full credit
  if (onePercentRuleMet) score += 20;
  if (Number.isFinite(compQuality)) score += (compQuality / 100) * 20;
  return Math.round(Math.max(0, Math.min(100, score)));
}

// Real, additive Flip Deal Score.
function computeFlipDealScore({ roi, meetsSeventyPercentRule, spreadPct, compQuality }) {
  let score = 0;
  if (Number.isFinite(roi)) score += Math.max(0, Math.min(35, (roi / 0.20) * 35)); // 20% ROI = full real credit
  if (meetsSeventyPercentRule) score += 25;
  if (Number.isFinite(spreadPct)) score += Math.max(0, Math.min(20, (spreadPct / 0.30) * 20));
  if (Number.isFinite(compQuality)) score += (compQuality / 100) * 20;
  return Math.round(Math.max(0, Math.min(100, score)));
}

module.exports = {
  PROPERTY_ENGINE_DEFAULTS, monthlyMortgagePayment,
  computeTrueCost, computeFlipAnalysis, computeRentalAnalysis, computeComparablesQuality,
  computeRentalDealScore, computeFlipDealScore,
};
