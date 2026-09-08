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
// providers, e.g. providers/yahoo.js). First real run against a real
// OPENAI_API_KEY (2026-09-08) found and fixed a real bug (the 60s
// timeout was too tight for gpt-image-1's real generation latency — see
// generateWithOpenAi's own comment) — do not treat "the code looks
// right" as "verified working" for anything not yet actually exercised
// against a live key, this file's own history included.

const { IMAGE_PROVIDER, OPENAI_API_KEY, REPLICATE_API_TOKEN, imageProviderConfigured } = require("./story-ai-config");

function isConfigured() { return imageProviderConfigured(); }

// Real bug found live (2026-09-08, first real run against a real
// OPENAI_API_KEY once the user configured one on Render): every scene
// image failed with "PROVIDER_ERROR: The operation was aborted due to
// timeout" — gpt-image-1 genuinely, routinely takes longer than 60s to
// generate a single image at its default ("auto") quality, especially
// with 4 real requests running concurrently (IMAGE_VOICE_CONCURRENCY,
// story-ai-job-runner.js) all competing for the same real account rate
// limit. 60s was a guess made before this was ever exercised against a
// real key (see this file's own now-outdated "UNTESTED" framing below,
// left in place as the honest history of what was/wasn't verified before
// today); real observed gpt-image-1 latency runs from well under a
// minute up past two, so 60s was simply too tight. Raised to a real 3
// minutes — generous enough to cover the real distribution without
// masking an actually-hung request forever.
//
// Real request shape per OpenAI's own current API docs (verified live
// via fetched docs, 2026-09-07). Real bug found and fixed before ever
// being tried: the original default size "1024x1792" is a DALL-E-3 size
// value, NOT valid for gpt-image-1 (the model this actually calls) —
// gpt-image-1 only accepts "1024x1024", "1536x1024", "1024x1536", or
// "auto", so the old default would have failed with a real 400 on the
// very first attempt. "1024x1536" (2:3 portrait) is the closest real
// supported size to this app's 9:16 target — there's no exact 9:16-
// native size for this model, an honest, disclosed compromise, not a
// silent inaccuracy. response_format is deliberately omitted: per
// OpenAI's own docs it's DALL-E-only — GPT image models always return
// base64 (the real b64_json field below) without it.
const OPENAI_IMAGE_TIMEOUT_MS = 180_000;
async function generateWithOpenAi(prompt, { size = "1024x1536" } = {}) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
    signal: AbortSignal.timeout(OPENAI_IMAGE_TIMEOUT_MS),
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
//
// Real bug found live (2026-09-08, first real run against a real
// REPLICATE_API_TOKEN once the user switched off OpenAI over cost):
// every scene failed with "PROVIDER_ERROR: The operation was aborted
// due to timeout" — same real bug class as gpt-image-1's own earlier
// 60s-was-too-tight fix. "Prefer: wait" (no explicit seconds value) can
// hold the real HTTP connection open up to Replicate's own real max wait
// window (documented up to 60s) — right at this function's own 60s
// AbortSignal, a real race under any added network latency, and Flux
// "schnell" (despite the name) can genuinely cold-start slower than that
// the first time a model isn't already warm, especially with 4 real
// concurrent requests (IMAGE_VOICE_CONCURRENCY) competing for the same
// real account. Raised the initial-request timeout well past
// Replicate's own real wait cap, and gave the polling/download requests
// real breathing room too — the actual generation is still fast once it
// starts; this just stops a slow real cold-start from being treated as a
// hang.
const REPLICATE_INITIAL_TIMEOUT_MS = 120_000;
const REPLICATE_DOWNLOAD_TIMEOUT_MS = 60_000;
async function generateWithReplicate(prompt) {
  const res = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${REPLICATE_API_TOKEN}`, Prefer: "wait" },
    body: JSON.stringify({ input: { prompt, aspect_ratio: "9:16", output_format: "png" } }),
    signal: AbortSignal.timeout(REPLICATE_INITIAL_TIMEOUT_MS),
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
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(REPLICATE_DOWNLOAD_TIMEOUT_MS) });
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
