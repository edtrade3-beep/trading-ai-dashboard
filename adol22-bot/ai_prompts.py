"""
ai_prompts.py — AI analysis via Anthropic (Claude) or OpenAI fallback.
Returns a short, high-signal trade narrative for Telegram.
"""

import os

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_KEY    = os.getenv("OPENAI_API_KEY", "")


def analyze_setup(data: dict, scored: dict) -> str:
    """
    Ask the AI for a brief trade narrative on this setup.
    Returns plain text (2-4 sentences). Falls back gracefully.
    """
    prompt = _build_prompt(data, scored)

    if ANTHROPIC_KEY:
        return _ask_claude(prompt)
    if OPENAI_KEY:
        return _ask_openai(prompt)
    return _local_narrative(data, scored)


def analyze_market(macro: dict) -> str:
    """High-level market overview from AI."""
    spy   = macro.get("SPY",   {})
    qqq   = macro.get("QQQ",   {})
    vix   = macro.get("VIX",   {})
    btc   = macro.get("BTC",   {})
    us10y = macro.get("US10Y", {})

    prompt = (
        f"Institutional trader, 2-sentence market overview for today:\n"
        f"SPY {spy.get('change_pct',0):+.2f}%, QQQ {qqq.get('change_pct',0):+.2f}%, "
        f"VIX {vix.get('price',20):.1f}, BTC {btc.get('change_pct',0):+.2f}%, "
        f"US10Y {us10y.get('price',4):.2f}%.\n"
        f"Is the tape risk-on or risk-off? What should a day trader watch?"
    )

    if ANTHROPIC_KEY:
        return _ask_claude(prompt)
    if OPENAI_KEY:
        return _ask_openai(prompt)
    return _local_macro_narrative(macro)


# ── Claude ────────────────────────────────────────────────────────────────────

def _ask_claude(prompt: str) -> str:
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception as e:
        return f"[Claude unavailable: {e}]"


# ── OpenAI ────────────────────────────────────────────────────────────────────

def _ask_openai(prompt: str) -> str:
    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_KEY)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a concise institutional trading analyst. Be direct, use numbers."},
                {"role": "user",   "content": prompt},
            ],
            max_tokens=200,
            temperature=0.4,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        return f"[OpenAI unavailable: {e}]"


# ── Local fallback (no API key needed) ────────────────────────────────────────

def _local_narrative(data: dict, scored: dict) -> str:
    sym   = data["symbol"]
    price = data["price"]
    rsi   = data["rsi"]
    rvol  = data["rvol"]
    grade = scored["grade"]
    score = scored["score"]
    reasons = scored["reasons"]

    trend = "bullish" if data.get("above_vwap") and data.get("obv_rising") else "mixed"
    reason_str = reasons[0] if reasons else "technical setup"

    return (
        f"{sym} is showing a {grade}-grade ({score}/100) {trend} setup at ${price:,.2f}. "
        f"Key driver: {reason_str}. RSI {rsi} with RVOL {rvol}x confirms participation. "
        f"Manage risk with the provided stop level."
    )


def _local_macro_narrative(macro: dict) -> str:
    spy_chg = macro.get("SPY", {}).get("change_pct", 0)
    vix     = macro.get("VIX", {}).get("price", 20)

    if spy_chg > 0.5 and vix < 20:
        return "Tape is risk-on. SPY trending up with low VIX. Favor longs with momentum setups."
    elif spy_chg < -0.5 and vix > 25:
        return "Risk-off environment. SPY selling off with elevated VIX. Reduce size, favor shorts or cash."
    else:
        return "Mixed tape. Trade the ticker, not the market. Stick to high-scoring setups with defined risk."


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(data: dict, scored: dict) -> str:
    sym       = data["symbol"]
    price     = data["price"]
    chg       = data["change_pct"]
    rsi       = data["rsi"]
    rvol      = data["rvol"]
    ema9      = data["ema9"]
    ema21     = data["ema21"]
    support   = data["support"]
    resistance= data["resistance"]
    atr       = data["atr"]
    above_vwap= data["above_vwap"]
    score     = scored["score"]
    grade     = scored["grade"]
    reasons   = ", ".join(scored["reasons"][:3]) or "none"
    flags     = ", ".join(scored["flags"][:2]) or "none"

    return (
        f"Institutional day trader. Give a 2-sentence trade thesis for {sym}:\n"
        f"Price ${price:,.2f} ({chg:+.2f}%), RSI {rsi}, RVOL {rvol}x, "
        f"EMA9 ${ema9}, EMA21 ${ema21}, {'above' if above_vwap else 'below'} VWAP, "
        f"support ${support}, resistance ${resistance}, ATR ${atr}.\n"
        f"Setup score: {score}/100 ({grade}). Bullish signals: {reasons}. Flags: {flags}.\n"
        f"Is this worth trading? What is the key risk? Be specific, use numbers."
    )
