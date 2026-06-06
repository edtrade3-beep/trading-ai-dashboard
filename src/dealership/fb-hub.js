// Facebook Hub — backend for Dealer Portal
// Handles: incoming Messenger webhooks, auto-reply rules, appointments
// Required env vars:
//   FB_PAGE_ACCESS_TOKEN  — from Meta for Developers > your App > Messenger > Page token
//   FB_VERIFY_TOKEN       — any string you choose; entered in the webhook setup screen

const fs   = require("fs");
const path = require("path");
const https = require("https");
const { writeJson } = require("../utils");
const { callAnthropicApi } = require("../anthropic");

const DATA_DIR   = path.join(__dirname, "../../data");
const MSG_FILE   = path.join(DATA_DIR, "fb-messages.json");
const APPT_FILE  = path.join(DATA_DIR, "fb-appointments.json");
const RULES_FILE = path.join(DATA_DIR, "fb-auto-rules.json");
const INV_FILE   = path.join(DATA_DIR, "inventory.json");
const AI_CFG_FILE = path.join(DATA_DIR, "fb-ai-config.json");

// Telegram lead alert
function notifyLead(senderName, customerMsg, aiReply) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const text = `💬 *FB LEAD* — ${senderName}\n\n"${customerMsg}"\n\n🤖 AI replied:\n${aiReply}`;
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" });
  const req = https.request({ hostname: "api.telegram.org", path: `/bot${token}/sendMessage`, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } });
  req.on("error", () => {}); req.write(payload); req.end();
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return fallback; }
}

function saveJson(file, data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[FB Hub] saveJson failed:", e.message);
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Facebook Graph API ────────────────────────────────────────────────────────

function graphPost(path2, body) {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) return Promise.reject(new Error("FB_PAGE_ACCESS_TOKEN not set"));
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: "graph.facebook.com",
      path: `/v19.0${path2}?access_token=${encodeURIComponent(token)}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    };
    const req = https.request(opts, res => {
      let raw = "";
      res.on("data", d => raw += d);
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function sendReply(recipientId, text) {
  return graphPost("/me/messages", {
    recipient: { id: recipientId },
    message: { text: text.slice(0, 2000) },
  });
}

// ── Auto-reply matching ───────────────────────────────────────────────────────

function matchAutoReply(text, rules) {
  if (!rules || !rules.length) return null;
  const lower = text.toLowerCase();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const kw = (rule.keyword || "").toLowerCase().trim();
    if (kw && lower.includes(kw)) return rule.reply;
  }
  return null;
}

// ── AI Smart Reply ────────────────────────────────────────────────────────────
function readJsonFile(file, fb) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fb; } }

async function generateAiReply(customerMsg, conversationHistory) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) return null;

  // AI config (custom dealership info the owner sets)
  const cfg = readJsonFile(AI_CFG_FILE, {});
  const dealerName = cfg.dealerName || "Dixie Motors";
  const hours      = cfg.hours || "Mon-Sat 9am-7pm, Sun closed";
  const phone      = cfg.phone || "";
  const address    = cfg.address || "";
  const customNote = cfg.customInstructions || "";

  // Inventory context (so AI can answer about real cars)
  const inv = readJsonFile(INV_FILE, []);
  const invSummary = Array.isArray(inv) && inv.length
    ? inv.slice(0, 30).map(v => `${v.year || ""} ${v.make || ""} ${v.model || ""} — $${v.price || v.askingPrice || "?"}${v.mileage ? ` · ${v.mileage}mi` : ""}${v.vin ? ` · VIN ${String(v.vin).slice(-6)}` : ""}`).join("\n")
    : "No inventory loaded yet.";

  // Recent conversation for context
  const history = (conversationHistory || []).slice(-6).map(m => `${m.from === "customer" ? "Customer" : "You"}: ${m.text}`).join("\n");

  const prompt = `You are a friendly, professional sales assistant for ${dealerName}, a used car dealership. A customer messaged on Facebook. Reply naturally and helpfully — like a real salesperson, not a robot.

DEALERSHIP INFO:
- Hours: ${hours}
${phone ? `- Phone: ${phone}` : ""}
${address ? `- Address: ${address}` : ""}

CURRENT INVENTORY:
${invSummary}

${customNote ? `SPECIAL INSTRUCTIONS:\n${customNote}\n` : ""}

CONVERSATION SO FAR:
${history || "(this is the first message)"}

NEW CUSTOMER MESSAGE: "${customerMsg}"

RULES:
- Keep it SHORT (1-3 sentences), warm, and conversational
- If they ask about a car, use real inventory above
- If they want to buy/test drive, encourage booking and ask for a good time
- If they ask price, give the price from inventory if available
- If you don't know something specific, offer to have someone call them
- Never make up cars or prices not in inventory
- End buying-intent messages by inviting them to come in or schedule

Write ONLY the reply text, nothing else.`;

  try {
    const reply = await callAnthropicApi(prompt, apiKey, { model: "claude-sonnet-4-6", maxTokens: 400 });
    return (reply || "").trim() || null;
  } catch (e) {
    console.error("[FB Hub] AI reply failed:", e.message);
    return null;
  }
}

// ── Draft reply for Chrome extension (Dixie Motors rules) ─────────────────────
function detectIntent(text) {
  const t = text.toLowerCase();
  if (/refund|lawyer|legal|sue|title problem|contract|scam|complaint|attorney|dispute/.test(t)) return "HUMAN_TAKEOVER";
  if (/finance|financing|credit|loan|approv|monthly|payment|apr|interest/.test(t)) return "FINANCING";
  if (/trade|trade-in|trade in|my car|worth/.test(t)) return "TRADE_IN";
  if (/down ?payment|how much down|deposit/.test(t)) return "DOWN_PAYMENT";
  if (/appointment|test drive|come in|visit|see the car|schedule|when can/.test(t)) return "APPOINTMENT";
  if (/price|cost|how much|asking/.test(t)) return "PRICE";
  if (/available|still have|in stock|sold/.test(t)) return "AVAILABILITY";
  return "GENERAL";
}

function detectLanguage(text) {
  if (/[؀-ۿ]/.test(text)) return "Arabic";
  // crude Spanish heuristic
  if (/\b(hola|gracias|cu[aá]nto|cuesta|precio|tienes|carro|coche|enganche|pago|cita|disponible|s[ií]|por favor)\b/i.test(text)) return "Spanish";
  return "English";
}

async function draftDealerReply(customerMsg, history) {
  const intent = detectIntent(customerMsg);
  const lang   = detectLanguage(customerMsg);

  // Human takeover — don't draft, tell the owner
  if (intent === "HUMAN_TAKEOVER") {
    return {
      ok: true, intent, language: lang, humanTakeover: true,
      reply: "⚠️ HUMAN TAKEOVER REQUIRED — this message involves a refund / legal / title / contract issue. Handle this one personally, do not use an auto-draft.",
    };
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  const cfg = readJsonFile(AI_CFG_FILE, {});
  const inv = readJsonFile(INV_FILE, []);
  const invSummary = Array.isArray(inv) && inv.length
    ? inv.slice(0, 30).map(v => `${v.year||""} ${v.make||""} ${v.model||""} — $${v.price||v.askingPrice||"?"}${v.mileage?` · ${v.mileage}mi`:""}`).join("\n")
    : "No inventory loaded.";
  const hist = (history || []).slice(-6).map(m => `${m.from === "customer" ? "Customer" : "Me"}: ${m.text}`).join("\n");

  // Fallback templates if no API key
  if (!apiKey) {
    const templates = {
      FINANCING:    "We finance with approved credit (W.A.C.). What monthly payment works for your budget, and how much were you thinking for a down payment?",
      DOWN_PAYMENT: "Great question! What down payment amount were you planning on? That helps me find the right vehicle for you.",
      TRADE_IN:     "We take trade-ins! What's the year, make, model, and mileage of your current vehicle?",
      APPOINTMENT:  "I'd love to set up a time for you. What day and time works best to come see it?",
      PRICE:        "Thanks for your interest! Which vehicle are you asking about? I'll get you the price right away.",
      AVAILABILITY: "Let me check on that for you — which vehicle are you interested in?",
      GENERAL:      "Thanks for reaching out to Dixie Motors! How can I help you today?",
    };
    return { ok: true, intent, language: lang, humanTakeover: false, reply: templates[intent] || templates.GENERAL, source: "template" };
  }

  const langRule = lang === "Arabic" ? "The customer wrote in Arabic — reply ONLY in Arabic."
                 : lang === "Spanish" ? "The customer wrote in Spanish — reply ONLY in Spanish."
                 : "Reply in English.";

  const prompt = `You are helping the owner of Dixie Motors (used car dealership, Fairfield, Ohio) reply to a Facebook customer message. Write a reply the owner will review and send manually.

INVENTORY:
${invSummary}
${cfg.customInstructions ? `\nOWNER NOTES:\n${cfg.customInstructions}\n` : ""}
CONVERSATION:
${hist || "(first message)"}

CUSTOMER MESSAGE: "${customerMsg}"
DETECTED INTENT: ${intent}

STRICT RULES:
- ${langRule}
- NEVER say "guaranteed approval" or promise approval. For financing always say "with approved credit (W.A.C.)".
- For financing/buying: ask for DOWN PAYMENT amount and MONTHLY BUDGET.
- Ask only ONE question at a time.
- Keep the reply SHORT — 1-2 sentences max. Friendly, like a real person texting.
- Never invent cars or prices not in inventory.
- Sound human and warm, not corporate.

Write ONLY the reply text.`;

  try {
    const reply = await callAnthropicApi(prompt, apiKey, { model: "claude-sonnet-4-6", maxTokens: 300 });
    return { ok: true, intent, language: lang, humanTakeover: false, reply: (reply || "").trim(), source: "ai" };
  } catch (e) {
    return { ok: false, intent, language: lang, humanTakeover: false, reply: "", error: e.message };
  }
}

// ── Incoming webhook event processing ────────────────────────────────────────

async function processMessagingEvent(event) {
  const senderId = event.sender?.id;
  const msgText  = event.message?.text || "";
  if (!senderId || !msgText) return;

  const messages = readJson(MSG_FILE, []);
  const existing = messages.find(m => m.senderId === senderId);

  const entry = {
    id: uid(),
    senderId,
    senderName: event.sender?.name || `User ${senderId.slice(-5)}`,
    text: msgText,
    ts: Date.now(),
    read: false,
    autoReplied: false,
    replies: [],
  };

  if (existing) {
    existing.messages = existing.messages || [];
    existing.messages.push({ from: "customer", text: msgText, ts: Date.now() });
    existing.lastTs = Date.now();
    existing.unread = (existing.unread || 0) + 1;
  } else {
    messages.unshift({
      threadId: uid(),
      senderId,
      senderName: entry.senderName,
      preview: msgText.slice(0, 80),
      lastTs: Date.now(),
      unread: 1,
      messages: [{ from: "customer", text: msgText, ts: Date.now() }],
    });
  }

  saveJson(MSG_FILE, messages.slice(0, 200)); // keep last 200 threads

  // ── Auto-reply: keyword rule first, then AI smart reply ──
  const rules = readJson(RULES_FILE, []);
  let replyText = matchAutoReply(msgText, rules);
  let isAi = false;

  // AI config — check if AI auto-reply is enabled (default ON if API key present)
  const aiCfg = readJson(AI_CFG_FILE, {});
  const aiEnabled = aiCfg.enabled !== false;

  if (!replyText && aiEnabled) {
    const thread = messages.find(m => m.senderId === senderId);
    replyText = await generateAiReply(msgText, thread?.messages || []);
    isAi = true;
  }

  if (replyText && process.env.FB_PAGE_ACCESS_TOKEN) {
    try {
      await sendReply(senderId, replyText);
      const thread = messages.find(m => m.senderId === senderId);
      if (thread) {
        thread.messages.push({ from: "page", text: replyText, ts: Date.now(), auto: true, ai: isAi });
        saveJson(MSG_FILE, messages.slice(0, 200));
      }
      // Notify owner on Telegram about the lead
      notifyLead(entry.senderName, msgText, replyText);
    } catch (e) {
      console.error("[FB Hub] Auto-reply failed:", e.message);
    }
  }
}

// ── Exported route handler ────────────────────────────────────────────────────

async function handleFbHub(req, res, pathname, searchParams, body) {

  // ── CORS preflight for Chrome extension ──
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // ── Webhook verification (Facebook calls this once during setup) ──
  if (pathname === "/api/dealer/fb/webhook" && req.method === "GET") {
    const mode      = searchParams.get("hub.mode");
    const token     = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");
    const expected  = process.env.FB_VERIFY_TOKEN || "dixie-motors-verify";
    if (mode === "subscribe" && token === expected) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end(challenge);
    }
    res.writeHead(403);
    return res.end("Forbidden");
  }

  // ── Incoming messages from Facebook ──
  if (pathname === "/api/dealer/fb/webhook" && req.method === "POST") {
    const data = typeof body === "string" ? JSON.parse(body || "{}") : body;
    if (data.object === "page") {
      const events = (data.entry || []).flatMap(e => e.messaging || []);
      await Promise.allSettled(events.map(processMessagingEvent));
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("EVENT_RECEIVED");
  }

  // ── GET messages ──
  if (pathname === "/api/dealer/fb/messages" && req.method === "GET") {
    return writeJson(res, 200, readJson(MSG_FILE, []));
  }

  // ── AI config: GET current settings ──
  if (pathname === "/api/dealer/fb/ai-config" && req.method === "GET") {
    const cfg = readJson(AI_CFG_FILE, {});
    return writeJson(res, 200, {
      enabled: cfg.enabled !== false,
      dealerName: cfg.dealerName || "Dixie Motors",
      hours: cfg.hours || "Mon-Sat 9am-7pm, Sun closed",
      phone: cfg.phone || "",
      address: cfg.address || "",
      customInstructions: cfg.customInstructions || "",
      aiReady: Boolean((process.env.ANTHROPIC_API_KEY || "").trim()),
      fbConnected: Boolean((process.env.FB_PAGE_ACCESS_TOKEN || "").trim()),
    });
  }

  // ── AI config: SAVE settings ──
  if (pathname === "/api/dealer/fb/ai-config" && req.method === "POST") {
    const cfg = typeof body === "string" ? JSON.parse(body || "{}") : body;
    saveJson(AI_CFG_FILE, cfg);
    return writeJson(res, 200, { ok: true });
  }

  // ── Test AI reply (preview without sending) ──
  if (pathname === "/api/dealer/fb/ai-test" && req.method === "POST") {
    const { message } = typeof body === "string" ? JSON.parse(body || "{}") : body;
    if (!message) return writeJson(res, 400, { error: "message required" });
    const reply = await generateAiReply(message, []);
    return writeJson(res, 200, { ok: Boolean(reply), reply: reply || "AI not configured — set ANTHROPIC_API_KEY" });
  }

  // ── DRAFT reply for Chrome extension (manual review, never auto-sends) ──
  if (pathname === "/api/dealer/fb/draft" && req.method === "POST") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const { message, history } = typeof body === "string" ? JSON.parse(body || "{}") : body;
    if (!message) return writeJson(res, 400, { error: "message required" });
    const result = await draftDealerReply(message, history || []);
    return writeJson(res, 200, result);
  }

  // ── Mark thread as read ──
  if (pathname === "/api/dealer/fb/messages/read" && req.method === "POST") {
    const { threadId } = typeof body === "string" ? JSON.parse(body || "{}") : body;
    const messages = readJson(MSG_FILE, []);
    const t = messages.find(m => m.threadId === threadId);
    if (t) { t.unread = 0; saveJson(MSG_FILE, messages); }
    return writeJson(res, 200, { ok: true });
  }

  // ── Send reply from dashboard ──
  if (pathname === "/api/dealer/fb/reply" && req.method === "POST") {
    const { senderId, threadId, text } = typeof body === "string" ? JSON.parse(body || "{}") : body;
    if (!senderId || !text) return writeJson(res, 400, { error: "senderId + text required" });
    try {
      await sendReply(senderId, text);
      const messages = readJson(MSG_FILE, []);
      const t = messages.find(m => m.threadId === threadId || m.senderId === senderId);
      if (t) {
        t.messages = t.messages || [];
        t.messages.push({ from: "page", text, ts: Date.now() });
        t.lastTs = Date.now();
        saveJson(MSG_FILE, messages);
      }
      return writeJson(res, 200, { ok: true });
    } catch (e) {
      return writeJson(res, 422, { error: e.message });
    }
  }

  // ── Auto-reply rules ──
  if (pathname === "/api/dealer/fb/auto-rules") {
    if (req.method === "GET") return writeJson(res, 200, readJson(RULES_FILE, []));
    if (req.method === "POST") {
      const data = typeof body === "string" ? JSON.parse(body || "[]") : body;
      saveJson(RULES_FILE, Array.isArray(data) ? data : []);
      return writeJson(res, 200, { ok: true });
    }
  }

  // ── Appointments ──
  if (pathname === "/api/dealer/fb/appointments") {
    if (req.method === "GET") return writeJson(res, 200, readJson(APPT_FILE, []));
    if (req.method === "POST") {
      const data = typeof body === "string" ? JSON.parse(body || "{}") : body;
      const appts = readJson(APPT_FILE, []);
      const newAppt = {
        id: uid(),
        name:    data.name    || "Unknown",
        phone:   data.phone   || "",
        vehicle: data.vehicle || "",
        date:    data.date    || "",
        time:    data.time    || "",
        notes:   data.notes   || "",
        source:  data.source  || "manual",
        status:  "pending",
        createdAt: Date.now(),
      };
      appts.unshift(newAppt);
      saveJson(APPT_FILE, appts.slice(0, 500));
      return writeJson(res, 200, newAppt);
    }
  }

  // ── Update appointment ──
  if (pathname.startsWith("/api/dealer/fb/appointments/") && req.method === "PATCH") {
    const id = pathname.split("/").pop();
    const data = typeof body === "string" ? JSON.parse(body || "{}") : body;
    const appts = readJson(APPT_FILE, []);
    const a = appts.find(x => x.id === id);
    if (!a) return writeJson(res, 404, { error: "Not found" });
    Object.assign(a, data);
    saveJson(APPT_FILE, appts);
    return writeJson(res, 200, a);
  }

  // ── Delete appointment ──
  if (pathname.startsWith("/api/dealer/fb/appointments/") && req.method === "DELETE") {
    const id = pathname.split("/").pop();
    const appts = readJson(APPT_FILE, []);
    const filtered = appts.filter(x => x.id !== id);
    saveJson(APPT_FILE, filtered);
    return writeJson(res, 200, { ok: true });
  }

  // ── Status (is FB connected?) ──
  if (pathname === "/api/dealer/fb/status" && req.method === "GET") {
    return writeJson(res, 200, {
      connected: !!process.env.FB_PAGE_ACCESS_TOKEN,
      verifyToken: process.env.FB_VERIFY_TOKEN || "dixie-motors-verify",
      webhookUrl: `${process.env.RENDER_EXTERNAL_URL || "https://your-app.onrender.com"}/api/dealer/fb/webhook`,
    });
  }

  return null; // not handled here
}

module.exports = { handleFbHub };
