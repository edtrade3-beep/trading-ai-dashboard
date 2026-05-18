const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require("./config");

function isConfigured() {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

function formatAlert(alert) {
  const sideEmoji = alert.side === "BUY" ? "🟢" : alert.side === "SELL" ? "🔴" : "🔵";
  const priceStr = alert.price ? ` @ $${alert.price}` : "";
  const tfStr = alert.timeframe ? ` [${alert.timeframe}]` : "";
  return [
    `${sideEmoji} *${alert.symbol}* — ${alert.side}${priceStr}${tfStr}`,
    `Score: ${alert.score}/100`,
    alert.message ? `_${alert.message}_` : null,
    alert.exchange ? `Exchange: ${alert.exchange}` : null,
    `\`${new Date(alert.at).toUTCString()}\``,
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendTelegramAlert(alert) {
  if (!isConfigured()) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: formatAlert(alert),
        parse_mode: "Markdown",
      }),
    });
  } catch {
    // Telegram delivery failure must not affect the webhook response
  }
}

async function sendTelegramMessage(text) {
  if (!isConfigured()) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" }),
    });
  } catch {}
}

module.exports = { sendTelegramAlert, sendTelegramMessage, isConfigured };
