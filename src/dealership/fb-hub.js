// Facebook Hub — backend for Dealer Portal
// Handles: incoming Messenger webhooks, auto-reply rules, appointments
// Required env vars:
//   FB_PAGE_ACCESS_TOKEN  — from Meta for Developers > your App > Messenger > Page token
//   FB_VERIFY_TOKEN       — any string you choose; entered in the webhook setup screen

const fs   = require("fs");
const path = require("path");
const https = require("https");

const DATA_DIR   = path.join(__dirname, "../../data");
const MSG_FILE   = path.join(DATA_DIR, "fb-messages.json");
const APPT_FILE  = path.join(DATA_DIR, "fb-appointments.json");
const RULES_FILE = path.join(DATA_DIR, "fb-auto-rules.json");

// ── JSON helpers ──────────────────────────────────────────────────────────────

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return fallback; }
}

function saveJson(file, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
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

  // Auto-reply
  const rules = readJson(RULES_FILE, []);
  const replyText = matchAutoReply(msgText, rules);
  if (replyText && process.env.FB_PAGE_ACCESS_TOKEN) {
    try {
      await sendReply(senderId, replyText);
      const thread = messages.find(m => m.senderId === senderId);
      if (thread) {
        thread.messages.push({ from: "page", text: replyText, ts: Date.now(), auto: true });
        saveJson(MSG_FILE, messages.slice(0, 200));
      }
    } catch (e) {
      console.error("[FB Hub] Auto-reply failed:", e.message);
    }
  }
}

// ── Exported route handler ────────────────────────────────────────────────────

async function handleFbHub(req, res, pathname, searchParams, body) {
  const { writeJson } = require("../utils");

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
