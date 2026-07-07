const https = require("node:https");

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
function callAnthropicApi(prompt, apiKey, { model = MODELS.sonnet, maxTokens = 1024, system = null, cache = false, timeout = 30000, effort = null } = {}) {
  const payload = { model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] };
  // effort (GA): low = faster/cheaper thinking, high = deeper. Cuts latency a lot.
  if (effort) payload.output_config = { effort };
  if (system) {
    payload.system = cache
      ? [{ type: "text", text: String(system), cache_control: { type: "ephemeral" } }]
      : String(system);
  }
  return anthropicRequest(payload, apiKey, timeout).then(p => (p.content || []).filter(b => b.type === "text").map(b => b.text).join("") || "");
}

// Low-level request that returns the full parsed response (for tool-use flows).
function anthropicRequest(payload, apiKey, timeoutMs = 120000) {
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

// Calls Claude with the built-in web_search tool so it can find live data on its own.
// Returns the concatenated final text. Handles pause_turn (long multi-search turns).
async function callAnthropicWithSearch(prompt, apiKey, { model = "claude-sonnet-4-6", maxTokens = 6000, maxSearches = 8 } = {}) {
  const messages = [{ role: "user", content: prompt }];
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }];
  let finalText = "";
  for (let i = 0; i < 4; i++) {
    const resp = await anthropicRequest({ model, max_tokens: maxTokens, messages, tools }, apiKey);
    const content = resp.content || [];
    const text = content.filter(b => b.type === "text").map(b => b.text).join("");
    if (text) finalText = text;
    if (resp.stop_reason === "pause_turn") { messages.push({ role: "assistant", content }); continue; }
    break;
  }
  return finalText;
}

module.exports = { callAnthropicApi, callAnthropicWithSearch, anthropicRequest, MODELS };
