const { writeJson } = require("../utils");
const { isConfigured: telegramConfigured } = require("../telegram");

// Server boot time — changes on every deploy/restart. The frontend polls this to auto-reload after a deploy.
const STARTED_AT = new Date().toISOString();

async function handleHealth(req, res) {
  return writeJson(res, 200, { ok: true, version: "market-v2", startedAt: STARTED_AT, telegram: telegramConfigured() });
}

module.exports = handleHealth;
