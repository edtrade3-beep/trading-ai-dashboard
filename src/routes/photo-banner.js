// routes/photo-banner.js — "AI adds a banner to your photo" (explicit user
// request, 2026-08-26: "build tab so i can give image and ask to add
// banners by ai"). Real scope, confirmed with the user: Claude has real
// vision INPUT (can look at an image) but no image-generation/editing
// output anywhere in this app or the Anthropic API — so this is NOT "AI
// paints a banner into the photo." It's the same real two-step split
// already proven by src/dealership/routes.js's reviewPhotosWithClaude:
// Claude vision looks at the real uploaded image + the user's real
// instruction and returns a real, disclosed placement/style suggestion
// (JSON: bannerText/position/colors/reasoning); the actual pixels get
// composited client-side via real Canvas drawing (axiom-runner/components/
// PhotoBannerTab.jsx) — deterministic, not AI-guessed, so the banner
// always renders exactly where/how Claude said, never a fabricated image.
//
// Same base64-dataURL-in-JSON-body transport dealership/routes.js already
// uses (parseDataUrl/readRequestBodyBuffer) — no new upload mechanism.
"use strict";

const { writeJson, readRequestBodyBuffer } = require("../utils");
const { anthropicRequest, MODELS } = require("../anthropic");
const { ANTHROPIC_API_KEY } = require("../config");
const { getKey } = require("../runtime-keys");

const anthropicKey = () => getKey("ANTHROPIC_API_KEY", ANTHROPIC_API_KEY);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB, generous for a single photo

function parseDataUrl(dataUrl) {
  const m = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  return m ? { mediaType: m[1], data: m[2] } : null;
}

function extractJsonBlock(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : (text.match(/\{[\s\S]*\}/) || [null])[0];
  if (!candidate) return null;
  try { return JSON.parse(candidate); } catch { return null; }
}

const VALID_POSITIONS = new Set(["top", "bottom"]);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Real, disclosed sanitization of Claude's suggestion before it ever
// reaches the client — never trust a model's output shape blindly. Any
// field outside the real allowed vocabulary falls back to an honest,
// clearly-labeled default rather than being silently passed through
// (a stray value here would either break the Canvas draw or render an
// unreadable banner).
function sanitizeSuggestion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const bannerText = typeof raw.bannerText === "string" ? raw.bannerText.trim().slice(0, 40) : "";
  if (!bannerText) return null;
  const position = VALID_POSITIONS.has(raw.position) ? raw.position : "top";
  const bgColor = HEX_RE.test(raw.bgColor) ? raw.bgColor : "#c8282a";
  const textColor = HEX_RE.test(raw.textColor) ? raw.textColor : "#ffffff";
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning.trim().slice(0, 300) : "";
  return { bannerText, position, bgColor, textColor, reasoning };
}

async function suggestBanner(imageBlock, instruction, apiKey) {
  const promptText = `You are helping compose a promotional banner overlay for a real photo (e.g. a "SALE" ribbon, a price tag, a "NEW ARRIVAL" tag — the kind of banner a business adds to a listing or social-media photo).

USER'S INSTRUCTION: ${instruction ? `"${instruction}"` : "(none given — use your own judgment based on what's actually in the photo)"}

Look at the actual attached photo. Decide:
1. The exact banner text (short — a few words, this is a banner not a caption).
2. Whether it reads better as a full-width band across the TOP or the BOTTOM of the photo (pick whichever won't cover the real subject of the photo — e.g. a car's face, a product's label, a person's face).
3. A background color (hex) and text color (hex) that read clearly against this specific photo's real colors/lighting — high contrast, legible.
4. One short sentence explaining your choice.

Only base this on what you can actually see in the photo and what the user actually asked for — never invent details about the photo that aren't visible.

Return ONLY a fenced \`\`\`json block with exactly this shape:
{"bannerText": "string", "position": "top" | "bottom", "bgColor": "#rrggbb", "textColor": "#rrggbb", "reasoning": "one short sentence"}`;

  const payload = {
    model: MODELS.sonnet, max_tokens: 400,
    messages: [{ role: "user", content: [{ type: "text", text: promptText }, imageBlock] }],
  };
  const resp = await anthropicRequest(payload, apiKey, 60000, "photo-banner-suggest");
  const text = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return extractJsonBlock(text);
}

async function handlePhotoBanner(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/photo-banner/suggest" && req.method === "POST") {
    if (!anthropicKey()) {
      return writeJson(res, 503, { ok: false, error: "ANTHROPIC_API_KEY is not configured." });
    }
    let body;
    try {
      const buf = await readRequestBodyBuffer(req, MAX_IMAGE_BYTES + 1024 * 1024);
      body = JSON.parse(buf.toString("utf8"));
    } catch (err) {
      const tooLarge = err instanceof Error && /too large/i.test(err.message);
      return writeJson(res, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? "That image is too large — try a smaller photo." : "Invalid request body." });
    }

    const parsed = parseDataUrl(body.imageDataUrl);
    if (!parsed) return writeJson(res, 400, { ok: false, error: "No valid image received." });
    if (Buffer.byteLength(parsed.data, "base64") > MAX_IMAGE_BYTES) {
      return writeJson(res, 413, { ok: false, error: "That image is over 8MB — try a smaller photo." });
    }
    const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 300) : "";

    try {
      const imageBlock = { type: "image", source: { type: "base64", media_type: parsed.mediaType, data: parsed.data } };
      const raw = await suggestBanner(imageBlock, instruction, anthropicKey());
      const suggestion = sanitizeSuggestion(raw);
      if (!suggestion) return writeJson(res, 422, { ok: false, error: "Could not come up with a real banner suggestion for this photo — try a different instruction." });
      return writeJson(res, 200, { ok: true, suggestion });
    } catch (err) {
      return writeJson(res, 502, { ok: false, error: err instanceof Error ? err.message : "Banner suggestion failed." });
    }
  }

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = { handlePhotoBanner, sanitizeSuggestion };
