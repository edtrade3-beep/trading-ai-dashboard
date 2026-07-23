const https = require("node:https");
const { logUsage, checkBudgetWarnings } = require("./anthropic-usage-store");
const { checkAndUpdateMode } = require("./credit-saver-mode");

// Pick the cheapest model that fits the task — Haiku is 5× cheaper than Opus.
const MODELS = {
  haiku: "claude-haiku-4-5",     // $1 / $5   — classification, extraction, short replies
  sonnet: "claude-sonnet-4-6",   // $3 / $15  — most analysis & summaries
  opus: "claude-opus-4-8",       // $5 / $25  — only the hardest reasoning
  fable: "claude-fable-5",       // $10 / $50 — top-tier reasoning; use sparingly (weekly/on-demand)
};

// callAnthropicApi(prompt, key, { model, maxTokens, system, cache })
// - system: a stable instruction block; pass it once and reuse it across calls.
// - cache: true → mark the system block cache_control:ephemeral so repeated calls
//   read it at ~10% of input price (big savings when the same instructions repeat).
function callAnthropicApi(prompt, apiKey, { model = MODELS.sonnet, maxTokens = 1024, system = null, cache = false, timeout = 30000, effort = null, feature = "unclassified" } = {}) {
  const payload = { model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] };
  // effort (GA): low = faster/cheaper thinking, high = deeper. Cuts latency a lot.
  if (effort) payload.output_config = { effort };
  if (system) {
    payload.system = cache
      ? [{ type: "text", text: String(system), cache_control: { type: "ephemeral" } }]
      : String(system);
  }
  return anthropicRequest(payload, apiKey, timeout, feature).then(p => (p.content || []).filter(b => b.type === "text").map(b => b.text).join("") || "");
}

// Real credit-tracking hook — every real Anthropic response already
// contains usage.{input_tokens,output_tokens,cache_*} and, for web-search
// tool turns, a server-side tool-use count; both were previously resolved
// into the response object and then silently discarded (confirmed via a
// full research pass before this was added — zero token/cost tracking
// existed anywhere in this codebase). This logs the real number from the
// real response, never an estimate. Wrapped so a logging failure can never
// break the actual AI call it's piggybacking on.
function logRealUsage(payload, parsed, feature) {
  try {
    if (!parsed || !parsed.usage) return;
    const webSearchCount = Number(parsed.usage?.server_tool_use?.web_search_requests) || 0;
    logUsage({ feature, model: payload.model, usage: parsed.usage, webSearchCount });
    checkAndUpdateMode();
    // Threshold warnings (50/75/90/95% of budget) — routed through the
    // existing telegram-bot.js alert gate, not a new dedup system. Required
    // lazily here (not top-level) purely to keep anthropic.js's own require
    // graph minimal for a chokepoint every AI call in the app passes
    // through — no circular-require risk either way (confirmed: neither
    // telegram.js nor telegram-bot.js requires anthropic.js).
    const warning = checkBudgetWarnings();
    if (warning) {
      const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
      const { shouldSendAlert } = require("./telegram-bot");
      if (telegramConfigured() && shouldSendAlert({ category: "budget-warning" })) {
        sendTelegramMessage(`💳 *ANTHROPIC BUDGET* — ${warning.pctUsed}% of $25 used this month (crossed the ${warning.newThreshold}% mark).`).catch(() => {});
      }
    }
  } catch { /* never let usage logging break a real AI call */ }
}

// Low-level single-attempt request — the actual HTTP call, one key, no retry.
function anthropicRequestOnce(payload, apiKey, timeoutMs = 120000, feature = "unclassified") {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    // Detect prompt caching to send the right beta header.
    const usesCache = Array.isArray(payload.system) && payload.system.some(b => b && b.cache_control);
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
    if (usesCache) headers["anthropic-beta"] = "prompt-caching-2024-07-31";
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers,
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message || "Anthropic API error"));
          logRealUsage(payload, parsed, feature);
          resolve(parsed);
        } catch { reject(new Error("Failed to parse Anthropic response")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error("Anthropic API timeout")); });
    req.write(body);
    req.end();
  });
}

// Real usage-cap hit live in production: "You have reached your specified
// API usage limits. You will regain access on 2026-08-01 at 00:00 UTC." —
// an account-level quota/rate error, not a code bug, so a normal retry on
// the same key can't help. If a second key is configured
// (ANTHROPIC_API_KEY_FALLBACK), retry once on that key instead of failing
// every AI feature in the app until the primary key's limit resets.
const USAGE_LIMIT_RE = /usage limit|rate.?limit|quota|credit balance/i;
async function anthropicRequest(payload, apiKey, timeoutMs = 120000, feature = "unclassified") {
  try {
    return await anthropicRequestOnce(payload, apiKey, timeoutMs, feature);
  } catch (err) {
    const fallbackKey = (process.env.ANTHROPIC_API_KEY_FALLBACK || "").trim();
    if (fallbackKey && fallbackKey !== apiKey && USAGE_LIMIT_RE.test(err.message)) {
      return anthropicRequestOnce(payload, fallbackKey, timeoutMs, feature);
    }
    throw err;
  }
}

// Calls Claude with the built-in web_search tool so it can find live data on its own.
// Returns the concatenated final text. Handles pause_turn (long multi-search turns).
async function callAnthropicWithSearch(prompt, apiKey, { model = "claude-sonnet-4-6", maxTokens = 6000, maxSearches = 8, timeout = 120000, feature = "unclassified" } = {}) {
  const messages = [{ role: "user", content: prompt }];
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }];
  let finalText = "";
  for (let i = 0; i < 4; i++) {
    const resp = await anthropicRequest({ model, max_tokens: maxTokens, messages, tools }, apiKey, timeout, feature);
    const content = resp.content || [];
    const text = content.filter(b => b.type === "text").map(b => b.text).join("");
    if (text) finalText = text;
    if (resp.stop_reason === "pause_turn") { messages.push({ role: "assistant", content }); continue; }
    break;
  }
  return finalText;
}

module.exports = { callAnthropicApi, callAnthropicWithSearch, anthropicRequest, MODELS };
