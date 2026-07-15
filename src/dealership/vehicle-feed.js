// Meta (Facebook) Vehicle Catalog feed + the public vehicle page it links to.
//
// This is the legitimate path to "automated Facebook Marketplace posting" for a
// dealer: Meta's Commerce Manager polls a feed URL and creates/updates/removes
// the actual Marketplace listings on Facebook's own infrastructure. Nothing here
// drives a browser or touches Facebook's UI — it only produces data.
//
// Field names follow Meta's vehicle product-catalog spec (Graph API reference,
// product-catalog/vehicles). Meta's spec can change; if Commerce Manager's feed
// validator flags a column, that's authoritative over this file.
//
// `images` is populated from each vehicle's `photos` array (set by
// POST /api/dealer/vehicle/:id/photos, see photo-store.js), serialized as
// comma-separated absolute URLs — the common convention for multi-image CSV
// product feeds. Meta's spec can change; if Commerce Manager's feed
// validator wants a different serialization, that's authoritative over this
// file. A vehicle with no photos yet still gets a row (with a blank
// `images` column) rather than being dropped — Commerce Manager will simply
// flag/reject that specific listing rather than the whole feed.

const { loadInventory } = require("../inventory-store");

const DEALER = {
  name: process.env.DEALER_NAME || "Dixie Motors",
  addr: process.env.DEALER_ADDR || "6416 Dixie Highway, Fairfield, OH 45014",
  phone: process.env.DEALER_PHONE || "513-874-4999",
};

function parseAddr(addr) {
  // "6416 Dixie Highway, Fairfield, OH 45014" -> addr1/city/region/postal
  const m = /^(.*?),\s*([^,]+?),\s*([A-Z]{2})\s+(\d{5})/.exec(addr || "");
  if (!m) return { addr1: addr || "", city: "", region: "", postal: "", country: "US" };
  return { addr1: m[1].trim(), city: m[2].trim(), region: m[3].trim(), postal: m[4].trim(), country: "US" };
}
const DEALER_ADDR = parseAddr(DEALER.addr);

function mapBodyStyle(raw) {
  const s = String(raw || "").toUpperCase();
  if (s.includes("SUV") || s.includes("MULTIPURPOSE")) return "SUV";
  if (s.includes("PICKUP") || s.includes("TRUCK")) return "TRUCK";
  if (s.includes("SEDAN") || s.includes("SALOON")) return "SEDAN";
  if (s.includes("COUPE")) return "COUPE";
  if (s.includes("CONVERTIBLE")) return "CONVERTIBLE";
  if (s.includes("VAN") || s.includes("MINIVAN")) return "MINIVAN";
  if (s.includes("WAGON")) return "WAGON";
  if (s.includes("HATCH")) return "HATCHBACK";
  return "OTHER";
}
function mapFuelType(raw) {
  const s = String(raw || "").toUpperCase();
  if (s.includes("DIESEL")) return "DIESEL";
  if (s.includes("ELECTRIC")) return "ELECTRIC";
  if (s.includes("PLUG")) return "PLUGIN_HYBRID";
  if (s.includes("HYBRID")) return "HYBRID";
  if (s.includes("FLEX")) return "FLEX";
  if (s.includes("GAS") || s.includes("PETROL")) return "GASOLINE";
  return "OTHER";
}
function mapDrivetrain(raw) {
  const s = String(raw || "").toUpperCase();
  if (s.includes("AWD") || s.includes("ALL-WHEEL")) return "AWD";
  if (s.includes("4WD") || s.includes("4X4") || s.includes("4-WHEEL")) return "FOUR_WD";
  if (s.includes("FWD") || s.includes("FRONT-WHEEL")) return "FWD";
  if (s.includes("RWD") || s.includes("REAR-WHEEL")) return "RWD";
  if (s.includes("4X2")) return "TWO_WD";
  return "OTHER";
}

function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function vehicleTitle(v) {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}
function vehicleDescription(v) {
  const bits = [`Used ${vehicleTitle(v)}.`];
  if (v.mileage) bits.push(`${Number(v.mileage).toLocaleString()} miles.`);
  if (v.engine) bits.push(`${v.engine} engine.`);
  if (v.drive) bits.push(`${v.drive}.`);
  if (v.vin) bits.push(`VIN ${v.vin}.`);
  bits.push(`Priced at $${Number(v.price || 0).toLocaleString()}.`);
  bits.push(`Contact ${DEALER.name} at ${DEALER.phone} for details or to schedule a viewing.`);
  return bits.join(" ");
}

const FEED_COLUMNS = [
  "vehicle_id", "vin", "year", "make", "model", "trim", "body_style", "state_of_vehicle",
  "price", "currency", "title", "description", "exterior_color", "mileage", "mileage_unit",
  "images", "url", "address.addr1", "address.city", "address.region", "address.postal_code",
  "address.country", "availability", "transmission", "fuel_type", "drivetrain",
  "dealer_name", "dealer_phone", "vehicle_type",
];

// Only sync vehicles with a real price and that aren't sold — an unpriced or
// sold vehicle has nothing legitimate to tell Meta.
function feedEligible(v) {
  return Number(v.price) > 0 && v.status !== "sold";
}

function buildVehicleFeedCsv(baseUrl) {
  const inv = loadInventory() || [];
  const rows = inv.filter(feedEligible).map(v => {
    const rec = {
      vehicle_id: v.id, vin: v.vin || "", year: v.year || "", make: v.make || "",
      model: v.model || "", trim: v.trim || "", body_style: mapBodyStyle(v.body),
      state_of_vehicle: "USED", price: Number(v.price || 0).toFixed(2), currency: "USD",
      title: vehicleTitle(v), description: vehicleDescription(v),
      exterior_color: v.exteriorColor || "", mileage: v.mileage || "", mileage_unit: "MILES",
      images: (v.photos || []).map(p => `${baseUrl}${p}`).join(","),
      url: `${baseUrl}/vehicle/${v.id}`,
      "address.addr1": DEALER_ADDR.addr1, "address.city": DEALER_ADDR.city,
      "address.region": DEALER_ADDR.region, "address.postal_code": DEALER_ADDR.postal,
      "address.country": DEALER_ADDR.country,
      availability: "AVAILABLE", transmission: v.transmission || "",
      fuel_type: mapFuelType(v.fuel), drivetrain: mapDrivetrain(v.drive),
      dealer_name: DEALER.name, dealer_phone: DEALER.phone, vehicle_type: "CAR_TRUCK",
    };
    return FEED_COLUMNS.map(c => csvEscape(rec[c])).join(",");
  });
  return [FEED_COLUMNS.join(","), ...rows].join("\n");
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderVehiclePage(v, baseUrl) {
  if (!v) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Vehicle not found</title></head>
<body style="font-family:sans-serif;max-width:640px;margin:60px auto;text-align:center;color:#333">
<h1>Vehicle no longer available</h1><p>This listing has been sold or removed. Call ${esc(DEALER.phone)} to ask about current inventory.</p>
</body></html>`;
  }
  const title = vehicleTitle(v);
  const price = Number(v.price || 0) > 0 ? `$${Number(v.price).toLocaleString()}` : "Call for price";
  // og:image needs an absolute URL for social/Marketplace scrapers; <img>
  // tags work fine relative, but absolute costs nothing and stays consistent.
  const abs = (p) => baseUrl ? `${baseUrl}${p}` : p;
  const photos = (Array.isArray(v.photos) ? v.photos : []).map(abs);
  const gallery = photos.length
    ? `<div style="margin-bottom:20px">
        <img src="${esc(photos[0])}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px" alt="${esc(title)}">
        ${photos.length > 1 ? `<div style="display:flex;gap:6px;margin-top:6px;overflow-x:auto">${photos.slice(1).map(p => `<img src="${esc(p)}" style="width:76px;height:57px;object-fit:cover;border-radius:6px;flex:none" alt="${esc(title)}">`).join("")}</div>` : ""}
      </div>`
    : `<div style="background:#f4f4f4;border-radius:8px;padding:20px;color:#888;text-align:center;margin-bottom:20px">Photos coming soon</div>`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | ${esc(DEALER.name)}</title>
<meta property="og:title" content="${esc(title)} — ${esc(price)}">
<meta property="og:description" content="${esc(vehicleDescription(v))}">
${photos.length ? `<meta property="og:image" content="${esc(photos[0])}">` : ""}
</head>
<body style="font-family:-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1a1a1a">
  <div style="font-size:13px;color:#666;text-transform:uppercase;letter-spacing:.04em">${esc(DEALER.name)}</div>
  <h1 style="font-size:28px;margin:8px 0">${esc(title)}</h1>
  <div style="font-size:24px;font-weight:700;color:#0a7d34;margin-bottom:16px">${esc(price)}</div>
  ${gallery}
  <table style="width:100%;border-collapse:collapse;font-size:15px">
    ${v.mileage ? `<tr><td style="padding:6px 0;color:#666">Mileage</td><td style="padding:6px 0;text-align:right">${Number(v.mileage).toLocaleString()} mi</td></tr>` : ""}
    ${v.engine ? `<tr><td style="padding:6px 0;color:#666">Engine</td><td style="padding:6px 0;text-align:right">${esc(v.engine)}</td></tr>` : ""}
    ${v.drive ? `<tr><td style="padding:6px 0;color:#666">Drivetrain</td><td style="padding:6px 0;text-align:right">${esc(v.drive)}</td></tr>` : ""}
    ${v.fuel ? `<tr><td style="padding:6px 0;color:#666">Fuel</td><td style="padding:6px 0;text-align:right">${esc(v.fuel)}</td></tr>` : ""}
    ${v.body ? `<tr><td style="padding:6px 0;color:#666">Body style</td><td style="padding:6px 0;text-align:right">${esc(v.body)}</td></tr>` : ""}
    ${v.vin ? `<tr><td style="padding:6px 0;color:#666">VIN</td><td style="padding:6px 0;text-align:right;font-family:monospace">${esc(v.vin)}</td></tr>` : ""}
  </table>
  <div style="margin-top:24px;padding-top:20px;border-top:1px solid #eee">
    <div style="font-weight:600">Interested? Contact us.</div>
    <div style="color:#666;margin-top:4px">${esc(DEALER.name)} · ${esc(DEALER.phone)}</div>
    <div style="color:#666">${esc(DEALER.addr)}</div>
  </div>
</body>
</html>`;
}

module.exports = { buildVehicleFeedCsv, renderVehiclePage, FEED_COLUMNS };
