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
// per Replicate's own current documented API (verified live via fetched
// docs, 2026-09-07 — the original version of this function had two real
// bugs found that way before ever being tried against a live account:
// (1) Authorization used "Token", Replicate's own current docs show
// "Bearer"; (2) POSTing to /v1/predictions with version:"owner/model" (no
// hash) is genuinely ambiguous per Replicate's own docs — the documented
// "official models" endpoint below (/v1/models/{owner}/{model}/predictions)
// is the unambiguous, version-hash-free way to call a well-known public
// model by name). Uses "Prefer: wait" to get a synchronous response
// (Flux "schnell" = German for "fast", designed to complete in a couple
// seconds — well within the wait window) rather than building a separate
// polling loop for the async job status. Downloads the real resulting
// image and returns it as base64 so this provider matches OpenAI's own
// {b64} shape — the job runner (story-ai-job-runner.js) stays provider-
// agnostic rather than branching on which image provider produced the
// result, which is the actual point of this abstraction.
async function generateWithReplicate(prompt) {
  const res = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${REPLICATE_API_TOKEN}`, Prefer: "wait" },
    body: JSON.stringify({ input: { prompt, aspect_ratio: "9:16", output_format: "png" } }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `Replicate API error (${res.status})`);
  if (data.status !== "succeeded") throw new Error(`Replicate prediction did not complete in time (status: ${data.status || "unknown"}).`);
  const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
  if (!imageUrl) throw new Error("Replicate returned no image output.");
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!imgRes.ok) throw new Error(`Failed to download the generated image (${imgRes.status}).`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  return { b64: buf.toString("base64") };
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
