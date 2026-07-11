import { useEffect, useRef } from "react";
import { computeRegime, STOCK_TO_SECTOR } from "./market-helpers.js";
import {
  computeGreenLight, logTradeNote, addPaperTrade, addPaperShort, optionValue,
  addPaperOption, alpacaPlace, alpacaShort, alpacaClose, alpacaOption, GL_TRADES_KEY,
} from "./trading-utils.js";

export default function AutoPilotEngine({ watchlistData, macroData, scanResults }) {
  const autoBoughtRef = useRef(new Set());
  const alpacaPosRef = useRef(0);
  const serverAutoRef = useRef(false);   // true when the SERVER autopilot is trading (browser stands down)
  // Detect server-side autopilot so the browser engine doesn't double-trade the same account.
  useEffect(() => {
    const check = () => fetch("/api/health").then(r => r.json()).then(d => { serverAutoRef.current = !!d?.serverAutopilot; }).catch(() => {});
    check();
    const iv = setInterval(check, 5 * 60_000);
    return () => clearInterval(iv);
  }, []);
  const apStatsRef = useRef({ dayPnl: 0, lossStreak: 0, equity: 0 }); // Alpaca risk stats for the circuit breaker

  // Keep the screen/tab awake while autopilot is ON so a laptop sleeping doesn't
  // pause trading. Re-acquires the lock when the tab becomes visible again.
  useEffect(() => {
    let lock = null;
    const acquire = async () => {
      try {
        if (localStorage.getItem("axiom_autopilot") === "on" && navigator.wakeLock && document.visibilityState === "visible") {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {}
    };
    const onVis = () => { if (document.visibilityState === "visible") acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVis);
    const iv = setInterval(acquire, 60_000);   // re-check in case autopilot was toggled on
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(iv); try { lock && lock.release(); } catch {} };
  }, []);

  // Poll Alpaca: open-position count + today's realized P&L, equity, and the consecutive-loss streak.
  useEffect(() => {
    const etDate = d => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(d)); } catch { return ""; } };
    const poll = () => {
      if (!["alpaca","both"].includes(localStorage.getItem("axiom_autopilot_broker"))) return;
      fetch("/api/alpaca/positions").then(r => r.json()).then(d => {
        if (!d?.ok) return;
        const pos = d.positions || [];
        alpacaPosRef.current = pos.length;
        // Estimate total open risk = Σ |qty| × entry × assumed 5% stop (autopilot uses ATR≈1.5×).
        const eq = apStatsRef.current.equity || 0;
        const riskDollars = pos.reduce((s, p) => s + Math.abs(Number(p.qty) || 0) * (Number(p.avgEntry) || 0) * 0.05, 0);
        apStatsRef.current.openRiskPct = eq > 0 ? (riskDollars / eq) * 100 : 0;
      }).catch(() => {});
      Promise.all([
        fetch("/api/alpaca/closed-trades").then(r => r.json()).catch(() => null),
        fetch("/api/alpaca/account").then(r => r.json()).catch(() => null),
      ]).then(([ct, acct]) => {
        const eq = acct?.ok ? Number(acct.account.equity) : apStatsRef.current.equity;
        const trades = ct?.ok ? (ct.trades || []) : [];
        const todayStr = etDate(new Date());
        const dayPnl = trades.filter(t => etDate(t.closedAt) === todayStr).reduce((s, t) => s + (Number(t.pnl) || 0), 0);
        let lossStreak = 0;                                // newest first → count leading losers
        for (const t of trades) { if (Number(t.pnl) <= 0) lossStreak++; else break; }
        apStatsRef.current = { ...apStatsRef.current, dayPnl, lossStreak, equity: eq };
      }).catch(() => {});
    };
    poll();
    const t = setInterval(poll, 60000);
    return () => clearInterval(t);
  }, []);

  // AUTO-BUY: every 15s, paper-buy any stock that hits the GREEN threshold (once/day each)
  useEffect(() => {
    const tick = () => {
      if (localStorage.getItem("axiom_autopilot") !== "on") return;
      if (serverAutoRef.current) return;   // server autopilot is trading — don't double up from the browser
      localStorage.setItem("axiom_autopilot_lastcheck", String(Date.now()));
      window.dispatchEvent(new Event("autopilot-tick"));
      const threshold = Number(localStorage.getItem("axiom_autopilot_min")) || 5;
      const doShares  = localStorage.getItem("axiom_autopilot_shares") !== "off";  // independent toggle, default ON
      const doOptions = localStorage.getItem("axiom_autopilot_opts") === "on";      // independent toggle, default OFF
      const doShort   = localStorage.getItem("axiom_autopilot_short") === "on";      // short selling, default OFF
      if (!doShares && !doOptions && !doShort) return;  // nothing enabled
      const today = new Date().toISOString().slice(0, 10);
      // ── Total open-risk guard: stop opening NEW trades once combined open risk hits the ceiling. ──
      const maxRiskPct = Number(localStorage.getItem("axiom_autopilot_maxrisk")) || 6;  // % of equity
      const openRiskPct = Number(apStatsRef.current.openRiskPct) || 0;
      if (openRiskPct >= maxRiskPct) {
        if (localStorage.getItem("axiom_autopilot_risk_note") !== today) {
          localStorage.setItem("axiom_autopilot_risk_note", today);
          logTradeNote("buy", `⚖️ RISK CEILING — open risk ~${openRiskPct.toFixed(1)}% ≥ ${maxRiskPct}% cap. Pausing NEW entries until risk drops.`);
        }
        return;
      }
      const brokers = ["alpaca"];  // SIM removed — autopilot is Alpaca-only
      const acct = Number(localStorage.getItem("axiom_acct_size")) || 10000;
      const riskPct = Number(localStorage.getItem("axiom_risk_pct")) || 1;
      const maxPos = Number(localStorage.getItem("axiom_autopilot_maxpos")) || 12;  // cap concurrent positions
      const spyQ = (macroData || []).find(m => m.symbol === "SPY") || (watchlistData || []).find(w => w.symbol === "SPY");
      const spyChg = Number(spyQ?.changesPercentage || 0);

      // ── Circuit breaker (Alpaca): −2% daily loss OR 3 consecutive losses = stop opening NEW trades today. ──
      // Open positions are still managed/closed by the exit engine — we only halt fresh risk.
      {
        const aplus = localStorage.getItem("axiom_autopilot_aplus") !== "off";
        const { dayPnl, lossStreak, equity } = apStatsRef.current;
        const manualMax = Number(localStorage.getItem("axiom_autopilot_maxloss")) || 0;  // optional fixed $ limit
        const pctLimit = aplus && equity > 0 ? equity * 0.02 : 0;                          // A+ spec: 2% of equity
        const lossLimit = Math.max(manualMax, pctLimit);
        const tripLoss = lossLimit > 0 && dayPnl <= -lossLimit;
        const tripStreak = aplus && lossStreak >= 3;                                       // 3 consecutive losses
        if (tripLoss || tripStreak) {
          if (localStorage.getItem("axiom_autopilot_halt_date") !== today) {
            localStorage.setItem("axiom_autopilot_halt_date", today);
            localStorage.setItem("axiom_autopilot_halt_reason", tripStreak ? "3 consecutive losses" : `daily loss $${Math.round(dayPnl)}`);
            window.dispatchEvent(new Event("autopilot-tick"));
            if (localStorage.getItem("axiom_autopilot_tg") !== "off") {
              const why = tripStreak ? `3 consecutive losses` : `daily loss ${Math.round(dayPnl)} ≤ -${Math.round(lossLimit)} (2% of equity)`;
              fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: `🛑 CIRCUIT BREAKER TRIPPED\n\n${why}.\nAutopilot has paused NEW trades for the rest of today. Open positions are still being managed.\n\nStep away, reset, come back tomorrow. No revenge trading.` }) }).catch(() => {});
            }
          }
          return;  // halted for today — open no new positions
        }
      }

      // A+ Institutional mode (default ON): only trade aPlus setups, sized by confidence.
      const aPlusMode = localStorage.getItem("axiom_autopilot_aplus") !== "off";
      const regimeScore = computeRegime(macroData).score;
      // A+ daily trade cap (max 5/day).
      const tdayKey = "axiom_ap_trades_" + today;
      const tradesToday = Number(localStorage.getItem(tdayKey)) || 0;
      const maxTradesDay = 5;

      // Rank all qualifying setups by quality; only take the BEST up to the cap.
      const candidates = [];
      (watchlistData || []).forEach(q => {
        const scanRow = (scanResults || []).find(r => r.ticker === q.symbol);
        const gl = computeGreenLight(q, spyChg, scanRow, regimeScore);
        if (!(gl.px > 0)) return;
        const bullish = aPlusMode ? gl.aPlus : (gl.signal === "GREEN" && gl.passed >= threshold);
        const bearishPut = false;  // puts disabled — no bearish option buys
        const shortSetup = doShort && gl.shortSignal === "SHORT" && gl.shortPassed >= threshold;
        if (!bullish && !shortSetup) return;
        // quality: A+ score (institutional) leads; else checks + relative strength.
        const quality = aPlusMode ? gl.aScore : (Math.max(gl.passed, shortSetup ? gl.shortPassed : 0) * 10 + Math.abs(Number(gl.relStrength) || 0) + (gl.isLeader ? 5 : 0));
        candidates.push({ q, gl, bullish, bearishPut, shortSetup, quality });
      });
      candidates.sort((a, b) => b.quality - a.quality);
      if (aPlusMode && tradesToday >= maxTradesDay) return;  // daily trade cap reached

      // For each selected broker, count free slots and place the best setups.
      for (const broker of brokers) {
      // How many slots are free (cap minus what's already open / placed today)
      let openCount = 0;
      if (broker === "sim") {
        try { openCount = (JSON.parse(localStorage.getItem(GL_TRADES_KEY)) || []).filter(t => t.status === "OPEN" && t.mode === "PAPER").length; } catch {}
      } else {
        // Alpaca position count refreshes only every 30s — to avoid over-buying between refreshes,
        // also count orders already placed today (autoBoughtRef updates instantly). Use the larger.
        let placedToday = 0;
        autoBoughtRef.current.forEach(k => { if (k.startsWith(today) && k.endsWith(`:${broker}`)) placedToday++; });
        openCount = Math.max(alpacaPosRef.current || 0, placedToday);
      }
      let slots = Math.max(0, maxPos - openCount);

      candidates.forEach(({ q, gl, bullish, bearishPut, shortSetup }) => {
        if (slots <= 0) return;  // cap reached — skip the rest (lower-ranked setups)

        // ── SHORT (sell to open — conservative: strong setups only, half size, few per day) ──
        if (doShort && shortSetup) {
          // Slowly + low risk: only the STRONGEST bearish setups, and no more than
          // maxShorts new shorts per day (default 2).
          const strongBear = gl.shortPassed >= 4 && gl.bearScore >= 60;
          if (!strongBear) return;
          const maxShorts = Number(localStorage.getItem("axiom_autopilot_maxshorts")) || 2;
          let shortsToday = 0;
          autoBoughtRef.current.forEach(k => { if (k.startsWith(today) && k.includes(":SH:")) shortsToday++; });
          if (shortsToday >= maxShorts) return;
          const key = `${today}:${q.symbol}:SH:${broker}`;
          if (!autoBoughtRef.current.has(key)) {
            // Conservative PUTS: only the STRONGEST bearish setups (5/5) express as a single
            // defined-risk PUT (max loss = premium). Weaker shorts use shares. Requires options on.
            const conservativePut = doOptions && gl.shortPassed >= 5;
            if (broker === "alpaca" && conservativePut) {
              autoBoughtRef.current.add(key); slots--;
              alpacaOption(q.symbol, "put", 1, gl.px).then(rr => {
                if (rr?.ok) logTradeNote("buy", `📉 ALPACA PUT (conservative) — ${q.symbol} (${gl.shortPassed}/5)\n1 contract · strike $${rr.order?.strike} · exp ${rr.order?.expiry} · defined risk`);
                else { autoBoughtRef.current.delete(key); }
              });
            } else if (broker === "alpaca") {
              const entry = gl.px;
              const atr = Math.min(0.05, Math.max(0.01, Number(gl.atrPct) || 0.025));
              const stop = +(entry * (1 + atr * 1.5)).toFixed(2);   // stop above
              const take = +(entry * (1 - atr * 3)).toFixed(2);     // target below
              const riskPerShare = Math.max(0.01, stop - entry);
              // Half the normal per-trade risk, capped at 0.5% — small, low-risk shorts.
              const shortRiskFrac = Math.min(0.005, (riskPct / 100) * 0.5);
              const qty = Math.max(1, Math.min(Math.floor((acct * shortRiskFrac) / riskPerShare), Math.floor(acct / entry)));
              autoBoughtRef.current.add(key); slots--;
              alpacaShort(q.symbol, qty, stop, take).then(r => {
                if (r?.ok) logTradeNote("buy", `🔻 ALPACA SHORT (small · ${(shortRiskFrac * 100).toFixed(2)}% risk) — ${q.symbol} (${gl.shortPassed}/5)\n${qty} sh @ ~$${entry} (paper · bracket)\nStop $${stop} (above) · Target $${take} (below)`);
                else { autoBoughtRef.current.delete(key); }
              });
            } else {
              const res = addPaperShort(q.symbol, gl.px, { atrPct: gl.atrPct, glScore: gl.shortPassed });
              if (res === "OK") { autoBoughtRef.current.add(key); slots--; }
              else if (res === "DUP") autoBoughtRef.current.add(key);
            }
          }
          return;  // a short setup is its own thing — don't also long it
        }

        // ── SHARES (long only, bullish) ──
        if (doShares && bullish) {
          const key = `${today}:${q.symbol}:S:${broker}`;
          if (!autoBoughtRef.current.has(key)) {
            if (broker === "alpaca") {
              const entry = gl.bestEntry || gl.px;
              const atr = Math.min(0.05, Math.max(0.01, Number(gl.atrPct) || 0.025));
              const stop = +(entry * (1 - atr * 1.5)).toFixed(2);
              const take = +(entry * (1 + atr * 3)).toFixed(2);
              const riskPerShare = Math.max(0.01, entry - stop);
              // Confidence-based size: A+ mode uses the per-setup risk % (1% / 0.75% / 0.5%); else fixed risk %.
              const riskFrac = (aPlusMode && gl.confRisk > 0 ? gl.confRisk : riskPct) / 100;
              const qty = Math.max(1, Math.min(Math.floor((acct * riskFrac) / riskPerShare), Math.floor(acct / entry)));
              autoBoughtRef.current.add(key); slots--;
              // Optional AI gate: ask Claude before placing; only proceed on a BUY verdict (fail-open on error).
              const aiGate = localStorage.getItem("axiom_autopilot_aigate") === "on";
              const place = () => {
                localStorage.setItem(tdayKey, String((Number(localStorage.getItem(tdayKey)) || 0) + 1));
                return alpacaPlace(q.symbol, qty, stop, take).then(r => {
                  if (r?.ok) logTradeNote("buy", `🟢 ALPACA BUY — ${q.symbol} (A+ ${gl.aScore}, ${(riskFrac * 100).toFixed(2)}% risk)\n${qty} sh @ ~$${entry} (paper · bracket)\nStop $${stop} · Target $${take}`);
                  else { autoBoughtRef.current.delete(key); }
                });
              };
              if (aiGate) {
                fetch("/api/market/ai-setup-review", { method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ setup: { symbol: q.symbol, px: gl.px.toFixed(2), chg: gl.chg.toFixed(2), aScore: gl.aScore, grade: gl.grade, marketScore: regimeScore, marketPass: gl.marketPass, sector: STOCK_TO_SECTOR[q.symbol] || null, strongSector: null, relStrength: gl.relStrength, rvol: gl.rvol.toFixed(1), bestEntry: gl.bestEntry, stop, rr: gl.rr, atEntry: gl.atEntry } }) })
                  .then(r => r.json()).then(d => {
                    if (d.ok && /VERDICT:\s*BUY/i.test(d.review)) { place(); }
                    else if (d.ok) { autoBoughtRef.current.delete(key); logTradeNote("note", `🤖 AI vetoed ${q.symbol} — ${String(d.review).split("\n")[0]}`); }
                    else { place(); }  // API error → fall through to the rules (don't freeze trading)
                  }).catch(() => place());
              } else { place(); }
            } else {
              const res = addPaperTrade(q.symbol, gl.bestEntry || gl.px, { atrPct: gl.atrPct, glScore: gl.passed });
              if (res === "OK") { autoBoughtRef.current.add(key); slots--; }
              else if (res === "DUP") autoBoughtRef.current.add(key);
            }
          }
        }

        if (slots <= 0) return;

        // ── OPTIONS (CALLS only — puts are disabled) ──
        if (doOptions && bullish) {
          const kind = "CALL";
          const key = `${today}:${q.symbol}:C:${broker}`;
          if (!autoBoughtRef.current.has(key)) {
            if (broker === "alpaca") {
              autoBoughtRef.current.add(key); slots--;
              alpacaOption(q.symbol, "call", 1, gl.px).then(rr => {
                if (rr?.ok) logTradeNote("buy", `📈 ALPACA CALL — ${q.symbol} (${gl.passed}/5)\n1 contract · strike $${rr.order.strike} · exp ${rr.order.expiry}`);
                else { autoBoughtRef.current.delete(key); }
              });
            } else {
              const res = addPaperOption(q.symbol, gl.px, kind, { glScore: gl.passed });
              if (res === "OK") { autoBoughtRef.current.add(key); slots--; }
              else if (res === "DUP") autoBoughtRef.current.add(key);
            }
          }
        }
      });
      } // end for each broker
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [watchlistData, macroData, scanResults]);

  // ── DAILY SUMMARY (Alpaca) — once per weekday after the close (ET), Telegram your day + edge progress ──
  useEffect(() => {
    const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" });
    const partsOf = d => { try { return Object.fromEntries(dtf.formatToParts(new Date(d)).map(x => [x.type, x.value])); } catch { return {}; } };
    const dateKey = p => `${p.year}-${p.month}-${p.day}`;
    const check = () => {
      if (localStorage.getItem("axiom_autopilot_tg") === "off") return;
      if (localStorage.getItem("axiom_daily_summary") === "off") return;
      const now = partsOf(new Date());
      if (now.weekday === "Sat" || now.weekday === "Sun") return;
      if (Number(now.hour) < 16) return;
      const today = dateKey(now);
      if (localStorage.getItem("axiom_daily_summary_date") === today) return;
      localStorage.setItem("axiom_daily_summary_date", today);  // claim early to avoid double-send
      fetch("/api/alpaca/closed-trades").then(r => r.json()).then(d => {
        if (!d.ok) return;
        const closed = d.trades || [];
        const todayT = closed.filter(t => dateKey(partsOf(t.closedAt)) === today);
        const wins = todayT.filter(t => t.pnl > 0).length;
        const dayPnl = todayT.reduce((s, t) => s + t.pnl, 0);
        const total = closed.length;
        const edge = total >= 20 ? `${total}/20 ✓ — check your edge in My Trades` : `${total}/20 — keep going`;
        const text = `📊 DAILY SUMMARY — ${today}\n\nToday: ${todayT.length} closed · ${wins}W/${todayT.length - wins}L · P&L ${dayPnl >= 0 ? "+" : ""}$${Math.round(dayPnl)}\nEdge check: ${edge}`;
        fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => {});
        // (AI Trade Coach now runs server-side in src/ai-coach.js — fires even when the app is closed.)
      }).catch(() => {});
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);


  // AUTO-EXIT: every 15s, scale out auto paper trades at T1/T2/T3 or dump at stop
  useEffect(() => {
    const priceOf = sym => Number((watchlistData || []).find(q => q.symbol === sym)?.price || 0);
    const t = setInterval(() => {
      let trades = [];
      try { trades = JSON.parse(localStorage.getItem(GL_TRADES_KEY)) || []; } catch {}
      const trailOn = localStorage.getItem("axiom_autopilot_trail") !== "off"; // default ON
      const exitMode = localStorage.getItem("axiom_autopilot_exit") || "trail"; // targets | trend (default: sell when bearish)
      let changed = false;
      const updated = trades.map(tr => {
        if (tr.status !== "OPEN" || tr.mode !== "PAPER" || !tr.auto) return tr;
        const q = (watchlistData || []).find(o => o.symbol === tr.ticker);
        // For options the working "price" is the simulated premium derived from the underlying
        const px = tr.instrument === "OPTION" ? optionValue(tr, priceOf(tr.ticker)) : priceOf(tr.ticker);
        if (!px) return tr;
        let x = { ...tr };
        x.remaining = x.remaining ?? x.shares;
        x.realized  = x.realized ?? 0;
        const third = Math.max(1, Math.floor(x.shares / 3));

        // ── SHORT positions: mirrored management (stop above, targets below, cover on bullish) ──
        if (x.side === "SHORT") {
          if (trailOn) {
            x.lwm = Math.min(Number(x.lwm) || x.entry, px);            // low-water mark
            const trailDist = Number(x.risk0) || (x.stop - x.entry);
            const trailStop = +(x.lwm + trailDist).toFixed(2);
            if (trailStop < x.stop) { x.stop = trailStop; changed = true; }   // ratchet DOWN
          }
          if (px >= x.stop) {  // price rose to stop → cover at a loss (or trailed profit)
            x.realized += x.remaining * (x.entry - x.stop);
            x.remaining = 0; x.status = "CLOSED"; x.exit = +x.stop.toFixed(2);
            x.closedAt = new Date().toISOString();
            const trailed = x.stop <= x.entry;
            x.exitReason = trailed ? "TRAIL" : "STOP"; changed = true;
            logTradeNote("exit", `${trailed ? "🔒 TRAIL COVER" : "🛑 SHORT STOP"} — ${x.ticker}${x.glScore ? ` (${x.glScore}/5)` : ""}\nCovered @ $${x.stop} (paper) · P&L ${x.realized >= 0 ? "+" : ""}$${x.realized.toFixed(0)}`);
            return x;
          }
          if (exitMode === "trend") {  // cover all when the stock turns bullish
            const ma50 = Number(q?.priceAvg50 || 0), chg = Number(q?.changesPercentage || 0);
            if ((ma50 > 0 && px > ma50) || chg > 3) {
              x.realized += x.remaining * (x.entry - px);
              x.remaining = 0; x.status = "CLOSED"; x.exit = +px.toFixed(2);
              x.closedAt = new Date().toISOString(); x.exitReason = "BULLISH"; changed = true;
              logTradeNote("exit", `📈 SHORT COVER — ${x.ticker}${x.glScore ? ` (${x.glScore}/5)` : ""}\nTurned bullish — covered all @ $${px.toFixed(2)} (paper) · P&L ${x.realized >= 0 ? "+" : ""}$${x.realized.toFixed(0)}`);
            }
            return x;
          }
          const pctDown = lvl => ((x.entry - lvl) / x.entry * 100);
          if (!x.t1Hit && px <= x.t1) { x.realized += third * (x.entry - x.t1); x.remaining -= third; x.t1Hit = true; x.stop = x.entry; changed = true;
            logTradeNote("sell", `🎯 T1 +${pctDown(x.t1).toFixed(1)}% — ${x.ticker} (short)\nCovered ${third} sh @ $${x.t1} · stop → breakeven · ${x.remaining} left`); }
          if (x.t1Hit && !x.t2Hit && px <= x.t2) { x.realized += third * (x.entry - x.t2); x.remaining -= third; x.t2Hit = true; changed = true;
            logTradeNote("sell", `🎯 T2 +${pctDown(x.t2).toFixed(1)}% — ${x.ticker} (short)\nCovered ${third} sh @ $${x.t2} · ${x.remaining} left`); }
          if (x.t2Hit && px <= x.t3) {
            x.realized += x.remaining * (x.entry - x.t3); x.remaining = 0; x.status = "CLOSED";
            x.exit = +x.t3.toFixed(2); x.closedAt = new Date().toISOString(); x.exitReason = "T3 🎯"; changed = true;
            logTradeNote("exit", `🏆 T3 +${pctDown(x.t3).toFixed(1)}% — ${x.ticker} (short)\nCovered @ $${x.t3} (paper) · P&L $${x.realized.toFixed(0)}`);
          }
          return x;
        }

        // ── TRAILING STOP: ratchet the stop UP as price makes new highs (never down) ──
        // Trail by ~2.5×ATR (= 5/3 × the 1.5×ATR initial risk) — the distance validated in the backtest.
        if (trailOn || exitMode === "trail") {
          x.hwm = Math.max(Number(x.hwm) || x.entry, px);          // high-water mark
          const trailDist = (Number(x.risk0) || (x.entry - x.stop)) * (5 / 3);
          const trailStop = +(x.hwm - trailDist).toFixed(2);
          if (trailStop > x.stop) { x.stop = trailStop; changed = true; }
        }
        if (px <= x.stop) {
          x.realized += x.remaining * (x.stop - x.entry);
          x.remaining = 0; x.status = "CLOSED"; x.exit = +(x.entry + x.realized / x.shares).toFixed(2);
          x.closedAt = new Date().toISOString();
          const trailed = x.stop >= x.entry;   // stop got ratcheted to/above breakeven = trailing exit
          x.exitReason = trailed ? "TRAIL" : "STOP"; changed = true;
          logTradeNote("exit", `${trailed ? "🔒 TRAIL STOP" : "🛑 STOP HIT"} — ${x.ticker}${x.glScore ? ` (${x.glScore}/5)` : ""}\nClosed @ $${x.exit} (paper) · P&L ${x.realized >= 0 ? "+" : ""}$${x.realized.toFixed(0)}`);
          return x;
        }
        // ── TRAIL mode: pure trailing stop (validated) — let winners run, no MA50 exit, no targets ──
        if (exitMode === "trail") return x;
        // ── TREND mode: hold the runner; sell ALL when the trend turns against the position ──
        if (exitMode === "trend") {
          const uPx  = tr.instrument === "OPTION" ? (priceOf(tr.ticker) || tr.uEntry) : px;
          const ma50 = Number(q?.priceAvg50 || 0);
          const chg  = Number(q?.changesPercentage || 0);
          const isPut = tr.optType === "PUT";
          // long (stock/CALL) reverses when underlying loses its uptrend; PUT reverses when it turns up
          const reversed = isPut
            ? ((ma50 > 0 && uPx > ma50) || chg > 3)
            : ((ma50 > 0 && uPx < ma50) || chg < -3);
          if (reversed) {
            x.realized += x.remaining * (px - x.entry);
            x.remaining = 0; x.status = "CLOSED"; x.exit = +(x.entry + x.realized / x.shares).toFixed(2);
            x.closedAt = new Date().toISOString(); x.exitReason = "BEARISH"; changed = true;
            logTradeNote("exit", `📉 TREND EXIT — ${x.ticker}${x.glScore ? ` (${x.glScore}/5)` : ""}\nTurned ${isPut ? "bullish" : "bearish"} — sold all @ $${x.exit} (paper) · P&L ${x.realized >= 0 ? "+" : ""}$${x.realized.toFixed(0)}`);
          }
          return x;
        }
        const pctOf = lvl => ((lvl - x.entry) / x.entry * 100);
        if (!x.t1Hit && px >= x.t1) { x.realized += third * (x.t1 - x.entry); x.remaining -= third; x.t1Hit = true; x.stop = x.entry; changed = true;
          logTradeNote("sell", `🎯 T1 +${pctOf(x.t1).toFixed(1)}% — ${x.ticker}\nSold ${third} sh @ $${x.t1} · stop → breakeven · ${x.remaining} sh left`); }
        if (x.t1Hit && !x.t2Hit && px >= x.t2) { x.realized += third * (x.t2 - x.entry); x.remaining -= third; x.t2Hit = true; changed = true;
          logTradeNote("sell", `🎯 T2 +${pctOf(x.t2).toFixed(1)}% — ${x.ticker}\nSold ${third} sh @ $${x.t2} · ${x.remaining} sh left`); }
        if (x.t2Hit && px >= x.t3) {
          x.realized += x.remaining * (x.t3 - x.entry); x.remaining = 0; x.status = "CLOSED";
          x.exit = +(x.entry + x.realized / x.shares).toFixed(2); x.closedAt = new Date().toISOString();
          x.exitReason = "T3 🎯"; changed = true;
          logTradeNote("exit", `🏆 T3 +${pctOf(x.t3).toFixed(1)}% — ${x.ticker}${x.glScore ? ` (${x.glScore}/5)` : ""}\nClosed @ $${x.t3} (paper) · P&L $${x.realized.toFixed(0)}`);
        }
        return x;
      });
      if (changed) { localStorage.setItem(GL_TRADES_KEY, JSON.stringify(updated)); window.dispatchEvent(new Event("gl-trades-changed")); }
    }, 15000);
    return () => clearInterval(t);
  }, [watchlistData]);

  // END-OF-DAY: at 4:00 PM ET on weekdays, write one session P&L summary note (once/day)
  useEffect(() => {
    const priceOf = sym => Number((watchlistData || []).find(q => q.symbol === sym)?.price || 0);
    const check = () => {
      const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      const day = et.getDay();
      if (day === 0 || day === 6) return;            // weekend
      if (et.getHours() < 16) return;                // before 4:00 PM ET
      const todayKey = `${et.getFullYear()}-${et.getMonth() + 1}-${et.getDate()}`;
      if (localStorage.getItem("axiom_eod_date") === todayKey) return;  // already done today

      let trades = [];
      try { trades = JSON.parse(localStorage.getItem(GL_TRADES_KEY)) || []; } catch {}
      const isToday = ds => {
        if (!ds) return false;
        const d = new Date(new Date(ds).toLocaleString("en-US", { timeZone: "America/New_York" }));
        return d.getFullYear() === et.getFullYear() && d.getMonth() === et.getMonth() && d.getDate() === et.getDate();
      };
      const paper = trades.filter(t => t.mode === "PAPER");
      const closedToday = paper.filter(t => t.status === "CLOSED" && isToday(t.closedAt));
      const openedToday = paper.filter(t => isToday(t.openedAt));
      const openNow = paper.filter(t => t.status === "OPEN");
      if (!closedToday.length && !openedToday.length) { localStorage.setItem("axiom_eod_date", todayKey); return; }

      const realized = closedToday.reduce((s, t) => s + (t.exit - t.entry) * t.shares, 0);
      const wins = closedToday.filter(t => (t.exit - t.entry) > 0).length;
      const losses = closedToday.length - wins;
      const unreal = openNow.reduce((s, t) => { const px = priceOf(t.ticker) || t.entry; return s + (px - t.entry) * (t.remaining ?? t.shares); }, 0);
      const dateLbl = et.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const verdict = realized > 0 ? "🟢 GREEN DAY" : realized < 0 ? "🔴 RED DAY" : "⚪ FLAT";
      const txt = `📊 SESSION SUMMARY — ${dateLbl}\n${verdict} · Realized P&L: ${realized >= 0 ? "+" : ""}$${realized.toFixed(0)}\nClosed: ${closedToday.length} trade${closedToday.length !== 1 ? "s" : ""} · ${wins}W / ${losses}L\nOpened today: ${openedToday.length} · Still open: ${openNow.length}${openNow.length ? ` (unrealized ${unreal >= 0 ? "+" : ""}$${unreal.toFixed(0)})` : ""}`;
      logTradeNote("summary", txt);
      localStorage.setItem("axiom_eod_date", todayKey);
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [watchlistData]);

  // ALPACA trend-exit: close positions whose underlying turns bearish (stop/target handled by Alpaca bracket)
  useEffect(() => {
    const t = setInterval(async () => {
      if (localStorage.getItem("axiom_autopilot") !== "on") return;
      if (!["alpaca","both"].includes(localStorage.getItem("axiom_autopilot_broker"))) return;
      if ((localStorage.getItem("axiom_autopilot_exit") || "trail") !== "trend") return;
      try {
        const r = await fetch("/api/alpaca/positions").then(x => x.json());
        if (!r?.ok) return;
        for (const p of (r.positions || [])) {
          const q = (watchlistData || []).find(o => o.symbol === p.symbol);
          const ma50 = Number(q?.priceAvg50 || 0), chg = Number(q?.changesPercentage || 0);
          const isShort = p.side === "short" || Number(p.qty) < 0;
          // long covers on bearish reversal; short covers on bullish reversal
          const reversed = isShort ? ((ma50 > 0 && p.current > ma50) || chg > 3) : ((ma50 > 0 && p.current < ma50) || chg < -3);
          if (reversed) {
            const cr = await alpacaClose(p.symbol);
            if (cr?.ok) logTradeNote("exit", `${isShort ? "📈 ALPACA COVER" : "📉 ALPACA TREND EXIT"} — ${p.symbol}\nTurned ${isShort ? "bullish" : "bearish"} — closed (paper) · P&L ${p.unrealizedPL >= 0 ? "+" : ""}$${p.unrealizedPL.toFixed(0)}`);
          }
        }
      } catch {}
    }, 30000);
    return () => clearInterval(t);
  }, [watchlistData]);

  return null;
}
