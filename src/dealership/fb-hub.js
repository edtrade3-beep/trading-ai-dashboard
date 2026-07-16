// Facebook Hub — backend for Dealer Portal
// Handles: incoming Messenger webhooks, auto-reply rules, appointments
// Required env vars:
//   FB_PAGE_ACCESS_TOKEN  — from Meta for Developers > your App > Messenger > Page token
//   FB_VERIFY_TOKEN       — any string you choose; entered in the webhook setup screen

const path = require("path");
const https = require("https");
const { writeJson } = require("../utils");
const { callAnthropicApi, MODELS } = require("../anthropic");
const { writeJsonAtomic, readJsonSafe } = require("../atomic-write");

const DATA_DIR   = path.join(__dirname, "../../data");
const MSG_FILE   = path.join(DATA_DIR, "fb-messages.json");
const APPT_FILE  = path.join(DATA_DIR, "fb-appointments.json");
const RULES_FILE = path.join(DATA_DIR, "fb-auto-rules.json");
const INV_FILE   = path.join(DATA_DIR, "inventory.json");
const AI_CFG_FILE = path.join(DATA_DIR, "fb-ai-config.json");
const CRM_FILE   = path.join(DATA_DIR, "crm-leads.json");

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
  return readJsonSafe(file, fallback);
}

function saveJson(file, data) {
  try {
    writeJsonAtomic(file, data);
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
function readJsonFile(file, fb) { return readJsonSafe(file, fb); }

// Picks which vehicles go into the AI's context window. With inventory now past 500
// items, a blind "first 30" misses anything the customer specifically asks about
// (e.g. a vehicle added later ends up last in the array and is never seen). Instead:
// vehicles whose year/make/model/trim word appears in the customer's message are
// always included, then the remainder is filled with the most recently listed cars.
function fmtVehicleLine(v) {
  const priceStr = v.price > 0 ? `$${v.price}` : (v.askingPrice > 0 ? `$${v.askingPrice}` : "call for price");
  return `${v.year || ""} ${v.make || ""} ${v.model || ""}${v.trim ? ` ${v.trim}` : ""} — ${priceStr}${v.mileage ? ` · ${v.mileage}mi` : ""}${v.vin ? ` · VIN ${String(v.vin).slice(-6)}` : ""}`;
}

function buildInventorySummary(inv, customerMsg, limit = 30) {
  if (!Array.isArray(inv) || !inv.length) return "No inventory loaded yet.";

  const msg = (customerMsg || "").toLowerCase();
  const matched = [];
  const rest = [];
  for (const v of inv) {
    const words = [v.year, v.make, v.model, v.trim].filter(Boolean).map(String).flatMap(s => s.toLowerCase().split(/\s+/));
    const isMatch = words.some(w => w.length > 2 && msg.includes(w));
    (isMatch ? matched : rest).push(v);
  }
  const picked = matched.concat(rest).slice(0, Math.max(limit, matched.length));
  return picked.map(fmtVehicleLine).join("\n");
}

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
  const invSummary = buildInventorySummary(inv, customerMsg);

  // Recent conversation for context
  const history = (conversationHistory || []).slice(-6).map(m => `${m.from === "customer" ? "Customer" : "You"}: ${m.text}`).join("\n");

  // Stable instruction block — cached so repeated replies read it at ~10% input cost.
  const system = `You are a friendly, professional sales assistant for ${dealerName}, a used car dealership. A customer messaged on Facebook. Reply naturally and helpfully — like a real salesperson, not a robot.

RULES:
- Keep it SHORT (1-3 sentences), warm, and conversational
- If they ask about a car, use the inventory provided
- If they want to buy/test drive, encourage booking and ask for a good time
- If they ask price, give the price from inventory if available
- If you don't know something specific, offer to have someone call them
- Never make up cars or prices not in inventory
- End buying-intent messages by inviting them to come in or schedule
- Write ONLY the reply text, nothing else.`;

  const prompt = `DEALERSHIP INFO:
- Hours: ${hours}
${phone ? `- Phone: ${phone}` : ""}
${address ? `- Address: ${address}` : ""}

CURRENT INVENTORY:
${invSummary}

${customNote ? `SPECIAL INSTRUCTIONS:\n${customNote}\n` : ""}

CONVERSATION SO FAR:
${history || "(this is the first message)"}

NEW CUSTOMER MESSAGE: "${customerMsg}"`;

  try {
    const reply = await callAnthropicApi(prompt, apiKey, { model: MODELS.haiku, maxTokens: 400, system, cache: true });
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
  const invSummary = buildInventorySummary(inv, customerMsg);
  const hist = (history || []).slice(-6).map(m => `${m.from === "customer" ? "Customer" : "Me"}: ${m.text}`).join("\n");

  // Smart rule-based replies — NO AI KEY NEEDED. Language-aware, follows all rules.
  if (!apiKey) {
    const T = {
      English: {
        FINANCING:    "We finance with approved credit (W.A.C.)! What monthly payment works best for your budget?",
        DOWN_PAYMENT: "Great question — how much were you planning to put down? That helps me find the right fit for you.",
        TRADE_IN:     "We take trade-ins! What's the year, make, model, and mileage of your current vehicle?",
        APPOINTMENT:  "I'd love to set up a time for you to come see it. What day works best?",
        PRICE:        "Thanks for your interest! Which vehicle are you asking about? I'll get you the price.",
        AVAILABILITY: "Let me check on that for you — which vehicle did you have your eye on?",
        GENERAL:      "Thanks for reaching out to Dixie Motors! How can I help you today?",
      },
      Spanish: {
        FINANCING:    "¡Financiamos con crédito aprobado (W.A.C.)! ¿Qué pago mensual le funciona mejor para su presupuesto?",
        DOWN_PAYMENT: "¡Buena pregunta! ¿Cuánto estaba pensando dar de enganche? Así le busco la mejor opción.",
        TRADE_IN:     "¡Aceptamos su carro a cuenta! ¿Cuál es el año, marca, modelo y millaje de su vehículo actual?",
        APPOINTMENT:  "Me encantaría agendar una cita para que lo vea. ¿Qué día le conviene mejor?",
        PRICE:        "¡Gracias por su interés! ¿De cuál vehículo me pregunta? Le consigo el precio.",
        AVAILABILITY: "Déjeme verificar — ¿cuál vehículo le interesa?",
        GENERAL:      "¡Gracias por contactar a Dixie Motors! ¿Cómo le puedo ayudar hoy?",
      },
      Arabic: {
        FINANCING:    "نوفّر تمويل بحسب الموافقة الائتمانية (W.A.C.)! كم القسط الشهري المناسب لميزانيتك؟",
        DOWN_PAYMENT: "سؤال ممتاز — كم تنوي أن تدفع كدفعة أولى؟ هذا يساعدني أجد لك الأنسب.",
        TRADE_IN:     "نقبل سيارتك كجزء من الدفع! ما هي سنة وماركة وموديل وعدد أميال سيارتك الحالية؟",
        APPOINTMENT:  "يسعدني أن أحجز لك موعد لمعاينة السيارة. أي يوم يناسبك؟",
        PRICE:        "شكراً لاهتمامك! عن أي سيارة تسأل؟ سأحضر لك السعر.",
        AVAILABILITY: "دعني أتحقق لك — ما السيارة التي تهمك؟",
        GENERAL:      "شكراً لتواصلك مع Dixie Motors! كيف أقدر أساعدك اليوم؟",
      },
    };
    const set = T[lang] || T.English;
    return { ok: true, intent, language: lang, humanTakeover: false, reply: set[intent] || set.GENERAL, source: "template" };
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
    const reply = await callAnthropicApi(prompt, apiKey, { model: MODELS.haiku, maxTokens: 300 });
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

  // ── Auto-reply: keyword rule first, then smart rule-based reply (no AI key needed) ──
  const rules = readJson(RULES_FILE, []);
  const aiCfg = readJson(AI_CFG_FILE, {});
  const autoEnabled = aiCfg.enabled !== false;

  let replyText = matchAutoReply(msgText, rules);
  let humanTakeover = false;

  if (!replyText && autoEnabled) {
    const thread = messages.find(m => m.senderId === senderId);
    // draftDealerReply works WITHOUT an Anthropic key (rule-based templates, all languages)
    const draft = await draftDealerReply(msgText, thread?.messages || []);
    if (draft.humanTakeover) {
      humanTakeover = true;
      // Don't auto-reply to legal/refund/title issues — alert the owner instead
      notifyLead(entry.senderName, msgText, "⚠️ NEEDS YOU — legal/refund/title/contract. Bot did NOT reply. Handle personally.");
    } else if (draft.ok && draft.reply) {
      replyText = draft.reply;
    }
  }

  if (replyText && !humanTakeover && process.env.FB_PAGE_ACCESS_TOKEN) {
    try {
      await sendReply(senderId, replyText);
      const thread = messages.find(m => m.senderId === senderId);
      if (thread) {
        thread.messages.push({ from: "page", text: replyText, ts: Date.now(), auto: true });
        saveJson(MSG_FILE, messages.slice(0, 200));
      }
      notifyLead(entry.senderName, msgText, replyText);
      // Auto-create CRM lead from the conversation
      try {
        const crm = readJsonFile(CRM_FILE, []);
        if (!crm.some(l => l.senderId === senderId)) {
          const phoneM = msgText.match(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
          crm.unshift({
            id: uid(), senderId, name: entry.senderName,
            phone: phoneM ? phoneM[0] : "", vehicle: "", budget: "", down: "",
            appt: "", notes: `[FB Marketplace] "${msgText.slice(0,120)}"`,
            hot: /buy|today|finance|approved|come|test drive/i.test(msgText),
            stage: "NEW", source: "facebook-bot", createdAt: Date.now(), updatedAt: Date.now(),
          });
          saveJson(CRM_FILE, crm.slice(0, 500));
        }
      } catch {}
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

  // ════════════ CRM ENDPOINTS ════════════
  // GET all leads
  if (pathname === "/api/dealer/crm/leads" && req.method === "GET") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return writeJson(res, 200, { leads: readJson(CRM_FILE, []) });
  }
  // SAVE / UPDATE a lead (upsert by id)
  if (pathname === "/api/dealer/crm/leads" && req.method === "POST") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    const lead = typeof body === "string" ? JSON.parse(body || "{}") : body;
    if (!lead || (!lead.name && !lead.phone)) return writeJson(res, 400, { error: "name or phone required" });
    const leads = readJson(CRM_FILE, []);
    if (lead.id) {
      const i = leads.findIndex(l => l.id === lead.id);
      if (i >= 0) { leads[i] = { ...leads[i], ...lead, updatedAt: Date.now() }; }
      else { leads.unshift({ ...lead, createdAt: Date.now(), updatedAt: Date.now() }); }
    } else {
      lead.id = uid(); lead.stage = lead.stage || "NEW";
      lead.createdAt = Date.now(); lead.updatedAt = Date.now();
      leads.unshift(lead);
      // Telegram alert on new lead
      if (lead.hot) notifyLead(lead.name || "?", `${lead.vehicle || ""} · budget ${lead.budget || "?"} · down ${lead.down || "?"}`, "🔥 New hot lead saved to CRM");
    }
    saveJson(CRM_FILE, leads.slice(0, 500));
    return writeJson(res, 200, { ok: true, id: lead.id });
  }
  // UPDATE lead stage (pipeline drag)
  if (pathname === "/api/dealer/crm/stage" && req.method === "POST") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const { id, stage } = typeof body === "string" ? JSON.parse(body || "{}") : body;
    const leads = readJson(CRM_FILE, []);
    const l = leads.find(x => x.id === id);
    if (l) { l.stage = stage; l.updatedAt = Date.now(); saveJson(CRM_FILE, leads); }
    return writeJson(res, 200, { ok: true });
  }
  // DELETE a lead
  if (pathname === "/api/dealer/crm/delete" && req.method === "POST") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const { id } = typeof body === "string" ? JSON.parse(body || "{}") : body;
    saveJson(CRM_FILE, readJson(CRM_FILE, []).filter(l => l.id !== id));
    return writeJson(res, 200, { ok: true });
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

// ── CRM auto follow-up + daily summary scheduler ──────────────────────────────
function startCrmScheduler() {
  // Check every 15 min for stale leads + send daily summary at 8am ET
  let lastSummaryDate = "";
  const tick = () => {
    try {
      const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      const h = et.getHours(), m = et.getMinutes(), wd = et.getDay();
      const today = et.toLocaleDateString("en-US");
      const leads = readJsonFile(CRM_FILE, []);
      let changed = false;

      // 1) Stale NEW lead reminder — NEW lead untouched > 2 hours, not yet reminded
      const now = Date.now();
      for (const l of leads) {
        if ((l.stage || "NEW") === "NEW" && !l.reminded) {
          const age = now - (l.createdAt || now);
          if (age > 2 * 3600_000) {  // 2 hours
            notifyLead(l.name || "?",
              `${l.vehicle || "vehicle ?"} · ${l.phone || "no phone"}`,
              `⏰ FOLLOW UP — this lead has been sitting in NEW for 2+ hours. Reach out!`);
            l.reminded = true; changed = true;
          }
        }
      }
      if (changed) saveJson(CRM_FILE, leads);

      // 2) Daily 8am ET CRM summary (weekdays)
      if (wd >= 1 && wd <= 5 && h === 8 && m < 15 && lastSummaryDate !== today) {
        lastSummaryDate = today;
        const newCt  = leads.filter(l => (l.stage||"NEW") === "NEW").length;
        const apptCt = leads.filter(l => l.stage === "APPOINTMENT").length;
        const negCt  = leads.filter(l => l.stage === "NEGOTIATING").length;
        const hotCt  = leads.filter(l => l.hot && l.stage !== "SOLD").length;
        if (leads.length > 0) {
          notifyLead("CRM", "",
            `📊 *DAILY CRM SUMMARY*\n🆕 New: ${newCt}\n📅 Appointments: ${apptCt}\n🤝 Negotiating: ${negCt}\n🔥 Hot leads: ${hotCt}\n\nWork your pipeline → ${"/crm"}`);
        }
      }
    } catch (e) { console.error("[CRM] scheduler error:", e.message); }
  };
  tick();
  const iv = setInterval(tick, 15 * 60_000);
  if (iv.unref) iv.unref();
  console.log("[CRM] Follow-up scheduler started (15-min checks + 8am daily summary)");
}

// buildInventorySummary/detectIntent/uid exported for reuse by other lead
// channels (src/gmail-leads.js) — same "never invent cars/prices" grounding
// and HUMAN_TAKEOVER safety net should apply everywhere leads get an AI
// reply, not just Messenger.
module.exports = { handleFbHub, startCrmScheduler, buildInventorySummary, detectIntent, uid };
