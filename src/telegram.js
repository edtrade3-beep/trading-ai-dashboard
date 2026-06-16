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

async function sendTelegramMessage(text) {
  if (!isConfigured()) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: String(text) }),
      // No parse_mode — plain text is always safe
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      console.error("[Telegram] sendTelegramMessage failed:", json.description || JSON.stringify(json));
    }
  } catch (err) {
    console.error("[Telegram] sendTelegramMessage error:", err.message);
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
