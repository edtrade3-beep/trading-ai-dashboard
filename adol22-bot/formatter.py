"""
formatter.py — Format trade alerts, market reports, and bot messages for Telegram.
All output uses Telegram MarkdownV2-safe formatting helpers.
"""

from datetime import datetime, timezone


# ── Safe markdown ─────────────────────────────────────────────────────────────

def _esc(text: str) -> str:
    """Escape special MarkdownV2 chars."""
    special = r"\_*[]()~`>#+-=|{}.!"
    return "".join(f"\\{c}" if c in special else c for c in str(text))


def _pct(val: float) -> str:
    sign = "+" if val >= 0 else ""
    return f"{sign}{val:.2f}%"


def _arrow(val: float) -> str:
    return "🟢" if val >= 0 else "🔴"


# ── Trade alert ───────────────────────────────────────────────────────────────

def format_buy_alert(data: dict, scored: dict, settings: dict) -> str:
    sym       = data["symbol"]
    price     = data["price"]
    atr       = data["atr"]
    support   = data["support"]
    resistance= data["resistance"]
    rsi       = data["rsi"]
    rvol      = data["rvol"]
    change    = data["change_pct"]
    score     = scored["score"]
    grade     = scored["grade"]
    reasons   = scored["reasons"][:3]
    flags     = scored["flags"][:2]
    risk_amt  = settings.get("risk_amount", 100)

    stop     = round(support - atr * 0.3, 2)
    target1  = round(price + atr * 2, 2)
    target2  = round(resistance + atr * 0.5, 2)
    risk_per = round(price - stop, 2)
    shares   = int(risk_amt / risk_per) if risk_per > 0 else 0
    rr       = round((target1 - price) / risk_per, 1) if risk_per > 0 else 0

    lines = [
        f"🚀 *BUY ALERT — {sym}* | Grade *{grade}* ({score}/100)",
        f"",
        f"💰 Price: *${price:,.2f}*  {_arrow(change)} {_pct(change)}",
        f"📈 RSI: {rsi}  |  RVOL: {rvol}x",
        f"",
        f"📌 *TRADE PLAN*",
        f"  Entry:   ${price:,.2f}",
        f"  Stop:    ${stop:,.2f}  (−${risk_per:.2f}/share)",
        f"  T1:      ${target1:,.2f}  ({rr}R)",
        f"  T2:      ${target2:,.2f}",
        f"  Size:    {shares} shares (${risk_amt} risk)",
        f"",
    ]

    if reasons:
        lines.append("✅ " + "  ·  ".join(reasons))
    if flags:
        lines.append("⚠️ Flags: " + ", ".join(flags))

    lines += [
        f"",
        f"🕐 {_timestamp()}",
    ]
    return "\n".join(lines)


def format_sell_alert(data: dict, scored: dict) -> str:
    sym    = data["symbol"]
    price  = data["price"]
    change = data["change_pct"]
    rsi    = data["rsi"]
    rvol   = data["rvol"]
    score  = scored["score"]
    flags  = scored["flags"]

    lines = [
        f"🔻 *SELL / SHORT ALERT — {sym}* | Score {score}/100",
        f"",
        f"💰 Price: *${price:,.2f}*  {_arrow(change)} {_pct(change)}",
        f"📉 RSI: {rsi}  |  RVOL: {rvol}x",
    ]
    if flags:
        lines.append("⚠️ " + ", ".join(flags[:3]))
    lines += ["", f"🕐 {_timestamp()}"]
    return "\n".join(lines)


# ── Morning report ────────────────────────────────────────────────────────────

def format_morning_report(macro: dict, sectors: dict, watchlist_scores: list) -> str:
    spy   = macro.get("SPY",   {})
    qqq   = macro.get("QQQ",   {})
    vix   = macro.get("VIX",   {})
    btc   = macro.get("BTC",   {})
    dxy   = macro.get("DXY",   {})
    us10y = macro.get("US10Y", {})

    lines = [
        "☀️ *ADOL22 MORNING BRIEF*",
        f"📅 {datetime.now().strftime('%A, %b %d %Y')}",
        "",
        "📊 *MACRO OVERVIEW*",
        f"  SPY  {_arrow(spy.get('change_pct',0))} ${spy.get('price',0):,.2f} ({_pct(spy.get('change_pct',0))})",
        f"  QQQ  {_arrow(qqq.get('change_pct',0))} ${qqq.get('price',0):,.2f} ({_pct(qqq.get('change_pct',0))})",
        f"  VIX  ${vix.get('price',0):.2f} ({_pct(vix.get('change_pct',0))})",
        f"  BTC  ${btc.get('price',0):,.0f} ({_pct(btc.get('change_pct',0))})",
        f"  DXY  ${dxy.get('price',0):.2f}  |  10Y {us10y.get('price',0):.2f}%",
        "",
        "🏭 *TOP SECTORS*",
    ]

    sorted_sectors = sorted(sectors.items(), key=lambda x: x[1], reverse=True)
    for name, chg in sorted_sectors[:5]:
        lines.append(f"  {_arrow(chg)} {name}: {_pct(chg)}")

    if watchlist_scores:
        lines += ["", "⭐ *TOP SETUPS TODAY*"]
        for item in watchlist_scores[:5]:
            sym   = item["data"]["symbol"]
            score = item["score"]
            grade = item["grade"]
            price = item["data"]["price"]
            chg   = item["data"]["change_pct"]
            lines.append(f"  {sym} — {grade} ({score}) | ${price:,.2f} {_pct(chg)}")

    lines += ["", "🤖 ADOL22 Command Deck | /help for commands"]
    return "\n".join(lines)


# ── Midday report ─────────────────────────────────────────────────────────────

def format_midday_report(macro: dict, top_movers: list) -> str:
    spy = macro.get("SPY", {})
    vix = macro.get("VIX", {})

    lines = [
        "🕐 *MIDDAY CHECK-IN*",
        f"SPY {_arrow(spy.get('change_pct',0))} ${spy.get('price',0):,.2f} ({_pct(spy.get('change_pct',0))})",
        f"VIX ${vix.get('price',0):.2f}",
        "",
        "📊 *WATCHLIST MOVERS*",
    ]
    for item in top_movers[:5]:
        sym   = item["data"]["symbol"]
        price = item["data"]["price"]
        chg   = item["data"]["change_pct"]
        score = item["score"]
        lines.append(f"  {_arrow(chg)} {sym} ${price:,.2f} ({_pct(chg)}) — {score}/100")

    lines += ["", f"🕐 {_timestamp()}"]
    return "\n".join(lines)


# ── Close report ──────────────────────────────────────────────────────────────

def format_close_report(macro: dict, watchlist_scores: list, daily_pnl_r: float) -> str:
    spy = macro.get("SPY", {})
    qqq = macro.get("QQQ", {})

    pnl_icon = "🟢" if daily_pnl_r >= 0 else "🔴"
    lines = [
        "🔔 *MARKET CLOSE SUMMARY*",
        "",
        f"📊 SPY {_arrow(spy.get('change_pct',0))} {_pct(spy.get('change_pct',0))}",
        f"📊 QQQ {_arrow(qqq.get('change_pct',0))} {_pct(qqq.get('change_pct',0))}",
        "",
        f"{pnl_icon} *Today's P/L: {daily_pnl_r:+.2f}R*",
        "",
        "📋 *WATCHLIST CLOSE SCORES*",
    ]
    for item in watchlist_scores[:8]:
        sym   = item["data"]["symbol"]
        price = item["data"]["price"]
        chg   = item["data"]["change_pct"]
        grade = item["grade"]
        lines.append(f"  {_arrow(chg)} {sym} ${price:,.2f} ({_pct(chg)}) [{grade}]")

    lines += ["", "See you tomorrow. 🤖 ADOL22"]
    return "\n".join(lines)


# ── Quote card ────────────────────────────────────────────────────────────────

def format_quote(data: dict, scored: dict = None) -> str:
    sym    = data["symbol"]
    name   = data.get("name", sym)
    price  = data["price"]
    prev   = data["prev_close"]
    chg    = data["change_pct"]
    vol    = data["volume"]
    avg_v  = data["avg_volume"]
    rvol   = data["rvol"]
    rsi    = data["rsi"]
    vwap   = data["vwap"]
    ema9   = data["ema9"]
    ema21  = data["ema21"]
    ema50  = data["ema50"]
    atr    = data["atr"]
    sup    = data["support"]
    res    = data["resistance"]
    w52h   = data["week52_high"]
    w52l   = data["week52_low"]
    above  = "✅ Above VWAP" if data["above_vwap"] else "❌ Below VWAP"
    source = data.get("source", "?")

    lines = [
        f"📈 *{sym}* — {name}",
        f"💰 *${price:,.2f}*  {_arrow(chg)} {_pct(chg)}  (prev ${prev:,.2f})",
        f"",
        f"📊 Volume: {vol:,} | Avg: {avg_v:,} | RVOL: {rvol}x",
        f"📉 RSI: {rsi}  |  ATR: ${atr}",
        f"📍 VWAP: ${vwap:,.2f}  — {above}",
        f"",
        f"📐 EMAs — 9: ${ema9:,.2f} | 21: ${ema21:,.2f} | 50: ${ema50:,.2f}",
        f"🛡 Support: ${sup:,.2f}  |  Resistance: ${res:,.2f}",
        f"📅 52W: ${w52l:,.2f} — ${w52h:,.2f}",
    ]

    if scored:
        lines += [
            f"",
            f"⭐ Score: *{scored['score']}/100* [{scored['grade']}]",
        ]
        if scored["reasons"]:
            lines.append("✅ " + " · ".join(scored["reasons"][:2]))
        if scored["flags"]:
            lines.append("⚠️ " + " · ".join(scored["flags"][:2]))

    lines += [f"", f"🔌 Source: {source} | 🕐 {_timestamp()}"]
    return "\n".join(lines)


# ── Watchlist summary ─────────────────────────────────────────────────────────

def format_watchlist(watchlist: list, scores: list) -> str:
    score_map = {s["data"]["symbol"]: s for s in scores}
    lines = ["📋 *YOUR WATCHLIST*", ""]
    for sym in watchlist:
        s = score_map.get(sym)
        if s:
            price = s["data"]["price"]
            chg   = s["data"]["change_pct"]
            grade = s["grade"]
            lines.append(f"  {_arrow(chg)} *{sym}* ${price:,.2f} ({_pct(chg)}) [{grade}]")
        else:
            lines.append(f"  ⬜ *{sym}* — no data")
    lines += ["", f"🕐 {_timestamp()}"]
    return "\n".join(lines)


# ── Scanner results ───────────────────────────────────────────────────────────

def format_scan_results(results: list, label: str = "SCAN RESULTS") -> str:
    if not results:
        return f"🔍 *{label}*\n\nNo setups found matching criteria."

    lines = [f"🔍 *{label}* — {len(results)} setups", ""]
    for item in results[:10]:
        sym   = item["data"]["symbol"]
        price = item["data"]["price"]
        chg   = item["data"]["change_pct"]
        rvol  = item["data"]["rvol"]
        score = item["score"]
        grade = item["grade"]
        lines.append(
            f"  {_arrow(chg)} *{sym}* ${price:,.2f} ({_pct(chg)}) "
            f"RVOL {rvol}x | *{grade}* {score}/100"
        )

    lines += ["", f"🕐 {_timestamp()}"]
    return "\n".join(lines)


# ── Risk status ───────────────────────────────────────────────────────────────

def format_risk_status(daily_pnl_r: float, max_daily_loss: float, vix: float,
                       paused: bool, risk_amount: float) -> str:
    status = "🔴 TRADING PAUSED" if paused else "🟢 TRADING ACTIVE"
    pnl_icon = "🟢" if daily_pnl_r >= 0 else "🔴"
    vix_icon = "⚠️" if vix > 30 else ("🟡" if vix > 20 else "🟢")

    return "\n".join([
        f"🛡 *RISK MANAGER STATUS*",
        f"",
        f"Status: {status}",
        f"{pnl_icon} Today P/L: {daily_pnl_r:+.2f}R (limit: {max_daily_loss}R)",
        f"{vix_icon} VIX: {vix:.1f}",
        f"💵 Risk/trade: ${risk_amount}",
        f"",
        f"🕐 {_timestamp()}",
    ])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _timestamp() -> str:
    return datetime.now().strftime("%b %d, %Y  %H:%M")
