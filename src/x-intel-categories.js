// x-intel-categories.js — the real category taxonomy X Intelligence Engine
// items are classified into. Extracted into its own file so both the item
// schema/validation and the real deterministic classifier
// (x-intel-x-classifiers.js) share one source of truth, rather than
// duplicating the list.
const CATEGORIES = [
  "Breaking News", "Politics", "Tariffs", "Earnings", "AI", "Semiconductor",
  "Crypto", "Inflation", "InterestRates", "FederalReserve", "Acquisition",
  "Healthcare", "Energy", "Consumer", "Macro", "Other",
  "BankFailure", "CreditDowngrade", "Hack", "ExchangeOutage", "CEOResignation",
];

module.exports = { CATEGORIES };
