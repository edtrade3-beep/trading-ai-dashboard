// Server-side CarGurus lead auto-reply via Gmail (IMAP read + SMTP send).
// Needs env: GMAIL_USER, GMAIL_APP_PASSWORD (a Gmail App Password, not your normal password).
// Optional: GMAIL_AUTO_SEND ("on" to send; otherwise it only logs/Telegrams what it WOULD send),
//           DEALER_NAME, DEALER_ADDR, DEALER_PHONE.
const { ImapFlow } = require("imapflow");
const nodemailer = require("nodemailer");
const { simpleParser } = require("mailparser");
const { sendTelegramMessage, isConfigured } = require("./telegram");

const LEAD_FROM = "dealer-leads@messages.cargurus.com";
const DEALER = () => ({
  name: process.env.DEALER_NAME || "Dixie Motors",
  addr: process.env.DEALER_ADDR || "6416 Dixie Highway, Fairfield, OH 45014",
  phone: process.env.DEALER_PHONE || "513-874-4999",
});

function parseLead(text) {
  const grab = (re) => { const m = (text || "").match(re); return m ? m[1].trim() : ""; };
  return {
    firstName: grab(/First Name:\s*(.+)/i) || "there",
    email: grab(/Email:\s*([^\s<]+@[^\s>]+)/i),
    phone: grab(/Telephone:\s*(.+)/i),
    vehicle: grab(/Vehicle:\s*(.+)/i),
    price: grab(/Listed Price:\s*\$?([\d,]+)/i) || grab(/Price:\s*\$?([\d,]+)/i),
  };
}
function buildReply(lead) {
  const d = DEALER();
  const subject = `${lead.vehicle} – Still Available`;
  const body =
    `Hi ${lead.firstName},\n\n` +
    `Thank you for your interest in our ${lead.vehicle}.\n\n` +
    `The vehicle is still available at the listed price of $${lead.price}. ` +
    `What day and time would you like to come in and take a look at it?\n\n` +
    `Please let me know the best way to reach you, or feel free to call us at ${d.phone}.\n\n` +
    `${d.name}\n${d.addr}`;
  return { subject, body };
}

let _running = false;
async function pollGmailLeads() {
  const user = (process.env.GMAIL_USER || "").trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""); // app passwords are shown with spaces
  if (!user || !pass || _running) return;
  _running = true;
  const autoSend = (process.env.GMAIL_AUTO_SEND || "").toLowerCase() === "on";
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  // ImapFlow emits 'error' on socket timeout/close from a background socket-level
  // handler, not from the awaited call chain below — without a listener here, Node's
  // default EventEmitter behavior is to throw it as an uncaught exception.
  client.on("error", (err) => console.error("[Gmail leads] client error:", err.message));
  let handled = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 3 * 86400000); // last 3 days
      const uids = await client.search({ seen: false, since, from: "cargurus.com" });
      for (const uid of (uids || [])) {
        const msg = await client.fetchOne(uid, { source: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const text = parsed.text || (parsed.html || "").replace(/<[^>]+>/g, " ");
        const lead = parseLead(text);
        if (!lead.email || !lead.vehicle) { await client.messageFlagsAdd(uid, ["\\Seen"]); continue; }
        const { subject, body } = buildReply(lead);
        if (autoSend) {
          const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
          await transport.sendMail({ from: `"${DEALER().name}" <${user}>`, to: lead.email, subject, text: body });
        }
        await client.messageFlagsAdd(uid, ["\\Seen"]);
        handled++;
        if (isConfigured()) sendTelegramMessage(`${autoSend ? "✅ AUTO-REPLIED" : "📝 LEAD (auto-send off)"} — CarGurus\n\nTo: ${lead.firstName} <${lead.email}>\nRe: ${lead.vehicle} ($${lead.price})\n\n${body}`).catch(() => {});
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) {
    console.error("[Gmail leads] error:", e.message);
  } finally { _running = false; }
  if (handled) console.log(`[Gmail leads] handled ${handled} CarGurus lead(s)`);
}

// Diagnostic: connect, search for CarGurus leads, return what it sees — WITHOUT sending or marking read.
async function testGmailConnection() {
  const user = (process.env.GMAIL_USER || "").trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) return { ok: false, configured: false, error: "GMAIL_USER / GMAIL_APP_PASSWORD not set in Render" };
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  client.on("error", (err) => console.error("[Gmail leads] client error (testGmailConnection):", err.message));
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    let leads = [];
    try {
      const since = new Date(Date.now() - 7 * 86400000);
      const uids = await client.search({ since, from: "cargurus.com" });
      const take = (uids || []).slice(-5);
      for (const uid of take) {
        const msg = await client.fetchOne(uid, { source: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const text = parsed.text || (parsed.html || "").replace(/<[^>]+>/g, " ");
        const lead = parseLead(text);
        leads.push({ firstName: lead.firstName, email: lead.email, vehicle: lead.vehicle, price: lead.price });
      }
      var total = (uids || []).length;
    } finally { lock.release(); }
    await client.logout();
    return { ok: true, configured: true, connected: true, autoSend: (process.env.GMAIL_AUTO_SEND || "").toLowerCase() === "on", foundLast7d: total, sample: leads };
  } catch (e) {
    let hint = "";
    const detail = (e.responseText || e.response || e.message || "").toLowerCase();
    if (e.authenticationFailed || detail.includes("auth") || detail.includes("credentials") || detail.includes("username and password")) {
      hint = "Login rejected — (1) make sure IMAP is ENABLED in Gmail (Settings → Forwarding and POP/IMAP → Enable IMAP → Save), and (2) GMAIL_APP_PASSWORD must be a 16-char App Password (not your normal Gmail password), generated for THIS account.";
    } else if (detail.includes("timeout") || detail.includes("etimedout")) {
      hint = "Connection timed out reaching imap.gmail.com.";
    } else {
      hint = "Usually means IMAP is not enabled in Gmail, or the App Password is wrong. Enable IMAP in Gmail settings and re-check the App Password.";
    }
    return { ok: false, configured: true, connected: false, error: e.message, detail: e.responseText || null, hint };
  }
}

module.exports = { pollGmailLeads, testGmailConnection };
