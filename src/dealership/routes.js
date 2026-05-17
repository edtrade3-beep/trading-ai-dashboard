const { writeJson, fetchJsonSafe, withTimeout } = require("../utils");

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

// ─── Route handler ────────────────────────────────────────────────────────────

async function handleDealership(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

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

  return writeJson(res, 404, { error: "Dealer endpoint not found" });
}

module.exports = handleDealership;
