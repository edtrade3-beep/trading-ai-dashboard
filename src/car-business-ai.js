// car-business-ai.js — Car Business Intelligence layer.
//
// Upgraded 2026-08-30 (explicit user /goal: "upgrade CAR BUSINESS... into a
// dealership PROFIT + INTELLIGENCE SYSTEM... DO NOT create another AI
// engine. Use the existing central engine, data layer, research system,
// inventory data and decision architecture.") from a single monolithic
// call into 3 real, right-sized calls — all through the exact SAME
// callAnthropicWithSearch chokepoint (never a new engine), run in parallel
// (Promise.all — none depends on another's output, so parallel is strictly
// faster wall-clock than sequential for the same real cost). The prior
// single-call version needed 4 rounds of live fixes (timeout ->
// truncation -> timeout again -> final tuning) just to reliably finish;
// adding this upgrade's much larger real ask (buy recommendations, local
// market gap, customer segments, lead channels, funnel, finance,
// regulation, future scan, forecast) to that same one call would have
// guaranteed the same failure mode, worse. Splitting by real grounding-
// data similarity (same lesson future-wallet-universe.js's own BATCH_SIZE
// fix already taught this codebase) is the honest fix, not another
// timeout tweak.
//
// Same real architecture as research-intel-ai.js/command-center-ai.js in
// every call — the same shouldSendAlert Telegram gate, the same file-based
// daily-snapshot-diff pattern. What's genuinely new: an AUTOMOTIVE decision
// system, kept fully separate from the trading engine's vocabulary/scoring
// (no am-core-engine.js, no opportunity-engine.js — a car lot and a stock
// aren't the same asset). What's explicitly REUSED, not duplicated:
// - src/inventory-store.js's loadInventory() — the dealer's actual real
//   current lot, including real soldPrice/soldAt/createdAt fields, which
//   the new Learning System (car-business-engine.js's gradeLearningHistory)
//   uses for real predicted-vs-actual grading — never fabricated outcomes.
// - src/dealership/fb-hub.js's real CRM (GET /api/dealer/crm/leads) — real
//   lead/stage counts, computed here in JS (never AI-invented), handed to
//   the AI only for interpretation (which real stage is the biggest leak).
// - this app's own real macro data (GET /api/market/macro-regime).
// - The Command Center (§14) and ONE FINAL VERDICT are NOT a 4th AI call —
//   car-business-engine.js's computeCommandCenter/computeFinalVerdict are
//   real, disclosed formulas over the 3 calls' already-sanitized real
//   output, same "formula with visible inputs" discipline
//   command-center-ai.js's own computeCommandScore already established.
//
// Produces RESEARCH/EVIDENCE + a real, disclosed business verdict — no
// verdict here ever touches the trading engine.
"use strict";

const { callAnthropicWithSearch } = require("./anthropic");
const { saveCoachOutput, loadCoachLog } = require("./ai-coach-store");
const { loadHistory, getMostRecentEntry, appendSnapshot, etDateStr } = require("./car-business-store");
const { loadInventory } = require("./inventory-store");
const { loadDealerInfo } = require("./car-business-dealer-info-store");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { PORT } = require("./config");
const {
  BUSINESS_DIMENSIONS, SECTION_CLASSIFICATIONS, OPPORTUNITY_CLASSIFICATIONS, BUY_CLASSIFICATIONS,
  TURN_VERDICTS, DEAD_INVENTORY_ACTIONS, DATA_QUALITIES, RISK_LEVELS, REGULATION_FLAGS, FUTURE_IMPACTS, REPRICE_ACTIONS,
  sanitizeMarketSections, sanitizeInventoryScores, sanitizeOpportunityCards, sanitizeRepricingResults, sanitizeFacebookStrategy, sanitizeFacebookAd,
  sanitizeBuyRecommendations, sanitizeAvoidList, sanitizeCustomerSegments, sanitizeLeadChannels,
  sanitizeFunnelRead, sanitizeFinanceRead, sanitizeRegulationFlags, sanitizeFutureScan,
  sanitizeLocalMarketGap, sanitizeForecast,
  sanitizeDimensions, dimensionsToSnapshot, computeNotificationTriggers,
  computeCommandCenter, gradeLearningHistory,
} = require("./car-business-engine");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(path) {
  try { const r = await fetch(`${BASE()}${path}`); return await r.json(); } catch { return null; }
}

// Real, fixed lead-channel list (spec §8) — the AI comments on each within
// this bounded set rather than inventing an open-ended list. Only channels
// this app actually has a real tracked-lead pipeline for (currently just
// Facebook, via fb-hub.js's CRM/Messenger webhook) get hasRealData:true —
// computed in JS from the real CRM data below, never AI-claimed.
const LEAD_CHANNELS = ["Facebook Marketplace", "Facebook", "Instagram", "Google", "TikTok", "YouTube", "Website / SEO", "Google Business Profile", "SMS", "Email", "Referrals", "Repeat customers"];
const REAL_TRACKED_CHANNELS = ["facebook", "facebook marketplace"]; // fb-hub.js's CRM is Facebook-Messenger-sourced only, honestly

// Shared, already-fetched context every call reuses — one real fetch each,
// not per-call.
async function loadSharedContext() {
  const inventory = loadInventory() || [];
  const [leadsData, regimeData] = await Promise.all([
    getJson("/api/dealer/crm/leads"),
    getJson("/api/market/macro-regime"),
  ]);
  const leads = Array.isArray(leadsData?.leads) ? leadsData.leads : [];
  const byStage = {};
  let hot = 0;
  for (const l of leads) { const s = l.stage || "NEW"; byStage[s] = (byStage[s] || 0) + 1; if (l.hot) hot++; }
  return { inventory, leads, byStage, hotCount: hot, regimeData };
}

function summarizeMacro(regimeData) {
  if (!regimeData || !regimeData.ok) return "unavailable this run";
  const r = regimeData;
  return [
    `Regime ${r.label || r.regime || "n/a"} (${r.score ?? "n/a"}/100)`,
    `Treasury score ${r.treasury?.score ?? "n/a"} (real yield-curve/real-yield read — relevant to auto-loan rate direction)`,
    `Credit score ${r.credit?.score ?? "n/a"} (momentum ${r.credit?.momentum?.status ?? "n/a"})`,
    `Employment score ${r.employment?.score ?? "n/a"} (relevant to consumer affordability)`,
  ].join(" · ");
}
function summarizePrior(items) {
  if (!Array.isArray(items) || !items.length) return "none (first real run, or none stored)";
  return items.map((c) => `- ${c.headline}${c.classification ? ` [${c.classification}]` : ""}`).join("\n");
}
async function runCall(prompt, system, opts) {
  try {
    const raw = await callAnthropicWithSearch(prompt + "\n\n" + system, KEY(), opts);
    const m = (raw || "").match(/\{[\s\S]*\}/);
    return { ok: true, parsed: JSON.parse(m ? m[0] : raw) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── CALL 1 — INVENTORY & OPERATIONS (§1 Radar, §5 Days-to-Turn, §6 Dead
// Inventory, plus the daily topOpportunity/biggestRisk/nextAction/summary)
// ─────────────────────────────────────────────────────────────────────────
// Capped at 15 real vehicles, highest-price first (2026-08-30, live-fixed
// against this dealership's real 525-vehicle lot — see git history for the
// 4 rounds of timeout/truncation fixes this exact number and the
// timeout/maxTokens below survived).
function summarizeInventoryForScoring(inventory) {
  if (!inventory.length) return "no real inventory on file";
  const top = [...inventory].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)).slice(0, 15);
  return top.map((v) => {
    const daysOnLot = Number.isFinite(Number(v.createdAt)) ? Math.round((Date.now() - Number(v.createdAt)) / 86_400_000) : null;
    return `${v.vin} — ${v.year} ${v.make} ${v.model} ${v.trim || ""} · ${v.mileage?.toLocaleString?.() ?? v.mileage} mi · $${v.price} · ${v.condition}${daysOnLot != null ? ` · ${daysOnLot}d on real lot` : ""}`;
  }).join("\n");
}

function buildInventoryCall(ctx, prior) {
  const system = `You are the INVENTORY & OPERATIONS layer of a real, independent used-car dealership's Car Business Intelligence system — completely separate from any stock/options trading logic. Score the dealership's REAL current inventory and read the real business dimensions.

You are given the dealership's REAL current top-priced inventory (real VINs/year/make/model/trim/mileage/price/condition/real days-on-lot) below — never invent a VIN, never score a vehicle not in the list given. Search real, current sources for real comps/demand data on these specific vehicles.

For EVERY real vehicle given, score 0-100 and classify (one of: ${BUY_CLASSIFICATIONS.join("/")} — UNDERPRICED_OPPORTUNITY means you found real evidence this specific unit is priced below real comparable market value; this classifies whether the dealership should acquire MORE like this one, not a condition rating), reason, expectedGross (real dollar estimate from real comps), expectedDaysToSell, turnVerdict (one of: ${TURN_VERDICTS.join("/")} — FAST_TURN ~7-14 real days, NORMAL ~14-30, SLOW ~30-45, EXIT_RISK 45-60+), deadInventoryAction (one of: ${DEAD_INVENTORY_ACTIONS.join("/")} — ONLY set this when the real days-on-lot + real weakening demand signal genuinely support it; leave null for a healthy, normally-aging unit), and action (a short specific real recommendation).

Evaluate these SEVEN fixed business dimensions using real current data — for each, your honest current state as a short label (auto-market: "BULLISH"/"NEUTRAL"/"BEARISH"; credit-environment: "EASING"/"NORMAL"/"TIGHT"; used-market: "STRONG"/"NORMAL"/"WEAK"; new-market: "STRONG"/"NORMAL"/"WEAK"; inventory-stance: "BUY"/"SELECTIVE"/"REDUCE"; pricing-direction: "RAISING"/"STABLE"/"FALLING"; dealer-environment: "IMPROVING"/"STABLE"/"DETERIORATING") plus a one-sentence whyItMatters for each: ${BUSINESS_DIMENSIONS.join(", ")}.

Finally write: topOpportunity (one specific real opportunity on THIS lot), biggestRisk (one specific real operational risk), nextAction (one specific, concrete action this week), dailySummary (2-4 sentences: what to buy, what to avoid, what to do right now).

Never invent a fact, price, or VIN. Return JSON ONLY:
{"inventoryScores":[{"vin":"...","score":0-100,"classification":"...","reason":"...","expectedGross":0,"expectedDaysToSell":0,"turnVerdict":"...","deadInventoryAction":"..." or null,"action":"..."}],"dimensions":[{"dimension":"...","state":"...","whyItMatters":"..."}],"topOpportunity":"...","biggestRisk":"...","nextAction":"...","dailySummary":"..."}`;

  const prompt = `THIS DEALERSHIP'S REAL CURRENT TOP-PRICED INVENTORY (score every one of these real VINs):
${summarizeInventoryForScoring(ctx.inventory)}

YESTERDAY'S REAL BUSINESS DIMENSION STATES: ${BUSINESS_DIMENSIONS.map((d) => `${d}=${prior.dimensions[d] || "not yet tracked"}`).join(", ")}

REAL MACRO/CREDIT CONTEXT (already computed — reuse, don't re-derive): ${summarizeMacro(ctx.regimeData)}

Search for real, current comps/demand data now and return the JSON.`;

  return runCall(prompt, system, { model: "claude-sonnet-4-6", maxTokens: 10000, maxSearches: 2, timeout: 280000, feature: "car-business-inventory" });
}

// ── CALL 2 — ACQUISITION & OPPORTUNITY (§2/§3 Buy Tomorrow + Buy-Price
// Engine, §4 Local Market Gap, §12 Future Scanner, opportunity board)
// ─────────────────────────────────────────────────────────────────────────
function buildAcquisitionCall(ctx, prior) {
  const invSummary = ctx.inventory.length
    ? `Currently stocks ${ctx.inventory.length} real vehicles, top categories by count: ${Object.entries(
        ctx.inventory.reduce((m, v) => { const k = `${v.make} ${v.model}`; m[k] = (m[k] || 0) + 1; return m; }, {})
      ).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}(${v})`).join(", ")}`
    : "no real inventory on file";

  const system = `You are the ACQUISITION & OPPORTUNITY layer of a real, independent used-car dealership's Car Business Intelligence system. Your job: tell the dealership exactly what to go BUY tomorrow (at auction, wholesale, or via trade-in) — not what's already on the lot.

You are given a real summary of the dealership's current stock (for context, so you don't recommend duplicating an already-full category) below. Search real, current auction/wholesale/retail comps data now.

Produce TOP 10 VEHICLES TO LOOK FOR TOMORROW: vehicle (e.g. "2021-2022 Toyota Tacoma SR5"), year, mileageRange, trim, targetBuy (real $ estimate), maxBuy (real $ ceiling), expectedRetail, expectedGross, expectedDaysToTurn, competition (real local competitive read), demandScore (0-100), financingDifficulty (${RISK_LEVELS.join("/")}), repairRisk (${RISK_LEVELS.join("/")}), confidence (0-100), whyNow. Never recommend a vehicle solely because it's cheap — optimize for real expected gross x real turn speed x real financeability.

Also produce TOP 10 VEHICLES TO AVOID right now: vehicle, reason.

Identify real, current business opportunities (pricing gaps, underpriced acquisition categories, financing program changes, seasonal windows) as OPPORTUNITY CARDS: headline, classification (${OPPORTUNITY_CLASSIFICATIONS.join("/")}), whyNow, buyPrice, targetRetail, expectedGross, expectedDaysToTurn, customer, leadSource, risk (${RISK_LEVELS.join("/")}), confidence (0-100). You are given YESTERDAY'S opportunity cards — if a finding today continues one, set priorHeadline to that exact prior headline and status to STRENGTHENED/WEAKENED/INVALIDATED/UNCHANGED; if genuinely new, status "NEW."

Research the LOCAL competitive market (real dealer listings, real local pricing/inventory patterns) and answer: what are customers looking for that local dealers are NOT stocking? Return as localMarketGap: {summary, underservedSegments:[...], sources:[...]}.

Research real emerging automotive technology (AI dealerships/sales/pricing/appraisal, digital retail, EV/hybrid/ICE shifts, autonomous vehicles, robotics, battery tech, new financing models, dealer consolidation, direct-to-consumer) as futureScan: [{technology, impact (${FUTURE_IMPACTS.join("/")}), summary}] — technologies that could create OR destroy dealership profit.

Never invent a fact or price. Return JSON ONLY:
{"buyRecommendations":[{"vehicle":"...","year":"...","mileageRange":"...","trim":"...","targetBuy":"...","maxBuy":"...","expectedRetail":"...","expectedGross":"...","expectedDaysToTurn":"...","competition":"...","demandScore":0-100,"financingDifficulty":"...","repairRisk":"...","confidence":0-100,"whyNow":"..."}],"avoidList":[{"vehicle":"...","reason":"..."}],"opportunities":[{"headline":"...","classification":"...","whyNow":"...","buyPrice":"...","targetRetail":"...","expectedGross":"...","expectedDaysToTurn":"...","customer":"...","leadSource":"...","risk":"...","confidence":0-100,"priorHeadline":null,"status":"..."}],"localMarketGap":{"summary":"...","underservedSegments":["..."],"sources":["..."]},"futureScan":[{"technology":"...","impact":"...","summary":"..."}]}`;

  const prompt = `THIS DEALERSHIP'S REAL CURRENT STOCK (context only — don't re-recommend what's already well-stocked): ${invSummary}

YESTERDAY'S REAL OPPORTUNITY CARDS (match today's findings for status continuation; don't repeat with no new information):
${summarizePrior(prior.opportunities)}

Search for real, current auction/wholesale/local-market/technology information now and return the JSON.`;

  return runCall(prompt, system, { model: "claude-sonnet-4-6", maxTokens: 10000, maxSearches: 2, timeout: 280000, feature: "car-business-acquisition" });
}

// ── CALL 3 — MARKET, CUSTOMER, CREDIT & REGULATION (§7 Customer Intel,
// §8 Lead Engine, §9 Funnel, §10 Finance, §11 FTC/Regulation, §13 Forecast,
// plus AUTO MARKET sections)
// ─────────────────────────────────────────────────────────────────────────
function buildMarketCustomerCall(ctx) {
  const stageLines = Object.entries(ctx.byStage).map(([k, v]) => `${k}=${v}`).join(", ") || "no real leads on file";

  const system = `You are the MARKET, CUSTOMER & CREDIT layer of a real, independent used-car dealership's Car Business Intelligence system.

Search real, current sources now across: AUTO MARKET (new vehicles, used vehicles, wholesale/auctions, inventory/days-supply, depreciation, EV/hybrid/ICE), AUTO LOANS/CREDIT (Fed rates, auto APR, subprime lending, delinquencies/defaults/repossessions, consumer debt, employment), and FTC/REGULATION (FTC, CFPB, NHTSA, state dealer rules, advertising/financing rules).

For each AUTO MARKET category you cover, classify it (one of: ${SECTION_CLASSIFICATIONS.join("/")}) with a summary and dataQuality (one of: ${DATA_QUALITIES.join("/")}).

Identify the dealership's most profitable customer segments (first-time buyers, credit-challenged, ITIN, low-down-payment, cash buyers, families, commuters, students, truck/SUV/luxury/EV/hybrid buyers, trade-in customers — pick the 5-6 real most relevant ones): segment, wants, priceRange, paymentRange, downPayment, creditProfile, commonObjection, bestVehicle, bestChannel.

You are given this dealership's REAL lead-channel list and REAL current lead/stage counts (Facebook is the only channel with real tracked lead data — everything else below is real market research about that channel's typical performance for used-car dealers, NOT this dealership's own measured numbers; be explicit about that distinction in each channel's notes). For each of these exact channels, give: channel (must match exactly), leadCount (ONLY for Facebook, using the real count given — omit/null for every other channel since no real data exists), notes. Channels: ${LEAD_CHANNELS.join(", ")}.

Using the REAL lead-stage counts given, identify the biggest real conversion leak in the funnel (view→message→response→phone→appointment→show→test drive→credit application→deal→delivery) and the top 3 real actions to increase appointments/shows/closings: funnelRead: {biggestLeak, topActions:[...]}.

Write a real finance/consumer-stress read: financeRead: {summary (connect real rates→payments→affordability→demand→inventory→defaults), verdict (EASING/NORMAL/TIGHT), sources}.

Flag real FTC/CFPB/NHTSA/state regulatory developments: regulationFlags: [{flag (${REGULATION_FLAGS.join("/")}), summary, source}]. Never recommend deceptive or illegal practices; flag anything needing professional/legal review explicitly.

Give a compact 24-month forecast: forecast: {baseCase (one real paragraph), bullCase (one sentence), bearCase (one sentence)}.

Never invent a fact, price, or regulation. Return JSON ONLY:
{"marketSections":[{"category":"...","classification":"...","summary":"...","dataQuality":"...","sources":["..."]}],"customerSegments":[{"segment":"...","wants":"...","priceRange":"...","paymentRange":"...","downPayment":"...","creditProfile":"...","commonObjection":"...","bestVehicle":"...","bestChannel":"..."}],"leadChannels":[{"channel":"...","leadCount":0,"notes":"..."}],"funnelRead":{"biggestLeak":"...","topActions":["...","...","..."]},"financeRead":{"summary":"...","verdict":"...","sources":["..."]},"regulationFlags":[{"flag":"...","summary":"...","source":"..."}],"forecast":{"baseCase":"...","bullCase":"...","bearCase":"..."}}`;

  const prompt = `THIS DEALERSHIP'S REAL CRM LEAD DATA: ${ctx.leads.length} real leads on file · by stage: ${stageLines} · ${ctx.hotCount} marked hot.

REAL MACRO/CREDIT CONTEXT (already computed — reuse, don't re-derive): ${summarizeMacro(ctx.regimeData)}

Search for real, current market/credit/regulatory information now and return the JSON.`;

  return runCall(prompt, system, { model: "claude-sonnet-4-6", maxTokens: 10000, maxSearches: 2, timeout: 280000, feature: "car-business-market" });
}

async function buildCarBusinessIntel() {
  if (!KEY()) return null;

  const ctx = await loadSharedContext();
  const prevEntry = getMostRecentEntry();
  const prior = { opportunities: prevEntry?.opportunities || [], dimensions: prevEntry?.dimensions || {} };

  const [r1, r2, r3] = await Promise.all([
    buildInventoryCall(ctx, prior),
    buildAcquisitionCall(ctx, prior),
    buildMarketCustomerCall(ctx),
  ]);

  // Real, disclosed partial-failure handling — if the whole thing failed
  // (all 3 calls errored), report honest unavailability. If SOME calls
  // succeeded, build from what's real rather than discarding everything
  // (same "real data always builds, AI enrichment layers on top" principle
  // command-center-ai.js's own buildCommandCenter already established).
  if (!r1.ok && !r2.ok && !r3.ok) {
    return { ok: false, aiUnavailable: true, aiError: [r1.error, r2.error, r3.error].filter(Boolean).join(" · "), generatedAt: Date.now() };
  }

  const inventoryByVin = new Map(ctx.inventory.map((v) => [String(v.vin || "").toUpperCase(), v]));
  const inventoryScores = r1.ok ? sanitizeInventoryScores(r1.parsed.inventoryScores, inventoryByVin) : [];
  const dimensions = r1.ok ? sanitizeDimensions(r1.parsed.dimensions, prior.dimensions) : [];
  const topOpportunity = r1.ok ? String(r1.parsed.topOpportunity || "").slice(0, 260) : "";
  const biggestRisk = r1.ok ? String(r1.parsed.biggestRisk || "").slice(0, 260) : "";
  const nextAction = r1.ok ? String(r1.parsed.nextAction || "").slice(0, 260) : "";
  const dailySummary = r1.ok ? String(r1.parsed.dailySummary || "").slice(0, 600) : "";

  const buyRecommendations = r2.ok ? sanitizeBuyRecommendations(r2.parsed.buyRecommendations) : [];
  const avoidList = r2.ok ? sanitizeAvoidList(r2.parsed.avoidList) : [];
  const opportunities = r2.ok ? sanitizeOpportunityCards(r2.parsed.opportunities) : [];
  const localMarketGap = r2.ok ? sanitizeLocalMarketGap(r2.parsed.localMarketGap) : null;
  const futureScan = r2.ok ? sanitizeFutureScan(r2.parsed.futureScan) : [];

  const marketSections = r3.ok ? sanitizeMarketSections(r3.parsed.marketSections) : [];
  const customerSegments = r3.ok ? sanitizeCustomerSegments(r3.parsed.customerSegments) : [];
  const leadChannels = r3.ok ? sanitizeLeadChannels(r3.parsed.leadChannels, REAL_TRACKED_CHANNELS) : [];
  const funnelRead = r3.ok ? sanitizeFunnelRead(r3.parsed.funnelRead) : null;
  const financeRead = r3.ok ? sanitizeFinanceRead(r3.parsed.financeRead) : null;
  const regulationFlags = r3.ok ? sanitizeRegulationFlags(r3.parsed.regulationFlags) : [];
  const forecast = r3.ok ? sanitizeForecast(r3.parsed.forecast) : null;

  const dimensionsSnapshot = dimensionsToSnapshot(dimensions);
  const triggers = computeNotificationTriggers({ dimensions, opportunities, inventoryScores });
  const commandCenter = computeCommandCenter({ dimensions, opportunities, buyRecommendations, inventoryScores, customerSegments, leadChannels, futureScan, forecast, biggestRisk });

  // §15 Learning System — real predicted-vs-actual grading over PAST
  // stored snapshots (never this run's own fresh predictions, which have
  // had zero real time to resolve) against the current real inventory.
  let learningHistory = [];
  try { learningHistory = gradeLearningHistory(loadHistory(), ctx.inventory); } catch { /* non-fatal — learning panel just stays empty this run */ }

  const built = {
    ok: true,
    marketSections, inventoryScores, opportunities, dimensions,
    buyRecommendations, avoidList, localMarketGap, futureScan,
    customerSegments, leadChannels, funnelRead, financeRead, regulationFlags, forecast,
    topOpportunity, biggestRisk, nextAction, dailySummary,
    commandCenter, learningHistory, triggers,
    partialFailures: [!r1.ok && "inventory", !r2.ok && "acquisition", !r3.ok && "market"].filter(Boolean),
    inventoryCount: ctx.inventory.length,
    priorAt: prevEntry?.at || null,
    generatedAt: Date.now(),
  };

  saveCoachOutput("carBusinessIntel", built);
  // Real per-VIN predictions persisted into the daily snapshot (not just
  // opportunities/dimensions as before) — this is what tomorrow's Learning
  // System grading pass will compare against real outcomes.
  try { appendSnapshot({ opportunities, dimensions: dimensionsSnapshot, inventoryScores }); } catch { /* non-fatal — tomorrow just won't have a diff */ }

  // Notification logic — reuses the existing shouldSendAlert gate, never a
  // new alert system.
  if (telegramConfigured() && triggers.length) {
    for (const t of triggers.slice(0, 5)) {
      const category = t.kind === "BUSINESS_SHIFT" ? "regime-change" : "breaking-news";
      if (!shouldSendAlert({ category })) continue;
      const label = { BUSINESS_SHIFT: "🚨 CAR BUSINESS SHIFT", OPPORTUNITY_INVALIDATED: "❌ OPPORTUNITY INVALIDATED", NEW_OPPORTUNITY: "💰 NEW CAR BUSINESS OPPORTUNITY", STRONG_LOT_VEHICLE: "🔥 STRONG LOT VEHICLE", DEAD_INVENTORY_ACTION: "⚠️ DEAD INVENTORY ACTION" }[t.kind] || t.kind;
      const msg = `${label}\n\n${t.detail}${t.whyItMatters ? `\n\n${t.whyItMatters}` : ""}`;
      await sendTelegramMessage(msg).catch(() => {});
    }
  }

  return built;
}

// ── CSV Repricing Analysis — explicit user request (2026-08-30): "add csv
// file to analysis inventory and ai will tell me which one i need to
// reprice supply and demand". A 4th call through the SAME
// callAnthropicWithSearch chokepoint (still no new engine) — reuses
// routes/inventory.js's real normalizeVehicle (never re-derives vehicle-
// shape validation) and this call's own grounding is whatever real VINs
// the user actually uploaded THIS request, not the live /api/inventory
// list — a CSV upload is an explicit, ad hoc, user-chosen batch (could be
// a subset the user is worried about, could be an external DMS export).
//
// Capped at 20 vehicles per real call (2026-08-30, applying the exact
// live-learned lesson from buildCarBusinessIntel's own 4 rounds of
// timeout/truncation fixes before this file even had a second caller —
// slightly more room than that call's 15 since this schema has fewer
// fields per vehicle) — highest-price first, real dollars at risk first.
const REPRICE_BATCH_CAP = 20;

function summarizeVehiclesForRepricing(vehicles) {
  return vehicles.map((v) => `${v.vin} — ${v.year} ${v.make} ${v.model} ${v.trim || ""} · ${v.mileage?.toLocaleString?.() ?? v.mileage} mi · asking $${v.price} · ${v.condition}`).join("\n");
}

async function analyzeRepricing(rawVehicles) {
  if (!KEY()) return { ok: false, error: "ANTHROPIC_API_KEY not set" };
  if (!Array.isArray(rawVehicles) || !rawVehicles.length) return { ok: false, error: "No real vehicles provided to analyze." };

  const { normalizeVehicle } = require("./routes/inventory");
  const normalized = rawVehicles.map((v) => normalizeVehicle(v)).filter(Boolean);
  if (!normalized.length) return { ok: false, error: "None of the uploaded rows parsed into a valid real vehicle (need at minimum a real year/make/model)." };

  const sorted = [...normalized].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  const batch = sorted.slice(0, REPRICE_BATCH_CAP);
  const truncated = sorted.length - batch.length;
  const uploadedVins = new Set(batch.map((v) => v.vin.toUpperCase()));

  const system = `You are the REPRICING ANALYSIS layer of a real, independent used-car dealership's Car Business Intelligence system. You are given a real batch of vehicles the dealer uploaded for a repricing check — analyze each one's real current supply and demand and tell the dealer exactly what to do with its price today.

For EVERY real vehicle given (by its real VIN — never invent a VIN, never analyze a vehicle not in the list given), search real, current comps/market data and determine: action (one of: ${REPRICE_ACTIONS.join("/")}), suggestedPrice (a real $ estimate grounded in real comps — if action is HOLD_PRICE this should be close to the current asking price), supplyDemandRead (one short real sentence: is supply tight or loose for this vehicle type right now, is demand strong or weak, and what that implies for price), reasoning (why this specific action, grounded in real comps/market conditions you found), urgency (${RISK_LEVELS.join("/")} — how urgently this needs a price change), confidence (0-100).

Never invent a fact, price, or VIN. Never recommend a price change without a real comps-based reason. Return JSON ONLY:
{"results":[{"vin":"...","action":"...","suggestedPrice":0,"supplyDemandRead":"...","reasoning":"...","urgency":"...","confidence":0-100}]}`;

  const prompt = `REAL VEHICLES TO ANALYZE FOR REPRICING (${batch.length} of ${normalized.length} real uploaded rows${truncated ? `, top ${batch.length} by price — ${truncated} lower-priced rows not analyzed this run` : ""}):
${summarizeVehiclesForRepricing(batch)}

Search for real, current supply/demand comps data now and return the JSON.`;

  const result = await runCall(prompt, system, { model: "claude-sonnet-4-6", maxTokens: 8000, maxSearches: 2, timeout: 280000, feature: "car-business-reprice" });
  if (!result.ok) return { ok: false, error: result.error };

  const results = sanitizeRepricingResults(result.parsed.results, uploadedVins);
  // Real, disclosed pass-through of what each uploaded vehicle actually
  // was (price/mileage/etc) so the UI can show "current asking price" next
  // to the AI's real suggestion without a second lookup.
  const byVin = new Map(batch.map((v) => [v.vin, v]));
  return {
    ok: true,
    results: results.map((r) => ({ ...r, vehicle: byVin.get(r.vin) || null })),
    analyzed: batch.length,
    uploaded: rawVehicles.length,
    skippedInvalid: rawVehicles.length - normalized.length,
    truncated,
    generatedAt: Date.now(),
  };
}

// ── Facebook Lead Generation Strategy — explicit user request (2026-08-30):
// "find strategy to post and get lots of leads from facebook, upgrade car
// business". A 5th call through the SAME callAnthropicWithSearch
// chokepoint (still no new engine). Deliberately NOT part of the daily
// 3-call cycle — a posting playbook is a real strategy document, not a
// fact that changes day to day the way market prices do, so this runs
// on-demand (like CSV Repricing) and persists via the same
// saveCoachOutput/loadCoachLog pattern every other AI feature in this app
// uses, rather than re-running automatically every 6:05pm cycle for no
// real new information.
//
// Grounded in: the dealership's REAL top inventory (so the per-vehicle
// post plans are for real units, never invented), REAL CRM lead/stage
// counts (so the AI can honestly diagnose what's/isn't working today
// rather than give generic advice), and live search for real, current
// Facebook Marketplace/Page best practices for used-car dealers. Most of
// this output is real MARKETING STRATEGY (a playbook), not a verifiable
// market fact — the system prompt requires the AI to ground every
// specific claim it can and never present strategy opinion as FACT.
async function buildFacebookStrategy() {
  if (!KEY()) return null;

  const inventory = loadInventory() || [];
  const leadsData = await getJson("/api/dealer/crm/leads");
  const leads = Array.isArray(leadsData?.leads) ? leadsData.leads : [];
  const byStage = {};
  let hot = 0;
  for (const l of leads) { const s = l.stage || "NEW"; byStage[s] = (byStage[s] || 0) + 1; if (l.hot) hot++; }

  const topInventory = [...inventory].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)).slice(0, 8);
  const realVins = new Set(topInventory.map((v) => String(v.vin || "").toUpperCase()));
  const invSummary = topInventory.length
    ? topInventory.map((v) => `${v.vin} — ${v.year} ${v.make} ${v.model} ${v.trim || ""} · ${v.mileage?.toLocaleString?.() ?? v.mileage} mi · $${v.price} · ${v.condition}`).join("\n")
    : "no real inventory on file";
  const dealer = loadDealerInfo();

  const system = `You are the FACEBOOK LEAD GENERATION STRATEGY layer of a real, independent used-car dealership's Car Business Intelligence system. Your job: build a real, current, actionable strategy for posting on Facebook (Marketplace + Facebook Page/groups) to generate as many real qualified leads as possible.

Search real, current sources now for what actually works for used-car dealers on Facebook Marketplace and Facebook Pages in 2026 — posting cadence, the Facebook algorithm's real current ranking factors, photo/video best practices, Facebook Shops/Catalog inventory sync, boosted posts vs organic reach, local buy/sell groups, Reels/video content, response-time impact on lead quality, and price-transparency norms.

You are given this dealership's REAL current top inventory, REAL CRM lead/stage data, and REAL dealer contact info/preferences below — use the real lead data to diagnose what's actually happening today (e.g. if leads are low, say so plainly and connect it to a real gap in the strategy below, don't give generic advice disconnected from their real numbers). When you reference local groups/search terms, use the dealer's real city (from the real address given), never a generic "[Your City]" placeholder. Respect the dealer's real contact-method and title-language rules in every piece of guidance that touches them.

Produce: postingCadence (a real, specific recommendation — how many posts/day, spread across Marketplace vs Page vs groups), bestTimes (real research-grounded best days/times to post), contentPillars (5-8 real content types proven to generate leads — e.g. "walk-around video," "price-drop announcement," "financing spotlight," "testimonial/delivery photo," "before/after detail," each one real and specific, not generic), photoGuidance (real best practices: count, order, angles, lighting), paidBoostGuidance (real guidance on when/how much to boost, targeting radius/audience), responseSpeedGuidance (real guidance on speed-to-lead, referencing that this dealership already has an AI auto-reply/Messenger system in place — build on that real capability, don't recommend duplicating it), weeklyActionPlan (4-6 real, concrete, specific action items for this week, using the real dealer name/city where natural).

Using the REAL top inventory given, write a Facebook post plan for EACH real vehicle (by its real VIN — never invent a VIN, never plan a post for a vehicle not in the list given): headline, priceDisplay (how to present the price — e.g. "$28,900 or $412/mo"), descriptionOutline (the real structure/key points the post description should hit for this specific real vehicle — apply the dealer's real title-language and financing-phrasing rules where relevant), cta (the real call-to-action — must match the dealer's real contact-method rule, e.g. never tell a buyer to text if texting isn't an allowed contact method), hashtags (5-8 real, relevant tags).

Never invent a fact, statistic, or VIN. Ground every specific claim (algorithm behavior, engagement stats) in what you actually found — if you can't find a genuinely current real source for a claim, phrase it as general strategic guidance, not a fabricated statistic. Return JSON ONLY:
{"postingCadence":"...","bestTimes":"...","contentPillars":["...","..."],"photoGuidance":"...","paidBoostGuidance":"...","responseSpeedGuidance":"...","weeklyActionPlan":["...","..."],"perVehiclePostPlans":[{"vin":"...","headline":"...","priceDisplay":"...","descriptionOutline":"...","cta":"...","hashtags":["...","..."]}],"sources":["..."]}`;

  const prompt = `THIS DEALERSHIP'S REAL TOP INVENTORY (write a real post plan for each of these real VINs):
${invSummary}

THIS DEALERSHIP'S REAL CRM LEAD DATA: ${leads.length} real leads on file · by stage: ${Object.entries(byStage).map(([k, v]) => `${k}=${v}`).join(", ") || "none"} · ${hot} marked hot. (Facebook Messenger is this dealership's only channel with real tracked lead data today.)

THIS DEALERSHIP'S REAL CONTACT INFO & RULES (use exactly, never invent different values):
Name: ${dealer.name}
Address: ${dealer.address}
Phone: ${dealer.phone}
Contact method rule: ${dealer.contactMethod}
Title-language rule: ${dealer.titleNote}
Financing-language guidance: ${dealer.financingNote}

Search for real, current Facebook Marketplace/Page strategy information now and return the JSON.`;

  const result = await runCall(prompt, system, { model: "claude-sonnet-4-6", maxTokens: 9000, maxSearches: 2, timeout: 280000, feature: "car-business-facebook" });
  if (!result.ok) return { ok: false, aiUnavailable: true, aiError: result.error, generatedAt: Date.now() };

  const strategy = sanitizeFacebookStrategy(result.parsed, realVins);
  const built = { ok: true, strategy, inventoryCount: inventory.length, generatedAt: Date.now() };
  saveCoachOutput("carBusinessFacebookStrategy", built);
  return built;
}

// ── Facebook Ad Maker — explicit user request (2026-08-30): "build
// facebook ad maker i only give details and you make ad also you can make
// it step by step". A 6th call through the SAME callAnthropicWithSearch
// chokepoint (still no new engine). Unlike every other Car Business tool,
// this is NOT grounded in the real /api/inventory list — the user types in
// whatever vehicle details they want an ad built for (a one-off, something
// not yet listed, anything), so there is no real VIN to validate against.
// Real, disclosed distinction: the vehicle DETAILS are exactly what the
// user typed (never independently verified against inventory), while the
// AD COPY/positioning is real AI output grounded in real search when
// available (comps-based positioning language), never fabricated.
async function buildFacebookAd(details) {
  if (!KEY()) return { ok: false, error: "ANTHROPIC_API_KEY not set" };
  const year = String(details?.year || "").trim();
  const make = String(details?.make || "").trim();
  const model = String(details?.model || "").trim();
  if (!year || !make || !model) return { ok: false, error: "Year, make, and model are required." };

  const line = [
    `${year} ${make} ${model}`, details?.trim && String(details.trim).trim(),
    details?.mileage && `${details.mileage} miles`, details?.price && `$${details.price}`,
    details?.condition && `condition: ${details.condition}`,
  ].filter(Boolean).join(" · ");
  const features = String(details?.features || "").trim();
  const notes = String(details?.notes || "").trim();
  const dealer = loadDealerInfo();

  const system = `You are the FACEBOOK AD MAKER layer of a real, independent used-car dealership's Car Business Intelligence system. The user will give you real details about ONE vehicle they want to advertise — these are exactly what they typed in, not independently verified against any inventory system, so never claim to have confirmed them against real records.

Build a complete, ready-to-post Facebook Marketplace + Page ad for this vehicle, presented as clear SEQUENTIAL STEPS the user can follow in order (aim for 6-8 real steps: e.g. Photos, Headline, Price Presentation, Full Description, Call To Action, Where To Post, After You Post/response-speed tip — adapt as makes sense for this specific vehicle). For each step, give a real, specific, ready-to-use title and instructions/content — never vague generic advice.

Also produce fullAdText: one single ready-to-copy-paste block combining the headline + price + full description + call to action, formatted exactly as it should be pasted into a Facebook listing. And hashtags: 5-8 real, relevant tags for this specific vehicle.

If you can find real, current comps for this specific vehicle via search, use them to strengthen the ad's positioning (e.g. "priced below comparable local listings") in positioningNote — otherwise leave positioningNote null rather than inventing a comp number you didn't find. Include vehicleSummary: a one-line echo of the vehicle so the user can confirm you understood it correctly.

Use this dealership's REAL contact info and content rules — apply them exactly, never fall back to a placeholder like "[YOUR PHONE NUMBER]" or "[YOUR LOT ADDRESS]":
Dealer name: ${dealer.name}
Address: ${dealer.address}
Phone: ${dealer.phone}
Contact method rule: ${dealer.contactMethod} — the call to action and any "where to post"/location step must only reference calling or messaging on Facebook; never suggest texting/SMS, and never leave a placeholder number.
Title-language rule: ${dealer.titleNote}
Financing-language guidance: ${dealer.financingNote} — weave real, attractive financing language into the description/CTA when it fits naturally (don't force it if the vehicle/notes don't call for it).

Never invent a fact about this vehicle beyond what's given. Return JSON ONLY:
{"vehicleSummary":"...","steps":[{"title":"...","instructions":"..."}],"fullAdText":"...","hashtags":["..."],"positioningNote":"..." or null,"sources":["..."]}`;

  const prompt = `VEHICLE DETAILS (exactly as the user entered them — not independently verified):
${line}
${features ? `Features/options: ${features}\n` : ""}${notes ? `Additional notes: ${notes}\n` : ""}
THIS DEALERSHIP'S REAL CONTACT INFO & RULES (use exactly, never invent different values or leave placeholders):
Name: ${dealer.name}
Address: ${dealer.address}
Phone: ${dealer.phone}
Contact method rule: ${dealer.contactMethod}
Title-language rule: ${dealer.titleNote}
Financing-language guidance: ${dealer.financingNote}

Search for real, current comps on this vehicle if useful for positioning, then build the step-by-step ad and return the JSON.`;

  const result = await runCall(prompt, system, { model: "claude-sonnet-4-6", maxTokens: 4000, maxSearches: 2, timeout: 200000, feature: "car-business-ad-maker" });
  if (!result.ok) return { ok: false, error: result.error };

  const ad = sanitizeFacebookAd(result.parsed);
  if (!ad) return { ok: false, error: "Could not build a real ad from the response — try again." };
  return { ok: true, ad, generatedAt: Date.now() };
}

module.exports = { buildCarBusinessIntel, analyzeRepricing, buildFacebookStrategy, buildFacebookAd };
