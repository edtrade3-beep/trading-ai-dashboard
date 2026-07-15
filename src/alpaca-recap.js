// End-of-day autopilot recap → Telegram. Reads the Alpaca PAPER account (equity,
// today's P&L, open positions) and sends one summary so you know what the
// autopilot did while you weren't watching. PAPER only.
const { sendTelegramMessage, isConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");

const BASE = "https://paper-api.alpaca.markets";
function keys() {
  return {
    id: process.env.ALPACA_KEY_ID || process.env.ALPACA_API_KEY_ID || "",
    secret: process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET_KEY || "",
  };
}
async function alpaca(path) {
  const { id, secret } = keys();
  if (!id || !secret) return null;
  try {
    const r = await fetch(`${BASE}${path}`, {
      headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

const money = (n) => `${n < 0 ? "-" : "+"}$${Math.abs(Math.round(n)).toLocaleString()}`;

async function runAutopilotRecap() {
  if (!isConfigured()) return;
  const { id, secret } = keys();
  if (!id || !secret) return;

  const acct = await alpaca("/v2/account");
  const positions = (await alpaca("/v2/positions")) || [];
  if (!acct) return;

  const equity   = Number(acct.equity) || 0;
  const lastEq   = Number(acct.last_equity) || equity;   // prior close
  const dayPnl   = equity - lastEq;                        // today's total change (open + closed)
  const openN    = positions.length;
  const longs    = positions.filter(p => Number(p.qty) > 0);
  const shorts   = positions.filter(p => Number(p.qty) < 0);
  const unreal   = positions.reduce((s, p) => s + (Number(p.unrealized_pl) || 0), 0);

  const posLines = positions
    .slice(0, 12)
    .map(p => {
      const q = Number(p.qty);
      const pl = Number(p.unrealized_pl) || 0;
      const dir = q < 0 ? "🔻" : "🟢";
      return `${dir} ${p.symbol}  ${Math.abs(q)} sh  ${money(pl)}`;
    })
    .join("\n");

  const emoji = dayPnl > 0 ? "🟢" : dayPnl < 0 ? "🔴" : "⚪";
  const msg =
    `🤖 AUTOPILOT RECAP\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${emoji} Today: ${money(dayPnl)}   (equity $${Math.round(equity).toLocaleString()})\n` +
    `Open: ${openN}  ·  ${longs.length} long / ${shorts.length} short\n` +
    `Unrealized: ${money(unreal)}\n` +
    (posLines ? `\n${posLines}\n` : `\n(no open positions)\n`) +
    `\n⏰ ${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })} ET (paper)`;

  if (shouldSendAlert({ category: "recap" })) await sendTelegramMessage(msg).catch(() => {});
  console.log(`[Autopilot recap] sent — day ${money(dayPnl)}, ${openN} open`);
}

module.exports = { runAutopilotRecap };
