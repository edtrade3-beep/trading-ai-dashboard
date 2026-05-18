"""
webhook_server.py — Lightweight HTTP server for TradingView alerts.
Listens on WEBHOOK_PORT (default 8080).
POST /webhook  { "secret": "...", "symbol": "NVDA", "action": "BUY", "price": 123.45 }
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread

from market_data import fetch_ticker_data
from scoring     import score_setup
from formatter   import format_buy_alert, format_sell_alert
from risk_manager import check_alert_allowed
import watchlist as wl_store

log = logging.getLogger(__name__)

WEBHOOK_SECRET = os.getenv("TRADINGVIEW_SECRET", "change_me_before_deploy")
WEBHOOK_PORT   = int(os.getenv("WEBHOOK_PORT", "8080"))


class _Handler(BaseHTTPRequestHandler):
    bot      = None   # injected by start_webhook_server
    chat_id  = None
    loop     = None

    def log_message(self, fmt, *args):
        log.debug(fmt, *args)

    def do_POST(self):
        if self.path != "/webhook":
            self._respond(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self._respond(400, {"error": "invalid json"})
            return

        # Secret check
        secret = payload.get("secret", "")
        if not hmac.compare_digest(secret, WEBHOOK_SECRET):
            log.warning("Webhook: bad secret from %s", self.client_address)
            self._respond(403, {"error": "forbidden"})
            return

        symbol  = payload.get("symbol", "").upper().strip()
        action  = payload.get("action", "").upper().strip()
        tv_price = payload.get("price", 0)

        if not symbol or action not in ("BUY", "SELL", "ALERT"):
            self._respond(400, {"error": "missing symbol or invalid action"})
            return

        log.info("Webhook: %s %s @ %s", action, symbol, tv_price)

        # Process in event loop (bot is async)
        asyncio.run_coroutine_threadsafe(
            _process_webhook(self.bot, self.chat_id, symbol, action, tv_price),
            self.loop,
        )

        self._respond(200, {"ok": True, "symbol": symbol, "action": action})

    def _respond(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {"ok": True, "service": "adol22-webhook"})
        else:
            self._respond(404, {"error": "not found"})


async def _process_webhook(bot, chat_id: str, symbol: str, action: str, tv_price: float) -> None:
    try:
        data   = fetch_ticker_data(symbol)
        scored = score_setup(data)
        settings = wl_store.get_settings()

        if action in ("BUY", "SELL"):
            allowed, reason = check_alert_allowed(
                symbol, action,
                {**data, "score": scored["score"], "vix": 20}
            )
            if not allowed:
                log.info("Webhook blocked: %s", reason)
                await bot.send_message(chat_id=chat_id, text=f"🚫 Webhook {action} *{symbol}* blocked: {reason}", parse_mode="Markdown")
                return

        if action == "BUY":
            text = format_buy_alert(data, scored, settings)
            text = f"📡 *TradingView Alert*\n\n{text}"
        elif action == "SELL":
            text = format_sell_alert(data, scored)
            text = f"📡 *TradingView Alert*\n\n{text}"
        else:
            text = f"📡 *TradingView ALERT — {symbol}*\n\nPrice: ${data['price']:,.2f}\nScore: {scored['score']}/100 [{scored['grade']}]"

        await bot.send_message(chat_id=chat_id, text=text, parse_mode="Markdown")
        wl_store.increment_alert_count()

    except Exception as e:
        log.error("Webhook processing error: %s", e)
        try:
            await bot.send_message(chat_id=chat_id, text=f"⚠️ Webhook error for {symbol}: {e}")
        except Exception:
            pass


def start_webhook_server(bot, chat_id: str, loop: asyncio.AbstractEventLoop) -> HTTPServer:
    """Start the webhook HTTP server in a background daemon thread."""
    _Handler.bot     = bot
    _Handler.chat_id = chat_id
    _Handler.loop    = loop

    server = HTTPServer(("0.0.0.0", WEBHOOK_PORT), _Handler)
    thread = Thread(target=server.serve_forever, daemon=True, name="webhook-server")
    thread.start()
    log.info("Webhook server listening on port %d", WEBHOOK_PORT)
    return server
