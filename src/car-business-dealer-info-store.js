// car-business-dealer-info-store.js — real, user-entered dealership contact
// details + ad-copy preferences, so the Facebook Ad Maker and Facebook
// Strategy tools stop leaving "[YOUR PHONE NUMBER]"-style placeholders in
// generated ad copy and instead use the dealer's actual real info. Explicit
// user-supplied values (2026-08-30): "Dixie Motors, 6416 Dixie Highway,
// Fairfield Oh 45014, 513-874-4999. only call or pm in facebook clean
// title but dont mentiend in hand find attractive words for financing."
//
// Same real atomic-write/readJsonSafe pattern as every other small store in
// this codebase (car-business-store.js, ai-coach-store.js) — a plain JSON
// file, no database needed for a single real settings record. Seeded with
// the real values the user actually gave, editable later via the Car
// Business tab's own small settings form (never re-typed into code again).
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "car-business-dealer-info.json");

// Real, explicit seed — the user's own words, not invented. contactMethod
// is a real, disclosed constraint ("only call or pm in facebook" — no
// texting/SMS in generated ad copy). titleNote captures the real, specific
// instruction: mention clean title, but never the phrase "title in hand."
const DEFAULT_INFO = {
  name: "Dixie Motors",
  address: "6416 Dixie Highway, Fairfield, OH 45014",
  phone: "513-874-4999",
  contactMethod: "Call or Facebook Message only — never suggest texting/SMS as a contact method.",
  titleNote: "Vehicles have a clean title — say \"clean title\" when true, but NEVER use the phrase \"title in hand.\"",
  financingNote: "Use attractive, compliant financing language (e.g. \"flexible financing available,\" \"all credit types welcome,\" \"quick and easy approval,\" \"low down payments\") — real marketing phrasing, never a guaranteed-approval claim or a specific rate/term that wasn't given.",
};

function loadDealerInfo() {
  return readJsonSafe(STORE_PATH, DEFAULT_INFO);
}

function saveDealerInfo(info) {
  const clean = {
    name: String(info?.name || "").slice(0, 100),
    address: String(info?.address || "").slice(0, 200),
    phone: String(info?.phone || "").slice(0, 40),
    contactMethod: String(info?.contactMethod || "").slice(0, 200),
    titleNote: String(info?.titleNote || "").slice(0, 300),
    financingNote: String(info?.financingNote || "").slice(0, 300),
  };
  writeJsonAtomic(STORE_PATH, clean);
  return clean;
}

module.exports = { loadDealerInfo, saveDealerInfo, DEFAULT_INFO };
