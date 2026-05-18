const fs = require("node:fs");
const path = require("node:path");
const { writeJson, readRequestBody } = require("../utils");

const PLAN_FILE = path.join(__dirname, "../../data/daily-plan.json");

function loadPlan() {
  try {
    if (!fs.existsSync(PLAN_FILE)) return { text: "", updatedAt: null };
    return JSON.parse(fs.readFileSync(PLAN_FILE, "utf8"));
  } catch {
    return { text: "", updatedAt: null };
  }
}

function savePlan(text) {
  const dir = path.dirname(PLAN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = { text, updatedAt: new Date().toISOString() };
  fs.writeFileSync(PLAN_FILE, JSON.stringify(data, null, 2), "utf8");
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
