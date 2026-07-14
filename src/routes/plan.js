const path = require("node:path");
const { writeJson, readRequestBody } = require("../utils");
const { writeJsonAtomic, readJsonSafe } = require("../atomic-write");

const PLAN_FILE = path.join(__dirname, "../../data/daily-plan.json");

function loadPlan() {
  return readJsonSafe(PLAN_FILE, { text: "", updatedAt: null });
}

function savePlan(text) {
  const data = { text, updatedAt: new Date().toISOString() };
  writeJsonAtomic(PLAN_FILE, data);
  return data;
}

async function handlePlan(req, res) {
  if (req.method === "GET") {
    return writeJson(res, 200, loadPlan());
  }
  if (req.method === "POST") {
    const raw = await readRequestBody(req);
    const body = JSON.parse(raw || "{}");
    const text = typeof body.text === "string" ? body.text.slice(0, 4000) : "";
    const saved = savePlan(text);
    return writeJson(res, 200, { ok: true, ...saved });
  }
  return writeJson(res, 405, { error: "Method not allowed" });
}

module.exports = handlePlan;
