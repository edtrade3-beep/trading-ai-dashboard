"use strict";
// Dixie Motors morning inventory scan — explicit user request (2026-09-04,
// uploaded the "Dixie Motors Marketplace Assistant" browser extension's own
// source as reference): "the idea every morning to scan website an create
// new vehicles only put them in draft make sure in description use emojis
// fill out all ad boxes."
//
// That extension's core.js already encodes this dealer's real, approved ad
// boilerplate (financing/ITIN/trade-in copy, dealer name/address/phone) and
// field-inference helpers (vehicle type, fuel type from title text) — this
// file ports that same logic server-side so it can run unattended every
// morning, rather than only when the extension's popup is clicked in a
// browser. It does NOT touch Facebook — nothing here drives a browser or
// posts anything; it only prepares real, disclosed DRAFT records in this
// app's own inventory store, exactly like the extension's own explicit
// safety principle ("This tool never clicks Publish").
//
// Real, observed markup (fetched + inspected directly against
// https://cincyautomall.com/inventory, 2026-09-04): the page has ZERO
// application/ld+json blocks, so routes/inventory.js's existing generic
// scrapeWebsite() (JSON-LD first, then a crude year+make+model text regex)
// would recover no VIN/color/trim/stock#/photo here at all. This is a
// dedicated parser for this site's real "v-card" markup instead, built
// against real fetched HTML, not guessed.
//
// sortby=new is this source site's own "Stock: Newest" sort (confirmed
// live: with it, the first result differed from the default alphabetical
// order) and pagesize=100 is its own page-size max — together, one request's
// first page covers every vehicle this dealer could plausibly add in a
// single day, without a 23-page daily crawl.
const SOURCE_URL = "https://cincyautomall.com/inventory?clearall=1&sortby=new&pagesize=100";

const path = require("node:path");
const { ROOT } = require("../config");
const { loadInventory, saveInventory } = require("../inventory-store");
const { writeJsonAtomic, readJsonSafe } = require("../atomic-write");

const SCAN_LOG_PATH = path.join(ROOT, "data", "dealer-scan-log.json");

const DEALER = {
  name: process.env.DEALER_NAME || "Dixie Motors",
  addr: process.env.DEALER_ADDR || "6416 Dixie Highway, Fairfield, OH 45014",
  phone: process.env.DEALER_PHONE || "513-874-4999",
};

const clean = (v) => String(v || "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// Real multi-word makes this site actually lists (the h4 title has no
// separator between make and model, e.g. "2017 Land Rover Range Rover") —
// same real gap the extension's own MAKES-prefix match solves.
const TWO_WORD_MAKES = ["Land Rover", "Alfa Romeo", "Aston Martin"];

// Real inference, not a scraped fact — the list page's own card markup has
// no body-style field at all (confirmed against real fetched HTML), so
// this is the same "read it off the model name" approach the uploaded
// extension's own core.js already used, extended with well-known SUV/
// crossover nameplates (Range Rover, Grand Cherokee, Explorer, etc.) that
// the extension's original keyword-only version missed — those don't say
// "SUV" anywhere in their name, so its title-text match alone
// undercounted them.
const SUV_NAMEPLATES = [
  "range rover", "grand cherokee", "explorer", "highlander", "4runner", "pilot",
  "cr-v", "crv", "rav4", "escalade", "suburban", "yukon", "tahoe", "expedition",
  "wrangler", "cherokee", "durango", "pathfinder", "rogue", "murano", "santa fe",
  "telluride", "palisade", "trailblazer", "traverse", "acadia", "atlas", "tiguan",
  "outback", "forester", "ascent", "3 series", "x1", "x3", "x5", "x6", "x7",
  "q3", "q5", "q7", "q8", "gle", "glc", "gls", "glb", "macan", "cayenne", "urus",
];
function inferVehicleType(title) {
  const value = String(title || "").toLowerCase();
  if (/\b(suv|sport utility|crossover|activity vehicle)\b/.test(value) || SUV_NAMEPLATES.some((n) => value.includes(n))) return "SUV";
  if (/\b(pickup|truck|f-?150|silverado|tacoma|tundra|colorado|canyon|ranger|maverick)\b/.test(value)) return "Truck";
  if (/\b(van|sprinter|transit|promaster|odyssey|sienna|caravan)\b/.test(value)) return "Van";
  if (/\b(coupe|2dr|2-dr)\b/.test(value)) return "Coupe";
  if (/\b(convertible|cabriolet)\b/.test(value)) return "Convertible";
  if (/\b(wagon|touring)\b/.test(value)) return "Wagon";
  if (/\b(hatchback|hatch)\b/.test(value)) return "Hatchback";
  return "Sedan";
}
function inferFuel(title, engine) {
  const value = `${title} ${engine}`.toLowerCase();
  if (value.includes("diesel")) return "Diesel";
  if (value.includes("electric") || / ev /.test(value)) return "Electric";
  if (value.includes("hybrid")) return "Hybrid";
  return "Gasoline";
}

// Extracts one real feature value from a card chunk, matching this site's
// actual markup: <p class="v-feature ... i13r_optXxx"><label>Label:</label> VALUE</p>
function fieldValue(chunk, cssSuffix) {
  const re = new RegExp(`i13r_opt${cssSuffix}["'][^>]*>\\s*(?:<label[^>]*>[^<]*</label>)?\\s*([^<]*)</p>`, "i");
  const m = chunk.match(re);
  return m ? clean(m[1]) : "";
}

function parseCard(chunk) {
  const titleM = chunk.match(/<h4 class="vehicleTitle\s*">\s*([^<]+?)\s*<\/h4>/i);
  const trimM = chunk.match(/<span class="vehicleTrim">([^<]*)<\/span>/i);
  const title = clean(titleM ? titleM[1] : "");
  if (!title) return null;

  const yearM = title.match(/\b(19|20)\d{2}\b/);
  if (!yearM) return null;
  const year = Number(yearM[0]);
  const rest = title.slice(yearM.index + 4).trim();

  let make = "", model = "";
  const twoWord = TWO_WORD_MAKES.find((mk) => rest.toLowerCase().startsWith(mk.toLowerCase()));
  if (twoWord) {
    make = twoWord;
    model = rest.slice(twoWord.length).trim();
  } else {
    const parts = rest.split(" ");
    make = parts.shift() || "";
    model = parts.join(" ");
  }
  if (!make || !model) return null;

  const vin = fieldValue(chunk, "Vin").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Real VINs are exactly 17 characters — never fabricate/guess a partial
  // or missing one; skip the vehicle entirely (honest omission, matches
  // the whole codebase's real-data-only discipline) rather than invent an
  // ID the dedup-by-VIN logic below would then trust as real.
  if (vin.length !== 17) return null;

  const stock = fieldValue(chunk, "Stock");
  const exteriorColor = fieldValue(chunk, "Color");
  const interiorColor = fieldValue(chunk, "Interior");
  const transmission = fieldValue(chunk, "Trans");
  const engine = fieldValue(chunk, "Engine");
  const drive = fieldValue(chunk, "Drive");
  const mileage = Number(fieldValue(chunk, "Mileage").replace(/[^\d]/g, "")) || 0;

  const priceM = chunk.match(/price-price">\s*\$?\s*([\d,]+(?:\.\d{2})?)\s*</i);
  const price = priceM ? Math.round(Number(priceM[1].replace(/,/g, ""))) : 0;

  const photoM = chunk.match(/data-src=['"]([^'"]+)['"]/i);
  const detailM = chunk.match(/href="(\/vdp\/[^"?]+)/i);

  return {
    vin, year, make, model, trim: clean(trimM ? trimM[1] : ""),
    mileage, price, condition: "Good",
    exteriorColor, interiorColor, transmission, drive,
    fuel: inferFuel(title, engine), body: inferVehicleType(title), engine,
    stock,
    photos: photoM ? [photoM[1]] : [],
    sourceUrl: detailM ? `https://cincyautomall.com${detailM[1]}` : null,
  };
}

function splitCards(html) {
  const MARK = '<div class="v-card h-100 grid-view-card">';
  const idxs = [];
  let i = html.indexOf(MARK);
  while (i !== -1) { idxs.push(i); i = html.indexOf(MARK, i + MARK.length); }
  return idxs.map((start, n) => html.slice(start, idxs[n + 1] ?? start + 6000));
}

async function scanSourceInventory() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(SOURCE_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`Source site returned ${res.status}`);
    const html = await res.text();
    const cards = splitCards(html);
    const items = cards.map(parseCard).filter(Boolean);
    return { ok: true, items, cardCount: cards.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

// Emoji-decorated description (explicit user request: "make sure in
// description use emojis") — deterministic and formulaic, same real
// approach as vehicle-feed.js's own vehicleDescription() and the uploaded
// extension's descriptionFor(), reusing this exact dealer's already-
// approved boilerplate (financing/ITIN/trade-in/warranty copy, real
// name/address/phone) rather than an AI call — a background job that runs
// unattended every morning shouldn't depend on ANTHROPIC_API_KEY being
// configured or an AI call succeeding to produce a usable draft.
function buildDraftDescription(v) {
  const specs = [transmission_drive(v), v.exteriorColor && `🎨 Exterior: ${v.exteriorColor}`, v.fuel && `⛽ ${v.fuel}`, v.stock && `🔑 Stock #: ${v.stock}`]
    .filter(Boolean);
  const lines = [
    `🚗 ${v.year} ${v.make} ${v.model}${v.trim ? " " + v.trim : ""}`,
    "",
    v.mileage ? `📍 ${Number(v.mileage).toLocaleString("en-US")} miles` : "",
    specs.join("\n"),
    "",
    "💰 Fast & Easy Financing — All Credit Accepted",
    "🆔 ITIN Accepted — Low Down Payment Options",
    "🔄 Trade-Ins Welcome",
    "🛡️ Warranty options available",
    "",
    `📍 ${DEALER.name}`,
    DEALER.addr,
    `📞 ${DEALER.phone}`,
    "",
    "Price shown is the advertised cash price. Taxes, title, registration and applicable dealer fees are additional. Please verify availability, price, condition and all vehicle details with the dealership.",
  ];
  return lines.filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n").trim();
}
function transmission_drive(v) {
  const bits = [v.transmission, v.drive].filter(Boolean);
  return bits.length ? `⚙️ ${bits.join(" • ")}` : "";
}

function loadScanLog() {
  return readJsonSafe(SCAN_LOG_PATH, { lastRunAt: null, ok: null, lastScannedCount: 0, lastNewCount: 0, recentNew: [] });
}
function saveScanLog(entry) {
  try { writeJsonAtomic(SCAN_LOG_PATH, entry); } catch { /* non-fatal — next run just overwrites again */ }
}

// Real, disclosed, append-only — never touches or overwrites an existing
// vehicle record (soldPrice/photos/dealerNotes a human already added stay
// exactly as they are). Only genuinely new VINs (not already anywhere in
// the current inventory) become new draft records.
async function runMorningInventoryScan() {
  const scan = await scanSourceInventory();
  if (!scan.ok) {
    const log = { lastRunAt: Date.now(), ok: false, error: scan.error, lastScannedCount: 0, lastNewCount: 0, recentNew: loadScanLog().recentNew || [] };
    saveScanLog(log);
    return log;
  }

  const existing = loadInventory() || [];
  const knownVins = new Set(existing.map((v) => String(v.vin || "").toUpperCase()));
  const genuinelyNew = scan.items.filter((v) => !knownVins.has(v.vin));

  const now = Date.now();
  const drafts = genuinelyNew.map((v) => ({
    id: `scan-${v.vin}-${now}`,
    ...v,
    status: "draft",
    description: buildDraftDescription(v),
    createdAt: now,
  }));

  if (drafts.length) saveInventory([...existing, ...drafts]);

  const log = {
    lastRunAt: now, ok: true,
    lastScannedCount: scan.items.length, lastNewCount: drafts.length,
    recentNew: drafts.map((d) => ({ id: d.id, vin: d.vin, year: d.year, make: d.make, model: d.model, trim: d.trim, price: d.price, mileage: d.mileage, photos: d.photos })),
  };
  saveScanLog(log);
  return log;
}

module.exports = { scanSourceInventory, runMorningInventoryScan, buildDraftDescription, loadScanLog, SOURCE_URL };
