"""
watchlist.py — CRUD for the watchlist stored in storage.json.
"""

import json
import os

STORAGE_FILE = os.path.join(os.path.dirname(__file__), "storage.json")

DEFAULT_WATCHLIST = ["SPY", "QQQ", "NVDA", "AAPL", "TSLA", "MSFT", "AMD", "BTC-USD", "ETH-USD"]


def _load() -> dict:
    try:
        with open(STORAGE_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return _default_storage()


def _save(data: dict) -> None:
    with open(STORAGE_FILE, "w") as f:
        json.dump(data, f, indent=2)


def _default_storage() -> dict:
    return {
        "settings": {
            "mode": "balanced",
            "risk_amount": 100,
            "max_daily_loss": -2,
            "auto_scan": False,
            "watchlist": DEFAULT_WATCHLIST[:],
        },
        "daily_state": {
            "date": "",
            "daily_pnl_r": 0,
            "alerts_this_hour": 0,
            "hour_window_start": None,
        },
        "rejected_log": [],
    }


# ── Watchlist ─────────────────────────────────────────────────────────────────

def get_watchlist() -> list[str]:
    return _load()["settings"].get("watchlist", DEFAULT_WATCHLIST[:])


def add_ticker(symbol: str) -> tuple[bool, str]:
    symbol = symbol.upper().strip()
    data = _load()
    wl = data["settings"].setdefault("watchlist", [])
    if symbol in wl:
        return False, f"{symbol} is already on your watchlist."
    wl.append(symbol)
    _save(data)
    return True, f"Added {symbol} to watchlist. ({len(wl)} tickers)"


def remove_ticker(symbol: str) -> tuple[bool, str]:
    symbol = symbol.upper().strip()
    data = _load()
    wl = data["settings"].setdefault("watchlist", [])
    if symbol not in wl:
        return False, f"{symbol} not found in watchlist."
    wl.remove(symbol)
    _save(data)
    return True, f"Removed {symbol}. ({len(wl)} tickers remaining)"


def clear_watchlist() -> None:
    data = _load()
    data["settings"]["watchlist"] = []
    _save(data)


# ── Settings ──────────────────────────────────────────────────────────────────

def get_settings() -> dict:
    return _load()["settings"]


def set_setting(key: str, value) -> tuple[bool, str]:
    allowed = {"mode", "risk_amount", "max_daily_loss", "auto_scan"}
    if key not in allowed:
        return False, f"Unknown setting: {key}"
    data = _load()
    data["settings"][key] = value
    _save(data)
    return True, f"Set {key} = {value}"


def get_mode() -> str:
    return get_settings().get("mode", "balanced")


def set_mode(mode: str) -> tuple[bool, str]:
    valid = {"conservative", "balanced", "aggressive"}
    mode = mode.lower()
    if mode not in valid:
        return False, f"Invalid mode. Choose: {', '.join(valid)}"
    return set_setting("mode", mode)


def get_risk_amount() -> float:
    return float(get_settings().get("risk_amount", 100))


def set_risk_amount(amount: float) -> tuple[bool, str]:
    if amount <= 0:
        return False, "Risk amount must be positive."
    return set_setting("risk_amount", amount)


# ── Daily state ───────────────────────────────────────────────────────────────

def get_daily_state() -> dict:
    return _load()["daily_state"]


def update_daily_pnl(r_value: float) -> float:
    data = _load()
    data["daily_state"]["daily_pnl_r"] = round(
        data["daily_state"].get("daily_pnl_r", 0) + r_value, 2
    )
    _save(data)
    return data["daily_state"]["daily_pnl_r"]


def reset_daily_state(date_str: str) -> None:
    data = _load()
    data["daily_state"] = {
        "date": date_str,
        "daily_pnl_r": 0,
        "alerts_this_hour": 0,
        "hour_window_start": None,
    }
    _save(data)


def increment_alert_count() -> int:
    data = _load()
    data["daily_state"]["alerts_this_hour"] = data["daily_state"].get("alerts_this_hour", 0) + 1
    _save(data)
    return data["daily_state"]["alerts_this_hour"]


def reset_alert_count() -> None:
    data = _load()
    data["daily_state"]["alerts_this_hour"] = 0
    data["daily_state"]["hour_window_start"] = None
    _save(data)


# ── Rejected log ─────────────────────────────────────────────────────────────

def log_rejection(symbol: str, reason: str) -> None:
    from datetime import datetime
    data = _load()
    data.setdefault("rejected_log", []).append({
        "symbol": symbol,
        "reason": reason,
        "ts": datetime.now().isoformat(),
    })
    # Keep last 100
    data["rejected_log"] = data["rejected_log"][-100:]
    _save(data)


def get_rejected_log(limit: int = 10) -> list[dict]:
    return _load().get("rejected_log", [])[-limit:]
