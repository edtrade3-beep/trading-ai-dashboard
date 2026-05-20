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

module.exports = { sendTelegramAlert, sendTelegramMessage, isConfigured };
