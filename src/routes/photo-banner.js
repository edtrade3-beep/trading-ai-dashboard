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

const VALID_POSITIONS = new Set(["top", "bottom"]);
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
function sanitizeSuggestion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const titleText = typeof raw.titleText === "string" ? raw.titleText.trim().slice(0, 30) : "";
  const rawBadges = Array.isArray(raw.badges) ? raw.badges : [];
  const badges = rawBadges.slice(0, MAX_BADGES).map((b) => {
    if (!b || typeof b !== "object") return null;
    const label = typeof b.label === "string" ? b.label.trim().slice(0, 16) : "";
    if (!label) return null;
    const icon = typeof b.icon === "string" && b.icon.trim() ? b.icon.trim().slice(0, 4) : "•";
    const sublabel = typeof b.sublabel === "string" ? b.sublabel.trim().slice(0, 16) : "";
    return { icon, label, sublabel };
  }).filter(Boolean);
  if (!titleText && !badges.length) return null; // nothing real to render

  const position = VALID_POSITIONS.has(raw.position) ? raw.position : "top";
  const bgColor = HEX_RE.test(raw.bgColor) ? raw.bgColor : "#12203a";
  const textColor = HEX_RE.test(raw.textColor) ? raw.textColor : "#ffffff";
  const accentColor = HEX_RE.test(raw.accentColor) ? raw.accentColor : "#2563eb";
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning.trim().slice(0, 300) : "";
  return { titleText, badges, position, bgColor, textColor, accentColor, reasoning };
}

async function suggestBanner(imageBlock, instruction, apiKey) {
  const promptText = `You are composing a real promotional banner bar for a photo — the kind of dark full-width bar a car dealership or retailer adds across the top of a listing photo, with a title on the left and a few short icon "badges" (e.g. a checkmark + "ONE OWNER", a gauge + "71K MILES ONLY", a shield + "CLEAN TITLE").

USER'S INSTRUCTION: ${instruction ? `"${instruction}"` : "(none given — use your own judgment based on what's actually in the photo)"}

Look at the actual attached photo. Decide:
1. A short title (e.g. the real subject of the photo if visible/inferable from the instruction — a vehicle name, a product name; keep it to a couple words). Leave it empty ("") if nothing real to title.
2. Up to ${MAX_BADGES} badges — each a short real claim the user actually asked for (from their instruction) or that's genuinely visible/reasonable for this kind of photo. Each badge = one real emoji icon that actually matches its meaning (✅ for a guarantee/verified claim, 📱 for connectivity, ⛽ for fuel economy, 🛡️ for a protection/title/warranty claim, ⏱️ or 🔧 for mileage/service, etc. — pick whatever emoji genuinely fits, don't force these exact ones), a short bold label (a couple words or a number), and an optional smaller sublabel below/after it (e.g. label "71K", sublabel "MILES ONLY"). Never invent a claim the user didn't ask for and that isn't visibly true.
3. Whether this reads better as a full-width bar across the TOP or BOTTOM of the photo (pick whichever won't cover the real subject).
4. Colors — this matters a lot, think like a real graphic designer:
   a. First, actually identify the real dominant color(s) of the photo's subject (e.g. "dark gray car," "white car," "red car," "black interior").
   b. Then choose a background color, text color, and accent color that genuinely CONTRAST with that real dominant color — the banner must visually pop against THIS photo, never blend in. Never choose a near-black banner on a black/dark-gray subject, and never a near-white banner on a white/light subject — pick a real contrasting hue instead (e.g. a black car often works well with a warm gold, red, or bright color banner; a white car often works well with a dark navy, black, or bold color banner).
   c. Be creative and vary your palette based on this specific photo — don't default to the same navy-blue-and-white combination every time. Use real color theory (complementary or contrasting hues) to make an attractive, eye-catching banner, the way a real dealership's marketing team would design one — while textColor still stays clearly legible against your chosen bgColor, and accentColor (the badge icon circles) stands out from both.
5. One short sentence explaining your choices, including the real dominant color you identified and why your palette contrasts with it.

Only base this on what you can actually see in the photo and what the user actually asked for — never invent details about the photo, and never fabricate a brand logo (use real styled text for any title instead, never claim to reproduce a logo).

Return ONLY a fenced \`\`\`json block with exactly this shape:
{"titleText": "string (can be empty)", "badges": [{"icon": "emoji", "label": "string", "sublabel": "string (can be empty)"}], "position": "top" | "bottom", "bgColor": "#rrggbb", "textColor": "#rrggbb", "accentColor": "#rrggbb", "reasoning": "one short sentence"}`;

  const payload = {
    model: MODELS.sonnet, max_tokens: 600,
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

module.exports = { handlePhotoBanner, sanitizeSuggestion, MAX_BADGES };
