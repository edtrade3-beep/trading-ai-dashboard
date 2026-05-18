# ADOL22 Telegram Command Deck 🤖

A personal AI-powered Telegram trading bot. Get real-time quotes, technical scores, market scans, scheduled reports, and TradingView webhook alerts — all from Telegram.

## Quick Start

### 1. Install dependencies
```bash
cd adol22-bot
pip install -r requirements.txt
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

Minimum required:
```
TELEGRAM_BOT_TOKEN=your_token_from_botfather
TELEGRAM_CHAT_ID=your_chat_id
```

Optional (for AI analysis):
```
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

### 3. Run
```bash
python bot.py
```

The bot will send a startup message to your Telegram chat.

---

## Features

| Feature | Command |
|---|---|
| Full quote + score | Type `NVDA` |
| Quick quote | `/q NVDA` |
| A+ score breakdown | `/score NVDA` |
| AI trade narrative | `/ai NVDA` |
| Recent news | `/news NVDA` |
| Watchlist | `/wl` |
| Add tickers | `/add NVDA AMD` |
| Remove ticker | `/rm NVDA` |
| Universe scan | `/scan` |
| Momentum scan | `/scan momentum` |
| Breakout scan | `/scan breakout` |
| RVOL spike scan | `/scan rvol_spike` |
| Top movers | `/movers` |
| Macro overview | `/macro` |
| Sector performance | `/sectors` |
| Risk status | `/risk` |
| Log trade P/L | `/pnl +1.5` |
| Position sizing | `/size NVDA 450 440` |
| Set mode | `/mode aggressive` |
| Set risk amount | `/risk_amt 200` |
| Manual morning brief | `/morning` |
| Manual midday report | `/midday` |

---

## Scheduled Reports

| Time (ET) | Report |
|---|---|
| 7:00 AM | Morning brief — macro, sectors, top setups |
| 10:30 AM | First hour recap — movers update |
| 1:30 PM | Midday check-in |
| 4:00 PM | Close summary — watchlist grades, daily P/L |

---

## TradingView Webhook

The bot runs an HTTP server on `WEBHOOK_PORT` (default 8080).

**POST** `/webhook` with JSON:
```json
{
  "secret": "your_TRADINGVIEW_SECRET",
  "symbol": "NVDA",
  "action": "BUY",
  "price": 923.45
}
```

Actions: `BUY`, `SELL`, `ALERT`

Set the URL in TradingView alerts: `http://your-server:8080/webhook`

---

## Scoring System

Setups are scored 0–100:

| Grade | Score | Description |
|---|---|---|
| A+ | 85–100 | Exceptional setup — full size |
| A | 75–84 | Strong setup — standard size |
| B+ | 65–74 | Good setup — reduced size |
| B | 55–64 | Marginal — skip unless confirmed |
| C/D | <55 | Avoid |

Score factors: EMA stack, RSI zone, RVOL, VWAP, OBV, MACD, 52-week high proximity, support proximity, market cap.

---

## Risk Controls

- **Daily loss limit**: No alerts after hitting max daily loss (default -2R)
- **Alert rate limit**: Max 5 alerts per hour
- **VIX gate**: Long alerts paused when VIX > 35
- **Mode thresholds**: Conservative = 80+ score, Balanced = 70+, Aggressive = 60+
- **Market hours**: Alerts gated to 9 AM–4 PM ET (high-score setups can pass pre-market)

---

## Deployment (VPS / Render.com)

1. Set all env vars in your platform's dashboard
2. Start command: `python bot.py`
3. For webhook, ensure port 8080 (or `WEBHOOK_PORT`) is open
4. The bot uses long-polling — no reverse proxy needed for Telegram

### Running as a service (Linux)
```bash
# systemd service
[Unit]
Description=ADOL22 Trading Bot
After=network.target

[Service]
WorkingDirectory=/path/to/adol22-bot
ExecStart=/usr/bin/python3 bot.py
Restart=always
EnvironmentFile=/path/to/adol22-bot/.env

[Install]
WantedBy=multi-user.target
```

---

## File Structure

```
adol22-bot/
├── bot.py            # Main entry point + all Telegram handlers
├── market_data.py    # yfinance quotes, technicals, macro, news
├── scoring.py        # A+ setup scoring engine (0–100)
├── formatter.py      # Telegram message formatters
├── scanner.py        # Market scanner with preset filters
├── scheduler.py      # APScheduler — 4 daily reports
├── risk_manager.py   # Risk gates (daily loss, VIX, rate limit)
├── watchlist.py      # CRUD for watchlist + settings (storage.json)
├── ai_prompts.py     # Claude / GPT-4o-mini trade narratives
├── webhook_server.py # TradingView alert HTTP receiver
├── storage.json      # Persistent state (watchlist, settings, P/L)
├── requirements.txt
├── .env.example
└── README.md
```
