const { writeJson } = require("../utils");

async function handleHealth(req, res) {
  return writeJson(res, 200, { ok: true, version: "market-v2" });
}

module.exports = handleHealth;
