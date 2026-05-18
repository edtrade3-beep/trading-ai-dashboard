"""
scanner.py — Scan a list of tickers for high-scoring setups.
Runs concurrently and returns sorted results.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from market_data import fetch_ticker_data
from scoring import score_setup

# Default scan universe (extend as needed)
SCAN_UNIVERSE = [
    "SPY", "QQQ", "NVDA", "AAPL", "MSFT", "TSLA", "AMD", "META",
    "GOOGL", "AMZN", "NFLX", "SMCI", "ARM", "PLTR", "COIN",
    "MARA", "RIOT", "SHOP", "SQ", "SOFI", "HOOD", "UPST",
    "IONQ", "QUBT", "RGTI", "MSTR", "GME", "AMC",
    "GLD", "SLV", "USO", "TLT", "IWM", "XLK", "XLE",
    "BTC-USD", "ETH-USD",
]


# ── Filters ───────────────────────────────────────────────────────────────────

def _passes_momentum(data: dict) -> bool:
    return (
        data["rvol"] >= 1.5 and
        data["rsi"] >= 55 and
        data["above_vwap"] and
        data["change_pct"] >= 1.0
    )


def _passes_breakout(data: dict) -> bool:
    w52h = data["week52_high"]
    price = data["price"]
    return (
        w52h > 0 and
        (price / w52h) >= 0.95 and      # within 5% of 52-week high
        data["rvol"] >= 2.0 and
        data["obv_rising"]
    )


def _passes_rvol_spike(data: dict) -> bool:
    return data["rvol"] >= 3.0


def _passes_oversold_bounce(data: dict) -> bool:
    return (
        data["rsi"] <= 35 and
        data["obv_rising"] and
        data["change_pct"] > 0
    )


PRESETS = {
    "momentum":       _passes_momentum,
    "breakout":       _passes_breakout,
    "rvol_spike":     _passes_rvol_spike,
    "oversold":       _passes_oversold_bounce,
}


# ── Core scanner ──────────────────────────────────────────────────────────────

def scan_universe(symbols: list[str] = None, min_score: int = 65,
                  preset: str = None, max_results: int = 10) -> list[dict]:
    """
    Scan symbols list (defaults to SCAN_UNIVERSE + watchlist).
    Returns top results sorted by score descending.
    """
    if symbols is None:
        symbols = SCAN_UNIVERSE[:]

    # Deduplicate
    symbols = list(dict.fromkeys(s.upper() for s in symbols))

    filter_fn = PRESETS.get(preset) if preset else None

    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_ticker_data, sym): sym for sym in symbols}
        for future, sym in futures.items():
            try:
                data = future.result(timeout=15)
                if data.get("error") and data.get("source") == "mock":
                    continue
                scored = score_setup(data)
                if scored["score"] < min_score:
                    continue
                if filter_fn and not filter_fn(data):
                    continue
                results.append({**scored, "data": data})
            except Exception:
                pass

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:max_results]


def scan_watchlist(watchlist: list[str], min_score: int = 65) -> list[dict]:
    """Score every ticker in the watchlist."""
    return scan_universe(symbols=watchlist, min_score=min_score, max_results=len(watchlist))


def find_top_movers(symbols: list[str] = None) -> list[dict]:
    """Return tickers sorted by absolute % change (movers)."""
    if symbols is None:
        symbols = SCAN_UNIVERSE[:]

    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_ticker_data, sym): sym for sym in symbols}
        for future, sym in futures.items():
            try:
                data = future.result(timeout=15)
                scored = score_setup(data)
                results.append({**scored, "data": data})
            except Exception:
                pass

    results.sort(key=lambda x: abs(x["data"].get("change_pct", 0)), reverse=True)
    return results[:15]
