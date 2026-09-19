"use strict";
// fajr-bot-store.js (2026-09-19, "Fajr & Tasbeeh bot for 200+ users")
// — real Postgres schema + query helpers for the new multi-user Fajr bot.
// Reuses atomic-write.js's already-shared, already-bounded pg.Pool
// (getPool()) — never a second Postgres pool against the same
// DATABASE_URL (that exact mistake caused a real production OOM incident
// this codebase's own history already documents; every other real
// Postgres-backed store here follows the same "reuse the one shared
// pool" rule).
//
// Genuine relational tables (NOT the generic kv_store blob table
// atomic-write.js's own file-store shim uses) — this feature needs real
// per-user rows with real constraints/indexes and, critically, a real
// database-backed idempotency guarantee (a PRIMARY KEY that a scheduler
// can INSERT ... ON CONFLICT DO NOTHING against) so a Render restart, a
// double-fired tick, or a future second server instance can never send
// the same Fajr reminder stage twice. That guarantee is impossible to get
// safely from one shared JSON blob.
const { getPool, isDbMode } = require("./atomic-write");

const STAGES = ["early", "fajr", "followup1", "followup2"];

let _ready = false;

// Called once from server.js, after initPgStore() has already run (same
// sequencing every other real Postgres-backed store in this app follows —
// see server.js's own comment chain). No-ops entirely when DATABASE_URL
// isn't set — this whole feature requires real per-user persistence, so
// it stays disabled (not silently degraded to file-mode) without it; see
// isReady()/isAvailable() below, checked before the bot ever starts.
// Real fix (2026-09-19, live incident: adding FAJR_BOT_TOKEN/etc. env
// vars appeared to leave the WHOLE app on a stale build — the real
// suspected cause is this function throwing during its own schema setup,
// which (before this fix) propagated straight through server.js's boot
// chain into process.exit(1) — a bug in this one new bolt-on feature
// taking down the entire, already-working trading platform. That
// directly violates the user's own explicit priority #1 ("keep the
// existing Render deployment working"). initPgStore() itself legitimately
// stays fatal (dozens of existing features depend on that one connection
// succeeding); this feature does not get that same blast radius — any
// failure here is caught, logged clearly, and leaves _ready false (the
// bot stays honestly disabled) instead of crashing the process.
async function initFajrBotStore() {
  if (!isDbMode()) return;
  const pool = getPool();
  if (!pool) return;
  try {
    await _createSchema(pool);
    _ready = true;
    console.log("[fajr-bot-store] Postgres schema ready.");
  } catch (err) {
    console.error("[fajr-bot-store] Schema setup failed — Fajr bot stays disabled, rest of the app boots normally:", err.message);
  }
}

async function _createSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fajr_users (
      telegram_id BIGINT PRIMARY KEY,
      first_name TEXT NOT NULL DEFAULT '',
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'America/New_York',
      early_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      tasbeeh_freq SMALLINT NOT NULL DEFAULT 0 CHECK (tasbeeh_freq BETWEEN 0 AND 3),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Real per-user, per-day Fajr time — recalculated daily (real lat/lng
  // changes seasonally, DST, etc.), never derived client-side. One real
  // row per (user, day), so a recompute is a real, idempotent UPSERT.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fajr_daily (
      telegram_id BIGINT NOT NULL REFERENCES fajr_users(telegram_id) ON DELETE CASCADE,
      local_date DATE NOT NULL,
      fajr_at TIMESTAMPTZ NOT NULL,
      acknowledged_at TIMESTAMPTZ,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (telegram_id, local_date)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fajr_daily_fajr_at ON fajr_daily (fajr_at) WHERE acknowledged_at IS NULL`);
  // The real idempotency guarantee (#12's own explicit ask: "prevent
  // duplicate reminder execution... database-backed locking, not just
  // in-memory timers, restart-safe"). Sending stage X for (user, day) is
  // always attempted via claimStage() below, whose real INSERT ... ON
  // CONFLICT DO NOTHING RETURNING * either wins this exact row (send it)
  // or finds it already claimed (skip — regardless of whether THIS
  // process or a prior one before a restart claimed it).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fajr_reminder_sent (
      telegram_id BIGINT NOT NULL,
      local_date DATE NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('early','fajr','followup1','followup2')),
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (telegram_id, local_date, stage),
      FOREIGN KEY (telegram_id, local_date) REFERENCES fajr_daily (telegram_id, local_date) ON DELETE CASCADE
    )
  `);
  // Real adhkar (morning/evening) completion tracking (#10) — one real row
  // per (user, day, kind) claimed the same idempotent way, so a duplicate
  // send/tap can never double-log a day as done twice.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fajr_adhkar_log (
      telegram_id BIGINT NOT NULL REFERENCES fajr_users(telegram_id) ON DELETE CASCADE,
      local_date DATE NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('morning','evening')),
      completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (telegram_id, local_date, kind)
    )
  `);
  // Real Tasbeeh reminder send-log — same idempotent claim shape, keyed
  // by the slot index within the day (0-based, up to tasbeeh_freq-1) so a
  // user's "2/day" setting can never fire 3 times on a retried tick.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fajr_tasbeeh_reminder_sent (
      telegram_id BIGINT NOT NULL REFERENCES fajr_users(telegram_id) ON DELETE CASCADE,
      local_date DATE NOT NULL,
      slot SMALLINT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (telegram_id, local_date, slot)
    )
  `);
  // Real admin-generated invitations (2026-09-19, explicit user request:
  // "add users with name send telgram invitation") — a real Telegram bot
  // can NEVER message someone who hasn't started a conversation with it
  // first (a hard platform anti-spam rule, not something any code here
  // can work around). What IS real and buildable: the admin generates a
  // real, personalized deep-link (https://t.me/<bot>?start=<code>) here,
  // sends it to the person through their own real channel (WhatsApp/SMS/
  // Telegram directly), and when that person taps it, the bot's own
  // /start handler recognizes the code and greets them by the real name
  // the admin gave — plus lets the admin see who has/hasn't joined yet.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fajr_invites (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      used_at TIMESTAMPTZ,
      telegram_id BIGINT
    )
  `);
}

function isReady() { return _ready; }

// ---- Users ----

async function upsertUser({ telegramId, firstName, latitude, longitude, timezone }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO fajr_users (telegram_id, first_name, latitude, longitude, timezone, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (telegram_id) DO UPDATE SET
       first_name = EXCLUDED.first_name, latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude, timezone = EXCLUDED.timezone,
       active = TRUE, updated_at = now()
     RETURNING *`,
    [telegramId, firstName || "", latitude, longitude, timezone]
  );
  return rows[0];
}

async function getUser(telegramId) {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM fajr_users WHERE telegram_id = $1", [telegramId]);
  return rows[0] || null;
}

async function setActive(telegramId, active) {
  const pool = getPool();
  await pool.query("UPDATE fajr_users SET active = $2, updated_at = now() WHERE telegram_id = $1", [telegramId, active]);
}

async function setEarlyReminder(telegramId, enabled) {
  const pool = getPool();
  await pool.query("UPDATE fajr_users SET early_reminder_enabled = $2, updated_at = now() WHERE telegram_id = $1", [telegramId, enabled]);
}

async function setTasbeehFreq(telegramId, freq) {
  const f = Math.max(0, Math.min(3, Number(freq) || 0));
  const pool = getPool();
  await pool.query("UPDATE fajr_users SET tasbeeh_freq = $2, updated_at = now() WHERE telegram_id = $1", [telegramId, f]);
}

async function listActiveUsers() {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM fajr_users WHERE active = TRUE");
  return rows;
}

// ---- Daily Fajr time ----

async function upsertDailyFajr({ telegramId, localDate, fajrAt }) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO fajr_daily (telegram_id, local_date, fajr_at, computed_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (telegram_id, local_date) DO UPDATE SET fajr_at = EXCLUDED.fajr_at, computed_at = now()`,
    [telegramId, localDate, fajrAt]
  );
}

async function getDailyFajr(telegramId, localDate) {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM fajr_daily WHERE telegram_id = $1 AND local_date = $2", [telegramId, localDate]);
  return rows[0] || null;
}

// Real acknowledgement — set once, first tap wins (subsequent taps are a
// harmless no-op via the WHERE guard), immediately visible to any
// escalation tick already in flight or about to run (checked via
// getDailyFajr/listDueForEscalation before firing a later stage).
async function acknowledgeToday(telegramId, localDate) {
  const pool = getPool();
  const { rows } = await pool.query(
    "UPDATE fajr_daily SET acknowledged_at = now() WHERE telegram_id = $1 AND local_date = $2 AND acknowledged_at IS NULL RETURNING *",
    [telegramId, localDate]
  );
  return rows[0] || null;
}

// Real rows needing a fresh recompute today — every active user without
// a fajr_daily row for the given date yet.
async function listUsersMissingDailyFajr(localDate) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT u.* FROM fajr_users u
     LEFT JOIN fajr_daily d ON d.telegram_id = u.telegram_id AND d.local_date = $1
     WHERE u.active = TRUE AND d.telegram_id IS NULL`,
    [localDate]
  );
  return rows;
}

// ---- Idempotent reminder claiming (the real #12 guarantee) ----

// Attempts to CLAIM stage X for (telegramId, localDate). Returns the real
// inserted row if this call won the claim (caller should send), or null
// if it was already claimed (by this or a prior process/tick — caller
// must skip). This is the one real mechanism that makes duplicate-send
// prevention survive a Render restart: the claim lives in Postgres, not
// in any in-memory timer/flag.
async function claimReminderStage(telegramId, localDate, stage) {
  if (!STAGES.includes(stage)) throw new Error(`Unknown reminder stage: ${stage}`);
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO fajr_reminder_sent (telegram_id, local_date, stage) VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id, local_date, stage) DO NOTHING RETURNING *`,
    [telegramId, localDate, stage]
  );
  return rows[0] || null;
}

async function listSentStages(telegramId, localDate) {
  const pool = getPool();
  const { rows } = await pool.query("SELECT stage FROM fajr_reminder_sent WHERE telegram_id = $1 AND local_date = $2", [telegramId, localDate]);
  return rows.map((r) => r.stage);
}

// ---- Adhkar tracking ----

async function claimAdhkar(telegramId, localDate, kind) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO fajr_adhkar_log (telegram_id, local_date, kind) VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id, local_date, kind) DO NOTHING RETURNING *`,
    [telegramId, localDate, kind]
  );
  return rows[0] || null;
}

// ---- Tasbeeh reminder claiming ----

async function claimTasbeehSlot(telegramId, localDate, slot) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO fajr_tasbeeh_reminder_sent (telegram_id, local_date, slot) VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id, local_date, slot) DO NOTHING RETURNING *`,
    [telegramId, localDate, slot]
  );
  return rows[0] || null;
}

// ---- Admin stats (#11) ----

async function getAdminStats() {
  const pool = getPool();
  const [users, todayAck, adhkarToday] = await Promise.all([
    pool.query("SELECT COUNT(*) FILTER (WHERE active) AS active, COUNT(*) AS total FROM fajr_users"),
    pool.query("SELECT COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL) AS acked, COUNT(*) AS total FROM fajr_daily WHERE local_date = CURRENT_DATE"),
    pool.query("SELECT COUNT(DISTINCT telegram_id) AS n FROM fajr_adhkar_log WHERE local_date = CURRENT_DATE"),
  ]);
  return {
    activeUsers: Number(users.rows[0]?.active || 0),
    totalUsers: Number(users.rows[0]?.total || 0),
    todayAcknowledged: Number(todayAck.rows[0]?.acked || 0),
    todayFajrRows: Number(todayAck.rows[0]?.total || 0),
    todayAdhkarUsers: Number(adhkarToday.rows[0]?.n || 0),
  };
}

// ---- Admin invitations ("add users with name send telegram invitation") ----

// Real, unique invite code — a short random string, real PRIMARY KEY
// collision-checked (regenerates on the rare real conflict) rather than
// a long UUID, since it has to be typed/pasted as part of a real
// t.me/<bot>?start=<code> link a human will actually handle.
function _randomCode() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}

async function createInvite(name) {
  const pool = getPool();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = _randomCode();
    const { rows } = await pool.query(
      "INSERT INTO fajr_invites (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING RETURNING *",
      [code, name]
    );
    if (rows[0]) return rows[0];
  }
  throw new Error("Could not generate a unique real invite code after 5 attempts.");
}

async function getInvite(code) {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM fajr_invites WHERE code = $1", [code]);
  return rows[0] || null;
}

// Real, idempotent claim — first real /start with this code wins; a
// second tap of the same link (or a retried update) is a harmless no-op
// via the WHERE guard, never double-attributed to two different users.
async function markInviteUsed(code, telegramId) {
  const pool = getPool();
  const { rows } = await pool.query(
    "UPDATE fajr_invites SET used_at = now(), telegram_id = $2 WHERE code = $1 AND used_at IS NULL RETURNING *",
    [code, telegramId]
  );
  return rows[0] || null;
}

async function listInvites() {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM fajr_invites ORDER BY created_at DESC LIMIT 200");
  return rows;
}

module.exports = {
  STAGES, initFajrBotStore, isReady,
  upsertUser, getUser, setActive, setEarlyReminder, setTasbeehFreq, listActiveUsers,
  upsertDailyFajr, getDailyFajr, acknowledgeToday, listUsersMissingDailyFajr,
  claimReminderStage, listSentStages,
  claimAdhkar, claimTasbeehSlot,
  getAdminStats,
  createInvite, getInvite, markInviteUsed, listInvites,
};
