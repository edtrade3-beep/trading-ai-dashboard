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
// OpenAI's own current API docs (verified live via fetched docs,
// 2026-09-07). Real bug found and fixed before ever being tried: the
// original default size "1024x1792" is a DALL-E-3 size value, NOT valid
// for gpt-image-1 (the model this actually calls) — gpt-image-1 only
// accepts "1024x1024", "1536x1024", "1024x1536", or "auto", so the old
// default would have failed with a real 400 on the very first attempt.
// "1024x1536" (2:3 portrait) is the closest real supported size to this
// app's 9:16 target — there's no exact 9:16-native size for this model,
// an honest, disclosed compromise, not a silent inaccuracy. response_format
// is deliberately omitted: per OpenAI's own docs it's DALL-E-only — GPT
// image models always return base64 (the real b64_json field below)
// without it.
async function generateWithOpenAi(prompt, { size = "1024x1536" } = {}) {
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

const REPLICATE_POLL_INTERVAL_MS = 2000;
const REPLICATE_MAX_POLL_ATTEMPTS = 30; // ~60s of extra polling on top of the initial wait

// Real bug found and fixed live (2026-09-07, via a direct curl test run
// against the real API while diagnosing a user report): "Prefer: wait" is
// NOT a guarantee of a finished result — Replicate itself only waits up
// to its own server-side cap (observed: the real test call returned
// HTTP 202 status:"processing" after that window elapsed, error:null, no
// credit/auth problem at all). The original code treated any non-
// "succeeded" status as a hard failure ("did not complete in time"),
// which would incorrectly fail perfectly healthy generations that simply
// took a little longer than Replicate's own initial wait window —
// exactly what the live test reproduced. Real fix: poll the prediction's
// own real status URL (returned in the initial response) until it
// actually finishes, succeeds, or fails, instead of giving up at the
// first non-terminal status.
async function pollReplicatePrediction(getUrl) {
  for (let i = 0; i < REPLICATE_MAX_POLL_ATTEMPTS; i++) {
    await new Promise((resolve) => setTimeout(resolve, REPLICATE_POLL_INTERVAL_MS));
    const res = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || `Replicate API error while polling (${res.status})`);
    if (data.status === "succeeded") return data;
    if (data.status === "failed" || data.status === "canceled") throw new Error(data.error || `Replicate prediction ${data.status}.`);
    // still "starting"/"processing" — keep polling
  }
  throw new Error("Replicate prediction did not finish within the real polling window.");
}

// Real request shape per Replicate's own current documented API (verified
// live via fetched docs, 2026-09-07 — the original version of this
// function had two real bugs found that way before ever being tried
// against a live account: (1) Authorization used "Token", Replicate's own
// current docs show "Bearer"; (2) POSTing to /v1/predictions with
// version:"owner/model" (no hash) is genuinely ambiguous per Replicate's
// own docs — the documented "official models" endpoint below
// (/v1/models/{owner}/{model}/predictions) is the unambiguous, version-
// hash-free way to call a well-known public model by name). Still sends
// "Prefer: wait" as a real optimization (often returns already-succeeded
// for a fast model like Flux "schnell"), but now falls back to real
// polling (above) rather than assuming that header guarantees completion.
// Downloads the real resulting image and returns it as base64 so this
// provider matches OpenAI's own {b64} shape — the job runner
// (story-ai-job-runner.js) stays provider-agnostic rather than branching
// on which image provider produced the result.
async function generateWithReplicate(prompt) {
  const res = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${REPLICATE_API_TOKEN}`, Prefer: "wait" },
    body: JSON.stringify({ input: { prompt, aspect_ratio: "9:16", output_format: "png" } }),
    signal: AbortSignal.timeout(60000),
  });
  let data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `Replicate API error (${res.status})`);
  if (data.status === "failed" || data.status === "canceled") throw new Error(data.error || `Replicate prediction ${data.status}.`);
  if (data.status !== "succeeded") {
    const getUrl = data?.urls?.get;
    if (!getUrl) throw new Error(`Replicate prediction is still ${data.status || "processing"} and returned no status URL to poll.`);
    data = await pollReplicatePrediction(getUrl);
  }
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
