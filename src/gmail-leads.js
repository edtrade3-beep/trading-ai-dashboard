// Server-side email lead auto-reply + appointment logging via Gmail (IMAP
// read + SMTP send). Was CarGurus-only (matched emails from
// cargurus.com and parsed a fixed template) — now covers any email in the
// inbox: CarGurus, direct customer inquiries, and the dealer website's
// contact form. There's no shared template across those sources, so a
// single AI call classifies AND extracts AND drafts per email, the same
// approach already proven for Facebook Messenger (src/dealership/fb-hub.js)
// — reusing its inventory-grounding, HUMAN_TAKEOVER safety check, and id
// generator rather than duplicating that logic.
//
// Needs env: GMAIL_USER, GMAIL_APP_PASSWORD (a Gmail App Password, not your
// normal password).
// Optional: GMAIL_AUTO_SEND ("on" to send; otherwise it only logs/Telegrams
//           what it WOULD send), DEALER_NAME, DEALER_ADDR, DEALER_PHONE.
const path = require("node:path");
const { ImapFlow } = require("imapflow");
const nodemailer = require("nodemailer");
const { simpleParser } = require("mailparser");
const { sendTelegramMessage, isConfigured } = require("./telegram");
const { callAnthropicApi, MODELS } = require("./anthropic");
const { readJsonSafe, writeJsonAtomic } = require("./atomic-write");
const { ROOT } = require("./config");
const { buildInventorySummary, detectIntent, uid } = require("./dealership/fb-hub");

const INV_FILE = path.join(ROOT, "data", "inventory.json");
const CRM_FILE = path.join(ROOT, "data", "crm-leads.json");

const DEALER = () => ({
  name: process.env.DEALER_NAME || "Dixie Motors",
  addr: process.env.DEALER_ADDR || "6416 Dixie Highway, Fairfield, OH 45014",
  phone: process.env.DEALER_PHONE || "513-874-4999",
});

function extractJsonBlock(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : (text.match(/\{[\s\S]*\}/) || [null])[0];
  if (!candidate) return null;
  try { return JSON.parse(candidate); } catch { return null; }
}

// Reads the email itself for a reply address — prefer Reply-To over From,
// since lead-forwarding services often send From a generic no-reply address.
function guessCustomerEmail(parsed) {
  const from = parsed.from?.value?.[0]?.address || "";
  const replyTo = parsed.replyTo?.value?.[0]?.address || "";
  return replyTo || from || "";
}

// Single AI call: is this a genuine sales lead, and if so, who/what/when
// and what should the reply say. Mirrors generateAiReply's system prompt in
// fb-hub.js (never invent cars/prices, keep it warm and human) but for
// email length/format instead of a 1-3 sentence Messenger reply, plus the
// classification and structured extraction this channel needs that
// Messenger doesn't (every Messenger conversation IS a lead by definition;
// an inbox is not).
async function classifyAndDraftEmailLead({ fromEmail, subject, text }, apiKey) {
  const cfg = readJsonSafe(path.join(ROOT, "data", "fb-ai-config.json"), {});
  const dealerName = cfg.dealerName || DEALER().name;
  const hours = cfg.hours || "Mon-Sat 9am-7pm, Sun closed";
  const inv = readJsonSafe(INV_FILE, []);
  const invSummary = buildInventorySummary(inv, `${subject}\n${text}`);

  const system = `You are a sales assistant for ${dealerName}, a used car dealership, screening and replying to inbox email. Not every email is a sales lead — this inbox also gets personal mail, business correspondence, newsletters, and spam. Only treat it as a lead if it's clearly from a potential customer asking about buying, viewing, or test-driving a vehicle.

RULES:
- If it's not a genuine vehicle sales inquiry, set isLead false and leave reply empty. Do not draft a reply to non-leads.
- If it IS a lead: use ONLY the inventory provided to answer vehicle/price questions. Never invent a vehicle or price not in that list.
- If the customer proposes a specific day/time to visit, CONFIRM that exact day/time in your reply (don't just ask again) — set proposedApptTime to a short human string like "Thursday 3pm" or "Sat 07-19 10am".
- If they haven't proposed a time, invite them to pick one.
- Write a warm, professional, human-sounding email reply — a few short paragraphs, not a wall of text. Sign off with the dealership name.
- Extract phone number only if the customer actually included one in their message.
- Write ONLY valid JSON, matching this shape exactly:
{"isLead": boolean, "name": string, "phone": string, "vehicleQuery": string, "proposedApptTime": string, "reply": string}`;

  const prompt = `DEALERSHIP INFO:
Hours: ${hours}
Phone: ${DEALER().phone}
Address: ${DEALER().addr}

CURRENT INVENTORY:
${invSummary}

EMAIL:
From: ${fromEmail}
Subject: ${subject}

${text.slice(0, 4000)}`;

  // Haiku, not Sonnet — matches the Messenger auto-reply's model choice for
  // a comparable task (classify + draft from grounded inventory context),
  // and this is a brand-new recurring AI cost source (the old version was
  // template-only, zero AI calls) worth keeping cheap by default.
  const raw = await callAnthropicApi(prompt, apiKey, { model: MODELS.haiku, maxTokens: 800, system, cache: true });
  return extractJsonBlock(raw);
}

let _running = false;
async function pollGmailLeads() {
  const user = (process.env.GMAIL_USER || "").trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""); // app passwords are shown with spaces
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!user || !pass || !apiKey || _running) return;
  _running = true;
  const autoSend = (process.env.GMAIL_AUTO_SEND || "").toLowerCase() === "on";
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  // ImapFlow emits 'error' on socket timeout/close from a background socket-level
  // handler, not from the awaited call chain below — without a listener here, Node's
  // default EventEmitter behavior is to throw it as an uncaught exception.
  client.on("error", (err) => console.error("[Gmail leads] client error:", err.message));
  let handled = 0, skipped = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 3 * 86400000); // last 3 days
      // No longer filtered to cargurus.com — covers CarGurus, direct
      // customer emails, and the dealer website's contact form. The AI
      // classification step below is what keeps this safe against
      // replying to non-lead mail.
      const uids = await client.search({ seen: false, since });
      for (const msgUid of (uids || [])) {
        const msg = await client.fetchOne(msgUid, { source: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const text = parsed.text || (parsed.html || "").replace(/<[^>]+>/g, " ");
        const fromEmail = guessCustomerEmail(parsed);
        const subject = parsed.subject || "";
        if (!fromEmail || !text.trim()) { await client.messageFlagsAdd(msgUid, ["\\Seen"]); continue; }

        // Same refund/legal/title/contract safety net as Messenger — don't
        // let AI touch these, flag for a human instead of auto-replying.
        if (detectIntent(text) === "HUMAN_TAKEOVER") {
          await client.messageFlagsAdd(msgUid, ["\\Seen"]);
          if (isConfigured()) sendTelegramMessage(`⚠️ *HUMAN TAKEOVER* — email from ${fromEmail}\nSubject: ${subject}\n\nInvolves a refund/legal/title/contract issue — handle this one personally, no auto-reply sent.`).catch(() => {});
          continue;
        }

        let lead;
        try { lead = await classifyAndDraftEmailLead({ fromEmail, subject, text }, apiKey); } catch { lead = null; }
        await client.messageFlagsAdd(msgUid, ["\\Seen"]);
        if (!lead || !lead.isLead || !lead.reply) { skipped++; continue; }

        if (autoSend) {
          const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
          const replySubject = subject && !/^re:/i.test(subject) ? `Re: ${subject}` : (subject || "Re: your inquiry");
          await transport.sendMail({ from: `"${DEALER().name}" <${user}>`, to: fromEmail, subject: replySubject, text: lead.reply });
        }

        // Log to the same CRM board the Messenger leads use.
        try {
          const crm = readJsonSafe(CRM_FILE, []);
          const existing = crm.find(l => l.email === fromEmail);
          const hasAppt = Boolean(lead.proposedApptTime);
          if (existing) {
            existing.appt = lead.proposedApptTime || existing.appt || "";
            if (hasAppt) existing.stage = "APPOINTMENT";
            existing.updatedAt = Date.now();
          } else {
            crm.unshift({
              id: uid(), email: fromEmail, name: lead.name || fromEmail.split("@")[0],
              phone: lead.phone || "", vehicle: lead.vehicleQuery || "", budget: "", down: "",
              appt: lead.proposedApptTime || "", notes: `[Email] "${text.slice(0, 120)}"`,
              hot: hasAppt, stage: hasAppt ? "APPOINTMENT" : "NEW",
              source: "email", createdAt: Date.now(), updatedAt: Date.now(),
            });
          }
          writeJsonAtomic(CRM_FILE, crm.slice(0, 500));
        } catch (e) { console.error("[Gmail leads] CRM log failed:", e.message); }

        handled++;
        if (isConfigured()) {
          sendTelegramMessage(
            `${autoSend ? "✅ AUTO-REPLIED" : "📝 LEAD (auto-send off)"} — Email\n\nFrom: ${lead.name || fromEmail} <${fromEmail}>\n` +
            `Vehicle: ${lead.vehicleQuery || "—"}${lead.proposedApptTime ? `\n📅 Appointment: ${lead.proposedApptTime}` : ""}\n\n${lead.reply}`
          ).catch(() => {});
        }
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) {
    console.error("[Gmail leads] error:", e.message);
  } finally { _running = false; }
  if (handled || skipped) console.log(`[Gmail leads] handled ${handled} lead(s), skipped ${skipped} non-lead email(s)`);
}

// Diagnostic: connect, sample the inbox, return what it sees — WITHOUT
// sending, classifying, or marking read.
async function testGmailConnection() {
  const user = (process.env.GMAIL_USER || "").trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) return { ok: false, configured: false, error: "GMAIL_USER / GMAIL_APP_PASSWORD not set in Render" };
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  client.on("error", (err) => console.error("[Gmail leads] client error (testGmailConnection):", err.message));
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    let sample = [];
    try {
      const since = new Date(Date.now() - 7 * 86400000);
      const uids = await client.search({ since });
      const take = (uids || []).slice(-5);
      for (const msgUid of take) {
        const msg = await client.fetchOne(msgUid, { source: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        sample.push({ from: guessCustomerEmail(parsed), subject: parsed.subject || "" });
      }
      var total = (uids || []).length;
    } finally { lock.release(); }
    await client.logout();
    return { ok: true, configured: true, connected: true, autoSend: (process.env.GMAIL_AUTO_SEND || "").toLowerCase() === "on", foundLast7d: total, sample };
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
