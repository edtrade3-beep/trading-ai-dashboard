const { writeJson } = require("../utils");
const { isConfigured: telegramConfigured } = require("../telegram");

async function handleHealth(req, res) {
  return writeJson(res, 200, { ok: true, version: "market-v2", telegram: telegramConfigured() });
}

module.exports = handleHealth;
