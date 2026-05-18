"""
risk_manager.py — Gate every alert through risk controls.
Returns (allowed: bool, reason: str).
"""

from datetime import datetime, timezone
import watchlist as wl_store


MAX_ALERTS_PER_HOUR = 5
HIGH_VIX_THRESHOLD  = 35   # pause new longs above this
WARN_VIX_THRESHOLD  = 25   # warn but allow


def check_alert_allowed(symbol: str, signal_type: str, market_data: dict) -> tuple[bool, str]:
    """
    Run all risk gates. Returns (True, "") if allowed,
    or (False, "reason") if blocked.
    """
    settings    = wl_store.get_settings()
    daily_state = wl_store.get_daily_state()
    mode        = settings.get("mode", "balanced")
    max_loss    = float(settings.get("max_daily_loss", -2))
    daily_pnl   = float(daily_state.get("daily_pnl_r", 0))

    # ── Daily loss limit ──────────────────────────────────────────────────────
    if daily_pnl <= max_loss:
        wl_store.log_rejection(symbol, f"Daily loss limit hit ({daily_pnl}R <= {max_loss}R)")
        return False, f"🛑 Daily loss limit hit ({daily_pnl:+.2f}R). No more alerts today."

    # ── Alert rate limiting ───────────────────────────────────────────────────
    alerts_this_hour = daily_state.get("alerts_this_hour", 0)
    if alerts_this_hour >= MAX_ALERTS_PER_HOUR:
        wl_store.log_rejection(symbol, f"Rate limit: {alerts_this_hour} alerts/hr")
        return False, f"⏳ Alert rate limit: {alerts_this_hour}/{MAX_ALERTS_PER_HOUR} per hour."

    # ── VIX check ─────────────────────────────────────────────────────────────
    vix = market_data.get("vix", 0)
    if vix >= HIGH_VIX_THRESHOLD and signal_type == "BUY":
        wl_store.log_rejection(symbol, f"VIX={vix} >= {HIGH_VIX_THRESHOLD}, blocking longs")
        return False, f"⚠️ VIX={vix:.1f} — market too volatile. Long alerts paused."

    # ── Mode-based score threshold ────────────────────────────────────────────
    score = market_data.get("score", 0)
    thresholds = {"conservative": 80, "balanced": 70, "aggressive": 60}
    min_score = thresholds.get(mode, 70)
    if score < min_score:
        wl_store.log_rejection(symbol, f"Score {score} < {min_score} ({mode} mode)")
        return False, f"Score {score}/100 below {mode} threshold ({min_score})."

    # ── Market hours check ────────────────────────────────────────────────────
    now_et = _et_hour()
    if not (9 <= now_et < 16):
        # Still allow pre-market momentum if score is very high
        if score < 85:
            wl_store.log_rejection(symbol, f"Outside market hours (ET={now_et}h)")
            return False, f"🕐 Outside market hours. Alerts paused until 9:00 AM ET."

    return True, ""


def check_vix_warning(vix: float) -> str | None:
    if vix >= HIGH_VIX_THRESHOLD:
        return f"⚠️ VIX ALERT: {vix:.1f} — Extreme fear. Reduce size, avoid new longs."
    if vix >= WARN_VIX_THRESHOLD:
        return f"🟡 VIX elevated ({vix:.1f}). Trade smaller, tighter stops."
    return None


def get_position_size(risk_amount: float, entry: float, stop: float) -> dict:
    risk_per_share = abs(entry - stop)
    if risk_per_share <= 0:
        return {"shares": 0, "risk_per_share": 0, "total_risk": 0}
    shares = int(risk_amount / risk_per_share)
    return {
        "shares":        shares,
        "risk_per_share": round(risk_per_share, 2),
        "total_risk":    round(shares * risk_per_share, 2),
    }


def _et_hour() -> int:
    """Return current Eastern Time hour (approximate via UTC offset)."""
    now = datetime.now(timezone.utc)
    # EST = UTC-5, EDT = UTC-4 (rough check: Mar-Nov DST)
    month = now.month
    offset = -4 if 3 <= month <= 11 else -5
    return (now.hour + offset) % 24
