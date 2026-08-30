// carfax-parse.js — pure, deterministic extraction of real vehicle facts
// from a pasted CarFax (or similar vehicle-history) report's plain text.
// Explicit user request, 2026-08-30: "copy carfax and paste it in box and
// automatically loaded add" — paste a real CarFax report into the Facebook
// Ad Maker and have the form auto-fill from what's actually in it.
//
// Same real-data-only discipline as every other tool in Car Business: this
// only reports a field when the pasted text actually contains a confident
// match for it — it never guesses a year/make/model/mileage that isn't
// really there, and never invents an accident/owner/title fact. Ambiguous
// or unrecognized text simply leaves that field out of the result so the
// UI can leave the form field blank for the user to fill in by hand.
//
// Client-side only (runs in the browser on paste) — no server round trip,
// so this deliberately duplicates a small MAKES list rather than importing
// src/routes/inventory.js's server-side one (client components never
// import from src/, see build-client.js).

const MAKES = [
  "acura", "alfa romeo", "audi", "bmw", "buick", "cadillac", "chevrolet", "chrysler",
  "dodge", "ferrari", "fiat", "ford", "genesis", "gmc", "honda", "hyundai", "infiniti",
  "jaguar", "jeep", "kia", "lamborghini", "land rover", "lexus", "lincoln", "maserati",
  "mazda", "mercedes-benz", "mercedes", "mini", "mitsubishi", "nissan", "pontiac",
  "porsche", "ram", "rolls-royce", "subaru", "tesla", "toyota", "volkswagen", "volvo",
];

// Real, common multi-word model names — checked before falling back to the
// single-token heuristic, so e.g. "Jeep Grand Cherokee Limited" doesn't
// misparse model="Grand" / trim="Cherokee Limited".
const MULTI_WORD_MODELS = [
  "grand cherokee", "grand caravan", "grand wagoneer", "land cruiser", "range rover",
  "model 3", "model s", "model x", "model y", "cr-v", "hr-v", "rav4", "cx-5", "cx-9",
  "f-150", "f-250", "f-350", "santa fe", "grand vitara", "3 series", "5 series", "7 series",
];

function properCase(s) {
  return String(s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function findYearMakeModelTrim(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const yearMatch = line.match(/\b(19|20)\d{2}\b/);
    if (!yearMatch) continue;
    const year = Number(yearMatch[0]);
    if (year < 1990 || year > new Date().getFullYear() + 2) continue;

    const afterYear = line.slice(yearMatch.index + yearMatch[0].length).trim();
    if (!afterYear) continue;
    const lower = afterYear.toLowerCase();

    // Longest make match first (so "mercedes-benz" wins over "mercedes").
    const make = [...MAKES].sort((a, b) => b.length - a.length).find((mk) => lower.startsWith(mk));
    if (!make) continue;

    const rest = afterYear.slice(make.length).trim().replace(/^[-–,:•|]+\s*/, "");
    if (!rest) return { year, make: properCase(make), model: undefined, trim: undefined };

    const restLower = rest.toLowerCase();
    const multiWord = MULTI_WORD_MODELS.find((m) => restLower.startsWith(m));
    let model, trimRemainder;
    if (multiWord) {
      model = properCase(multiWord);
      trimRemainder = rest.slice(multiWord.length).trim();
    } else {
      const tokens = rest.split(/\s+/);
      model = tokens[0];
      trimRemainder = tokens.slice(1).join(" ");
    }

    // Only keep a trim when it's short and label-like (real trim strings
    // are things like "LE", "XLT 4x4", "SR5 Double Cab" — a long remainder
    // is more likely unrelated report text, so it's dropped rather than
    // guessed at).
    const trim = trimRemainder && trimRemainder.split(/\s+/).length <= 5 && trimRemainder.length <= 40
      ? trimRemainder.replace(/[.,;].*$/, "").trim()
      : undefined;

    return { year, make: properCase(make), model, trim: trim || undefined };
  }
  return {};
}

function findVin(text) {
  const m = text.match(/\bVIN[:\s]*([A-HJ-NPR-Z0-9]{17})\b/i) || text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
  return m ? m[1].toUpperCase() : undefined;
}

function findMileage(text) {
  const matches = [...text.matchAll(/\b(\d{1,3}(?:,\d{3})+|\d{4,6})\s*(?:mi\.?|miles?)\b/gi)];
  const values = matches
    .map((m) => Number(String(m[1]).replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 400000);
  if (!values.length) return undefined;
  return Math.max(...values);
}

function findOwnerCount(text) {
  const m = text.match(/\b(\d+)[\s-]+owners?\b/i);
  return m ? Number(m[1]) : undefined;
}

function findAccidentInfo(text) {
  if (/\bno\s+accidents?\s*(?:or\s+damage)?\s*(?:reported)?\b/i.test(text)) {
    return { accidentFree: true, accidentCount: 0 };
  }
  const m = text.match(/\b(\d+)\s+accidents?\s*(?:reported)?\b/i);
  if (m) return { accidentFree: Number(m[1]) === 0, accidentCount: Number(m[1]) };
  return {};
}

function findTitleStatus(text) {
  if (/\b(salvage|branded|rebuilt|flood damage|junk|lemon)\s*title\b/i.test(text) || /\btitle\s*(?:brand|issue)s?\s*:?\s*(?:salvage|branded|rebuilt|flood|junk|lemon)/i.test(text)) {
    return { titleStatus: "BRANDED", titleWarning: true };
  }
  if (/\bclean\s*title\b/i.test(text)) {
    return { titleStatus: "CLEAN", titleWarning: false };
  }
  return {};
}

function findServiceRecordCount(text) {
  const m = text.match(/\b(\d+)\s+service\s*(?:history\s*)?records?\b/i);
  return m ? Number(m[1]) : undefined;
}

// Builds a short, honest summary string of only the real facts found —
// meant to be appended to the Ad Maker's free-form "notes" field so the ad
// copy can reference them (e.g. "1-owner, no accidents reported, clean
// title") without ever stating a fact that wasn't actually in the report.
function buildNotesSummary(parsed) {
  const parts = [];
  if (parsed.ownerCount != null) parts.push(`${parsed.ownerCount}-owner vehicle (per CarFax)`);
  if (parsed.accidentFree === true) parts.push("no accidents or damage reported (per CarFax)");
  else if (parsed.accidentCount != null) parts.push(`${parsed.accidentCount} accident(s) reported (per CarFax)`);
  if (parsed.titleStatus === "CLEAN") parts.push("clean title (per CarFax)");
  else if (parsed.titleStatus === "BRANDED") parts.push("⚠ CarFax reports a branded/salvage/rebuilt title — verify before advertising as clean");
  if (parsed.serviceRecords != null) parts.push(`${parsed.serviceRecords} service history records (per CarFax)`);
  return parts.join(", ");
}

function parseCarfaxText(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return { foundFields: [], notesSummary: "" };

  const { year, make, model, trim } = findYearMakeModelTrim(text);
  const vin = findVin(text);
  const mileage = findMileage(text);
  const ownerCount = findOwnerCount(text);
  const { accidentFree, accidentCount } = findAccidentInfo(text);
  const { titleStatus, titleWarning } = findTitleStatus(text);
  const serviceRecords = findServiceRecordCount(text);

  const parsed = { year, make, model, trim, vin, mileage, ownerCount, accidentFree, accidentCount, titleStatus, titleWarning, serviceRecords };
  const foundFields = Object.entries(parsed).filter(([k, v]) => v !== undefined && k !== "titleWarning").map(([k]) => k);
  const notesSummary = buildNotesSummary(parsed);

  return { ...parsed, foundFields, notesSummary };
}

export { parseCarfaxText, MAKES, MULTI_WORD_MODELS };
