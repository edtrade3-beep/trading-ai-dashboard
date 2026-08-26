// routes/photo-banner.js — "AI adds a banner to your photo" (explicit user
// request, 2026-08-26: "build tab so i can give image and ask to add
// banners by ai"). Real scope, confirmed with the user: Claude has real
// vision INPUT (can look at an image) but no image-generation/editing
// output anywhere in this app or the Anthropic API — so this is NOT "AI
// paints a banner into the photo." It's the same real two-step split
// already proven by src/dealership/routes.js's reviewPhotosWithClaude:
// Claude vision looks at the real uploaded image + the user's real
// instruction and returns a real, disclosed placement/style suggestion
// (JSON: titleText/badges[]/position/colors/reasoning — a title + up to
// MAX_BADGES icon/label/sublabel badges, matching a real dealership-style
// banner bar); the actual pixels get composited client-side via real
// Canvas drawing (axiom-runner/components/PhotoBannerTab.jsx) —
// deterministic, not AI-guessed, so the banner always renders exactly
// where/how Claude said, never a fabricated image.
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

// Position locked to the top only (explicit user request, 2026-08-26:
// "make sure banner always in top") — enforced here at the real
// validation layer, not just asked for in the prompt, so it holds even if
// Claude's raw output ever suggested otherwise.
const VALID_POSITIONS = new Set(["top"]);
const VALID_FONTS = new Set(["Arial", "Helvetica Neue", "Georgia", "Impact", "Trebuchet MS", "Verdana", "Futura"]);
const VALID_BADGE_SHAPES = new Set(["circle", "square"]);
const VALID_LAYOUTS = new Set(["bar", "ribbon"]);
const VALID_CORNERS = new Set(["top-left", "top-right"]);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_BADGES = 4;

// Real, disclosed sanitization of Claude's suggestion before it ever
// reaches the client — never trust a model's output shape blindly. Any
// field outside the real allowed vocabulary falls back to an honest,
// clearly-labeled default rather than being silently passed through
// (a stray value here would either break the Canvas draw or render an
// unreadable banner).
//
// Schema upgraded 2026-08-26 (explicit user follow-up, showed a real
// dealership listing-photo example: a dark top bar with a title + several
// icon badges like "✅ ONE OWNER" / "71K MILES ONLY") from a single plain
// text line to a real title + up to MAX_BADGES icon/label/sublabel badges,
// matching that reference layout. A vehicle brand LOGO is never fabricated
// (no real logo asset exists in this app, and reproducing a trademarked
// logo isn't something to invent) — the title is real styled TEXT instead.
//
// Upgraded again 2026-08-26 (explicit user follow-up pasting a full
// generative-image-editing-style brief — "vary shape/gradient/border/
// typography/badge style," "make the strongest selling point visually
// prominent"). Confirmed with the user: this app has no image-generation
// API (Claude vision input only), so the real, honest answer is to widen
// what the deterministic Canvas renderer can express — real gradient
// fills, a real curated font-family whitelist (only names broadly
// available as system fonts, since Canvas can't load an arbitrary
// webfont here), a real badge-shape choice, and a real single "primary"
// badge (rendered larger) for genuine typographic hierarchy — while
// keeping every value validated against a real allowed set, same as before.
function sanitizeSuggestion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const titleText = typeof raw.titleText === "string" ? raw.titleText.trim().slice(0, 30) : "";
  const rawBadges = Array.isArray(raw.badges) ? raw.badges : [];
  let primaryTaken = false;
  const badges = rawBadges.slice(0, MAX_BADGES).map((b) => {
    if (!b || typeof b !== "object") return null;
    const label = typeof b.label === "string" ? b.label.trim().slice(0, 16) : "";
    if (!label) return null;
    const icon = typeof b.icon === "string" && b.icon.trim() ? b.icon.trim().slice(0, 4) : "•";
    const sublabel = typeof b.sublabel === "string" ? b.sublabel.trim().slice(0, 16) : "";
    const primary = !primaryTaken && b.primary === true; // only the FIRST real primary claim wins — one clear hierarchy, not several competing "biggest" badges
    if (primary) primaryTaken = true;
    return { icon, label, sublabel, primary };
  }).filter(Boolean);
  if (!titleText && !badges.length) return null; // nothing real to render

  const position = VALID_POSITIONS.has(raw.position) ? raw.position : "top";
  const gradient = raw.gradient === true;
  const bgColor = HEX_RE.test(raw.bgColor) ? raw.bgColor : "#12203a";
  const bgColor2 = gradient && HEX_RE.test(raw.bgColor2) ? raw.bgColor2 : bgColor;
  const textColor = HEX_RE.test(raw.textColor) ? raw.textColor : "#ffffff";
  const accentColor = HEX_RE.test(raw.accentColor) ? raw.accentColor : "#2563eb";
  const fontFamily = VALID_FONTS.has(raw.fontFamily) ? raw.fontFamily : "Arial";
  const badgeShape = VALID_BADGE_SHAPES.has(raw.badgeShape) ? raw.badgeShape : "circle";
  const layout = VALID_LAYOUTS.has(raw.layout) ? raw.layout : "bar";
  const corner = VALID_CORNERS.has(raw.corner) ? raw.corner : "top-right";
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning.trim().slice(0, 300) : "";
  return { titleText, badges, position, layout, corner, gradient, bgColor, bgColor2, textColor, accentColor, fontFamily, badgeShape, reasoning };
}

async function suggestBanner(imageBlock, instruction, apiKey) {
  const promptText = `You are a professional automotive dealership graphic designer composing a real promotional banner OVERLAY for a photo. This is drawn on top of the real photo — the photo itself is never altered, regenerated, or touched in any way, only this overlay is added.

USER'S INSTRUCTION: ${instruction ? `"${instruction}"` : "(none given — use your own judgment based on what's actually in the photo)"}

Look at the actual attached photo and design a UNIQUE banner for THIS specific photo (don't reuse the same template every time). Decide:

1. LAYOUT SHAPE — pick whichever genuinely suits this photo:
   - "bar": a full-width bar ACROSS THE TOP of the photo with a title and a few short icon badges — use this when you have multiple real claims to show (e.g. one-owner + mileage + clean title).
   - "ribbon": a classic diagonal ribbon draped across a TOP corner, showing just ONE short punchy phrase (put it in titleText, e.g. "SALE" or "ONE OWNER") — use this when there's really just one strong claim, or when the photo's negative space suits a corner accent better than a full bar.
   Vary this choice across different photos — don't always pick the same one. The banner always goes at the TOP of the photo — never the bottom.
2. TITLE: a short title/phrase (vehicle name, or the single ribbon phrase if layout is "ribbon"). Empty ("") if nothing real to title.
3. BADGES (only rendered when layout is "bar"): up to ${MAX_BADGES} — each a short real claim the user actually asked for or that's genuinely visible/reasonable. Each badge = one real matching emoji icon, a short bold label (a couple words or a number), an optional smaller sublabel (e.g. label "71K", sublabel "MILES ONLY"), and "primary": true on the ONE badge that's the strongest real selling point (it will render larger — pick at most one). Never invent a claim the user didn't ask for and isn't visibly true.
4. POSITION/CORNER: if layout is "bar", the position field is always "top". If layout is "ribbon", pick a corner field: "top-left" or "top-right" — whichever won't cover the vehicle's grille, headlights, wheels, badges, or other identifying features. Use the real negative space in the photo.
5. COLORS — think like a real designer, and be BOLD:
   a. Identify the real dominant color(s) of the photo's subject (e.g. "dark gray car," "white car," "red car").
   b. Choose bgColor/textColor/accentColor that genuinely CONTRAST with that real color — never near-black on a dark subject, never near-white on a light subject.
   c. Optionally set "gradient": true with a real bgColor2 for a two-color gradient background for a premium look — use this when it would look genuinely better than a flat fill, not automatically every time.
   d. GO BEYOND navy-and-white and black-and-white — those should be the exception, not the default. Reach for real, vivid, saturated color families and genuinely rotate between them across different photos: deep red/crimson, gold/amber, emerald/teal, royal purple, burnt orange, electric blue, hot pink — whatever real color theory says will pop hardest against THIS specific photo's actual colors. A muted/dark-neutral banner should only happen when it's genuinely the best real choice for that photo, never as a safe fallback.
6. TYPOGRAPHY: pick ONE fontFamily from exactly this real list (pick whichever mood fits the vehicle — Impact/Futura read bold and sporty, Georgia reads premium/luxury, Arial/Helvetica Neue/Trebuchet MS/Verdana read clean and modern): ${[...VALID_FONTS].join(", ")}.
7. BADGE SHAPE: "circle" or "square" (rounded-square reads more modern/premium on some photos, circle is more classic — pick whichever fits; irrelevant for "ribbon" layout).
8. One short sentence explaining your real choices (dominant color identified, why the palette contrasts, why this layout/font/shape fits this vehicle's character).

Only base this on what you can actually see in the photo and what the user actually asked for — never invent details about the photo, and never fabricate a brand logo (use real styled text for any title instead, never claim to reproduce a logo).

Return ONLY a fenced \`\`\`json block with exactly this shape:
{"titleText": "string (can be empty)", "badges": [{"icon": "emoji", "label": "string", "sublabel": "string (can be empty)", "primary": true or false}], "layout": "bar" | "ribbon", "position": "top", "corner": "top-left" | "top-right", "gradient": true or false, "bgColor": "#rrggbb", "bgColor2": "#rrggbb (only meaningful if gradient is true)", "textColor": "#rrggbb", "accentColor": "#rrggbb", "fontFamily": "one of the exact list above", "badgeShape": "circle" | "square", "reasoning": "one short sentence"}`;

  const payload = {
    model: MODELS.sonnet, max_tokens: 700,
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

module.exports = { handlePhotoBanner, sanitizeSuggestion, MAX_BADGES, VALID_FONTS, VALID_BADGE_SHAPES, VALID_LAYOUTS, VALID_CORNERS };
