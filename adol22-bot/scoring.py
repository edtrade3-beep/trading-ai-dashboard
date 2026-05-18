"""
scoring.py — A+ setup scoring engine (0–100).
Higher score = stronger setup. 70+ = alert-worthy.
"""

from market_data import fetch_ticker_data


def score_setup(data: dict) -> dict:
    """
    Score a ticker setup 0–100.
    Returns { score, grade, reasons, flags }.
    """
    score = 0
    reasons = []
    flags = []

    price     = data.get("price", 0)
    rsi       = data.get("rsi", 50)
    rvol      = data.get("rvol", 1.0)
    change    = data.get("change_pct", 0)
    atr       = data.get("atr", 0)
    macd      = data.get("macd", {})
    above_vwap = data.get("above_vwap", False)
    obv_rising = data.get("obv_rising", False)
    ema9      = data.get("ema9", price)
    ema21     = data.get("ema21", price)
    ema50     = data.get("ema50", price)
    ema200    = data.get("ema200", price)
    support   = data.get("support", 0)
    resistance= data.get("resistance", 0)
    week52_h  = data.get("week52_high", price)
    week52_l  = data.get("week52_low", price)
    close_near_high = data.get("close_near_high", False)
    market_cap= data.get("market_cap", 0)
    volume    = data.get("volume", 0)
    avg_vol   = data.get("avg_volume", 1)

    # ── Trend alignment ──────────────────────────────────────────────────────
    if price > ema9 > ema21 > ema50:
        score += 20
        reasons.append("EMA stack bullish (9>21>50)")
    elif price > ema9 > ema21:
        score += 12
        reasons.append("Short-term EMAs bullish")
    elif price < ema9 < ema21 < ema50:
        score += 20
        reasons.append("EMA stack bearish (short)")
        flags.append("BEARISH_TREND")

    if price > ema200:
        score += 8
        reasons.append("Above 200 EMA (bull market)")
    else:
        flags.append("BELOW_200EMA")

    # ── Momentum ─────────────────────────────────────────────────────────────
    if 55 <= rsi <= 75:
        score += 15
        reasons.append(f"RSI momentum zone ({rsi})")
    elif 25 <= rsi <= 45:
        score += 10
        reasons.append(f"RSI oversold bounce zone ({rsi})")
        flags.append("OVERSOLD")
    elif rsi > 80:
        score -= 5
        flags.append("RSI_OVERBOUGHT")
    elif rsi < 25:
        score -= 5
        flags.append("RSI_EXTREME_OVERSOLD")

    # ── Volume ───────────────────────────────────────────────────────────────
    if rvol >= 3.0:
        score += 15
        reasons.append(f"RVOL {rvol}x — exceptional volume surge")
    elif rvol >= 2.0:
        score += 10
        reasons.append(f"RVOL {rvol}x — strong volume")
    elif rvol >= 1.5:
        score += 5
        reasons.append(f"RVOL {rvol}x — above average volume")
    elif rvol < 0.7:
        score -= 5
        flags.append("LOW_VOLUME")

    # ── VWAP ─────────────────────────────────────────────────────────────────
    if above_vwap:
        score += 8
        reasons.append("Price above VWAP (intraday bullish)")
    else:
        flags.append("BELOW_VWAP")

    # ── OBV ──────────────────────────────────────────────────────────────────
    if obv_rising:
        score += 7
        reasons.append("OBV rising (accumulation)")
    else:
        flags.append("OBV_DECLINING")

    # ── MACD ─────────────────────────────────────────────────────────────────
    hist = macd.get("hist", 0)
    macd_val = macd.get("macd", 0)
    if hist > 0 and macd_val > 0:
        score += 8
        reasons.append("MACD bullish crossover")
    elif hist < 0 and macd_val < 0:
        flags.append("MACD_BEARISH")

    # ── Price action ─────────────────────────────────────────────────────────
    if close_near_high:
        score += 5
        reasons.append("Closing near intraday high (strength)")

    # Near 52-week high (momentum breakout zone)
    if week52_h > 0:
        pct_from_high = (price - week52_h) / week52_h * 100
        if -5 <= pct_from_high <= 2:
            score += 8
            reasons.append("Near 52-week high (breakout watch)")
        elif pct_from_high < -40:
            flags.append("FAR_FROM_52W_HIGH")

    # ── Support proximity (risk/reward) ──────────────────────────────────────
    if support > 0 and atr > 0:
        dist_to_support = price - support
        if 0 < dist_to_support <= atr * 1.5:
            score += 5
            reasons.append("Price near support (<1.5 ATR)")

    # ── Liquidity filter ─────────────────────────────────────────────────────
    if market_cap >= 10_000_000_000:  # $10B+
        score += 3
        reasons.append("Large-cap liquidity")
    elif market_cap < 500_000_000 and market_cap > 0:
        flags.append("SMALL_CAP_RISK")

    if avg_vol < 500_000:
        flags.append("ILLIQUID")
        score -= 5

    # ── Daily change context ─────────────────────────────────────────────────
    if 1.5 <= change <= 8:
        score += 5
        reasons.append(f"+{change}% day move — momentum day")
    elif change > 15:
        flags.append("EXTENDED_MOVE")
        score -= 3
    elif change < -8:
        flags.append("SHARP_SELLOFF")

    # Clamp score
    score = max(0, min(100, score))

    # Grade
    if score >= 85:
        grade = "A+"
    elif score >= 75:
        grade = "A"
    elif score >= 65:
        grade = "B+"
    elif score >= 55:
        grade = "B"
    elif score >= 45:
        grade = "C"
    else:
        grade = "D"

    return {
        "score":   score,
        "grade":   grade,
        "reasons": reasons,
        "flags":   flags,
    }


def score_ticker(symbol: str) -> dict:
    """Fetch + score a ticker in one call."""
    data = fetch_ticker_data(symbol)
    result = score_setup(data)
    result["data"] = data
    return result


def format_score_summary(symbol: str, scored: dict) -> str:
    """Short text summary for Telegram."""
    score = scored["score"]
    grade = scored["grade"]
    reasons = scored["reasons"][:3]
    flags = scored["flags"][:3]

    bar = "█" * (score // 10) + "░" * (10 - score // 10)
    lines = [
        f"📊 *{symbol}* — Grade: *{grade}* ({score}/100)",
        f"`{bar}`",
    ]
    if reasons:
        lines.append("✅ " + " · ".join(reasons[:2]))
    if flags:
        lines.append("⚠️ " + " · ".join(flags[:2]))
    return "\n".join(lines)
