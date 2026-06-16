const https = require("node:https");

function callAnthropicApi(prompt, apiKey, { model = "claude-sonnet-4-6", maxTokens = 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message || "Anthropic API error"));
          resolve(parsed.content?.[0]?.text || "");
        } catch {
          reject(new Error("Failed to parse Anthropic response"));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(new Error("Anthropic API timeout")); });
    req.write(body);
    req.end();
  });
}

// Low-level request that returns the full parsed response (for tool-use flows).
function anthropicRequest(payload, apiKey, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
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

module.exports = { callAnthropicApi, callAnthropicWithSearch };
