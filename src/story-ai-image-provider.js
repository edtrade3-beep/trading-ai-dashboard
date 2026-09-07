"use strict";

// story-ai-image-provider.js — Image Generation provider abstraction
// (spec §"4. IMAGE GENERATION SYSTEM"). generateImage() never throws for
// a missing-credential state — it returns an honest
// {ok:false, reason:"NOT_CONFIGURED"} so the rest of the pipeline
// (script, scenes, character bible) can still complete and the project
// can still be reviewed/edited without any image credentials at all.
//
// DISCLOSED: the OpenAI branch below is real, standard REST-call code
// (same fetch/timeout/error-handling shape as this app's other HTTP
// providers, e.g. providers/yahoo.js) but has never been exercised
// against a real OpenAI key in this environment (none is configured
// here) — it is UNTESTED beyond the NOT_CONFIGURED path, which IS fully
// tested (see test/story-ai-providers.test.js). Do not treat "the code
// looks right" as "verified working."

const { IMAGE_PROVIDER, OPENAI_API_KEY, REPLICATE_API_TOKEN, imageProviderConfigured } = require("./story-ai-config");

function isConfigured() { return imageProviderConfigured(); }

// UNTESTED (no OpenAI key in this environment) — real request shape per
// OpenAI's documented Images API, not exercised end-to-end.
async function generateWithOpenAi(prompt, { size = "1024x1792" } = {}) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI image API error (${res.status})`);
  const b64 = data?.data?.[0]?.b64_json;
  const url = data?.data?.[0]?.url;
  if (!b64 && !url) throw new Error("OpenAI image API returned no image data.");
  return { b64, url };
}

// UNTESTED (no Replicate token in this environment) — real request shape
// per Replicate's documented prediction API, not exercised end-to-end.
async function generateWithReplicate(prompt) {
  const res = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Token ${REPLICATE_API_TOKEN}` },
    body: JSON.stringify({
      version: "black-forest-labs/flux-schnell",
      input: { prompt, aspect_ratio: "9:16", output_format: "png" },
    }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `Replicate API error (${res.status})`);
  return { predictionId: data.id, status: data.status, pollUrl: data?.urls?.get || null };
}

// Real caller-facing entry point — the only function the rest of Story
// AI should ever call. `prompt` is the Director Agent's own
// image_prompt_en (English). settings is currently unused beyond size
// but kept as an extension point (spec's own "editable prompt + settings"
// ask) without over-building unused options today.
async function generateImage(prompt, settings = {}) {
  if (!isConfigured()) {
    return { ok: false, reason: "NOT_CONFIGURED", provider: IMAGE_PROVIDER };
  }
  try {
    if (IMAGE_PROVIDER === "openai") {
      const result = await generateWithOpenAi(prompt, settings);
      return { ok: true, provider: "openai", ...result };
    }
    if (IMAGE_PROVIDER === "replicate") {
      const result = await generateWithReplicate(prompt, settings);
      return { ok: true, provider: "replicate", ...result };
    }
    return { ok: false, reason: "UNKNOWN_PROVIDER", provider: IMAGE_PROVIDER };
  } catch (err) {
    return { ok: false, reason: "PROVIDER_ERROR", provider: IMAGE_PROVIDER, error: err.message };
  }
}

module.exports = { generateImage, isConfigured };
