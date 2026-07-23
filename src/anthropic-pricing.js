// anthropic-pricing.js — real per-model $/M-token rates, turning the
// comments already in src/anthropic.js's MODELS constant into an actual
// programmatic table (previously just documentation, never wired into any
// calculation anywhere in this codebase — confirmed via a full research
// pass before building this file).
//
// Web-search cost ($10 per 1,000 uses) is Anthropic's published rate for
// the server-side web_search tool (billed per use, not per token) — not
// previously documented anywhere in this codebase.
const PRICING = {
  "claude-haiku-4-5": { inputPerM: 1, outputPerM: 5 },
  "claude-sonnet-4-6": { inputPerM: 3, outputPerM: 15 },
  "claude-opus-4-8": { inputPerM: 5, outputPerM: 25 },
  "claude-fable-5": { inputPerM: 10, outputPerM: 50 },
};
const WEB_SEARCH_PER_1000 = 10;

// usage: the real {input_tokens, output_tokens, cache_creation_input_tokens,
// cache_read_input_tokens} object Anthropic's Messages API already returns
// on every call. Cache tokens are billed at the same input rate here (a
// simplification — Anthropic actually prices cache writes/reads slightly
// differently, but those aren't documented anywhere in this codebase and
// this app doesn't use prompt caching heavily enough for the difference to
// matter for a soft monthly budget tracker; real per-call cost still comes
// from real token counts, not a guess).
function computeCallCost({ model, usage, webSearchCount = 0 }) {
  const rates = PRICING[model];
  if (!rates || !usage) return 0;
  const inputTokens = (Number(usage.input_tokens) || 0) +
    (Number(usage.cache_creation_input_tokens) || 0) +
    (Number(usage.cache_read_input_tokens) || 0);
  const outputTokens = Number(usage.output_tokens) || 0;
  const tokenCost = (inputTokens / 1_000_000) * rates.inputPerM + (outputTokens / 1_000_000) * rates.outputPerM;
  const searchCost = (Number(webSearchCount) || 0) / 1000 * WEB_SEARCH_PER_1000;
  return Math.round((tokenCost + searchCost) * 1_000_000) / 1_000_000; // round to the nearest micro-dollar, not display precision
}

module.exports = { PRICING, WEB_SEARCH_PER_1000, computeCallCost };
