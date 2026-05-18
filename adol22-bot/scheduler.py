"""
scheduler.py — APScheduler jobs for the 4 daily reports.
Reports fire at:  7:00 AM ET  (pre-market brief)
                  10:30 AM ET (open + first hour recap)
                   1:30 PM ET (midday check-in)
                   4:00 PM ET (close summary)
"""

import asyncio
import logging
import os
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import aiohttp

from market_data  import fetch_macro_data, fetch_sector_performance
from scanner      import scan_watchlist, find_top_movers
from formatter    import (format_morning_report, format_midday_report,
                          format_close_report)
from ai_prompts   import analyze_market
import watchlist as wl_store

SERVER_URL = os.getenv("SERVER_URL", "http://localhost:3000")

log = logging.getLogger(__name__)


async def _send(bot, chat_id: str, text: str) -> None:
    try:
        await bot.send_message(
            chat_id=chat_id,
            text=text,
            parse_mode="Markdown",
        )
    except Exception as e:
        log.error("Scheduler send error: %s", e)


# ── Report jobs ───────────────────────────────────────────────────────────────

async def job_morning_brief(bot, chat_id: str) -> None:
    log.info("Running morning brief...")
    try:
        macro   = fetch_macro_data()
        sectors = fetch_sector_performance()
        wl      = wl_store.get_watchlist()
        scores  = scan_watchlist(wl, min_score=60)

        text = format_morning_report(macro, sectors, scores)

        # Append today's game plan if set
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{SERVER_URL}/api/plan", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    plan_data = await resp.json()
            plan_text = (plan_data.get("text") or "").strip()
            if plan_text:
                text += f"\n\n📋 *Today's Plan:* {plan_text[:300]}"
        except Exception:
            pass

        # Append earnings today / this week
        try:
            from market_data import fetch_ticker_data
            from datetime import datetime, timezone
            today_str = datetime.now(timezone.utc).strftime("%b %d, %Y")
            today_syms, week_syms = [], []
            for sym in wl[:20]:
                try:
                    d = fetch_ticker_data(sym)
                    ed = d.get("earnings_date", "")
                    if not ed or ed == "Unknown":
                        continue
                    dt = datetime.strptime(ed, "%b %d, %Y").replace(tzinfo=timezone.utc)
                    days_away = (dt - datetime.now(timezone.utc)).days
                    if days_away == 0:
                        today_syms.append(sym)
                    elif 1 <= days_away <= 5:
                        week_syms.append(f"{sym} ({ed})")
                except Exception:
                    pass
            if today_syms:
                text += f"\n\n⚡ *EARNINGS TODAY:* {', '.join(today_syms)}"
            elif week_syms:
                text += f"\n\n📅 *Earnings this week:* {', '.join(week_syms[:5])}"
        except Exception:
            pass

        # Append AI market read if available
        ai_note = analyze_market(macro)
        if ai_note and not ai_note.startswith("["):
            text += f"\n\n🤖 *AI TAKE:* {ai_note}"

        await _send(bot, chat_id, text)
        log.info("Morning brief sent.")
    except Exception as e:
        log.error("Morning brief error: %s", e)
        await _send(bot, chat_id, f"⚠️ Morning brief error: {e}")


async def job_open_recap(bot, chat_id: str) -> None:
    log.info("Running open recap (10:30 AM)...")
    try:
        macro   = fetch_macro_data()
        wl      = wl_store.get_watchlist()
        movers  = find_top_movers(wl)

        text = format_midday_report(macro, movers)
        text = "📊 *FIRST HOUR RECAP*\n\n" + text.split("*MIDDAY", 1)[-1].lstrip("*\n").strip()
        text = "📊 *FIRST HOUR RECAP*\n" + "\n".join(text.split("\n")[1:])

        await _send(bot, chat_id, text)
    except Exception as e:
        log.error("Open recap error: %s", e)


async def job_midday(bot, chat_id: str) -> None:
    log.info("Running midday report (1:30 PM)...")
    try:
        macro  = fetch_macro_data()
        wl     = wl_store.get_watchlist()
        movers = find_top_movers(wl)

        text = format_midday_report(macro, movers)
        await _send(bot, chat_id, text)
    except Exception as e:
        log.error("Midday report error: %s", e)


async def job_close_summary(bot, chat_id: str) -> None:
    log.info("Running close summary (4:00 PM)...")
    try:
        macro   = fetch_macro_data()
        wl      = wl_store.get_watchlist()
        scores  = scan_watchlist(wl, min_score=0)  # all tickers for close review
        pnl_r   = wl_store.get_daily_state().get("daily_pnl_r", 0)

        text = format_close_report(macro, scores, pnl_r)
        await _send(bot, chat_id, text)

        # Reset daily alert counter for next day
        wl_store.reset_alert_count()
    except Exception as e:
        log.error("Close summary error: %s", e)


# ── Scheduler setup ───────────────────────────────────────────────────────────

def build_scheduler(bot, chat_id: str) -> AsyncIOScheduler:
    """
    Create and configure the APScheduler with all 4 daily jobs.
    Timezone: US/Eastern.
    """
    scheduler = AsyncIOScheduler(timezone="US/Eastern")

    scheduler.add_job(
        lambda: asyncio.ensure_future(job_morning_brief(bot, chat_id)),
        CronTrigger(hour=7, minute=0, timezone="US/Eastern"),
        id="morning_brief",
        name="Morning Brief (7:00 AM ET)",
        replace_existing=True,
    )
    scheduler.add_job(
        lambda: asyncio.ensure_future(job_open_recap(bot, chat_id)),
        CronTrigger(hour=10, minute=30, timezone="US/Eastern"),
        id="open_recap",
        name="Open Recap (10:30 AM ET)",
        replace_existing=True,
    )
    scheduler.add_job(
        lambda: asyncio.ensure_future(job_midday(bot, chat_id)),
        CronTrigger(hour=13, minute=30, timezone="US/Eastern"),
        id="midday",
        name="Midday Check-in (1:30 PM ET)",
        replace_existing=True,
    )
    scheduler.add_job(
        lambda: asyncio.ensure_future(job_close_summary(bot, chat_id)),
        CronTrigger(hour=16, minute=0, timezone="US/Eastern"),
        id="close_summary",
        name="Close Summary (4:00 PM ET)",
        replace_existing=True,
    )

    return scheduler
