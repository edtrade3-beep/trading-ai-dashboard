// Server-side autopilot — trades A+ buy-points on the Alpaca PAPER account even
// when NO browser is open. OFF unless SERVER_AUTOPILOT="on". LONGS ONLY (shorts
// stay browser-side for safety). Mirrors the client guards: market-hours only,
// daily-loss breaker, max positions, total open-risk ceiling, no re-buying a
// symbol already held. PAPER only — never live.
const path = require("node:path");
const { sendTelegramMessage, isConfigured } = require("./telegram");
const { PORT, ROOT } = require("./config");
const { appendJournal } = require("./autopilot-journal");
const { getClosedTrades } = require("./routes/alpaca");
const { computeLearningGates, isAllowed } = require("./learning-engine");
const { isOn } = require("./utils");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const {
  isMarketHoursET, checkAccountHealth, dailyLossBreakerTripped,
  weeklyLossBreakerTripped, totalDrawdownBreakerTripped, updateWeeklyDrawdownState,
  openRiskPct, sectorCapExceeded, sizePositionByRisk, sectorOf,
} = require("./risk-guardrails");

// Weekly + total drawdown breakers (Master Build Spec §16-17, 2026-08-23).
// server-autopilot.js has no persisted state today (its daily breaker
// uses Alpaca's own native last_equity field, no snapshot needed) — this
// is a new, small, durable store using the same real atomic-write.js
// primitives every other data/*.json store in this app already uses
// (transparently Postgres-backed when DATABASE_URL is set — see
// atomic-write.js's own header for why raw fs writes would silently lose
// this on every Render restart).
const RISK_STATE_PATH = path.join(ROOT, "data", "autopilot-risk-state.json");
const DEFAULT_RISK_STATE = { weekAnchorDate: "", weekStartEquity: 0, peakEquity: 0 };
function readRiskState() { return { ...DEFAULT_RISK_STATE, ...readJsonSafe(RISK_STATE_PATH, null) }; }
function writeRiskState(state) { writeJsonAtomic(RISK_STATE_PATH, state); }

// Curated liquid market leaders — the kind of names the Trend Template works best
// on. Added to your watchlist so there are always candidates to find trades.
const LEADERS = [
  "NVDA","MSFT","AAPL","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","PLTR","SNOW","MU","QCOM",
  "ANET","MRVL","SMCI","ARM","COIN","HOOD","UBER","ABNB","SHOP","INTU",
  "LLY","V","MA","JPM","COST","WMT","HD","AXP","GE","CAT",
];

const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
const APCA = "https://paper-api.alpaca.markets";
function keys() {
  return {
    id: process.env.ALPACA_KEY_ID || process.env.ALPACA_API_KEY_ID || "",
    secret: process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET_KEY || "",
  };
}
async function apca(path, method = "GET", body = null) {
  const { id, secret } = keys();
  if (!id || !secret) return null;
  try {
    const r = await fetch(`${APCA}${path}`, {
      method,
      headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data: j };
  } catch { return null; }
}
async function getJson(path) { try { const r = await fetch(`${BASE()}${path}`); return await r.json(); } catch { return null; }
}

async function runServerAutopilot() {
  if (!isOn(process.env.SERVER_AUTOPILOT)) return;
  // Emergency Stop (2026-08-24) — the one real, global kill switch shared
  // across all 4 automated-execution systems, checked first.
  if (require("./emergency-stop").isEmergencyStopActive()) return;
  const { id, secret } = keys();
  if (!id || !secret) return;
  if (!isMarketHoursET()) return;

  const acctR = await apca("/v2/account");
  if (!acctR || !acctR.ok) return;
  const acct = acctR.data;
  const equity   = Number(acct.equity) || 0;
  const lastEq   = Number(acct.last_equity) || equity;
  // Size off CASH, not buying_power — buying_power includes margin (borrowed
  // money). Cash-only means the account can never lever up on the long side.
  const cash     = Math.max(0, Number(acct.cash) || 0);
  const buyPower = cash;
  // Account health gate — never trade a blown, debit, or restricted account.
  const health = checkAccountHealth({ equity, cash: Number(acct.cash) || 0, tradingBlocked: acct.trading_blocked, accountBlocked: acct.account_blocked });
  if (!health.ok) return;

  // Daily-loss circuit breaker: stop opening new trades after −2% on the day.
  if (dailyLossBreakerTripped({ equity, startOfDayEquity: lastEq, maxLossPct: 2 })) return;

  // Weekly + total drawdown breakers (Master Build Spec §16-17, 2026-08-23)
  // — real, persisted weekStartEquity/peakEquity (RISK_STATE_PATH above).
  // weekStartEquity resets on the first real check of a new ET week;
  // peakEquity is a continuously-updated all-time high-water mark, never
  // reset. 5%/15% match the user's own chosen thresholds (roughly
  // 2.5x/7.5x the daily breaker above).
  const riskState = readRiskState();
  updateWeeklyDrawdownState(riskState, equity);
  writeRiskState(riskState);
  if (weeklyLossBreakerTripped({ equity, weekStartEquity: riskState.weekStartEquity, maxLossPct: 5 })) return;
  if (totalDrawdownBreakerTripped({ equity, peakEquity: riskState.peakEquity, maxDrawdownPct: 15 })) return;

  const posR = await apca("/v2/positions");
  const positions = (posR && posR.ok && Array.isArray(posR.data)) ? posR.data : [];
  const normPositions = positions.map(p => ({ symbol: p.symbol, qty: p.qty, avgEntryPrice: p.avg_entry_price }));
  const held = new Set(positions.map(p => p.symbol));
  // Raised 12->20 (2026-08-19, real user report: "not having lots of
  // trades" — confirmed live in production the account had sat pinned at
  // exactly 12/12 positions since 2026-07-23, ~4 weeks, silently blocking
  // every single tick before it even looked at the watchlist, regardless
  // of how many good Tier A/B setups existed. Safe to raise: aggregate
  // risk is still independently capped by openRiskPct below (6% of
  // equity) and per-sector by maxPerSector — this cap was blocking trade
  // COUNT specifically, not exposure.
  const maxPos = Number(process.env.SERVER_AUTOPILOT_MAXPOS) || 20;
  if (positions.length >= maxPos) return;

  // Total open-risk ceiling (Σ |qty|×entry×5% assumed stop) ≤ 6% of equity.
  const maxRiskPct = Number(process.env.SERVER_AUTOPILOT_MAXRISK) || 6;
  if (openRiskPct({ positions: normPositions, equity }) >= maxRiskPct) return;

  // Universe = your watchlist + a curated set of liquid market leaders, so there
  // are always enough candidates to find trades (more opportunities = more trades).
  // Real primary watchlist (data/watchlist.json) — not settings.watchlistSymbols,
  // a separate legacy store found to have silently diverged (2026-08-14 unify).
  let syms = [];
  try { syms = require("./routes/watchlist").loadWatchlist().symbols || []; } catch {}
  syms = [...new Set([...syms, ...LEADERS].filter(Boolean))].slice(0, 60);
  if (!syms.length) return;
  // withDecision=1 (One Engine Migration Phase 6) attaches the real
  // am-core-engine.js verdict per row — same real pipeline now driving
  // every other real BUY signal in this app (Workspace banner, Scanner
  // grade, all 5 alert files). Real automated order placement previously
  // gated on _buildTrendTemplate's own pre-unification atBuyPoint/
  // volConfirmed/passCount/actionable/extended fields directly — the last
  // real consumer of that legacy shape (One Engine Migration Phase 7,
  // 2026-08-23).
  const screen = await getJson(`/api/market/trend-screen?symbols=${encodeURIComponent(syms.join(","))}&withDecision=1`);
  const eligible = ((screen && screen.results) || [])
    .filter(r => !r.error && !held.has(r.symbol) && Number(r.entry) > 0 && Number(r.stop) > 0 && Number(r.entry) > Number(r.stop))
    // Tier A = Core Engine EARLY_BUY (score >=85, real entry, clears the
    // full hard-gate cascade) — full size, same role as the old
    // atBuyPoint&&volConfirmed gate. Tier B = Core Engine BUY (score >=70)
    // — half size, same role as the old passCount>=7&&actionable&&!extended
    // gate. Both now share the exact real hard-gate cascade (structure
    // broken, do-not-chase, critical red flags, Stage 4, bearish daily
    // bias, entry-score floor) the old fields never checked at all.
    .map(r => {
      const coreClean = r.coreCriticalFlags === 0;
      const tierA = coreClean && r.coreVerdict === "EARLY_BUY";
      const tierB = coreClean && r.coreVerdict === "BUY";
      return { ...r, tier: tierA ? "A" : (tierB ? "B" : null) };
    })
    .filter(r => r.tier)
    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "A" ? -1 : 1) || (b.passCount - a.passCount) || ((b.rsRating || 0) - (a.rsRating || 0)));
  if (!eligible.length) return;

  // Learning Engine — real per-tier/per-sector win rate off actual closed
  // trades, gating OUT only what's proven to genuinely lose (never boosts a
  // tier/sector for a good streak). Best-effort: a fetch/compute failure
  // falls back to fully-open gates rather than blocking trading over a
  // diagnostic hiccup — this is a refinement on top of the real ranking
  // below, not a dependency it can't run without.
  let tierGates = {}, sectorGates = {};
  try {
    const { ok, trades } = await getClosedTrades();
    if (ok) ({ tierGates, sectorGates } = computeLearningGates(trades));
  } catch {}
  const gatedOutTiers = eligible.filter(r => !isAllowed(tierGates[r.tier])).map(r => r.symbol);
  const eligibleAfterLearning = eligible.filter(r => isAllowed(tierGates[r.tier]));
  if (gatedOutTiers.length) {
    console.log(`[Server autopilot] Learning Engine paused tier(s) for: ${gatedOutTiers.join(", ")}`);
  }
  if (!eligibleAfterLearning.length) return;

  const riskPct = Number(process.env.SERVER_AUTOPILOT_RISK) || 1;   // % of equity per FULL-size trade
  // Sector-correlation cap: don't hold more than N positions in one sector.
  const maxPerSector = Number(process.env.SERVER_AUTOPILOT_MAXSECTOR) || 3;
  const heldPositions = [...normPositions];   // grows as buys are placed, so the sector cap sees them
  let slots = maxPos - positions.length;
  let placed = 0;
  let availCash = buyPower;   // running cash budget — decremented as buys are placed
  for (const r of eligibleAfterLearning) {
    if (slots <= 0) break;
    if (sectorCapExceeded({ positions: heldPositions, symbol: r.symbol, maxPerSector })) continue;
    const sectorGate = sectorGates[sectorOf(r.symbol)];
    if (!isAllowed(sectorGate)) { console.log(`[Server autopilot] Learning Engine paused sector for ${r.symbol}: ${sectorGate.reason}`); continue; }
    const entry = Number(r.entry), stop = Number(r.stop);
    const target = Number(r.target2) > entry ? Number(r.target2) : +(entry + (entry - stop) * 2).toFixed(2);
    const riskFrac = r.tier === "A" ? riskPct : riskPct * 0.5;   // Tier B trades at half size
    const qty = sizePositionByRisk({ equity, riskPct: riskFrac, entry, stop, availCash, maxNamePct: 20 });
    if (qty < 1) continue;
    const order = {
      symbol: r.symbol, qty: String(qty), side: "buy", type: "market", time_in_force: "day",
      order_class: "bracket",
      take_profit: { limit_price: String(target) },
      stop_loss: { stop_price: String(+stop.toFixed(2)) },
      // Idempotency: one buy per symbol per day — a retry can't duplicate it.
      client_order_id: `sap-${r.symbol}-${new Date().toISOString().slice(0, 10)}`,
    };
    const res = await apca("/v2/orders", "POST", order);
    if (res && res.ok) {
      slots--; placed++; availCash -= qty * entry;
      heldPositions.push({ symbol: r.symbol, qty, avgEntryPrice: entry });
      // Journal the setup tags so we can later see which setups actually win.
      // sector: added for AI-Memory-style pattern mining (journal-analytics.js)
      // — "which sector do I actually trade well" was previously uncomputed
      // anywhere in the app despite sectorOf() already existing for the
      // sector-cap guardrail above.
      appendJournal({ ts: Date.now(), symbol: r.symbol, tier: r.tier, side: "long", qty,
        entry, stop, target, passCount: r.passCount, rsRating: r.rsRating || null, source: "server",
        sector: sectorOf(r.symbol) });
      if (isConfigured()) sendTelegramMessage(
        `🤖 SERVER AUTOPILOT — BUY ${r.symbol} (Tier ${r.tier})\n${qty} sh @ ~$${entry} (paper · bracket)\nStop $${stop} · Target $${target}\n(no browser needed · ${riskFrac.toFixed(2)}% risk)`
      ).catch(() => {});
    }
  }
  if (placed) console.log(`[Server autopilot] placed ${placed} order(s)`);
}

module.exports = { runServerAutopilot };
