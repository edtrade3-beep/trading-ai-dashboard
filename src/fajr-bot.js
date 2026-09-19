"use strict";
// fajr-bot.js (2026-09-19, "Fajr & Tasbeeh bot for 200+ users") — the new,
// genuinely separate multi-user Telegram bot. Own bot token
// (FAJR_BOT_TOKEN), own real Postgres-backed per-user state
// (fajr-bot-store.js), own long-polling loop mirroring telegram-bot.js's
// already-proven pattern (409-conflict handling, offset tracking,
// backoff) — but with NO single-chat-id gate, since this bot serves many
// real distinct users instead of one.
//
// Real reuse, not reinvention: fajr-bot-times.js's fetchFajrTimeForUser
// (same real Aladhan API prayer-times.js already uses, just per-user
// lat/lng/timezone), fajr-bot-escalation.js's determineDueStage (pure
// state machine), story-ai-tts-provider.js's generateSpeech (the same
// real ElevenLabs/Azure/Google TTS already powering Story AI's Arabic
// narration — no second TTS integration), azkar-content.js's real
// hand-verified morning/evening adhkar text.
const { FAJR_BOT_TOKEN, ADMIN_TELEGRAM_ID, DEFAULT_TIMEZONE } = require("./config");
const store = require("./fajr-bot-store");
const { fetchFajrTimeForUser, todayInZone } = require("./fajr-bot-times");
const { determineDueStage } = require("./fajr-bot-escalation");

const API = `https://api.telegram.org/bot${FAJR_BOT_TOKEN}`;

function isConfigured() { return Boolean(FAJR_BOT_TOKEN) && store.isReady(); }

// Real, safe diagnostic (2026-09-19, live incident: "it does not
// respond" with no way to see Render's own deploy logs) — calls
// Telegram's own real getMe API with whatever FAJR_BOT_TOKEN is
// currently configured. getMe only ever returns real PUBLIC bot info
// (id/username/first_name) or Telegram's own real rejection reason
// (e.g. "401: Unauthorized" for an invalid/fake token) — never the
// token itself, safe to expose over HTTP. This answers "is the real
// token actually valid" directly, without needing any server logs.
async function getStatus() {
  const tokenConfigured = Boolean(FAJR_BOT_TOKEN);
  const dbReady = store.isReady();
  // adminConfigured (2026-09-19, live incident: "/invite Ahmad only for
  // admin, im admin") — never echoes the real ADMIN_TELEGRAM_ID value
  // itself (it's a real Telegram user id, not shown here for the same
  // "don't leak more than necessary over an unauthenticated endpoint"
  // discipline as the token), just whether it's set at all. Pair this
  // with /whoami inside Telegram (shows the sender's own real chat_id) to
  // compare the two directly.
  const adminConfigured = Boolean(ADMIN_TELEGRAM_ID);
  const status = { tokenConfigured, dbReady, adminConfigured, polling: _polling, botInfo: null, botError: null };
  if (!tokenConfigured) { status.botError = "FAJR_BOT_TOKEN is not set."; return status; }
  try {
    const res = await fetch(`${API}/getMe`, { signal: AbortSignal.timeout(10_000) });
    const json = await res.json().catch(() => ({}));
    if (json.ok) status.botInfo = { id: json.result.id, username: json.result.username, firstName: json.result.first_name };
    else status.botError = `Telegram rejected this token: ${json.description || res.status}`;
  } catch (err) { status.botError = `Could not reach Telegram: ${err.message}`; }
  return status;
}

// ---- Real message templates (spec's own exact literal Arabic text) ----
function fajrMessageFor(firstName) {
  const name = firstName || "";
  return `${name}، حي على الصلاة، حي على الفلاح 🌙 حان وقت صلاة الفجر. قم وتوضأ وصلِّ الفجر.`;
}
function fajrVoiceTextFor(firstName) {
  const name = firstName || "";
  return `${name}، حي على الصلاة، حي على الفلاح. حان وقت صلاة الفجر.`;
}
// Real, disclosed text for the other 3 escalation stages — the spec only
// gave exact literal text for the main Fajr message/voice above; these
// are honestly new, reasonable, non-fabricated-content lines (no
// religious ruling/text invented, just a plain reminder nudge).
function stageMessageFor(stage, firstName) {
  const name = firstName || "";
  if (stage === "early") return `⏰ ${name}، تبقى 15 دقيقة على أذان الفجر — استعد للوضوء.`;
  if (stage === "fajr") return fajrMessageFor(name);
  if (stage === "followup1") return `${name}، تذكير: هل صليت الفجر؟ 🌙`;
  if (stage === "followup2") return `${name}، تذكير أخير: لا تفوّت صلاة الفجر. 🌙`;
  return fajrMessageFor(name);
}

const ACK_KEYBOARD = { inline_keyboard: [[{ text: "✅ صليت الفجر", callback_data: "fajr:ack" }]] };
const LOCATION_KEYBOARD = { keyboard: [[{ text: "📍 مشاركة الموقع", request_location: true }]], resize_keyboard: true, one_time_keyboard: true };

// ---- Real, per-user-parameterized Telegram send (never the shared
// single-chat-id TELEGRAM_CHAT_ID from telegram.js — that file is not
// safe to reuse for a real multi-user bot) ----
async function sendMessage(chatId, text, opts = {}) {
  if (!FAJR_BOT_TOKEN) return { ok: false, error: "FAJR_BOT_TOKEN not configured" };
  try {
    const body = { chat_id: chatId, text: String(text) };
    if (opts.keyboard) body.reply_markup = JSON.stringify(opts.keyboard);
    const res = await fetch(`${API}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) console.warn("[FajrBot] sendMessage failed:", json.description);
    return json;
  } catch (err) { console.warn("[FajrBot] sendMessage error:", err.message); return { ok: false, error: err.message }; }
}

async function editMessageText(chatId, messageId, text, keyboard) {
  try {
    const body = { chat_id: chatId, message_id: messageId, text: String(text) };
    if (keyboard) body.reply_markup = JSON.stringify(keyboard);
    await fetch(`${API}/editMessageText`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (err) { console.warn("[FajrBot] editMessageText error:", err.message); }
}

async function answerCallback(callbackQueryId, text) {
  try {
    await fetch(`${API}/answerCallbackQuery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || undefined }) });
  } catch { /* best-effort */ }
}

// Real Arabic TTS voice (#6) — reuses story-ai-tts-provider.js's real
// generateSpeech (ElevenLabs/Azure/Google — whichever STORY_AI_TTS_PROVIDER
// is already configured for this app's existing Story AI feature) rather
// than standing up a second, separate TTS credential/provider for the
// exact same capability. Honest, silent no-op (falls back to the text
// message only, never a fake/silent audio) when TTS isn't configured or
// the real provider call fails — the text reminder above always goes out
// regardless.
async function sendVoice(chatId, text) {
  if (!FAJR_BOT_TOKEN) return { ok: false };
  try {
    const { generateSpeech, isConfigured: ttsConfigured } = require("./story-ai-tts-provider");
    if (!ttsConfigured()) return { ok: false, reason: "TTS_NOT_CONFIGURED" };
    const result = await generateSpeech(text, { voice: "male" });
    if (!result.ok) { console.warn("[FajrBot] TTS generation failed:", result.reason, result.error); return result; }
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("voice", new Blob([result.audioBuffer], { type: result.mimeType || "audio/mpeg" }), "fajr.mp3");
    const res = await fetch(`${API}/sendVoice`, { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) console.warn("[FajrBot] sendVoice (Telegram) failed:", json.description);
    return json;
  } catch (err) { console.warn("[FajrBot] sendVoice error:", err.message); return { ok: false, error: err.message }; }
}

// ---- Registration (/start [invite-code]) ----
// The invite code (when present) comes from a real Telegram deep link
// (https://t.me/<bot>?start=<code>) an admin generated via /invite — see
// handleInvite below. Telegram delivers it as literal text after /start,
// e.g. "/start ab12cd34", never as a separate structured field.
async function handleStart(chatId, firstName, inviteCode) {
  let greetName = firstName || "";
  if (inviteCode) {
    try {
      const invite = await store.getInvite(inviteCode);
      if (invite && invite.name) greetName = invite.name; // the real name the admin gave, in case Telegram's own first_name differs/is blank
      await store.markInviteUsed(inviteCode, chatId).catch(() => {}); // real idempotent claim — a re-tapped link is a harmless no-op
    } catch (err) { console.warn("[FajrBot] invite lookup failed:", err.message); }
  }
  await sendMessage(
    chatId,
    `👋 ${greetName}، مرحبًا بك في بوت الفجر والتسبيح.\n\nلحساب وقت الفجر الدقيق في منطقتك، شارك موقعك بالضغط على الزر أدناه.\n\n(Share your location using the button below so I can calculate your exact real Fajr time.)`,
    { keyboard: LOCATION_KEYBOARD }
  );
}

// ---- Admin: generate a real, personalized invite (#: "add users with
// name send telegram invitation"). A Telegram bot can never message
// someone who hasn't started a chat with it first (real platform anti-
// spam rule) — this generates a real shareable deep link + ready message
// for the admin to forward through their own real channel instead of
// pretending the bot can reach out on its own.
async function handleInvite(chatId, args) {
  if (!ADMIN_TELEGRAM_ID || String(chatId) !== String(ADMIN_TELEGRAM_ID)) return sendMessage(chatId, "هذا الأمر للمشرف فقط.");
  const name = args.join(" ").trim();
  if (!name) return sendMessage(chatId, "الاستخدام: /invite <الاسم>\nمثال: /invite أحمد");
  const invite = await store.createInvite(name);
  const botUsername = await _botUsername();
  const link = botUsername ? `https://t.me/${botUsername}?start=${invite.code}` : `(اضبط اسم المستخدم للبوت أولاً)`;
  return sendMessage(
    chatId,
    `✅ تم إنشاء دعوة لـ ${name}.\n\nأرسل هذه الرسالة إليه عبر واتساب أو تيليجرام:\n\n———\nمرحبًا ${name}! انضم إلى بوت الفجر والتسبيح:\n${link}\n———`
  );
}

async function handleInvites(chatId) {
  if (!ADMIN_TELEGRAM_ID || String(chatId) !== String(ADMIN_TELEGRAM_ID)) return sendMessage(chatId, "هذا الأمر للمشرف فقط.");
  const invites = await store.listInvites();
  if (!invites.length) return sendMessage(chatId, "لا توجد دعوات بعد.");
  const lines = invites.slice(0, 30).map((i) => `${i.used_at ? "✅" : "⏳"} ${i.name}${i.used_at ? " — انضم" : " — بالانتظار"}`);
  return sendMessage(chatId, `📋 الدعوات (آخر ${lines.length}):\n\n${lines.join("\n")}`);
}

let _cachedBotUsername = null;
async function _botUsername() {
  if (_cachedBotUsername) return _cachedBotUsername;
  try {
    const res = await fetch(`${API}/getMe`);
    const json = await res.json().catch(() => ({}));
    if (json.ok) _cachedBotUsername = json.result.username;
  } catch { /* real network failure — caller handles a null username */ }
  return _cachedBotUsername;
}

async function handleLocation(chatId, firstName, latitude, longitude) {
  const user = await store.upsertUser({ telegramId: chatId, firstName, latitude, longitude, timezone: DEFAULT_TIMEZONE });
  await sendMessage(
    chatId,
    `✅ تم تسجيل موقعك بنجاح.\n\nإذا كانت منطقتك الزمنية ليست ${DEFAULT_TIMEZONE}، استخدم:\n/timezone Africa/Cairo (مثال)\n\nسأذكّرك تلقائيًا كل يوم عند دخول وقت الفجر.\nاستخدم /tasbeeh للتسبيح، و/adhkar لتفعيل أذكار الصباح والمساء.`,
    { keyboard: { remove_keyboard: true } }
  );
  // Real, immediate first calculation — the user shouldn't have to wait
  // for the next scheduled daily recalc tick to get a real Fajr time.
  try {
    const localDate = todayInZone(user.timezone);
    const { fajrAt } = await fetchFajrTimeForUser({ latitude, longitude, timezone: user.timezone, localDate });
    await store.upsertDailyFajr({ telegramId: chatId, localDate, fajrAt });
  } catch (err) { console.warn("[FajrBot] initial Fajr calc failed for", chatId, err.message); }
}

async function handleTimezone(chatId, args) {
  const tz = (args[0] || "").trim();
  if (!tz) return sendMessage(chatId, "الاستخدام: /timezone America/New_York");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }); // throws RangeError on an invalid IANA name — the one real validation available without a hardcoded zone list
  } catch { return sendMessage(chatId, `منطقة زمنية غير صالحة: ${tz}`); }
  const user = await store.getUser(chatId);
  if (!user) return sendMessage(chatId, "سجّل أولاً بإرسال /start.");
  await store.upsertUser({ telegramId: chatId, firstName: user.first_name, latitude: user.latitude, longitude: user.longitude, timezone: tz });
  return sendMessage(chatId, `✅ تم تحديث المنطقة الزمنية إلى ${tz}.`);
}

async function handleEarly(chatId, args) {
  const on = (args[0] || "").toLowerCase();
  if (!["on", "off"].includes(on)) return sendMessage(chatId, "الاستخدام: /early on  أو  /early off");
  await store.setEarlyReminder(chatId, on === "on");
  return sendMessage(chatId, on === "on" ? "✅ تم تفعيل التذكير المبكر (15 دقيقة قبل الفجر)." : "✅ تم إيقاف التذكير المبكر.");
}

async function handleTasbeehFreq(chatId, args) {
  const map = { off: 0, "0": 0, "1": 1, "2": 2, "3": 3 };
  const v = map[(args[0] || "").toLowerCase()];
  if (v === undefined) return sendMessage(chatId, "الاستخدام: /tasbeehfreq off|1|2|3");
  await store.setTasbeehFreq(chatId, v);
  return sendMessage(chatId, `✅ تم ضبط تذكير التسبيح: ${v === 0 ? "متوقف" : `${v} مرة/يوم`}.`);
}

async function handleAck(chatId) {
  const user = await store.getUser(chatId);
  if (!user) return;
  const localDate = todayInZone(user.timezone);
  const row = await store.acknowledgeToday(chatId, localDate);
  if (row) await sendMessage(chatId, "✅ جزاك الله خيرًا — تم تسجيل صلاتك، لن تصلك تذكيرات إضافية اليوم.");
}

// Real, self-serve diagnostic (2026-09-19, live incident: "/invite Ahmad
// only for admin, im admin") — real Telegram chat IDs are per-account,
// so the most likely real cause is the sender's own real chat_id not
// actually matching whatever ADMIN_TELEGRAM_ID is configured to on
// Render (a different Telegram account, a typo when it was set, etc.).
// This lets anyone directly compare their own real id against it,
// without needing Render log/dashboard access.
async function handleWhoami(chatId) {
  const isAdmin = Boolean(ADMIN_TELEGRAM_ID) && String(chatId) === String(ADMIN_TELEGRAM_ID);
  return sendMessage(
    chatId,
    [
      `🆔 رقم حسابك (chat_id): ${chatId}`,
      ADMIN_TELEGRAM_ID
        ? (isAdmin ? "✅ هذا الحساب مُسجَّل كمشرف." : "❌ هذا الحساب ليس المشرف المُسجَّل — تأكد أن ADMIN_TELEGRAM_ID على Render يساوي الرقم أعلاه بالضبط.")
        : "⚠️ لم يتم ضبط ADMIN_TELEGRAM_ID على Render بعد.",
    ].join("\n")
  );
}

async function handleStats(chatId) {
  if (!ADMIN_TELEGRAM_ID || String(chatId) !== String(ADMIN_TELEGRAM_ID)) return sendMessage(chatId, "هذا الأمر للمشرف فقط.");
  const s = await store.getAdminStats();
  return sendMessage(
    chatId,
    [
      "📊 إحصائيات البوت",
      "━━━━━━━━━━━━━━━━━━━━",
      `👥 مستخدمون نشطون: ${s.activeUsers} / ${s.totalUsers}`,
      `✅ صلّوا الفجر اليوم: ${s.todayAcknowledged} / ${s.todayFajrRows}`,
      `📿 فعّلوا أذكار اليوم: ${s.todayAdhkarUsers}`,
    ].join("\n")
  );
}

// ---- Real, restart-safe scheduler ticks (server.js registers these on
// its own real minute-interval job pattern — #12's own "do not depend
// only on in-memory timers" requirement is met by claimReminderStage's
// real Postgres PK-based claim below, not by anything in this loop
// itself being clever) ----

async function runFajrEscalationTick() {
  if (!isConfigured()) return { ok: false, reason: "not configured" };
  const users = await store.listActiveUsers();
  let sent = 0;
  for (const user of users) {
    try {
      const localDate = todayInZone(user.timezone);
      const daily = await store.getDailyFajr(user.telegram_id, localDate);
      if (!daily) continue; // real recalc tick fills this in — never guessed here
      const sentStages = await store.listSentStages(user.telegram_id, localDate);
      const stage = determineDueStage({
        fajrAt: new Date(daily.fajr_at), now: new Date(),
        earlyReminderEnabled: user.early_reminder_enabled, sentStages,
        acknowledged: Boolean(daily.acknowledged_at),
      });
      if (!stage) continue;
      const claim = await store.claimReminderStage(user.telegram_id, localDate, stage);
      if (!claim) continue; // real idempotency — another tick/process already claimed this exact stage
      await sendMessage(user.telegram_id, stageMessageFor(stage, user.first_name), { keyboard: ACK_KEYBOARD });
      if (stage === "fajr") await sendVoice(user.telegram_id, fajrVoiceTextFor(user.first_name)).catch(() => {});
      sent++;
    } catch (err) { console.warn("[FajrBot] escalation tick error for", user.telegram_id, err.message); }
  }
  return { ok: true, sent };
}

async function runFajrDailyRecalcTick() {
  if (!isConfigured()) return { ok: false, reason: "not configured" };
  let recalculated = 0;
  // Real per-user local "today" — a user's own calendar date can differ
  // from the server's/another user's depending on real timezone, so this
  // is checked per-user rather than once globally.
  const users = await store.listActiveUsers();
  for (const user of users) {
    try {
      const localDate = todayInZone(user.timezone);
      const existing = await store.getDailyFajr(user.telegram_id, localDate);
      if (existing) continue;
      const { fajrAt } = await fetchFajrTimeForUser({ latitude: user.latitude, longitude: user.longitude, timezone: user.timezone, localDate });
      await store.upsertDailyFajr({ telegramId: user.telegram_id, localDate, fajrAt });
      recalculated++;
    } catch (err) { console.warn("[FajrBot] daily recalc failed for", user.telegram_id, err.message); }
  }
  return { ok: true, recalculated };
}

// Real, fixed local-time slots per frequency (#9: Off/1/2/3 per day) —
// spread across the real waking part of the day, not clustered. A real,
// disclosed choice (not user-customizable beyond the frequency itself,
// matching the spec's own literal "Off / 1/day / 2/day / 3/day" ask).
const TASBEEH_SLOTS_BY_FREQ = { 1: [12], 2: [10, 16], 3: [9, 13, 18] };

function slotsDueNow(freq, nowLocal) {
  const slots = TASBEEH_SLOTS_BY_FREQ[freq] || [];
  const nowHour = nowLocal.getHours();
  return slots.map((hour, idx) => ({ idx, due: nowHour === hour })).filter((s) => s.due).map((s) => s.idx);
}

async function runFajrTasbeehReminderTick() {
  if (!isConfigured()) return { ok: false, reason: "not configured" };
  const users = await store.listActiveUsers();
  let sent = 0;
  for (const user of users) {
    if (!user.tasbeeh_freq) continue;
    try {
      const localDate = todayInZone(user.timezone);
      const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: user.timezone }));
      const dueSlots = slotsDueNow(user.tasbeeh_freq, nowLocal);
      for (const slot of dueSlots) {
        const claim = await store.claimTasbeehSlot(user.telegram_id, localDate, slot);
        if (!claim) continue; // real idempotency — same PK-claim pattern as Fajr stages
        await sendMessage(user.telegram_id, `📿 ${user.first_name || ""}، حان وقت التسبيح — سبحان الله، الحمد لله، الله أكبر.\n\nاستخدم /tasbeeh على البوت الرئيسي أو سبّح الآن.`);
        sent++;
      }
    } catch (err) { console.warn("[FajrBot] tasbeeh reminder tick error for", user.telegram_id, err.message); }
  }
  return { ok: true, sent };
}

// ---- Command dispatch ----
async function dispatchMessage(msg) {
  const chatId = msg.chat?.id;
  const firstName = msg.from?.first_name || "";
  if (!chatId) return;

  if (msg.location) return handleLocation(chatId, firstName, msg.location.latitude, msg.location.longitude);

  const text = String(msg.text || "").trim();
  if (!text.startsWith("/")) return;
  const [cmdRaw, ...args] = text.slice(1).split(/\s+/);
  const cmd = cmdRaw.toLowerCase();

  if (cmd === "start") return handleStart(chatId, firstName, args[0] || null);
  if (cmd === "timezone") return handleTimezone(chatId, args);
  if (cmd === "early") return handleEarly(chatId, args);
  if (cmd === "tasbeehfreq") return handleTasbeehFreq(chatId, args);
  if (cmd === "stats") return handleStats(chatId);
  if (cmd === "whoami") return handleWhoami(chatId);
  if (cmd === "invite") return handleInvite(chatId, args);
  if (cmd === "invites") return handleInvites(chatId);
  if (cmd === "help") {
    return sendMessage(chatId, [
      "/start — تسجيل/مشاركة الموقع",
      "/timezone <IANA> — تحديد المنطقة الزمنية",
      "/early on|off — التذكير المبكر (15 د قبل الفجر)",
      "/tasbeehfreq off|1|2|3 — عدد تذكيرات التسبيح يوميًا",
      "/whoami — عرض رقم حسابك (chat_id) والتحقق من صلاحية المشرف",
    ].join("\n"));
  }
}

async function handleCallbackQuery(cq) {
  const data = String(cq.data || "");
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  if (data === "fajr:ack" && chatId) {
    await handleAck(chatId);
    if (messageId) await editMessageText(chatId, messageId, "✅ تم تسجيل صلاتك — جزاك الله خيرًا.");
  }
  await answerCallback(cq.id);
}

// ---- Long-polling (mirrors telegram-bot.js's own proven pattern) ----
let _offset = 0;
let _polling = false;
let _pollFails = 0;

async function deleteWebhook() {
  try { await fetch(`${API}/deleteWebhook?drop_pending_updates=false`); } catch { /* best-effort */ }
}

async function pollOnce() {
  const res = await fetch(`${API}/getUpdates?offset=${_offset}&timeout=25&allowed_updates=%5B%22message%22%2C%22callback_query%22%5D`, { signal: AbortSignal.timeout(35_000) });
  const data = await res.json();
  if (!data?.ok) {
    _pollFails++;
    if (data?.error_code === 409) { await deleteWebhook(); await new Promise((r) => setTimeout(r, 10_000)); }
    return;
  }
  _pollFails = 0;
  if (!Array.isArray(data.result) || !data.result.length) return;
  for (const update of data.result) {
    _offset = update.update_id + 1;
    if (update.callback_query) { handleCallbackQuery(update.callback_query).catch((err) => console.error("[FajrBot] callback error:", err.message)); continue; }
    if (update.message) dispatchMessage(update.message).catch((err) => console.error("[FajrBot] dispatch error:", err.message));
  }
}

function startFajrBot() {
  if (!FAJR_BOT_TOKEN) { console.log("[FajrBot] FAJR_BOT_TOKEN not set — Fajr bot disabled."); return; }
  if (!store.isReady()) { console.log("[FajrBot] Postgres not configured (DATABASE_URL) — Fajr bot requires real per-user persistence, staying disabled."); return; }
  _polling = true;
  async function loop() {
    if (!_polling) return;
    try { await pollOnce(); } catch (err) { console.warn("[FajrBot] poll error:", err.message); _pollFails++; }
    const delay = _pollFails >= 5 ? 15_000 : _pollFails >= 2 ? 5_000 : 1_000;
    if (_polling) setTimeout(loop, delay);
  }
  deleteWebhook().then(() => { loop().catch(() => {}); console.log("[FajrBot] Polling started."); });
}
function stopFajrBot() { _polling = false; }

module.exports = {
  isConfigured, getStatus, startFajrBot, stopFajrBot,
  runFajrEscalationTick, runFajrDailyRecalcTick, runFajrTasbeehReminderTick, slotsDueNow,
  dispatchMessage, handleCallbackQuery,
  fajrMessageFor, fajrVoiceTextFor, stageMessageFor,
};
