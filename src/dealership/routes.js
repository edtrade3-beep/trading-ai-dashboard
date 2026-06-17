const { writeJson, fetchJsonSafe, withTimeout, readRequestBody } = require("../utils");
const { callAnthropicApi, callAnthropicWithSearch } = require("../anthropic");
const { ANTHROPIC_API_KEY } = require("../config");

// Pull the first JSON object out of an AI response (handles ```json fences or a bare {...}).
function extractJsonBlock(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : (text.match(/\{[\s\S]*\}/) || [null])[0];
  if (!candidate) return null;
  try { return JSON.parse(candidate); } catch { return null; }
}

// Builds the deal-intelligence prompt around the decoded vehicle + inputs.
function buildDealFinderPrompt(v, vin, mileage, zip, radius) {
  const vehicle = `${v.year} ${v.make} ${v.model}${v.trim ? " " + v.trim : ""} (${v.engine}, ${v.drive}, ${v.transmission})`;
  return `You are an automotive market intelligence analyst for a used-car dealership. Use the web_search tool to find REAL, currently-listed vehicles. Do not invent any listing, price, or history — if you cannot verify something, say so and mark it "unverified".

TARGET VEHICLE
- VIN: ${vin}
- Decoded: ${vehicle}
- Subject mileage: ${mileage ? mileage.toLocaleString() + " miles" : "not specified"}
- Reference ZIP: ${zip} · Search radius: ${radius} miles

STEPS (think through each before answering)
1. IDENTIFY: confirm year/make/model/trim. Note trim-equivalent names across marketplaces.
2. SCAN: web_search Cars.com, CarGurus, AutoTrader, and similar for matching listings within ~${radius} mi of ${zip}. Match exact year/model or ±1 year, trim-equivalent. For each listing capture: price, mileage, location, dealer/private, title status, accident notes, source.
3. HISTORY/RISK: from what each listing states (title status, accident claims), classify GREEN (clean) / YELLOW (minor/gaps) / RED (accident/major) / BLACKLIST (salvage/structural). You will NOT have full Carfax — base risk only on stated info and label gaps "unverified".
4. PRICING: compute market low / average / high from the listings you actually found. Tag each listing Cheap / Fair / High / Overpriced.
5. SCORE each listing 0–100: price vs market 35%, mileage vs expected 25%, history quality 25%, ownership/condition 15%.
6. OUTPUTS: rank best→worst and pick: cheapest, best safe deal, top value, best resale profit, and risk alerts.

RESPOND IN TWO PARTS:
PART 1 — a fenced \`\`\`json block with this shape:
{
  "marketSummary": { "low": number, "average": number, "high": number, "listingsFound": number },
  "listings": [ { "title": string, "price": number, "mileage": number, "location": string, "seller": "dealer|private", "titleStatus": string, "risk": "GREEN|YELLOW|RED|BLACKLIST", "pricePosition": "Cheap|Fair|High|Overpriced", "score": number, "source": string } ],
  "picks": { "cheapest": string, "bestSafeDeal": string, "topDeal": string, "bestProfit": string },
  "riskAlerts": [ string ],
  "resaleRange": { "low": number, "high": number },
  "priceCeiling": number
}
PART 2 — a short, clear human-readable summary (market low/avg/high, best buy + why, expected resale, suggested max purchase price).

If web search returns no usable listings, return listingsFound: 0 and explain honestly rather than inventing data.`;
}

function monthlyPayment(amount, apr, months, downPayment) {
  const principal = Math.max(Number(amount || 0) - Number(downPayment || 0), 0);
  const rate = Number(apr || 0) / 100 / 12;
  const term = Math.max(Number(months || 72), 1);
  if (!principal) return 0;
  if (!rate) return Math.round(principal / term);
  return Math.round((principal * rate) / (1 - Math.pow(1 + rate, -term)));
}

// ─── NHTSA VIN decode ─────────────────────────────────────────────────────────

function pickNhtsa(results, variable) {
  const row = results.find(r => String(r.Variable || "").trim() === variable);
  const val = String(row?.Value || "").trim();
  return val && val !== "Not Applicable" && val !== "0" ? val : "";
}

async function decodeVinNhtsa(vin) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`;
  const data = await withTimeout(fetchJsonSafe(url), 8000, null);
  if (!data?.Results?.length) return null;

  const r = data.Results;
  const year  = Number(pickNhtsa(r, "Model Year")) || 0;
  const make  = pickNhtsa(r, "Make");
  const model = pickNhtsa(r, "Model");
  if (!year || !make || !model) return null;

  const displ   = pickNhtsa(r, "Displacement (L)");
  const cyls    = pickNhtsa(r, "Engine Number of Cylinders");
  const config  = pickNhtsa(r, "Engine Configuration");
  const engineStr = [
    displ ? `${Number(displ).toFixed(1)}L` : "",
    cyls  ? `${cyls} Cyl` : "",
    config && config !== "In-Line" ? config : "",
  ].filter(Boolean).join(" ") || "—";

  const driveRaw = pickNhtsa(r, "Drive Type");
  const driveMap = { "FWD/Front-Wheel Drive": "FWD", "RWD/Rear-Wheel Drive": "RWD", "AWD/All-Wheel Drive": "AWD", "4WD/4-Wheel Drive/4x4": "4WD" };
  const drive = driveMap[driveRaw] || driveRaw || "—";

  const fuelRaw = pickNhtsa(r, "Fuel Type - Primary");
  const fuelMap = { Gasoline: "Gasoline", Diesel: "Diesel", Electric: "Electric", "Plug-in Hybrid/Electric": "Hybrid" };
  const fuel = fuelMap[fuelRaw] || fuelRaw || "Gasoline";

  const transRaw = pickNhtsa(r, "Transmission Style");
  const transmission = transRaw.toLowerCase().includes("auto") ? "Automatic"
    : transRaw.toLowerCase().includes("manual") ? "Manual" : transRaw || "Automatic";

  const body = pickNhtsa(r, "Body Class") || "—";
  const trim = pickNhtsa(r, "Series") || pickNhtsa(r, "Trim") || "";

  return { year, make, model, trim, body, engine: engineStr, drive, fuel, transmission, source: "nhtsa" };
}

// ─── Stub fallback ────────────────────────────────────────────────────────────

const VIN_MAP = {
  "1HG": { year: 2019, make: "Honda",     model: "Accord", trim: "Sport", body: "Sedan", engine: "2.4L 4 Cyl", drive: "FWD" },
  "2T3": { year: 2018, make: "Toyota",    model: "RAV4",   trim: "XLE",   body: "SUV",   engine: "2.5L 4 Cyl", drive: "AWD" },
  "1GN": { year: 2017, make: "Chevrolet", model: "Tahoe",  trim: "LT",    body: "SUV",   engine: "5.3L V8",    drive: "4WD" },
  "5FR": { year: 2016, make: "Acura",     model: "MDX",    trim: "Tech",  body: "SUV",   engine: "3.5L V6",    drive: "AWD" },
};
const DEFAULT_VEHICLE = { year: 2019, make: "Toyota", model: "Camry", trim: "SE", body: "Sedan", engine: "2.5L 4 Cyl", drive: "FWD" };

function decodeVinStub(vin) {
  const item = VIN_MAP[vin.slice(0, 3)] || DEFAULT_VEHICLE;
  return { ...item, fuel: "Gasoline", transmission: "Automatic", source: "stub" };
}

// ─── Comps estimator ─────────────────────────────────────────────────────────

function estimateMarketValue(year, make, model, mileage, condition) {
  const currentYear = new Date().getFullYear();
  const age = Math.max(currentYear - Number(year || currentYear), 0);
  const mi = Number(mileage || 0);
  const mkLower = String(make || "").toLowerCase();
  const mdLower = String(model || "").toLowerCase();

  let base = 31000 - age * 2100;
  if (["toyota", "honda", "lexus", "acura"].includes(mkLower)) base *= 1.08;
  if (["chevrolet", "ford", "gmc"].includes(mkLower)) base *= 1.03;
  if (["bmw", "mercedes", "mercedes-benz", "audi", "porsche"].includes(mkLower)) base *= 1.15;
  if (mdLower.includes("tahoe") || mdLower.includes("truck") || mdLower.includes("f-150") || mdLower.includes("silverado")) base *= 1.1;
  if (mdLower.includes("prius") || mdLower.includes("hybrid")) base *= 1.05;
  base -= Math.max(mi - 60000, 0) * 0.05;
  base *= ({ Excellent: 1.08, "Very Good": 1.04, Good: 1, Fair: 0.92, Rough: 0.84 }[condition] || 1);
  return Math.max(Math.round(base / 100) * 100, 4000);
}

const DOM_BY_CONDITION = { Excellent: 18, "Very Good": 24, Good: 32, Fair: 48, Rough: 65 };

function buildComps(year, make, model, trim, mileage, condition, marketValue) {
  const mi = Number(mileage || 0);
  const variations = [
    { priceMult: 1.05, miOffset: -8000,  condOffset: 0,  dom: Math.round((DOM_BY_CONDITION[condition] || 30) * 0.7) },
    { priceMult: 1.02, miOffset: 5000,   condOffset: 0,  dom: Math.round((DOM_BY_CONDITION[condition] || 30) * 0.9) },
    { priceMult: 0.98, miOffset: 12000,  condOffset: 1,  dom: Math.round((DOM_BY_CONDITION[condition] || 30) * 1.1) },
    { priceMult: 0.95, miOffset: 20000,  condOffset: 1,  dom: Math.round((DOM_BY_CONDITION[condition] || 30) * 1.4) },
    { priceMult: 1.00, miOffset: -2000,  condOffset: 0,  dom: Math.round((DOM_BY_CONDITION[condition] || 30) * 1.0) },
  ];
  const conditions = ["Excellent", "Very Good", "Good", "Fair", "Rough"];
  const condIdx = conditions.indexOf(condition);
  const sources = ["Private Party", "Dealer Listing", "CarGurus Est.", "Private Party", "Dealer Listing"];

  return variations.map((v, i) => {
    const compMi = Math.max(mi + v.miOffset, 0);
    const compCondIdx = Math.min(Math.max(condIdx + v.condOffset, 0), conditions.length - 1);
    const compCond = conditions[compCondIdx];
    const price = Math.max(Math.round(marketValue * v.priceMult / 100) * 100, 3000);
    return {
      year: Number(year),
      make,
      model,
      trim: trim || "",
      mileage: compMi,
      condition: compCond,
      price,
      daysOnMarket: v.dom,
      source: sources[i],
    };
  });
}

const { handleFbHub } = require("./fb-hub");

// ─── Route handler ────────────────────────────────────────────────────────────

async function handleDealership(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  // ── Facebook Hub routes ──
  if (pathname.startsWith("/api/dealer/fb/")) {
    let body = "";
    await new Promise(resolve => {
      req.on("data", c => body += c);
      req.on("end", resolve);
    });
    const handled = await handleFbHub(req, res, pathname, searchParams, body || "{}");
    if (handled !== null) return;
  }

  if (pathname === "/api/dealer/vin-decode") {
    const raw = String(searchParams.get("vin") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
    if (raw.length !== 17) {
      return writeJson(res, 400, { error: "VIN must be exactly 17 alphanumeric characters" });
    }

    // Try NHTSA first; fall back to stub if unreachable or VIN is not recognized
    let decoded = null;
    try { decoded = await decodeVinNhtsa(raw); } catch {}
    if (!decoded) decoded = decodeVinStub(raw);

    return writeJson(res, 200, {
      vin: raw,
      year:         decoded.year,
      make:         decoded.make,
      model:        decoded.model,
      trim:         decoded.trim,
      body:         decoded.body,
      engine:       decoded.engine,
      drive:        decoded.drive,
      fuel:         decoded.fuel,
      transmission: decoded.transmission,
      mileage:      0,
      condition:    "Good",
      price:        0,
      source:       decoded.source,
    });
  }

  if (pathname === "/api/dealer/payment-calc") {
    const price  = Number(searchParams.get("price")  || 0);
    const apr    = Number(searchParams.get("apr")    || 9.9);
    const months = Number(searchParams.get("months") || 72);
    const down   = Number(searchParams.get("down")   || 0);
    if (price <= 0) return writeJson(res, 400, { error: "price must be greater than 0" });
    return writeJson(res, 200, {
      price, apr, months, downPayment: down,
      monthlyPayment: monthlyPayment(price, apr, months, down),
    });
  }

  if (pathname === "/api/dealer/comps") {
    const year = Number(searchParams.get("year") || 0);
    const make = String(searchParams.get("make") || "").trim();
    const model = String(searchParams.get("model") || "").trim();
    const trim = String(searchParams.get("trim") || "").trim();
    const mileage = Number(searchParams.get("mileage") || 0);
    const condition = String(searchParams.get("condition") || "Good").trim();

    const validConditions = ["Excellent", "Very Good", "Good", "Fair", "Rough"];
    if (!year || year < 1990 || year > new Date().getFullYear() + 2) {
      return writeJson(res, 400, { error: "Valid year (1990–present) is required." });
    }
    if (!make || !model) return writeJson(res, 400, { error: "make and model are required." });
    if (!validConditions.includes(condition)) {
      return writeJson(res, 400, { error: `condition must be one of: ${validConditions.join(", ")}` });
    }

    const marketValue = estimateMarketValue(year, make, model, mileage, condition);
    const comps = buildComps(year, make, model, trim, mileage, condition, marketValue);
    const prices = comps.map((c) => c.price);
    const avgDom = Math.round(comps.reduce((s, c) => s + c.daysOnMarket, 0) / comps.length);

    return writeJson(res, 200, {
      vehicle: { year, make, model, trim, mileage, condition },
      marketValue,
      priceRange: { low: Math.min(...prices), high: Math.max(...prices) },
      avgDaysOnMarket: avgDom,
      cleanTrade: Math.round(marketValue * 0.87),
      roughTrade: Math.round(marketValue * 0.78),
      comps,
      note: "Estimates based on age, mileage, make, and condition. Not a KBB or NADA quote.",
    });
  }

  // POST /api/dealer/describe — AI vehicle description generator
  if (pathname === "/api/dealer/describe" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) {
      return writeJson(res, 503, { error: "ANTHROPIC_API_KEY is not configured." });
    }
    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { error: "Invalid JSON body" });
    }

    const v = body || {};
    const year = Number(v.year || 0);
    const make = String(v.make || "").trim();
    const model = String(v.model || "").trim();
    if (!year || !make || !model) {
      return writeJson(res, 400, { error: "year, make, and model are required" });
    }

    const trim = String(v.trim || "").trim();
    const mileage = Number(v.mileage || 0);
    const condition = String(v.condition || "Good").trim();
    const price = Number(v.price || 0);
    const engine = String(v.engine || "").trim();
    const drive = String(v.drive || "").trim();
    const fuel = String(v.fuel || "").trim();
    const transmission = String(v.transmission || "").trim();
    const notes = String(v.notes || "").trim();
    const style = String(v.style || "facebook").toLowerCase();

    const styleInstructions = {
      facebook: "Write a Facebook Marketplace listing. Casual, friendly, conversational. Include key facts, highlight value, end with a clear call to action. 3-5 short paragraphs.",
      website: "Write a professional dealership website listing description. SEO-friendly, detailed, trust-building. Use clear headings if needed. 4-6 paragraphs.",
      craigslist: "Write a Craigslist listing. Plain text, practical, bullet points for key specs. Focus on price and condition. 2-3 paragraphs max.",
      summary: "Write a 2-sentence summary description suitable for a price sticker or window tag. Highlight the best features and value in 40-60 words total.",
    };

    const prompt = `You are an experienced used car sales copywriter. Write a compelling vehicle listing description.

VEHICLE DETAILS:
- ${year} ${make} ${model}${trim ? " " + trim : ""}
- Mileage: ${mileage ? mileage.toLocaleString() + " miles" : "not specified"}
- Condition: ${condition}
- Price: ${price ? "$" + price.toLocaleString() : "contact for price"}
${engine ? "- Engine: " + engine : ""}
${transmission ? "- Transmission: " + transmission : ""}
${drive ? "- Drivetrain: " + drive : ""}
${fuel ? "- Fuel: " + fuel : ""}
${notes ? "- Additional notes: " + notes : ""}

PLATFORM / STYLE: ${styleInstructions[style] || styleInstructions.facebook}

Do not invent features not listed above. Do not use all-caps except for the vehicle name. No emojis unless writing for Facebook.`;

    try {
      const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, { maxTokens: 600 });
      return writeJson(res, 200, { description: text, style, generatedAt: new Date().toISOString() });
    } catch (err) {
      return writeJson(res, 422, { error: err instanceof Error ? err.message : "AI description failed" });
    }
  }

  // POST /api/dealer/deal-finder — AI market scan + deal scoring via live web search
  if (pathname === "/api/dealer/deal-finder" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) {
      return writeJson(res, 503, { error: "ANTHROPIC_API_KEY is not configured." });
    }
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { error: "Invalid JSON body" }); }

    const vin = String(body.vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
    const mileage = Number(body.mileage || 0);
    const zip = (String(body.zip || "45014").replace(/[^0-9]/g, "").slice(0, 5)) || "45014";
    const radius = Math.min(Math.max(Number(body.radius || 200), 25), 500);
    if (vin.length !== 17) return writeJson(res, 400, { error: "VIN must be exactly 17 alphanumeric characters" });

    // Decode with real NHTSA data first
    let decoded = null;
    try { decoded = await decodeVinNhtsa(vin); } catch {}
    if (!decoded) decoded = decodeVinStub(vin);

    const prompt = buildDealFinderPrompt(decoded, vin, mileage, zip, radius);
    try {
      const text = await callAnthropicWithSearch(prompt, ANTHROPIC_API_KEY, { model: "claude-sonnet-4-6", maxTokens: 6000, maxSearches: 8 });
      return writeJson(res, 200, {
        vin, vehicle: decoded, mileage, zip, radius,
        analysis: extractJsonBlock(text),
        summary: text,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      return writeJson(res, 422, { error: err instanceof Error ? err.message : "Deal finder failed" });
    }
  }

  // POST /api/dealer/price-beat — "Am I cheapest?" Finds the lowest competitor price for ONE vehicle.
  if (pathname === "/api/dealer/price-beat" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) {
      return writeJson(res, 503, { error: "ANTHROPIC_API_KEY is not configured." });
    }
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { error: "Invalid JSON body" }); }

    const year = Number(body.year || 0);
    const make = String(body.make || "").trim();
    const model = String(body.model || "").trim();
    const trim = String(body.trim || "").trim();
    const zip = (String(body.zip || "45014").replace(/[^0-9]/g, "").slice(0, 5)) || "45014";
    const radius = Math.min(Math.max(Number(body.radius || 200), 25), 500);
    const myPrice = Number(body.myPrice || 0);
    if (!year || !make || !model) return writeJson(res, 400, { error: "year, make, and model are required" });

    const prompt = `You are a used-car pricing research assistant. Use the web_search tool to find the single CHEAPEST currently-listed used car matching this vehicle, from any OTHER seller.

Vehicle: ${year} ${make} ${model} ${trim}
Within ${radius} miles of ZIP ${zip}.
EXCLUDE my own dealership: "Dixie Motors", "Dixie Imports", "Cincy Automall".
Search CarGurus, Cars.com, and AutoTrader for the lowest asking price from any other dealer or private seller.

Reply with ONLY valid JSON, no markdown:
If found: {"found":true,"cheapest_price":12500,"source":"CarGurus","dealer":"ABC Motors","miles":95000,"link":"https://..."}
If nothing comparable found: {"found":false}`;

    try {
      const text = await callAnthropicWithSearch(prompt, ANTHROPIC_API_KEY, { model: "claude-sonnet-4-6", maxTokens: 700, maxSearches: 5 });
      const result = extractJsonBlock(text) || { found: false };
      let out = { found: !!result.found };
      if (result.found) {
        const comp = Number(result.cheapest_price || 0);
        const gap = myPrice && comp ? myPrice - comp : null;       // positive = I'm cheaper
        out = {
          found: true, cheapestPrice: comp, source: result.source || "", dealer: result.dealer || "",
          compMiles: Number(result.miles || 0), link: result.link || "",
          gap, status: gap == null ? "unknown" : gap >= 0 ? "cheapest" : gap >= -500 ? "close" : "not_cheapest",
          suggested: gap != null && gap < 0 ? Math.max(comp - 100, 0) : null,
        };
      }
      return writeJson(res, 200, out);
    } catch (err) {
      return writeJson(res, 422, { error: err instanceof Error ? err.message : "Price scan failed" });
    }
  }

  return writeJson(res, 404, { error: "Dealer endpoint not found" });
}

module.exports = handleDealership;
