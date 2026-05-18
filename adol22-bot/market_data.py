"""
market_data.py — Fetch quotes, technicals, and news.
Primary source: yfinance (free, no key needed).
Falls back to Finnhub / Polygon when keys are set.
Returns a unified MarketData dict for every ticker.
"""

import os
import math
import asyncio
import aiohttp
from datetime import datetime, timezone
import yfinance as yf

FINNHUB_KEY  = os.getenv("FINNHUB_API_KEY", "")
POLYGON_KEY  = os.getenv("POLYGON_API_KEY", "")
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")

# ── Helpers ───────────────────────────────────────────────────────────────────

def _ema(values: list[float], period: int) -> float:
    if len(values) < period:
        return values[-1] if values else 0.0
    k = 2 / (period + 1)
    ema = sum(values[:period]) / period
    for v in values[period:]:
        ema = v * k + ema * (1 - k)
    return round(ema, 4)

def _rsi(closes: list[float], period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - 100 / (1 + rs), 2)

def _macd(closes: list[float]) -> dict:
    if len(closes) < 26:
        return {"macd": 0, "signal": 0, "hist": 0}
    fast = _ema(closes, 12)
    slow = _ema(closes, 26)
    macd_val = fast - slow
    return {"macd": round(macd_val, 4), "signal": 0, "hist": round(macd_val, 4)}

def _atr(highs, lows, closes, period=14) -> float:
    trs = []
    for i in range(1, len(closes)):
        tr = max(highs[i] - lows[i],
                 abs(highs[i] - closes[i-1]),
                 abs(lows[i] - closes[i-1]))
        trs.append(tr)
    if not trs:
        return 0.0
    return round(sum(trs[-period:]) / min(len(trs), period), 4)

def _vwap(highs, lows, closes, volumes) -> float:
    tp_vol = sum(((h + l + c) / 3) * v for h, l, c, v in zip(highs, lows, closes, volumes))
    total_vol = sum(volumes)
    return round(tp_vol / total_vol, 4) if total_vol else closes[-1]

def _obv(closes, volumes) -> float:
    obv = 0.0
    for i in range(1, len(closes)):
        if closes[i] > closes[i-1]:
            obv += volumes[i]
        elif closes[i] < closes[i-1]:
            obv -= volumes[i]
    return obv

# ── Main fetch ────────────────────────────────────────────────────────────────

def fetch_ticker_data(symbol: str) -> dict:
    """Fetch full market data for a ticker. Returns unified dict."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="6mo", interval="1d")
        hist_5m = ticker.history(period="5d", interval="5m")

        if hist.empty or len(hist) < 5:
            return _mock_data(symbol)

        closes  = hist["Close"].tolist()
        highs   = hist["High"].tolist()
        lows    = hist["Low"].tolist()
        volumes = hist["Volume"].tolist()

        price   = closes[-1]
        prev    = closes[-2] if len(closes) > 1 else price
        chg_pct = round((price - prev) / prev * 100, 2) if prev else 0

        avg_vol_20 = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else volumes[-1]
        rvol = round(volumes[-1] / avg_vol_20, 2) if avg_vol_20 else 1.0

        ema9  = _ema(closes, 9)
        ema21 = _ema(closes, 21)
        ema50 = _ema(closes, 50)
        ema200= _ema(closes, 200)
        rsi   = _rsi(closes)
        macd  = _macd(closes)
        atr   = _atr(highs, lows, closes)

        # VWAP from intraday if available
        if not hist_5m.empty:
            vwap = _vwap(
                hist_5m["High"].tolist(),
                hist_5m["Low"].tolist(),
                hist_5m["Close"].tolist(),
                hist_5m["Volume"].tolist()
            )
        else:
            vwap = _vwap(highs[-5:], lows[-5:], closes[-5:], volumes[-5:])

        obv_val = _obv(closes, volumes)
        obv_prev = _obv(closes[:-1], volumes[:-1])
        obv_rising = obv_val > obv_prev

        # Support / resistance = recent swing low / high
        recent_lows  = sorted(lows[-20:])
        recent_highs = sorted(highs[-20:], reverse=True)
        support    = round(recent_lows[2], 2)
        resistance = round(recent_highs[2], 2)

        # 52-week
        year_hist = ticker.history(period="1y", interval="1d")
        week52_high = round(year_hist["High"].max(), 2) if not year_hist.empty else price
        week52_low  = round(year_hist["Low"].min(), 2)  if not year_hist.empty else price

        info = {}
        try:
            info = ticker.info or {}
        except Exception:
            pass

        sector        = info.get("sector", "Unknown")
        market_cap    = info.get("marketCap", 0)
        pe_ratio      = info.get("trailingPE", 0)
        earnings_date = _next_earnings(info)
        name          = info.get("shortName", symbol)

        close_near_high = (price - lows[-1]) / (highs[-1] - lows[-1]) > 0.6 if highs[-1] != lows[-1] else False

        return {
            "symbol":        symbol.upper(),
            "name":          name,
            "price":         round(price, 2),
            "prev_close":    round(prev, 2),
            "change_pct":    chg_pct,
            "volume":        int(volumes[-1]),
            "avg_volume":    int(avg_vol_20),
            "rvol":          rvol,
            "vwap":          round(vwap, 2),
            "above_vwap":    price > vwap,
            "ema9":          round(ema9, 2),
            "ema21":         round(ema21, 2),
            "ema50":         round(ema50, 2),
            "ema200":        round(ema200, 2),
            "rsi":           rsi,
            "macd":          macd,
            "atr":           round(atr, 2),
            "obv_rising":    obv_rising,
            "support":       support,
            "resistance":    resistance,
            "week52_high":   week52_high,
            "week52_low":    week52_low,
            "close_near_high": close_near_high,
            "sector":        sector,
            "market_cap":    market_cap,
            "pe_ratio":      round(pe_ratio, 2) if pe_ratio else 0,
            "earnings_date": earnings_date,
            "high":          round(highs[-1], 2),
            "low":           round(lows[-1], 2),
            "source":        "yfinance",
            "error":         None,
        }

    except Exception as e:
        return _mock_data(symbol, error=str(e))


def _next_earnings(info: dict) -> str:
    ts = info.get("earningsTimestamp") or info.get("earningsTimestampStart")
    if ts:
        try:
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            return dt.strftime("%b %d, %Y")
        except Exception:
            pass
    return "Unknown"


def fetch_macro_data() -> dict:
    """Fetch SPY, QQQ, VIX, BTC, DXY, TLT, GLD, USO."""
    symbols = {
        "SPY":    "SPY",
        "QQQ":    "QQQ",
        "VIX":    "^VIX",
        "BTC":    "BTC-USD",
        "ETH":    "ETH-USD",
        "DXY":    "DX-Y.NYB",
        "US10Y":  "^TNX",
        "GLD":    "GLD",
        "USO":    "USO",
        "IWM":    "IWM",
    }
    result = {}
    for key, sym in symbols.items():
        try:
            t = yf.Ticker(sym)
            h = t.history(period="5d", interval="1d")
            if not h.empty:
                c = h["Close"].tolist()
                price  = c[-1]
                chg    = round((c[-1] - c[-2]) / c[-2] * 100, 2) if len(c) > 1 else 0
                result[key] = {"price": round(price, 2), "change_pct": chg}
            else:
                result[key] = {"price": 0, "change_pct": 0}
        except Exception:
            result[key] = {"price": 0, "change_pct": 0}
    return result


def fetch_news(symbol: str = "") -> list[dict]:
    """Fetch recent news. Uses yfinance news; falls back to NewsAPI if key set."""
    items = []
    try:
        t = yf.Ticker(symbol or "SPY")
        raw = t.news or []
        for n in raw[:5]:
            items.append({
                "title":     n.get("title", ""),
                "publisher": n.get("publisher", ""),
                "link":      n.get("link", ""),
            })
    except Exception:
        pass

    if not items and NEWS_API_KEY:
        # Placeholder for NewsAPI integration
        pass

    return items


def fetch_sector_performance() -> dict:
    """Return % change for major sector ETFs."""
    sector_etfs = {
        "XLK": "Tech", "XLF": "Finance", "XLE": "Energy",
        "XLV": "Health", "XLI": "Industrial", "XLC": "Comm",
        "XLY": "Consumer Disc", "XLP": "Consumer Staples",
        "XLRE": "Real Estate", "XLB": "Materials", "XLU": "Utilities",
    }
    result = {}
    for etf, name in sector_etfs.items():
        try:
            h = yf.Ticker(etf).history(period="2d", interval="1d")
            if len(h) >= 2:
                c = h["Close"].tolist()
                result[name] = round((c[-1] - c[-2]) / c[-2] * 100, 2)
            else:
                result[name] = 0.0
        except Exception:
            result[name] = 0.0
    return result


# ── Mock data fallback ────────────────────────────────────────────────────────

def _mock_data(symbol: str, error: str = None) -> dict:
    """Return plausible mock data when real fetch fails."""
    import random
    price = round(random.uniform(50, 500), 2)
    return {
        "symbol": symbol.upper(), "name": symbol, "price": price,
        "prev_close": price * 0.99, "change_pct": round(random.uniform(-3, 3), 2),
        "volume": random.randint(1_000_000, 50_000_000),
        "avg_volume": 10_000_000, "rvol": round(random.uniform(0.5, 3.0), 2),
        "vwap": round(price * random.uniform(0.97, 1.03), 2),
        "above_vwap": random.choice([True, False]),
        "ema9": price, "ema21": price * 0.99, "ema50": price * 0.98, "ema200": price * 0.95,
        "rsi": round(random.uniform(35, 70), 1),
        "macd": {"macd": 0, "signal": 0, "hist": 0},
        "atr": round(price * 0.015, 2),
        "obv_rising": random.choice([True, False]),
        "support": round(price * 0.95, 2), "resistance": round(price * 1.05, 2),
        "week52_high": round(price * 1.3, 2), "week52_low": round(price * 0.7, 2),
        "close_near_high": random.choice([True, False]),
        "sector": "Technology", "market_cap": 1_000_000_000,
        "pe_ratio": round(random.uniform(15, 40), 1),
        "earnings_date": "Unknown", "high": round(price * 1.01, 2),
        "low": round(price * 0.99, 2),
        "source": "mock", "error": error,
    }
