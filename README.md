# Institutional Trading Analyst Workstation

Local trading workstation for structured stock analysis using institutional-style logic:

- market structure
- EMA / RSI / VWAP alignment
- volume and smart-money framing
- news sentiment
- macro regime
- weighted AI score
- trade setup with entry, stop, target, and action

## Run

1. Start the local server:

```powershell
node server.js
```

2. Open [http://localhost:3000](http://localhost:3000)

No package install is required.

## Permanent Public URL (Works From Any Browser / Any Network)

This project is now preconfigured for Render deployment with a fixed HTTPS URL.

### 1) Push project to GitHub

- Create a new GitHub repo
- Upload this folder:
  `C:\Users\dixie\OneDrive\Documents\New project`

### 2) Deploy on Render

- Open [https://render.com](https://render.com)
- Click `New` -> `Blueprint`
- Select your GitHub repo
- Render will detect `render.yaml` and create the web service automatically

### 3) Add your provider keys in Render

In Render service settings -> `Environment` set:

- `FINNHUB_API_KEY`
- `FMP_API_KEY`
- `POLYGON_API_KEY` (optional)
- `TRADIER_API_KEY` (optional)
- `UNUSUAL_WHALES_API_KEY` (optional)

### 4) Open your permanent URL

Render gives you a stable URL like:

`https://am-trading-platform.onrender.com`

You can use it from phone data, home Wi-Fi, office Wi-Fi, or any browser.

## What it does

This version is software, not just a prompt:

- accepts ticker, timeframe, style, indicator values, news notes, and macro inputs
- can fetch live market data and recent headlines for a ticker
- auto-computes support, resistance, EMA 9/21/200, RSI, VWAP-style value, volume state, and macro regime
- scores the setup from 0 to 100
- returns the exact decision structure you requested
- includes a demo dataset so you can test immediately

## Live data notes

The server currently pulls public Yahoo Finance endpoints. That keeps setup simple, but it also means:

- availability depends on Yahoo responding
- some macro symbols may occasionally fall back or return incomplete data
- this is useful for prototyping, not a production-grade execution stack

## Next upgrade path

If you want, the next step is to wire in:

1. premium market/news providers
2. OpenAI-generated analyst commentary on top of the rule engine
3. watchlists, alerts, and trade journaling
