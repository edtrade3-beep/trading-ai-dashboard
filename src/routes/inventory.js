const { writeJson, readRequestBody, readRequestBodyBuffer } = require("../utils");
const { loadInventory, saveInventory } = require("../inventory-store");
const { deletePhotosForVehicle } = require("../dealership/photo-store");

// ─── Vehicle normalizer ───────────────────────────────────────────────────────

const MAKES = [
  "acura","alfa romeo","audi","bmw","buick","cadillac","chevrolet","chrysler",
  "dodge","ferrari","fiat","ford","genesis","gmc","honda","hyundai","infiniti",
  "jaguar","jeep","kia","lamborghini","land rover","lexus","lincoln","maserati",
  "mazda","mercedes","mercedes-benz","mini","mitsubishi","nissan","pontiac",
  "porsche","ram","rolls-royce","subaru","tesla","toyota","volkswagen","volvo",
];

function guessCondition(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("excellent")) return "Excellent";
  if (t.includes("very good") || t.includes("great")) return "Very Good";
  if (t.includes("fair")) return "Fair";
  if (t.includes("rough") || t.includes("poor")) return "Rough";
  return "Good";
}

function extractPrice(text) {
  const m = String(text || "").replace(/,/g, "").match(/\$?\s*(\d{4,6})/);
  return m ? Number(m[1]) : 0;
}

function extractMileage(text) {
  const t = String(text || "").toLowerCase().replace(/,/g, "");
  const m = t.match(/(\d{3,7})\s*(?:mi|mile|km)/);
  return m ? Number(m[1]) : 0;
}

function normalizeVehicle(raw) {
  const year = Number(raw.year) || 0;
  const make = String(raw.make || "").trim();
  const model = String(raw.model || "").trim();
  const trim = String(raw.trim || raw.trimLevel || "").trim();
  const vin = String(raw.vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
  const price = extractPrice(String(raw.price || raw.listPrice || raw.askingPrice || "")) || Number(raw.price) || 0;
  const mileage = extractMileage(String(raw.mileage || raw.miles || "")) || Number(raw.mileage) || 0;
  const condition = guessCondition(raw.condition || "");

  if (!year || year < 1990 || year > new Date().getFullYear() + 2) return null;
  if (!make || !model) return null;

  return {
    vin: vin || `GEN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase(),
    year,
    make: make.charAt(0).toUpperCase() + make.slice(1).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
    model: model.charAt(0).toUpperCase() + model.slice(1),
    trim,
    mileage,
    price,
    condition,
  };
}

// ─── Website scraper ──────────────────────────────────────────────────────────

function extractJsonLd(html) {
  const results = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : (data["@graph"] ? data["@graph"] : [data]);
      for (const item of items) {
        const type = String(item["@type"] || "").toLowerCase();
        if (type === "car" || type === "vehicle" || type === "product") {
          results.push(item);
        }
      }
    } catch {}
  }
  return results;
}

function parseJsonLdItems(items) {
  return items.map((item) => {
    const name = String(item.name || item.model || "");
    const yearMatch = name.match(/\b(19|20)\d{2}\b/);
    const makeGuess = MAKES.find(mk => name.toLowerCase().includes(mk)) || "";
    return normalizeVehicle({
      year: item.vehicleModelDate || item.year || (yearMatch ? yearMatch[0] : ""),
      make: item.brand?.name || item.manufacturer || makeGuess || name.split(" ")[1] || "",
      model: item.model || item.vehicleModel || name.split(" ").slice(2).join(" "),
      trim: item.vehicleConfiguration || item.trimLevel || "",
      vin: item.vehicleIdentificationNumber || item.vin || "",
      price: item.offers?.price || item.price || "",
      mileage: item.mileageFromOdometer?.value || item.mileage || "",
      condition: item.itemCondition || item.condition || "",
    });
  }).filter(Boolean);
}

function parseHtmlFallback(html) {
  // Extract text blocks likely to contain vehicle listings
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ");

  const results = [];
  // Pattern: "2019 Toyota Camry SE" optionally followed by price/mileage nearby
  const vehicleRe = /\b((?:19|20)\d{2})\s+([A-Za-z\-]+(?:\s+[A-Za-z\-]+)?)\s+([A-Za-z0-9\s\-]{2,30?})/g;
  let m;
  while ((m = vehicleRe.exec(text)) !== null) {
    const year = Number(m[1]);
    const makeCandidate = m[2].toLowerCase().trim();
    const matchedMake = MAKES.find(mk => makeCandidate.startsWith(mk));
    if (!matchedMake) continue;

    const surrounding = text.slice(Math.max(0, m.index - 100), m.index + 300);
    const price = extractPrice(surrounding);
    const mileage = extractMileage(surrounding);
    const modelWords = m[3].trim().split(/\s+/).slice(0, 3).join(" ");

    const vehicle = normalizeVehicle({
      year, make: matchedMake, model: modelWords,
      price, mileage, condition: "Good",
    });
    if (vehicle) results.push(vehicle);
    if (results.length >= 50) break;
  }
  return results;
}

async function scrapeWebsite(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`Website returned ${res.status}`);
    const html = await res.text();

    // Try JSON-LD structured data first (most reliable)
    const ldItems = extractJsonLd(html);
    if (ldItems.length) {
      const vehicles = parseJsonLdItems(ldItems);
      if (vehicles.length) return { items: vehicles, method: "json-ld" };
    }

    // Fall back to HTML text parsing
    const vehicles = parseHtmlFallback(html);
    return { items: vehicles, method: "html-text" };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── PDF text extractor ───────────────────────────────────────────────────────

function extractPdfText(buffer) {
  // Extract readable ASCII text strings from PDF binary.
  // Works for text-based PDFs (not scanned images).
  const str = buffer.toString("latin1");
  const chunks = [];

  // Grab content between BT (Begin Text) and ET (End Text) markers
  const btRe = /BT\s([\s\S]*?)ET/g;
  let m;
  while ((m = btRe.exec(str)) !== null) {
    const block = m[1];
    // Extract strings in parentheses: (Hello World)
    const parenRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
    let pm;
    while ((pm = parenRe.exec(block)) !== null) {
      const text = pm[1]
        .replace(/\\n/g, "\n").replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t").replace(/\\\\/g, "\\")
        .replace(/\\\(/g, "(").replace(/\\\)/g, ")");
      chunks.push(text);
    }
  }

  // Also grab hex strings <48656c6c6f> that decode to readable text
  const hexRe = /<([0-9a-fA-F]{4,})>/g;
  while ((m = hexRe.exec(str)) !== null) {
    try {
      const hex = m[1];
      let decoded = "";
      for (let i = 0; i < hex.length; i += 2) {
        decoded += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      }
      if (/[A-Za-z0-9]/.test(decoded)) chunks.push(decoded);
    } catch {}
  }

  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function parsePdfVehicles(text) {
  const results = [];
  const lines = text.split(/[\n\r|]+/).map(s => s.trim()).filter(Boolean);

  for (const line of lines) {
    const yearMatch = line.match(/\b((?:19|20)\d{2})\b/);
    if (!yearMatch) continue;
    const year = Number(yearMatch[1]);
    const makeFound = MAKES.find(mk => line.toLowerCase().includes(mk));
    if (!makeFound) continue;

    const price = extractPrice(line);
    const mileage = extractMileage(line);

    // Extract model: words after make up to next number or punctuation
    const makeIdx = line.toLowerCase().indexOf(makeFound);
    const afterMake = line.slice(makeIdx + makeFound.length).trim();
    const modelWords = afterMake.split(/\s+/).slice(0, 3).join(" ").replace(/[^A-Za-z0-9\s\-]/g, "").trim();

    const vehicle = normalizeVehicle({
      year, make: makeFound, model: modelWords || "Unknown",
      price, mileage, condition: "Good",
    });
    if (vehicle) results.push(vehicle);
    if (results.length >= 100) break;
  }

  // Deduplicate by year+make+model
  const seen = new Set();
  return results.filter(v => {
    const key = `${v.year}|${v.make}|${v.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Multipart parser ─────────────────────────────────────────────────────────

function parseMultipartFile(bodyBuffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/i);
  if (!boundaryMatch) throw new Error("No boundary found in Content-Type");
  const boundary = Buffer.from("--" + boundaryMatch[1].replace(/^["']|["']$/g, ""));

  const parts = [];
  let start = 0;
  while (start < bodyBuffer.length) {
    const bPos = bodyBuffer.indexOf(boundary, start);
    if (bPos === -1) break;
    const partStart = bPos + boundary.length;
    const next = bodyBuffer.indexOf(boundary, partStart);
    if (next === -1) break;
    const partBuf = bodyBuffer.slice(partStart, next);
    // Find the blank line separating headers from body (\r\n\r\n)
    const headerEnd = partBuf.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) { start = next; continue; }
    const headerStr = partBuf.slice(0, headerEnd).toString("utf8");
    const body = partBuf.slice(headerEnd + 4, partBuf.length - 2); // trim trailing \r\n
    const nameMatch = headerStr.match(/name="([^"]+)"/i);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/i);
    parts.push({ name: nameMatch?.[1] || "", filename: filenameMatch?.[1] || "", body });
    start = next;
  }

  const filePart = parts.find(p => p.filename && p.body.length > 0);
  if (!filePart) throw new Error("No file found in upload");
  return filePart;
}

// ─── Route handler ────────────────────────────────────────────────────────────

async function handleInventory(req, res, requestUrl) {
  const { pathname } = requestUrl;

  // GET /api/inventory — return saved inventory
  if (pathname === "/api/inventory" && req.method === "GET") {
    const saved = loadInventory();
    return writeJson(res, 200, { items: saved || [], source: saved ? "saved" : "empty" });
  }

  // POST /api/inventory/save — persist the current inventory array
  if (pathname === "/api/inventory/save" && req.method === "POST") {
    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { error: "Invalid JSON body" });
    }
    const items = Array.isArray(body.items) ? body.items : Array.isArray(body) ? body : [];

    // Whole-array replace is how this store has always worked (client sends
    // its full local state each save) — a vehicle missing from the new array
    // means it was deleted, so its photo directory would otherwise sit
    // orphaned on disk forever with nothing left pointing to it.
    //
    // Guard: this same session already saw a client-side cache-loss bug send
    // an empty/near-empty array over a real 525-vehicle inventory (browser
    // localStorage got cleared, POSTed {"items":[]}). Deleting photos on
    // that kind of mass drop would destroy files with no JSON backup to
    // recover them from, unlike the inventory record itself. Skip the photo
    // cleanup (still save the array as requested) when it looks like a bulk
    // loss rather than real deletions — over half of a non-trivial inventory
    // disappearing in one save.
    const before = loadInventory() || [];
    const bulkLossLikely = before.length > 10 && items.length < before.length * 0.5;
    if (!bulkLossLikely) {
      const afterIds = new Set(items.map(v => String(v.id)));
      for (const v of before) {
        if (!afterIds.has(String(v.id))) await deletePhotosForVehicle(v.id);
      }
    } else {
      console.error(`[inventory] save dropped ${before.length} -> ${items.length} items — skipping photo cleanup as a likely bulk-loss, not real deletions.`);
    }

    saveInventory(items);
    return writeJson(res, 200, { ok: true, saved: items.length });
  }

  // POST /api/inventory/import-website
  if (pathname === "/api/inventory/import-website" && req.method === "POST") {
    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { error: "Invalid JSON body. Send { url: '...' }" });
    }
    const url = String(body.url || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return writeJson(res, 400, { error: "A valid http/https URL is required." });
    }
    try {
      const result = await scrapeWebsite(url);
      if (result.items.length) saveInventory(result.items);
      return writeJson(res, 200, {
        items: result.items,
        count: result.items.length,
        method: result.method,
      });
    } catch (error) {
      return writeJson(res, 422, {
        error: error instanceof Error ? error.message : "Failed to scrape website",
        items: [],
      });
    }
  }

  // POST /api/inventory/import-pdf
  if (pathname === "/api/inventory/import-pdf" && req.method === "POST") {
    const contentType = String(req.headers["content-type"] || "");
    if (!contentType.includes("multipart/form-data")) {
      return writeJson(res, 400, { error: "Expected multipart/form-data upload." });
    }
    let filePart;
    try {
      const bodyBuffer = await readRequestBodyBuffer(req, 10 * 1024 * 1024);
      filePart = parseMultipartFile(bodyBuffer, contentType);
    } catch (error) {
      return writeJson(res, 400, {
        error: error instanceof Error ? error.message : "Failed to parse uploaded file",
      });
    }
    if (!filePart.filename.toLowerCase().endsWith(".pdf")) {
      return writeJson(res, 400, { error: "Only PDF files are accepted." });
    }
    const text = extractPdfText(filePart.body);
    if (!text.trim()) {
      return writeJson(res, 422, {
        error: "No readable text found in this PDF. It may be a scanned image — only text-based PDFs are supported.",
        items: [],
      });
    }
    const items = parsePdfVehicles(text);
    if (items.length) saveInventory(items);
    return writeJson(res, 200, { items, count: items.length, method: "pdf-text" });
  }

  // GET /api/inventory/export.csv
  if (pathname === "/api/inventory/export.csv" && req.method === "GET") {
    const items = loadInventory() || [];
    const header = "VIN,Year,Make,Model,Trim,Mileage,Price,Condition,Status,SoldPrice,SoldDate,DealerNotes";
    const rows = items.map(v => {
      const status = v.soldPrice > 0 ? "Sold" : "Active";
      const soldDate = v.soldAt ? new Date(v.soldAt).toISOString().slice(0, 10) : "";
      return [v.vin, v.year, v.make, v.model, v.trim, v.mileage, v.price, v.condition, status, v.soldPrice || "", soldDate, v.dealerNotes || ""]
        .map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",");
    });
    const csv = [header, ...rows].join("\r\n");
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventory-${new Date().toISOString().slice(0,10)}.csv"`,
      "Cache-Control": "no-store",
    });
    res.end(csv);
    return;
  }

  return writeJson(res, 404, { error: "Unknown inventory endpoint." });
}

module.exports = handleInventory;
