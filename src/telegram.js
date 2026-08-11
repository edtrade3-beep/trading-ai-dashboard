const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require("./config");

function isConfigured() {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

function formatAlert(alert) {
  const sideEmoji = alert.side === "BUY" ? "🟢" : alert.side === "SELL" ? "🔴" : "🔵";
  const priceStr = alert.price ? ` @ $${alert.price}` : "";
  const tfStr = alert.timeframe ? ` [${alert.timeframe}]` : "";
  // Plain text — no Markdown so special chars never break delivery
  return [
    `${sideEmoji} ${alert.symbol} — ${alert.side}${priceStr}${tfStr}`,
    `Score: ${alert.score}/100`,
    alert.message ? alert.message : null,
    alert.exchange ? `Exchange: ${alert.exchange}` : null,
    new Date(alert.at).toUTCString(),
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendTelegramAlert(alert) {
  if (!isConfigured()) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: formatAlert(alert),
        // No parse_mode — plain text is always safe
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      console.error("[Telegram] sendTelegramAlert failed:", json.description || JSON.stringify(json));
      return json;
    }
    return json;
  } catch (err) {
    console.error("[Telegram] sendTelegramAlert error:", err.message);
    // Telegram delivery failure must not affect the webhook response
  }
}

// Global send-level throttle — a real, unmissable safety net on top of the
// existing per-category shouldSendAlert budgets (telegram-bot.js). Several
// real alert sources (market-scanner.js's ~15 call sites, trailing-stops.js,
// server-autopilot.js, market-recap.js, premarket-alerts.js) send directly
// and never go through that gate at all, so their combined volume was
// effectively uncapped. Explicit user complaint (2026-07-29, "i get too
// much notifications in telegram fix it") — rather than auditing and
// re-routing every one of those call sites individually (and re-missing
// the next one that gets added later), this throttles the one function
// every single Telegram send in this app actually funnels through, so
// nothing can bypass it. Silently drops (never queues/delays) over the
// cap — a dropped low-priority ping beats a backlog of stale ones arriving
// late, same philosophy shouldSendAlert already uses.
let lastSentAt = 0;
let dailyCount = 0;
let dailyDate = "";
const MIN_INTERVAL_MS = 60_000; // 60s floor between ANY two messages, any source
const MAX_DAILY_TOTAL = 40;     // hard ceiling across every category combined, every source

// Real success/failure result (2026-08-03 — was always `undefined`, on
// every path including a genuine success, so /api/notify's real caller
// (GreenLightTab's manual "push to Telegram" button) had no way to tell a
// silently-dropped send — daily cap, 60s cooldown shared with every other
// alert job in this app, or a real Telegram API error — from an actual
// delivery, and always reported "sent" regardless. Every existing caller
// (the scheduled alert jobs) already ignores the return value, so widening
// it from undefined to a real result object is backward-compatible.
// `opts.url` + `opts.buttonText` (2026-08-11, AI Sniper deep-link) — adds a
// single inline URL button under the message, so tapping it opens the app
// straight to a specific symbol's Sniper Decision screen instead of a plain
// text mention. reply_markup is a separate JSON field from parse_mode, so
// this stays safe with the existing no-Markdown convention. Optional —
// every existing caller passes nothing and behaves exactly as before.
async function sendTelegramMessage(text, opts = {}) {
  if (!isConfigured()) return { ok: false, reason: "not-configured" };
  const today = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  if (today !== dailyDate) { dailyDate = today; dailyCount = 0; }
  const now = Date.now();
  if (dailyCount >= MAX_DAILY_TOTAL) {
    console.log("[Telegram] global daily cap reached — message dropped");
    return { ok: false, reason: "daily-cap" };
  }
  if (now - lastSentAt < MIN_INTERVAL_MS) {
    console.log("[Telegram] global cooldown active — message dropped");
    return { ok: false, reason: "cooldown", retryInMs: MIN_INTERVAL_MS - (now - lastSentAt) };
  }
  lastSentAt = now;
  dailyCount++;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = { chat_id: TELEGRAM_CHAT_ID, text: String(text) };
  if (opts.url && opts.buttonText) {
    body.reply_markup = { inline_keyboard: [[{ text: String(opts.buttonText), url: String(opts.url) }]] };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // No parse_mode — plain text is always safe
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      console.error("[Telegram] sendTelegramMessage failed:", json.description || JSON.stringify(json));
      return { ok: false, reason: "telegram-api-error", detail: json.description || null };
    }
    return { ok: true };
  } catch (err) {
    console.error("[Telegram] sendTelegramMessage error:", err.message);
    return { ok: false, reason: "network-error", detail: err.message };
  }
}

// Send a spoken voice message to Telegram. `speak` = the short phrase to say aloud;
// `caption` = the written text shown under the clip. Falls back to a plain text message if TTS fails.
async function fetchTTS(phrase) {
  // Try multiple free TTS providers (datacenter IPs get blocked by some) — return first real mp3.
  const tries = [
    { url: `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=${encodeURIComponent(phrase)}`, name: "google" },
    { url: `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${encodeURIComponent(phrase)}`, name: "streamelements" },
    { url: `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=gtx&q=${encodeURIComponent(phrase)}`, name: "google-gtx" },
  ];
  const diag = [];
  for (const t of tries) {
    try {
      const r = await fetch(t.url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept": "audio/mpeg,*/*", "Referer": "https://translate.google.com/" } });
      const ct = r.headers.get("content-type") || "";
      if (r.ok && /audio|mpeg|ogg/i.test(ct)) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.byteLength > 500) return { buf, provider: t.name, diag };
        diag.push(`${t.name}:tiny(${buf.byteLength})`);
      } else diag.push(`${t.name}:${r.status}/${ct.slice(0, 20)}`);
    } catch (e) { diag.push(`${t.name}:err`); }
  }
  return { buf: null, diag };
}

async function sendTelegramVoice(speak, caption) {
  if (!isConfigured()) return { ok: false, error: "not configured" };
  const phrase = String(speak || "").slice(0, 190);
  const cap = caption != null ? String(caption) : undefined;
  try {
    const { buf, provider, diag } = await fetchTTS(phrase);
    if (!buf) { await sendTelegramMessage(cap || phrase); return { ok: false, stage: "tts", diag }; }
    const form = new FormData();
    form.append("chat_id", String(TELEGRAM_CHAT_ID));
    form.append("title", "Market Alert");
    if (cap) form.append("caption", cap);
    form.append("audio", new Blob([buf], { type: "audio/mpeg" }), "alert.mp3");
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendAudio`, { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) { await sendTelegramMessage(cap || phrase); return { ok: false, stage: "telegram", provider, error: json.description || "", diag }; }
    return { ok: true, provider, bytes: buf.byteLength };
  } catch (err) {
    await sendTelegramMessage(cap || phrase);
    return { ok: false, stage: "exception", error: err.message };
  }
}

module.exports = { sendTelegramAlert, sendTelegramMessage, sendTelegramVoice, isConfigured };
