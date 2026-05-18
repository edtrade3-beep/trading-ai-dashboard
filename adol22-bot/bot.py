"""
bot.py — ADOL22 Telegram Command Deck 🤖
Main entry point. Run:  python bot.py
"""

import asyncio
import logging
import os
import aiohttp
from dotenv import load_dotenv

load_dotenv()

from telegram import (
    Update, InlineKeyboardButton, InlineKeyboardMarkup,
    KeyboardButton, ReplyKeyboardMarkup,
)
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters,
)

from market_data  import fetch_ticker_data, fetch_macro_data, fetch_sector_performance, fetch_news
from scoring      import score_setup, format_score_summary
from formatter    import (
    format_quote, format_buy_alert, format_sell_alert,
    format_watchlist, format_scan_results, format_risk_status,
    format_morning_report, format_midday_report,
)
from scanner      import scan_universe, scan_watchlist, find_top_movers, PRESETS
from ai_prompts   import analyze_setup, analyze_market
from risk_manager import check_alert_allowed, check_vix_warning, get_position_size
from scheduler    import build_scheduler
from webhook_server import start_webhook_server
import watchlist as wl_store

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO,
)
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
TOKEN      = os.getenv("TELEGRAM_BOT_TOKEN", "")
CHAT_ID    = os.getenv("TELEGRAM_CHAT_ID", "")
SERVER_URL = os.getenv("SERVER_URL", "http://localhost:3000")

if not TOKEN:
    raise RuntimeError("TELEGRAM_BOT_TOKEN not set. Check your .env file.")


# ── Auth guard ────────────────────────────────────────────────────────────────

def _authorized(update: Update) -> bool:
    """Only respond to the configured CHAT_ID."""
    if not CHAT_ID:
        return True  # open if no CHAT_ID configured
    return str(update.effective_chat.id) == str(CHAT_ID)


async def _auth_guard(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    if not _authorized(update):
        await update.message.reply_text("⛔ Unauthorized.")
        return False
    return True


# ── Main keyboard ─────────────────────────────────────────────────────────────

def _main_keyboard() -> ReplyKeyboardMarkup:
    rows = [
        [KeyboardButton("📊 Watchlist"), KeyboardButton("📈 Scan"), KeyboardButton("🌍 Macro")],
        [KeyboardButton("⚡ Top Movers"), KeyboardButton("🛡 Risk"), KeyboardButton("⚙️ Settings")],
        [KeyboardButton("❓ Help")],
    ]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, one_time_keyboard=False)


# ── /start ────────────────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    settings = wl_store.get_settings()
    mode     = settings.get("mode", "balanced")
    wl_count = len(wl_store.get_watchlist())
    text = (
        "🤖 *ADOL22 Telegram Command Deck*\n\n"
        f"Mode: *{mode.title()}*  |  Watchlist: *{wl_count} tickers*\n\n"
        "Type a ticker (e.g. `NVDA`) for a full quote.\n"
        "Use the menu buttons below or /help for all commands."
    )
    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=_main_keyboard())


# ── /help ─────────────────────────────────────────────────────────────────────

async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    text = (
        "🤖 *ADOL22 Command Reference*\n\n"
        "*Quotes & Analysis*\n"
        "  `NVDA` — full quote + score for any ticker\n"
        "  `/q NVDA` — quick quote\n"
        "  `/score NVDA` — A+ score breakdown\n"
        "  `/ai NVDA` — AI trade narrative\n"
        "  `/news NVDA` — recent news\n\n"
        "*Watchlist*\n"
        "  `/wl` — show watchlist\n"
        "  `/add NVDA AMD` — add tickers\n"
        "  `/rm NVDA` — remove ticker\n\n"
        "*Scanner*\n"
        "  `/scan` — scan all with score ≥65\n"
        "  `/scan momentum` — momentum preset\n"
        "  `/scan breakout` — breakout preset\n"
        "  `/scan rvol_spike` — RVOL 3x+ spike\n"
        "  `/movers` — top % movers\n\n"
        "*Market*\n"
        "  `/macro` — SPY/QQQ/VIX/BTC overview\n"
        "  `/sectors` — sector performance\n\n"
        "*Alerts*\n"
        "  `/alert NVDA above 900` — set price alert on platform\n"
        "  `/alert NVDA below 400 breakdown` — alert with note\n\n"
        "*Risk & Settings*\n"
        "  `/risk` — risk status\n"
        "  `/pnl +1.5` — log P/L in R\n"
        "  `/mode balanced` — conservative/balanced/aggressive\n"
        "  `/risk_amt 200` — set $ risk per trade\n"
        "  `/size NVDA 450 440` — position size (entry, stop)\n\n"
        "*Reports*\n"
        "  `/briefing` — compact situational briefing (regime + setups + P/L)\n"
        "  `/morning` — run morning brief now\n"
        "  `/midday` — run midday check-in now\n"
        "  `/status` — bot status, regime, daily P/L\n\n"
        "*Journal*\n"
        "  `/journal` — journal P/L stats overview\n"
        "  `/trades` — list open journal trades\n"
        "  `/close NVDA 450` — close most recent NVDA trade at 450\n"
        "  `/close 450` — close most recent open trade at 450\n"
        "  `/note NVDA watching VWAP` — append timestamped note to open trade\n\n"
        "*Charts*\n"
        "  `/chart NVDA` — ASCII price chart (1 month)\n"
        "  `/chart NVDA 5d` — 5-day intraday chart\n"
        "  `/chart NVDA 3mo` — 3-month chart\n\n"
        "*Game Plan*\n"
        "  `/plan` — show today's game plan from the platform\n"
        "  `/plan SPY above 590 is bullish…` — save/update today's plan\n"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


# ── /q — quick quote ──────────────────────────────────────────────────────────

async def cmd_quote(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    args = context.args
    if not args:
        await update.message.reply_text("Usage: /q NVDA")
        return
    symbol = args[0].upper()
    await update.message.reply_text(f"Fetching {symbol}...")
    data   = fetch_ticker_data(symbol)
    scored = score_setup(data)
    text   = format_quote(data, scored)
    await update.message.reply_text(text, parse_mode="Markdown")


# ── /score ────────────────────────────────────────────────────────────────────

async def cmd_score(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    args = context.args
    if not args:
        await update.message.reply_text("Usage: /score NVDA")
        return
    symbol = args[0].upper()
    await update.message.reply_text(f"Scoring {symbol}...")
    data   = fetch_ticker_data(symbol)
    scored = score_setup(data)

    lines = [format_score_summary(symbol, scored), ""]
    lines.append("*Full breakdown:*")
    for r in scored["reasons"]:
        lines.append(f"  ✅ {r}")
    for f in scored["flags"]:
        lines.append(f"  ⚠️ {f}")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ── /ai ───────────────────────────────────────────────────────────────────────

async def cmd_ai(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    args = context.args
    if not args:
        await update.message.reply_text("Usage: /ai NVDA")
        return
    symbol = args[0].upper()
    await update.message.reply_text(f"🤖 Analyzing {symbol}...")
    data   = fetch_ticker_data(symbol)
    scored = score_setup(data)
    narrative = analyze_setup(data, scored)
    text = f"🤖 *AI Analysis — {symbol}*\n\n{narrative}"
    await update.message.reply_text(text, parse_mode="Markdown")


# ── /status ───────────────────────────────────────────────────────────────────

async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    from datetime import datetime, timezone
    import pytz
    settings  = wl_store.get_settings()
    state     = wl_store.get_daily_state()
    wl        = wl_store.get_watchlist()
    macro     = fetch_macro_data()
    spy       = macro.get("SPY", {})
    vix       = macro.get("VIX", {})
    spy_chg   = spy.get("change_pct", 0)
    vix_chg   = vix.get("change_pct", 0)
    vix_price = vix.get("price", 0)
    # Determine market session from ET time
    try:
        et = pytz.timezone("US/Eastern")
        now_et = datetime.now(et)
        h, m  = now_et.hour, now_et.minute
        total = h * 60 + m
        if total < 9 * 60 + 30:
            session = "PRE-MARKET"
        elif total < 16 * 60:
            session = "LIVE"
        elif total < 20 * 60:
            session = "AFTER-HOURS"
        else:
            session = "CLOSED"
    except Exception:
        session = "UNKNOWN"
    alert_cnt = state.get("alerts_this_hour", 0)
    pnl_r     = state.get("daily_pnl_r", 0)
    mode      = settings.get("mode", "balanced")
    risk_amt  = settings.get("risk_amount", 100)
    regime    = "FEAR 🔴" if vix_chg >= 3 else "CALM 🟢" if vix_chg <= -2 else "NEUTRAL 🟡"
    text = (
        "📡 *ADOL22 Status*\n\n"
        f"Session: *{session}*\n"
        f"Regime: *{regime}*\n"
        f"SPY: `{spy_chg:+.2f}%`  |  VIX: `{vix_price:.1f}` ({vix_chg:+.2f}%)\n\n"
        f"Mode: *{mode.title()}*  |  Risk/trade: *${risk_amt}*\n"
        f"Watchlist: *{len(wl)} tickers*\n"
        f"Alerts this hour: *{alert_cnt}*/5\n"
        f"Daily P/L: *{pnl_r:+.2f}R*"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


# ── Journal HTTP helpers ──────────────────────────────────────────────────────

async def _journal_get():
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{SERVER_URL}/api/journal", timeout=aiohttp.ClientTimeout(total=8)) as resp:
            return await resp.json()

async def _journal_stats_get():
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{SERVER_URL}/api/journal/stats", timeout=aiohttp.ClientTimeout(total=8)) as resp:
            return await resp.json()

async def _journal_patch(entry_id: str, payload: dict):
    async with aiohttp.ClientSession() as session:
        async with session.patch(
            f"{SERVER_URL}/api/journal/{entry_id}",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=8),
        ) as resp:
            return await resp.json()


# ── /journal — journal stats overview ────────────────────────────────────────

async def cmd_journal_stats(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    try:
        stats = await _journal_stats_get()
    except Exception as exc:
        await update.message.reply_text(f"❌ Could not reach journal: {exc}")
        return
    if not stats or not stats.get("total"):
        await update.message.reply_text("No journal entries yet.")
        return
    total   = stats.get("total", 0)
    closed  = stats.get("closed", 0)
    wins    = stats.get("wins", 0)
    losses  = stats.get("losses", 0)
    wr      = stats.get("winRate")
    pnl     = stats.get("totalPnl")
    avg_pnl = stats.get("avgPnl")
    avg_sc  = stats.get("avgScore", 0)
    best    = stats.get("bestTrade")
    worst   = stats.get("worstTrade")
    top_t   = stats.get("topTicker")
    open_c  = stats.get("open", 0)
    wr_str  = f"{wr}%" if wr is not None else "N/A"
    pnl_icon = "🟢" if (pnl or 0) >= 0 else "🔴"
    lines = [
        "📒 *Journal Stats*\n",
        f"Total entries: *{total}*  |  Open: *{open_c}*  |  Closed: *{closed}*",
        f"Win rate: *{wr_str}*  ({wins}W / {losses}L)\n",
    ]
    if pnl is not None:
        lines.append(f"{pnl_icon} Total P/L: *${pnl:+.2f}*")
        if avg_pnl is not None:
            lines.append(f"Avg per trade: `${avg_pnl:+.2f}`")
    if avg_sc:
        lines.append(f"Avg setup score: *{avg_sc}*")
    if best:
        lines.append(f"\n🏆 Best: *{best['ticker']}*  +${best['pnl']:.2f}")
    if worst:
        lines.append(f"📉 Worst: *{worst['ticker']}*  ${worst['pnl']:.2f}")
    if top_t:
        lines.append(f"🔥 Top ticker: *{top_t['ticker']}*  {top_t['trades']} trades  +${top_t['pnl']:.2f}")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ── /trades — list open journal entries ───────────────────────────────────────

async def cmd_trades(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    try:
        data = await _journal_get()
    except Exception as exc:
        await update.message.reply_text(f"❌ Could not reach journal: {exc}")
        return
    entries = data.get("entries", [])
    open_trades = [e for e in entries if e.get("status") == "open"]
    if not open_trades:
        await update.message.reply_text("No open trades in journal.")
        return
    lines = ["📋 *Open Trades*", ""]
    for e in open_trades[-12:]:
        ticker   = e.get("ticker", "?")
        side     = e.get("side", "?")
        entry_p  = e.get("entry", 0)
        stop_p   = e.get("stopLoss") or 0
        target_p = e.get("target") or 0
        score    = e.get("score", 0)
        opened   = (e.get("openedAt") or "")[:10]
        rr_str   = ""
        if entry_p and stop_p and target_p:
            risk   = abs(entry_p - stop_p)
            reward = abs(target_p - entry_p)
            if risk:
                rr_str = f"  R:R {reward/risk:.1f}"
        lines.append(
            f"• *{ticker}* {side} @ ${entry_p:.2f}  SL ${stop_p:.2f}  TP ${target_p:.2f}{rr_str}  [{score}] ({opened})"
        )
    lines.append(f"\n_{len(open_trades)} open trade(s). Use /close TICKER PRICE to close._")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ── /close — close the most recent open trade ────────────────────────────────

async def cmd_close_trade(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    args = context.args

    if not args:
        await update.message.reply_text(
            "Usage:\n`/close NVDA 450.50` — close most recent NVDA trade\n`/close 450.50` — close most recent open trade",
            parse_mode="Markdown",
        )
        return

    # /close NVDA 450.50  OR  /close 450.50
    if len(args) >= 2:
        filter_ticker = args[0].upper()
        try:
            close_price = float(args[1])
        except ValueError:
            await update.message.reply_text("Usage: `/close NVDA 450.50`", parse_mode="Markdown")
            return
    else:
        filter_ticker = None
        try:
            close_price = float(args[0])
        except ValueError:
            await update.message.reply_text("Usage: `/close 450.50`", parse_mode="Markdown")
            return

    try:
        data = await _journal_get()
    except Exception as exc:
        await update.message.reply_text(f"❌ Could not reach journal: {exc}")
        return

    entries    = data.get("entries", [])
    open_list  = [e for e in entries if e.get("status") == "open"]
    if filter_ticker:
        open_list = [e for e in open_list if e.get("ticker") == filter_ticker]

    if not open_list:
        msg = f"No open {filter_ticker} trades found." if filter_ticker else "No open trades found."
        await update.message.reply_text(msg)
        return

    trade = open_list[-1]  # most recent
    try:
        result = await _journal_patch(trade["id"], {"status": "closed", "closePrice": close_price})
    except Exception as exc:
        await update.message.reply_text(f"❌ Failed to close: {exc}")
        return

    closed   = result.get("entry", {})
    pnl      = closed.get("pnl")
    ticker   = closed.get("ticker", "?")
    entry_p  = closed.get("entry", 0)
    pnl_icon = "🟢" if (pnl or 0) >= 0 else "🔴"
    pnl_str  = f"${pnl:+.2f}" if pnl is not None else "N/A"
    await update.message.reply_text(
        f"{pnl_icon} *Closed {ticker}*\n\nEntry: ${entry_p:.2f}  →  Close: ${close_price:.2f}\nP/L: *{pnl_str}*",
        parse_mode="Markdown",
    )


# ── /alert — set a price alert on the platform ───────────────────────────────

async def cmd_set_alert(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    args = context.args
    if len(args) < 3:
        await update.message.reply_text(
            "Usage: `/alert NVDA above 900`  or  `/alert NVDA below 400`",
            parse_mode="Markdown",
        )
        return
    symbol    = args[0].upper()
    direction = args[1].lower()
    if direction not in ("above", "below"):
        await update.message.reply_text("Direction must be `above` or `below`.", parse_mode="Markdown")
        return
    try:
        target = float(args[2])
    except ValueError:
        await update.message.reply_text("Price must be a number.")
        return
    note = " ".join(args[3:]) if len(args) > 3 else ""
    payload = {"symbol": symbol, "targetPrice": target, "direction": direction, "note": note}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{SERVER_URL}/api/price-alerts",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                data = await resp.json()
    except Exception as exc:
        await update.message.reply_text(f"❌ Could not reach platform: {exc}")
        return
    if data.get("ok"):
        arrow = "▲" if direction == "above" else "▼"
        await update.message.reply_text(
            f"🔔 Alert set: *{symbol}* {arrow} `${target:,.2f}`{(' · ' + note) if note else ''}",
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text(f"❌ {data.get('error', 'Unknown error')}")


# ── /note — append a note to the most recent open journal entry ───────────────

async def cmd_note(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    if not context.args:
        await update.message.reply_text("Usage: `/note NVDA holding above VWAP, watching for breakout`", parse_mode="Markdown")
        return

    # Optional leading ticker arg
    first = context.args[0].upper()
    import re
    if re.match(r"^[A-Z]{1,6}$", first):
        filter_ticker = first
        note_text = " ".join(context.args[1:])
    else:
        filter_ticker = None
        note_text = " ".join(context.args)

    if not note_text.strip():
        await update.message.reply_text("Please include note text after the ticker.")
        return

    try:
        data = await _journal_get()
    except Exception as exc:
        await update.message.reply_text(f"❌ Could not reach journal: {exc}")
        return

    entries   = data.get("entries", [])
    open_list = [e for e in entries if e.get("status") == "open"]
    if filter_ticker:
        open_list = [e for e in open_list if e.get("ticker") == filter_ticker]

    if not open_list:
        msg = f"No open {filter_ticker} trades found." if filter_ticker else "No open trades found."
        await update.message.reply_text(msg)
        return

    trade = open_list[-1]
    existing_notes = trade.get("notes") or ""
    new_notes = f"{existing_notes}\n[{update.message.date.strftime('%H:%M')}] {note_text}".strip() if existing_notes else f"[{update.message.date.strftime('%H:%M')}] {note_text}"

    try:
        await _journal_patch(trade["id"], {"notes": new_notes})
    except Exception as exc:
        await update.message.reply_text(f"❌ Failed to update: {exc}")
        return

    ticker = trade.get("ticker", "?")
    await update.message.reply_text(f"✏️ *Note added to {ticker}*\n_{note_text}_", parse_mode="Markdown")


# ── /news ─────────────────────────────────────────────────────────────────────

async def cmd_news(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    symbol = (context.args[0].upper() if context.args else "SPY")
    items  = fetch_news(symbol)
    if not items:
        await update.message.reply_text(f"No news found for {symbol}.")
        return
    lines = [f"📰 *{symbol} News*", ""]
    for n in items:
        title = n["title"]
        pub   = n.get("publisher", "")
        link  = n.get("link", "")
        lines.append(f"• [{title}]({link}) — {pub}")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown",
                                    disable_web_page_preview=True)


# ── /wl — watchlist ───────────────────────────────────────────────────────────

async def cmd_watchlist(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    await update.message.reply_text("Scoring watchlist...")
    wl     = wl_store.get_watchlist()
    scores = scan_watchlist(wl, min_score=0)
    text   = format_watchlist(wl, scores)
    await update.message.reply_text(text, parse_mode="Markdown")


# ── /add ─────────────────────────────────────────────────────────────────────

async def cmd_add(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    if not context.args:
        await update.message.reply_text("Usage: /add NVDA AMD TSLA")
        return
    msgs = []
    for sym in context.args:
        ok, msg = wl_store.add_ticker(sym.upper())
        msgs.append(("✅" if ok else "ℹ️") + " " + msg)
    await update.message.reply_text("\n".join(msgs))


# ── /rm ──────────────────────────────────────────────────────────────────────

async def cmd_remove(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    if not context.args:
        await update.message.reply_text("Usage: /rm NVDA")
        return
    ok, msg = wl_store.remove_ticker(context.args[0].upper())
    await update.message.reply_text(("✅ " if ok else "❌ ") + msg)


# ── /scan ─────────────────────────────────────────────────────────────────────

async def cmd_scan(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    preset = context.args[0].lower() if context.args else None
    label  = f"{preset.upper()} SCAN" if preset else "UNIVERSE SCAN"

    if preset and preset not in PRESETS:
        opts = ", ".join(PRESETS.keys())
        await update.message.reply_text(f"Unknown preset. Options: {opts}")
        return

    await update.message.reply_text(f"🔍 Running {label}...")
    wl      = wl_store.get_watchlist()
    symbols = list(set(wl + list(scan_universe.__module__ and [])))
    results = scan_universe(symbols=wl, min_score=65, preset=preset)
    text    = format_scan_results(results, label)
    await update.message.reply_text(text, parse_mode="Markdown")


# ── /movers ───────────────────────────────────────────────────────────────────

async def cmd_movers(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    await update.message.reply_text("⚡ Finding top movers...")
    wl      = wl_store.get_watchlist()
    results = find_top_movers(wl)
    text    = format_scan_results(results[:8], "TOP MOVERS")
    await update.message.reply_text(text, parse_mode="Markdown")


# ── /macro ────────────────────────────────────────────────────────────────────

async def cmd_macro(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    macro   = fetch_macro_data()
    sectors = fetch_sector_performance()
    wl      = wl_store.get_watchlist()
    scores  = scan_watchlist(wl, min_score=60)
    text    = format_morning_report(macro, sectors, scores)
    ai_note = analyze_market(macro)
    if ai_note and not ai_note.startswith("["):
        text += f"\n\n🤖 {ai_note}"
    await update.message.reply_text(text, parse_mode="Markdown")


# ── /sectors ─────────────────────────────────────────────────────────────────

async def cmd_sectors(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    sectors = fetch_sector_performance()
    sorted_s = sorted(sectors.items(), key=lambda x: x[1], reverse=True)
    lines = ["🏭 *SECTOR PERFORMANCE*", ""]
    for name, chg in sorted_s:
        icon = "🟢" if chg >= 0 else "🔴"
        lines.append(f"  {icon} {name}: {chg:+.2f}%")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ── /risk ─────────────────────────────────────────────────────────────────────

async def cmd_risk(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    settings = wl_store.get_settings()
    state    = wl_store.get_daily_state()
    macro    = fetch_macro_data()
    vix      = macro.get("VIX", {}).get("price", 20)
    pnl_r    = state.get("daily_pnl_r", 0)
    max_loss = settings.get("max_daily_loss", -2)
    paused   = pnl_r <= max_loss
    text     = format_risk_status(pnl_r, max_loss, vix, paused, settings.get("risk_amount", 100))
    await update.message.reply_text(text, parse_mode="Markdown")


# ── /pnl ─────────────────────────────────────────────────────────────────────

async def cmd_pnl(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    if not context.args:
        pnl = wl_store.get_daily_state().get("daily_pnl_r", 0)
        await update.message.reply_text(f"Today's P/L: {pnl:+.2f}R\nUse `/pnl +1.5` to add a trade result.")
        return
    try:
        r = float(context.args[0])
    except ValueError:
        await update.message.reply_text("Usage: /pnl +1.5  or  /pnl -1")
        return
    new_pnl = wl_store.update_daily_pnl(r)
    icon = "🟢" if new_pnl >= 0 else "🔴"
    await update.message.reply_text(f"{icon} Logged {r:+.2f}R. Today total: *{new_pnl:+.2f}R*", parse_mode="Markdown")


# ── /mode ─────────────────────────────────────────────────────────────────────

async def cmd_mode(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    if not context.args:
        mode = wl_store.get_mode()
        await update.message.reply_text(f"Current mode: *{mode}*\nUsage: /mode conservative|balanced|aggressive", parse_mode="Markdown")
        return
    ok, msg = wl_store.set_mode(context.args[0])
    await update.message.reply_text(("✅ " if ok else "❌ ") + msg)


# ── /risk_amt ─────────────────────────────────────────────────────────────────

async def cmd_risk_amt(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    if not context.args:
        amt = wl_store.get_risk_amount()
        await update.message.reply_text(f"Current risk amount: ${amt}\nUsage: /risk_amt 200")
        return
    try:
        amount = float(context.args[0].replace("$", ""))
    except ValueError:
        await update.message.reply_text("Usage: /risk_amt 200")
        return
    ok, msg = wl_store.set_risk_amount(amount)
    await update.message.reply_text(("✅ " if ok else "❌ ") + msg)


# ── /size — position sizing ───────────────────────────────────────────────────

async def cmd_size(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    args = context.args
    if len(args) < 3:
        await update.message.reply_text("Usage: /size NVDA 450 440  (ticker entry stop)")
        return
    symbol = args[0].upper()
    try:
        entry = float(args[1])
        stop  = float(args[2])
    except ValueError:
        await update.message.reply_text("Entry and stop must be numbers.")
        return
    risk_amt = wl_store.get_risk_amount()
    sizing   = get_position_size(risk_amt, entry, stop)
    text = (
        f"📐 *Position Size — {symbol}*\n\n"
        f"Entry: ${entry:,.2f}  |  Stop: ${stop:,.2f}\n"
        f"Risk/share: ${sizing['risk_per_share']:.2f}\n"
        f"Shares: *{sizing['shares']}* (${risk_amt} risk)\n"
        f"Total risk: ${sizing['total_risk']:,.2f}"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


# ── /morning / /midday (manual trigger) ──────────────────────────────────────

async def cmd_morning(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    await update.message.reply_text("Running morning brief...")
    macro   = fetch_macro_data()
    sectors = fetch_sector_performance()
    wl      = wl_store.get_watchlist()
    scores  = scan_watchlist(wl, min_score=60)
    text    = format_morning_report(macro, sectors, scores)
    await update.message.reply_text(text, parse_mode="Markdown")


async def cmd_briefing(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Compact situational briefing: regime + macro + top watchlist setups + risk."""
    if not await _auth_guard(update, context): return
    import pytz
    from datetime import datetime
    await update.message.reply_text("📋 Building briefing...")
    macro    = fetch_macro_data()
    wl       = wl_store.get_watchlist()
    settings = wl_store.get_settings()
    state    = wl_store.get_daily_state()

    spy = macro.get("SPY", {})
    qqq = macro.get("QQQ", {})
    vix = macro.get("VIX", {})
    spy_chg  = spy.get("change_pct", 0)
    qqq_chg  = qqq.get("change_pct", 0)
    vix_p    = vix.get("price", 20)
    vix_chg  = vix.get("change_pct", 0)

    # Session
    try:
        et = pytz.timezone("US/Eastern")
        now_et = datetime.now(et)
        total  = now_et.hour * 60 + now_et.minute
        session = "PRE-MARKET" if total < 570 else "LIVE" if total < 960 else "AFTER-HOURS" if total < 1200 else "CLOSED"
        time_str = now_et.strftime("%I:%M %p ET")
    except Exception:
        session, time_str = "UNKNOWN", "?"

    regime = "FEAR 🔴" if vix_chg >= 3 else "CALM 🟢" if vix_chg <= -2 else "NEUTRAL 🟡"

    # Scan top 5 watchlist setups
    scores  = scan_watchlist(wl, min_score=55)
    top5    = sorted(scores, key=lambda x: x.get("composite", 0), reverse=True)[:5]

    # Daily P/L
    pnl_r    = state.get("daily_pnl_r", 0)
    risk_amt = settings.get("risk_amount", 100)
    mode     = settings.get("mode", "balanced")

    lines = [
        f"📋 *ADOL22 Briefing* — {time_str}",
        f"Session: *{session}*  |  Regime: *{regime}*",
        "",
        f"SPY `{spy_chg:+.2f}%`  QQQ `{qqq_chg:+.2f}%`  VIX `{vix_p:.1f}` ({vix_chg:+.2f}%)",
        "",
    ]

    if top5:
        lines.append("*Top Setups*")
        for r in top5:
            sym   = r.get("symbol", "?")
            score = r.get("composite", 0)
            chg   = r.get("changesPercentage", 0)
            price = r.get("price", 0)
            rv    = r.get("rvol", 0)
            bar   = "▓" * min(int(score // 10), 10)
            lines.append(f"  `{sym:6}` ${price:.2f} {chg:+.2f}% RVOL {rv:.1f}x  [{score:.0f}] {bar}")
        lines.append("")

    lines += [
        f"Mode: *{mode.title()}*  |  Risk: *${risk_amt}*",
        f"Daily P/L: *{pnl_r:+.2f}R*  |  Watchlist: *{len(wl)} tickers*",
    ]

    # AI market note
    ai_note = analyze_market(macro)
    if ai_note and not ai_note.startswith("["):
        lines += ["", f"🤖 {ai_note[:280]}"]

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_midday_now(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    await update.message.reply_text("Running midday report...")
    macro   = fetch_macro_data()
    wl      = wl_store.get_watchlist()
    movers  = find_top_movers(wl)
    text    = format_midday_report(macro, movers)
    await update.message.reply_text(text, parse_mode="Markdown")


# ── /plan ─────────────────────────────────────────────────────────────────────

async def cmd_plan(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Usage: /plan — show today's plan  |  /plan <text> — set or append plan"""
    if not await _auth_guard(update, context): return
    args = context.args

    if not args:
        # GET plan
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{SERVER_URL}/api/plan", timeout=aiohttp.ClientTimeout(total=8)) as resp:
                    data = await resp.json()
            text = data.get("text", "").strip()
            updated = data.get("updatedAt", "")
            if not text:
                await update.message.reply_text("📋 No game plan set for today.\n\nUse `/plan Your plan here` to set one.", parse_mode="Markdown")
            else:
                ts = ""
                if updated:
                    try:
                        from datetime import datetime
                        ts = " · Updated " + datetime.fromisoformat(updated.replace("Z", "+00:00")).strftime("%m/%d %H:%M")
                    except Exception:
                        pass
                await update.message.reply_text(f"📋 *Today's Game Plan*{ts}\n\n{text}", parse_mode="Markdown")
        except Exception as e:
            await update.message.reply_text(f"Error fetching plan: {e}")
    else:
        # POST plan
        plan_text = " ".join(args)
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{SERVER_URL}/api/plan",
                    json={"text": plan_text},
                    timeout=aiohttp.ClientTimeout(total=8),
                ) as resp:
                    data = await resp.json()
            if data.get("ok"):
                await update.message.reply_text(f"✅ Game plan saved:\n\n_{plan_text}_", parse_mode="Markdown")
            else:
                await update.message.reply_text("Failed to save plan.")
        except Exception as e:
            await update.message.reply_text(f"Error saving plan: {e}")


# ── /chart ────────────────────────────────────────────────────────────────────

async def cmd_chart(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Usage: /chart NVDA  or  /chart NVDA 5d"""
    if not await _auth_guard(update, context): return
    args = context.args
    if not args:
        await update.message.reply_text("Usage: `/chart NVDA` or `/chart NVDA 5d`", parse_mode="Markdown")
        return

    symbol = args[0].upper()
    period = args[1] if len(args) > 1 else "1mo"
    VALID_PERIODS = {"1d","5d","1mo","3mo","6mo","1y","2y"}
    if period not in VALID_PERIODS:
        period = "1mo"

    await update.message.reply_text(f"Fetching chart for {symbol} ({period})…")

    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period, interval="1d" if period not in ("1d","5d") else ("5m" if period == "1d" else "1h"))
        if hist.empty:
            await update.message.reply_text(f"No data for {symbol}.")
            return

        closes = list(hist["Close"].dropna())
        if len(closes) < 4:
            await update.message.reply_text(f"Not enough data for {symbol}.")
            return

        # ASCII sparkline — 20 bars wide, 8 rows tall
        W, H = 20, 6
        sample = closes[::max(1, len(closes) // W)][:W]
        lo, hi = min(sample), max(sample)
        span = hi - lo or 1

        rows = []
        for row in range(H - 1, -1, -1):
            threshold = lo + span * row / (H - 1)
            line = ""
            for v in sample:
                line += "█" if v >= threshold - span / (H * 2) else " "
            rows.append(line)

        change = closes[-1] - closes[0]
        change_pct = change / closes[0] * 100
        arrow = "▲" if change >= 0 else "▼"
        color_label = "🟢" if change >= 0 else "🔴"

        chart_block = "\n".join(rows)
        caption = (
            f"📊 *{symbol}* ({period})\n"
            f"```\n{chart_block}\n```\n"
            f"{color_label} ${closes[-1]:.2f}  {arrow} {change_pct:+.2f}%\n"
            f"Range: ${lo:.2f} – ${hi:.2f}"
        )
        await update.message.reply_text(caption, parse_mode="Markdown")

    except Exception as e:
        await update.message.reply_text(f"Chart error: {e}")


# ── Free-text message handler (ticker lookup) ─────────────────────────────────

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _auth_guard(update, context): return
    text = update.message.text.strip().upper()

    # Keyboard button aliases
    button_map = {
        "📊 WATCHLIST": cmd_watchlist,
        "📈 SCAN": cmd_scan,
        "🌍 MACRO": cmd_macro,
        "⚡ TOP MOVERS": cmd_movers,
        "🛡 RISK": cmd_risk,
        "⚙️ SETTINGS": _cmd_settings,
        "❓ HELP": cmd_help,
    }
    if text in button_map:
        await button_map[text](update, context)
        return

    # Ticker lookup — 1-5 chars, letters + optional dash/dot (e.g. BTC-USD, BRK.B)
    import re
    if re.match(r'^[A-Z]{1,5}([.\-][A-Z]{1,3})?$', text):
        await update.message.reply_text(f"Fetching {text}...")
        data   = fetch_ticker_data(text)
        scored = score_setup(data)
        reply  = format_quote(data, scored)
        await update.message.reply_text(reply, parse_mode="Markdown")
        return

    # Inline BUY/SELL signal check
    parts = text.split()
    if len(parts) == 2 and parts[0] in ("BUY", "SELL", "LONG", "SHORT"):
        sym  = parts[1]
        await update.message.reply_text(f"Analyzing {sym}...")
        data   = fetch_ticker_data(sym)
        scored = score_setup(data)
        settings = wl_store.get_settings()
        if parts[0] in ("BUY", "LONG"):
            reply = format_buy_alert(data, scored, settings)
        else:
            reply = format_sell_alert(data, scored)
        await update.message.reply_text(reply, parse_mode="Markdown")
        return

    # Fallback
    await update.message.reply_text(
        "Type a ticker like `NVDA` or use /help for commands.",
        parse_mode="Markdown"
    )


async def _cmd_settings(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    settings = wl_store.get_settings()
    text = (
        "⚙️ *Settings*\n\n"
        f"Mode: *{settings.get('mode','balanced')}*\n"
        f"Risk/trade: *${settings.get('risk_amount',100)}*\n"
        f"Max daily loss: *{settings.get('max_daily_loss',-2)}R*\n\n"
        "Change with:\n"
        "`/mode balanced`\n"
        "`/risk_amt 200`"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    app = Application.builder().token(TOKEN).build()

    # Commands
    app.add_handler(CommandHandler("start",    cmd_start))
    app.add_handler(CommandHandler("status",   cmd_status))
    app.add_handler(CommandHandler("help",     cmd_help))
    app.add_handler(CommandHandler("q",        cmd_quote))
    app.add_handler(CommandHandler("quote",    cmd_quote))
    app.add_handler(CommandHandler("score",    cmd_score))
    app.add_handler(CommandHandler("ai",       cmd_ai))
    app.add_handler(CommandHandler("news",     cmd_news))
    app.add_handler(CommandHandler("wl",       cmd_watchlist))
    app.add_handler(CommandHandler("watchlist",cmd_watchlist))
    app.add_handler(CommandHandler("add",      cmd_add))
    app.add_handler(CommandHandler("rm",       cmd_remove))
    app.add_handler(CommandHandler("remove",   cmd_remove))
    app.add_handler(CommandHandler("scan",     cmd_scan))
    app.add_handler(CommandHandler("movers",   cmd_movers))
    app.add_handler(CommandHandler("macro",    cmd_macro))
    app.add_handler(CommandHandler("sectors",  cmd_sectors))
    app.add_handler(CommandHandler("risk",     cmd_risk))
    app.add_handler(CommandHandler("pnl",      cmd_pnl))
    app.add_handler(CommandHandler("mode",     cmd_mode))
    app.add_handler(CommandHandler("risk_amt", cmd_risk_amt))
    app.add_handler(CommandHandler("size",     cmd_size))
    app.add_handler(CommandHandler("morning",  cmd_morning))
    app.add_handler(CommandHandler("midday",   cmd_midday_now))
    app.add_handler(CommandHandler("briefing", cmd_briefing))
    app.add_handler(CommandHandler("alert",    cmd_set_alert))
    app.add_handler(CommandHandler("note",     cmd_note))
    app.add_handler(CommandHandler("journal",  cmd_journal_stats))
    app.add_handler(CommandHandler("trades",   cmd_trades))
    app.add_handler(CommandHandler("close",    cmd_close_trade))
    app.add_handler(CommandHandler("chart",    cmd_chart))
    app.add_handler(CommandHandler("plan",     cmd_plan))

    # Free-text (ticker lookup)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    # Post-init: start scheduler + webhook server
    async def _post_init(application: Application) -> None:
        bot     = application.bot
        chat_id = CHAT_ID
        loop    = asyncio.get_event_loop()

        # Scheduler
        scheduler = build_scheduler(bot, chat_id)
        scheduler.start()
        log.info("APScheduler started — 4 daily reports scheduled.")

        # Webhook server
        start_webhook_server(bot, chat_id, loop)

        # Startup message
        try:
            await bot.send_message(
                chat_id=chat_id,
                text="🤖 *ADOL22 Command Deck is online.*\n\nUse /start or /help to begin.",
                parse_mode="Markdown",
            )
        except Exception as e:
            log.warning("Could not send startup message: %s", e)

    app.post_init = _post_init

    log.info("Starting ADOL22 bot...")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
