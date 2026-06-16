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
async function sendTelegramVoice(speak, caption) {
  if (!isConfigured()) return;
  const phrase = String(speak || "").slice(0, 190);  // Google TTS caps ~200 chars/request
  const cap = caption != null ? String(caption) : undefined;
  try {
    // Fetch real speech audio server-side (needs a browser UA or Google 403s).
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=${encodeURIComponent(phrase)}`;
    const audioRes = await fetch(ttsUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!audioRes.ok) throw new Error("TTS " + audioRes.status);
    const buf = Buffer.from(await audioRes.arrayBuffer());
    // Upload the mp3 to Telegram as an audio message (Node 20 has global FormData/Blob).
    const form = new FormData();
    form.append("chat_id", String(TELEGRAM_CHAT_ID));
    form.append("title", "Market Alert");
    if (cap) form.append("caption", cap);
    form.append("audio", new Blob([buf], { type: "audio/mpeg" }), "alert.mp3");
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendAudio`, { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) { console.error("[Telegram] sendTelegramVoice failed:", json.description || ""); await sendTelegramMessage(cap || phrase); }
    return json;
  } catch (err) {
    console.error("[Telegram] sendTelegramVoice error:", err.message);
    await sendTelegramMessage(cap || phrase);  // text always gets through
  }
}

module.exports = { sendTelegramAlert, sendTelegramMessage, sendTelegramVoice, isConfigured };
