// Lightweight-Charts candlestick chart with MA50/150/200, Bollinger Bands,
// pivot/stop/target price lines, base-low line, AI-target line, and
// BUY/EXIT markers, plus an "Overall Rating" derived from trend score + VCP
// base quality. Shared by DayTradeTab, MarketTerminalTab, and
// TrendTemplateTab — all three render swing-context charts off the same
// /api/market/trend-template payload shape.
// vcpOverlayOn (2026-08-24, VCP Visual Analysis Layer, explicit user
// request: "VCP must be displayed directly on the technical chart... not
// just a text panel") — gates the whole VCP-specific overlay bundle
// (contraction zigzag/C1-C4 markers, VCP's own pivot/base-range lines,
// entry zone, volume dry-up bar tint, breakout marker) behind one real
// toggle, same real data (data.setup.vcp/data.setup.breakout) this file
// was already partially drawing from. Defaults falsy so every existing
// mount point (DashboardTab/CryptoTab/TrendTemplateTab) is unaffected
// unless a caller explicitly opts in. VCP stays evidence only — no new
// score/verdict is computed anywhere in this file; every VCP field drawn
// here already exists on the real, already-fetched `data` prop.
export default function TrendChart({ data, C, MONO, SANS, height, vcpOverlayOn }) {
  const elRef = React.useRef(null);
  const chartRef = React.useRef(null);
  const seriesRef = React.useRef(null);
  const symRef = React.useRef(null);
  const fillTimeoutsRef = React.useRef([]);
  const settleScrollCleanupRef = React.useRef(null);
  // height="fill" (opt-in, currently only MarketTerminalTab.jsx) sizes the
  // chart to whatever real vertical space is left below it in the viewport,
  // instead of a fixed pixel number — fixes a real live bug (screenshot,
  // 2026-07-26): a hardcoded 620 was taller than the available space on the
  // user's actual screen, cutting off BASE LOW/STOP behind the page fold and
  // the floating FAB stack. Other TrendChart call sites (Dashboard's small
  // widget, TrendTemplateTab) keep passing their own fixed number, untouched.
  // Deliberately NOT React state: an earlier version drove this through
  // useState, which made window resize change `H`, which re-ran the
  // chart-creation effect below (it depends on H) and tore down/recreated
  // the whole chart+series — but the separate data-filling effect further
  // down only depends on [data, C], so it never re-ran after that
  // recreation, leaving a genuinely blank chart after any resize (caught
  // live before shipping). Applying height imperatively inside the same
  // resize handler that already updates width (same pattern, zero
  // recreation) avoids this entirely.
  const fillToViewport = height === "fill";
  const H = fillToViewport ? 560 : (height || 520); // 560 = static fallback for the wrapper divs' initial layout only, in fill mode; the real value is computed+applied imperatively below once mounted
  // Hoisted to component scope (not just inside the chart-creation effect)
  // so the data-fill effect below can also call them — real live bug found
  // after shipping: measuring available height only ONCE at chart-creation
  // time could run before sibling content above the chart (rating card,
  // indicator pills, etc., some of it async-loaded) had finished laying
  // out, baking in a too-small height that then never got corrected unless
  // the user actually resized their browser window. Re-measuring every
  // time real bar data arrives (data-fill effect runs on initial load AND
  // every live refresh) self-corrects within one refresh cycle even if the
  // very first measurement was taken too early.
  const computeFillHeight = () => {
    const el = elRef.current;
    if (!el) return 520;
    // Clamp top at 0: once the chart is scrolled past (its top edge above
    // the viewport, top < 0), subtracting a negative top ADDS to the
    // available space instead of capping it — real bug found live
    // (2026-07-27) via a scroll-past test: an over-scroll drove top to
    // -412 and inflated the computed height to 1262px, taller than the
    // 900px viewport itself. The real available space can never exceed
    // the viewport height regardless of how far past the chart you've
    // scrolled.
    const top = Math.max(0, el.getBoundingClientRect().top);
    return Math.max(320, Math.floor(window.innerHeight - top - 20));
  };
  const applyHeight = (h) => {
    const el = elRef.current;
    if (!el) return;
    el.style.height = h + "px";
    if (el.parentElement) el.parentElement.style.height = h + "px";
  };
  const [showInfo, setShowInfo] = React.useState(false);
  // Lightweight Charts needs a plain Unix-seconds timestamp (UTCTimestamp)
  // for anything with intraday precision — the {year,month,day} BusinessDay
  // form only carries date resolution, so every 5m/15m/30m/1h bar within the
  // same calendar day would collide on the same "time" key (non-unique,
  // non-ascending), which the library rejects outright (blank chart /
  // "Value is null" crash — confirmed live once the real Alpaca intraday
  // picker started feeding this component actual sub-daily bars).
  const isIntraday = data && data.intervalUsed && data.intervalUsed !== "1d" && data.intervalUsed !== "1wk";
  const toTime = (ms) => {
    if (isIntraday) return Math.floor(ms / 1000);
    const d = new Date(ms); return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  };

  // Create the chart + series once per symbol / theme / size.
  // useLayoutEffect, not useEffect: the wrapper divs' JSX below paints at
  // the static H fallback (560 in fill mode) first. A plain useEffect only
  // runs AFTER the browser has already painted that frame, so the real
  // computed height landed one visible frame later — a real, if small,
  // "stretch" on every chart mount (confirmed live, 2026-07-27: "chart
  // stretch just little bit"). useLayoutEffect runs synchronously before
  // paint, so the browser only ever paints the correct final height.
  React.useLayoutEffect(() => {
    const LC = window.LightweightCharts, el = elRef.current;
    if (!LC || !el) return;
    el.innerHTML = "";
    const initialHeight = fillToViewport ? computeFillHeight() : H;
    if (fillToViewport) applyHeight(initialHeight);
    let raf1 = 0, raf2 = 0;
    if (fillToViewport) {
      // One same-tick correction isn't always enough — sibling content
      // above the chart (rating card, indicator pills) can still be
      // mid-layout on the very first paint. Two chained rAFs (one full
      // layout/paint cycle apart) catches that without a fixed setTimeout
      // guess. The data-fill effect below re-corrects again on every real
      // refresh as a final backstop.
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          const h = computeFillHeight();
          applyHeight(h);
          chart.applyOptions({ height: h });
        });
      });
    }
    const chart = LC.createChart(el, {
      width: el.clientWidth || 800, height: initialHeight,
      layout: { background: { color: "transparent" }, textColor: C.textDim || "#888", fontFamily: SANS },
      grid: { vertLines: { color: (C.border || "#cccccc") + "44" }, horzLines: { color: (C.border || "#cccccc") + "44" } },
      // bottom:0.22 reserves the bottom ~22% of the chart for the volume
      // histogram's own price scale below (top:0.84, ~16%). Without this,
      // the main scale defaults to the FULL chart height for its own price
      // labels (PIVOT/STOP/T1/T2/T3/BASE LOW/AI TARGET included) — its
      // low-end labels could land in the exact same pixel band as the
      // volume pane's own axis label, rendering as illegible overlapping
      // text. Real live bug (screenshot, 2026-07-27: "stretch chart so i
      // can see all numbers") — BASE LOW and the volume scale's last-value
      // label were stacked directly on top of each other. A taller chart
      // alone wouldn't fix this (both scales are proportional margins, so
      // the same relative overlap persists at any height) — the real fix
      // is giving the two scales non-overlapping territory.
      rightPriceScale: { borderColor: C.border || "#ccc", scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: C.border || "#ccc" },
      crosshair: { mode: LC.CrosshairMode ? LC.CrosshairMode.Normal : 1 },
      // Mouse-wheel scroll was hijacked by the chart's own zoom/pan (default
      // library behavior) — scrolling the PAGE past the chart instead zoomed
      // or panned it, which read as "the chart messes up" (confirmed live).
      // Click-drag pan and pinch-zoom on touch still work; only the wheel
      // is disabled so it always scrolls the page like everything else here.
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
    });
    // priceLineVisible/lastValueVisible: false here too (real live bug,
    // screenshot 2026-08-03: "confusion" — the library's own default
    // last-price marker rendered with no text label at all, right next to
    // the labeled STOP price line, and the two looked like one box with two
    // stacked numbers). An explicit, clearly-labeled "PRICE" line is drawn
    // below instead (same pl() helper PIVOT/STOP/etc. use), so the current
    // price always carries a real title the way every other level does.
    const candle = chart.addCandlestickSeries({ upColor: C.green, downColor: C.red, borderUpColor: C.green, borderDownColor: C.red, wickUpColor: C.green, wickDownColor: C.red, priceLineVisible: false, lastValueVisible: false });
    // priceLineVisible/lastValueVisible: false — every other overlay series
    // in this chart (MA50/150/200, Bollinger Bands, via mk() below) already
    // suppresses its own last-value label; volume never got the same
    // treatment, so its label ("1.53M" etc.) was left free to render right
    // on top of the main price scale's own low-end gridline labels (real
    // live bug, screenshot 2026-07-27: "1.53M" fused with "220.00").
    const vol = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    const mk = (color, w) => chart.addLineSeries({ color, lineWidth: w, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const ma200 = mk("#c94440", 1), ma150 = mk("#d6a312", 1), ma50 = mk(C.accent, 2);
    // MA20 (2026-08-24, VCP Visual Analysis Layer) — the user's explicit
    // "20/50/200 moving averages" spec; this file's existing MAs are
    // 50/150/200 (Minervini's own convention), so 20 is a genuinely new
    // series, not a relabel. Always drawn (not VCP-gated) — a standard MA,
    // not a VCP-specific artifact.
    const ma20 = mk("#94a3b8", 1);
    // Bollinger Bands (20, 2σ) — the green volatility envelope in the reference chart.
    const bbU = mk("#4ea86e", 1), bbL = mk("#4ea86e", 1);
    // VWAP/9EMA/21EMA overlays (2026-08-04 decision-first redesign, Phase 4)
    // — same real rolling-average math checklist-engine.js's ema()/vwap20d()
    // already use for their latest-value pass/fail checks, extended here to
    // a full per-bar series so they can be drawn as lines. 20D VWAP, not
    // intraday VWAP — chart.bars are real daily bars, same honest scope note
    // checklist-engine.js documents.
    const ema9 = mk("#38bdf8", 1), ema21 = mk("#f472b6", 1), vwap20 = mk("#facc15", 1);
    // VCP contraction zigzag (2026-08-14, VCP engine integration Phase 3) —
    // traces the real swing high/low sequence vcpBreakoutEngine's own base
    // detection already found (setup.vcp.points), instead of adding more
    // horizontal price lines to an already-dense pl() stack (10 potential
    // lines already share this axis with 3.5%-proximity dedup — a real risk
    // of contraction highs/lows silently losing that fight against PIVOT/
    // BASE LOW, which sit in the exact same tight range by definition).
    // Labeled C1/C2/C3/C4 via markers below, not T1/T2/T3 — those already
    // mean 1R/2R/3R profit targets on this same chart.
    const vcpZigzag = mk("#9c5cff", 2);
    chartRef.current = chart;
    seriesRef.current = { candle, vol, ma20, ma50, ma150, ma200, bbU, bbL, ema9, ema21, vwap20, vcpZigzag, priceLines: [] };
    symRef.current = null; // force a fitContent on next data fill
    const onResize = () => {
      chart.applyOptions({ width: el.clientWidth || 800 });
      if (fillToViewport) { const h = computeFillHeight(); applyHeight(h); chart.applyOptions({ height: h }); }
    };
    window.addEventListener("resize", onResize);
    // Real live bug history (2026-07-26/27), all around this same
    // fill-to-viewport height: a hardcoded scroll listener that recomputed
    // on every scroll event (even rAF-throttled/debounced) kept resizing the
    // chart on ANY page scroll, not just the one real case that needed it —
    // MarketTerminalTab's auto-scroll-to-chart animation settling after a
    // symbol search. Ordinary manual scrolling (the normal way a user reads
    // the page) has its own pauses between flicks, so a scroll-triggered
    // correction visibly "stretched" the chart after every pause — reported
    // live as "when i scroll chart stretch". There is no listener here at
    // all now; the bounded, one-time settle corrections that replace it live
    // in the data-fill effect below (fillTimeoutsRef), tied to data/symbol
    // changes instead of to scrolling. Real window resize is still a
    // legitimate reason to recompute (above) and stays wired.
    // handleScroll.mouseWheel:false above kills ALL wheel-driven chart
    // interaction, not just the vertical case — a genuine horizontal
    // trackpad swipe (a wheel event with deltaX, same as deltaY for
    // vertical scroll) stopped panning the chart through history too
    // (confirmed live: dates never changed on a horizontal swipe).
    // Restore just that one axis manually: deltaX-dominant wheel events
    // pan the time scale directly via the API; deltaY-dominant ones are
    // left alone so the page keeps scrolling normally.
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const ts = chart.timeScale();
      const pos = ts.scrollPosition();
      if (typeof pos === "number") ts.scrollToPosition(pos + e.deltaX / 60, false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf1); cancelAnimationFrame(raf2);
      fillTimeoutsRef.current.forEach(clearTimeout); fillTimeoutsRef.current = [];
      if (settleScrollCleanupRef.current) { settleScrollCleanupRef.current(); settleScrollCleanupRef.current = null; }
      window.removeEventListener("resize", onResize);
      el.removeEventListener("wheel", onWheel);
      chart.remove(); chartRef.current = null; seriesRef.current = null;
    };
  }, [data && data.symbol, C, H, SANS]);

  // Push data + overlays whenever `data` changes (keeps zoom on live refresh).
  React.useEffect(() => {
    const s = seriesRef.current, chart = chartRef.current;
    if (!s || !chart || !data || !data.bars) return;
    // Real backstop for fill-to-viewport height + width: this effect fires
    // on initial load AND every live refresh, by which point sibling
    // content above the chart has reliably finished its own layout —
    // re-measuring here self-corrects even if the chart-creation effect's
    // own rAF-based check (right after mount) still ran too early.
    fillTimeoutsRef.current.forEach(clearTimeout); fillTimeoutsRef.current = [];
    if (settleScrollCleanupRef.current) { settleScrollCleanupRef.current(); settleScrollCleanupRef.current = null; }
    const settleCorrect = () => {
      const el = elRef.current, c = chartRef.current;
      if (!el || !c) return;
      if (fillToViewport) { const h = computeFillHeight(); applyHeight(h); c.applyOptions({ height: h }); }
      c.applyOptions({ width: el.clientWidth || 800 });
    };
    settleCorrect();
    // Catches MarketTerminalTab's auto-scroll-to-chart animation settling.
    // A first version guessed fixed 400ms/900ms delays — wrong on a page
    // with more content above the chart (production has a Prediction
    // Markets section local didn't), where the real smooth-scroll took
    // longer and a manual scroll landing inside that guess window got
    // "locked in" mid-animation (confirmed live 2026-07-27: heights
    // 622→682→802 instead of settling once). Real fix: watch scroll and
    // debounce-correct only once it actually stops (any duration, no
    // guessing), then fully detach — capped at 3s so this can never
    // linger into ordinary later scrolling and cause the earlier
    // "stretch on scroll" bug again.
    if (fillToViewport) {
      let debounce = 0, hardCap = 0;
      const onSettleScroll = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { settleCorrect(); teardown(); }, 150);
      };
      const teardown = () => {
        clearTimeout(debounce); clearTimeout(hardCap);
        window.removeEventListener("scroll", onSettleScroll);
        if (settleScrollCleanupRef.current === teardown) settleScrollCleanupRef.current = null;
      };
      hardCap = setTimeout(teardown, 3000);
      window.addEventListener("scroll", onSettleScroll, { passive: true });
      settleScrollCleanupRef.current = teardown;
    }
    // Show clock time on the x-axis for intraday granularities (otherwise
    // Lightweight Charts just repeats the date across every bar in a day).
    chart.applyOptions({ timeScale: { timeVisible: !!isIntraday, secondsVisible: false } });
    const bars = data.bars, n = bars.length;
    s.candle.setData(bars.map(b => ({ time: toTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close })));
    // Volume dry-up (2026-08-24, VCP Visual Analysis Layer) — bars inside
    // the real detected base (from vcp.points[0].i, the same real base-
    // start index the price-line/marker logic below already uses) get a
    // distinct muted tint instead of plain green/red, so the real
    // declining volume into the base (vcp.volTrend) is visible as an
    // obviously-shorter, differently-colored cluster of bars — not just a
    // number in a panel.
    const baseStartIdxForVol = vcpOverlayOn && data.setup && data.setup.vcp && Array.isArray(data.setup.vcp.points) && data.setup.vcp.points.length
      ? data.setup.vcp.points[0].i : -1;
    s.vol.setData(bars.map((b, i) => ({
      time: toTime(b.time), value: b.volume,
      color: (baseStartIdxForVol >= 0 && i >= baseStartIdxForVol) ? "#9c5cff66" : (b.close >= b.open ? C.green : C.red) + "55",
    })));
    const setMA = (series, arr) => series.setData(bars.map((b, i) => arr[i] == null ? null : ({ time: toTime(b.time), value: arr[i] })).filter(Boolean));
    setMA(s.ma200, data.series.ma200); setMA(s.ma150, data.series.ma150); setMA(s.ma50, data.series.ma50);
    // MA20 — real rolling SMA computed client-side (the server's `series`
    // only carries 50/150/200); same simple-average math as every other
    // MA, just a shorter window.
    const sma20 = bars.map((b, i) => {
      if (i < 19) return null;
      let sum = 0; for (let j = i - 19; j <= i; j += 1) sum += bars[j].close;
      return sum / 20;
    });
    setMA(s.ma20, sma20);

    // Bollinger Bands (20-period, 2σ) computed from closes.
    const P = 20, K = 2, closes = bars.map(b => b.close), bbUp = [], bbLo = [];
    for (let i = 0; i < n; i++) {
      if (i < P - 1) { bbUp.push(null); bbLo.push(null); continue; }
      let sum = 0; for (let j = i - P + 1; j <= i; j++) sum += closes[j];
      const mean = sum / P;
      let vv = 0; for (let j = i - P + 1; j <= i; j++) vv += (closes[j] - mean) ** 2;
      const sd = Math.sqrt(vv / P);
      bbUp.push(mean + K * sd); bbLo.push(mean - K * sd);
    }
    setMA(s.bbU, bbUp); setMA(s.bbL, bbLo);

    // 9/21 EMA series — same k=2/(period+1) formula as checklist-engine.js's
    // ema(), extended to every bar (that function only ever returns the
    // latest value, for a single pass/fail check) so it can be drawn as a
    // line here. Seeded with a real SMA over the first `period` closes,
    // same as the source function.
    const emaSeries = (period) => {
      const out = new Array(n).fill(null);
      if (n < period) return out;
      let e = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
      out[period - 1] = e;
      const k = 2 / (period + 1);
      for (let i = period; i < n; i++) { e = closes[i] * k + e * (1 - k); out[i] = e; }
      return out;
    };
    setMA(s.ema9, emaSeries(9));
    setMA(s.ema21, emaSeries(21));
    // 20-day rolling VWAP series — same real "typical price × volume, 20-bar
    // trailing window" formula as checklist-engine.js's vwap20d() (which
    // only ever computes the single latest-window value), extended to a
    // rolling window ending at every bar so it can be drawn as a line.
    const vwap20Series = () => {
      const out = new Array(n).fill(null);
      for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - 19);
        const win = bars.slice(start, i + 1);
        if (win.length < 5) continue;
        let pv = 0, vv = 0;
        for (const b of win) { const typical = (Number(b.high) + Number(b.low) + Number(b.close)) / 3; const v = Number(b.volume) || 0; pv += typical * v; vv += v; }
        out[i] = vv > 0 ? pv / vv : null;
      }
      return out;
    };
    setMA(s.vwap20, vwap20Series());

    // VCP contraction zigzag — real swing high/low sequence (setup.vcp.points),
    // each point already carries the real bar index this chart's own bars
    // array uses, so no re-detection here, just plotting what
    // vcpBreakoutEngine already found. Sparse (null everywhere else,
    // matching setMA's existing null-gap convention).
    const vcpPoints = vcpOverlayOn && data.setup && data.setup.vcp && Array.isArray(data.setup.vcp.points) ? data.setup.vcp.points : [];
    if (vcpPoints.length >= 2) {
      const zz = new Array(n).fill(null);
      vcpPoints.forEach(p => { if (p.i >= 0 && p.i < n) zz[p.i] = p.price; });
      setMA(s.vcpZigzag, zz);
    } else {
      setMA(s.vcpZigzag, []);
    }

    s.priceLines.forEach(pl => { try { s.candle.removePriceLine(pl); } catch {} }); s.priceLines = [];
    const su = data.setup, LS = window.LightweightCharts.LineStyle || {};
    // Up to 10 price lines (PRICE/PIVOT/STOP/T1/T2/T3/BASE LOW/AI TARGET/
    // RESISTANCE/SUPPORT) can land within a few dollars of each other on
    // the same axis — e.g. PIVOT $214.39 right next to a live AFTER-HRS
    // price of $215.10 — and Lightweight Charts doesn't collision-avoid
    // simultaneous price-line labels, so they render as illegible
    // stacked/overlapping text (real live bug, screenshot 2026-08-04:
    // "chart make it right fix it"). Skip a new line if it's within ~3.5%
    // of the running visible price span of an already-placed one, keeping
    // whichever was added first — pl() is called below in priority order
    // (current price first, then trade-plan levels, broader swing
    // support/resistance last) so the more actionable label always wins.
    const plRange = { max: Math.max(...bars.map(b => b.high)), min: Math.min(...bars.map(b => b.low)) };
    const plShown = [];
    const pl = (price, color, title, style) => {
      if (price == null || !isFinite(price)) return;
      if (price > plRange.max) plRange.max = price;
      if (price < plRange.min) plRange.min = price;
      const minGap = Math.max(1e-6, plRange.max - plRange.min) * 0.035;
      if (plShown.some(v => Math.abs(v - price) < minGap)) return;
      plShown.push(price);
      s.priceLines.push(s.candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
    };
    // Real current price, explicitly labeled — replaces the native
    // candle-series marker disabled above. Same up/down coloring the volume
    // histogram already uses (close vs. that bar's own open). Prefers
    // data.livePrice (real Yahoo pre-market/after-hours quote) over
    // data.price (the daily bar's regular-session close) so this line
    // reflects the actual current session, not a stale 4pm close.
    const lastBar = bars[n - 1];
    const curPrice = Number(data.livePrice) || Number(data.price) || (lastBar ? lastBar.close : null);
    const priceLabel = data.marketState === "PRE" ? "PRE-MKT" : (data.marketState && data.marketState.startsWith("POST")) ? "AFTER-HRS" : "PRICE";
    if (curPrice != null) pl(curPrice, lastBar && lastBar.close >= lastBar.open ? C.green : C.red, priceLabel, LS.Solid ?? 0);
    if (su) {
      pl(su.entry, C.accent, "PIVOT", LS.Dashed ?? 2);
      if (su.actionable) {
        pl(su.stop, C.red, "STOP", LS.Dashed ?? 2);
        const t1 = Math.round((su.entry + (su.entry - su.stop)) * 100) / 100;   // 1R — first scale-out
        pl(t1, "#5ab552", "T1", LS.Dotted ?? 1);
        pl(su.target2, C.green, "T2", LS.Dashed ?? 2);
        pl(su.target3, C.green, "T3", LS.Dotted ?? 1);
      }
      // Base box: bottom = contraction low. Combined with the PIVOT line above it
      // this brackets the consolidation the stock is breaking out of.
      if (su.contractionLow) pl(su.contractionLow, C.textDim, "BASE LOW", LS.Dotted ?? 1);
      // AI prediction target — MEASURED MOVE: pivot + base height (entry − base low),
      // a distinct technical objective (not the R-multiple T2). Falls back to T2.
      const aiTgt = su.contractionLow && su.entry > su.contractionLow
        ? Math.round((su.entry + (su.entry - su.contractionLow)) * 100) / 100
        : su.target2;
      if (aiTgt) pl(aiTgt, "#f59e0b", "🎯 AI TARGET", LS.Dashed ?? 2);
    }
    // VCP-specific levels (2026-08-24, VCP Visual Analysis Layer) — the
    // VCP engine's OWN pivot/base range, distinct from the Minervini-
    // template PIVOT/BASE LOW just above (su.entry/su.contractionLow are
    // a different, separately-computed real swing-high pivot and a
    // narrower 15-bar low — see src/routes/market.js's own comment on why
    // these two real values can legitimately differ). The existing pl()
    // dedup (± ~3.5% of the visible range) naturally collapses these into
    // one label when they're close, and shows both when they're not.
    if (vcpOverlayOn && data.setup) {
      const vcpB = data.setup.breakout, vcp = data.setup.vcp;
      if (vcpB && vcpB.pivot && vcpB.pivot.price > 0) {
        pl(vcpB.pivot.price, "#9c5cff", "VCP PIVOT", LS.Dashed ?? 2);
        // Entry zone — Minervini's own standard "up to 5% past pivot before
        // it's extended" guideline, not a detected value. Labeled with the
        // rule spelled out so it never reads as a second detected level.
        pl(Math.round(vcpB.pivot.price * 1.05 * 100) / 100, "#9c5cff", "ENTRY ZONE HIGH (+5%)", LS.Dotted ?? 1);
      }
      if (vcp && vcp.baseHigh) pl(vcp.baseHigh, "#9c5cff", "VCP BASE HIGH", LS.Dotted ?? 1);
      if (vcp && vcp.baseLow) pl(vcp.baseLow, "#9c5cff", "VCP BASE LOW", LS.Dotted ?? 1);
    }
    // Support/Resistance (2026-08-04 decision-first redesign, Phase 4) —
    // real swing-high/swing-low detection, same W=3 local-extremum algorithm
    // buildTrendTemplate uses server-side for real pivot/VCP detection (not
    // re-fetched — recomputed here from the same real bars this chart
    // already has, matching real pivot logic). Broader than PIVOT/BASE LOW
    // above (which only bracket the current base) — this surfaces the
    // nearest real swing level on each side of the current price, even when
    // it sits outside the current base.
    if (curPrice != null) {
      const W = 3, highs = bars.map(b => b.high), lows = bars.map(b => b.low);
      const swingHighs = [], swingLows = [];
      for (let i = W; i < n - W; i++) {
        let isHigh = true, isLow = true;
        for (let j = i - W; j <= i + W; j++) {
          if (highs[j] > highs[i]) isHigh = false;
          if (lows[j] < lows[i]) isLow = false;
        }
        if (isHigh) swingHighs.push(highs[i]);
        if (isLow) swingLows.push(lows[i]);
      }
      const resistance = swingHighs.filter(h => h > curPrice).sort((a, b) => a - b)[0];
      const support = swingLows.filter(l => l < curPrice).sort((a, b) => b - a)[0];
      if (resistance) pl(Math.round(resistance * 100) / 100, "#8b5cf6", "RESISTANCE", LS.Dotted ?? 1);
      if (support) pl(Math.round(support * 100) / 100, "#8b5cf6", "SUPPORT", LS.Dotted ?? 1);
    }
    // BUY = most recent reclaim of the rising 50-day MA; EXIT = first close back below it.
    const ma50s = data.series.ma50 || []; let buyIdx = -1;
    for (let i = n - 1; i >= 1; i--) { if (ma50s[i] != null && ma50s[i - 1] != null && bars[i].close > ma50s[i] && bars[i - 1].close <= ma50s[i - 1]) { buyIdx = i; break; } }
    if (buyIdx === -1) for (let i = 1; i < n; i++) { if (ma50s[i] != null && bars[i].close > ma50s[i]) { buyIdx = i; break; } }
    let exitIdx = -1; if (buyIdx >= 0) for (let i = buyIdx + 2; i < n; i++) { if (ma50s[i] != null && bars[i].close < ma50s[i]) { exitIdx = i; break; } }
    // Only annotate a BUY when the stock is actually in an uptrend (Stage 2 /
    // ≥6/8). On a Stage 4 downtrend a green "BUY" arrow is misleading.
    const trendOK = (Number(data.score) || 0) >= 6 || /Stage\s*2/i.test(data.stage || "");
    const markers = [];
    if (trendOK && buyIdx >= 0) markers.push({ time: toTime(bars[buyIdx].time), position: "belowBar", color: C.green, shape: "arrowUp", text: "BUY" });
    if (exitIdx >= 0) markers.push({ time: toTime(bars[exitIdx].time), position: "aboveBar", color: C.red, shape: "arrowDown", text: "EXIT" });
    // VCP contraction labels — C1/C2/C3/C4 (not T1/T2/T3, which already mean
    // 1R/2R/3R profit targets on this chart), one per real contraction leg,
    // placed at each leg's real low with its real depth %.
    const vcpContractions = vcpOverlayOn && data.setup && data.setup.vcp && Array.isArray(data.setup.vcp.contractions) ? data.setup.vcp.contractions : [];
    vcpContractions.forEach((c, i) => {
      if (c.lowIdx == null || c.lowIdx < 0 || c.lowIdx >= n) return;
      markers.push({ time: toTime(bars[c.lowIdx].time), position: "belowBar", color: "#9c5cff", shape: "circle", text: `C${i + 1} -${c.depth}%` });
    });
    // Real breakout candle (2026-08-24) — the exact bar vcpBreakoutEngine
    // detected price crossing above its own VCP pivot, now returned as
    // breakoutIdx (previously computed there but discarded — see
    // src/routes/market.js). Distinct marker/color from the generic
    // MA50-reclaim "BUY" arrow above — a different real signal (VCP
    // pivot breakout, not a moving-average reclaim).
    const vcpBreakout = data.setup && data.setup.breakout;
    if (vcpOverlayOn && vcpBreakout && Number.isFinite(vcpBreakout.breakoutIdx) && vcpBreakout.breakoutIdx >= 0 && vcpBreakout.breakoutIdx < n) {
      markers.push({ time: toTime(bars[vcpBreakout.breakoutIdx].time), position: "belowBar", color: "#0d9465", shape: "arrowUp", text: "🚀 VCP BREAKOUT" });
    }
    markers.sort((a, b) => {
      const ta = isIntraday ? a.time : new Date(a.time.year, a.time.month - 1, a.time.day).getTime();
      const tb = isIntraday ? b.time : new Date(b.time.year, b.time.month - 1, b.time.day).getTime();
      return ta - tb;
    });
    s.candle.setMarkers(markers);

    // Re-fit on a symbol OR timeframe change (switching 5m→1D on the same
    // symbol leaves a stale zoom range from the old granularity otherwise).
    const viewKey = `${data.symbol}:${data.intervalUsed || "1d"}`;
    if (symRef.current !== viewKey) { chart.timeScale().fitContent(); symRef.current = viewKey; }
  }, [data, C, vcpOverlayOn]);

  if (typeof window !== "undefined" && !window.LightweightCharts) {
    return <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading interactive chart…</div>;
  }
  // Trend & Base Rating (0–100): blends trend gears (score/8) with VCP base
  // quality, then penalizes a deep base — a wide/deep base has poor
  // breakout odds even when the trend template scores well. Renamed from
  // "OVERALL RATING" (2026-07-29, real user-reported confusion: this and
  // the AI Score Card above compute genuinely different real things —
  // trend-template/VCP structure here vs. the 7-dimension Institutional
  // Grade there — but the old "OVERALL" framing read as one absolute
  // verdict competing with the other. Neither one is wrong; they can
  // legitimately disagree. Glossary entry below explains the relationship
  // instead of pretending only one score exists.
  const passC = Number(data && data.score) || 0;
  const vcpS = Number(data && data.setup && data.setup.report && data.setup.report.score) || 0;
  const baseDepth = Number(data && data.setup && data.setup.vcp && data.setup.vcp.baseDepth);
  // Penalty: 0 up to 25% deep, then grows; capped at −30 for very deep bases.
  const depthPenalty = Number.isFinite(baseDepth) && baseDepth > 25 ? Math.min(30, Math.round((baseDepth - 25) * 1.2)) : 0;
  const rating = Math.max(0, Math.min(100, Math.round((passC / 8) * 50 + (vcpS / 100) * 50) - depthPenalty));
  const rColor = rating >= 80 ? "#22d47e" : rating >= 60 ? "#d6a312" : rating >= 40 ? "#f59e0b" : "#ef4444";
  const rWord  = rating >= 80 ? "STRONG" : rating >= 60 ? "GOOD" : rating >= 40 ? "FAIR" : "WEAK";
  const su = data && data.setup;
  const aiTarget = su ? (su.contractionLow && su.entry > su.contractionLow
    ? Math.round((su.entry + (su.entry - su.contractionLow)) * 100) / 100
    : su.target2) : null;
  const upside = aiTarget && data.price ? Math.round(((aiTarget - data.price) / data.price) * 100) : null;
  const verdict = su && su.verdict;   // GO / WAIT / AVOID
  const vColor = verdict === "GO" ? "#22d47e" : verdict === "WAIT" ? "#d6a312" : "#ef4444";
  const glossary = [
    ["📊 TREND & BASE RATING", "Blends the 8-point trend-template pass rate with real VCP base quality, penalized for a deep base. A different real lens than the AI Score Card above (which grades 7 broader factors — smart money, options flow, fundamentals, macro, sector). The two can legitimately disagree; neither overrides the other."],
    ["⬤ PRICE", "The real current/last price — green if today's candle is up, red if down."],
    ["🔵 PIVOT", "Top of the recent base — buy on a break ABOVE it with volume ≥1.4× average. The breakout trigger."],
    ["⚪ BASE LOW", "Bottom of the base. If price falls back here the setup has failed — often where the stop goes."],
    ["🔴 STOP", "Where you exit if wrong — the tighter of −8% or just under the base low."],
    ["🎯 TARGETS", "T2 and T3 = 2× and 3× your risk (pivot − stop), measured up from the pivot."],
    ["🟠 AI TARGET", "Projected upside based on the trend/base quality."],
    ["🔵 9 EMA / 🩷 21 EMA", "Fast trend-following averages — same real formula as the Trade Checklist's 9/21 EMA pass/fail checks, drawn as a full line here."],
    ["🟡 20D VWAP", "Real 20-day rolling volume-weighted average price — not intraday VWAP (this chart's bars are daily), same real definition the Trade Checklist uses."],
    ["🟣 SUPPORT / RESISTANCE", "Nearest real swing high/low on each side of price — broader than PIVOT/BASE LOW, which only bracket the current base."],
    ["🟪 VCP ZIGZAG / C1 C2 C3…", "Real swing high→low sequence forming the base (vcpBreakoutEngine's own detection) — each circle marks one real contraction leg with its real % depth. Progressively smaller (e.g. C1 -18% → C2 -11% → C3 -6%) is the real tightening pattern this setup needs."],
    ["🔵 20 MA", "20-day simple moving average — the shortest of this chart's 3 MAs (20/50/200)."],
    ["🟪 VCP PIVOT / BASE HIGH / BASE LOW", "The VCP engine's own real pivot and whole-base range — a separate real computation from PIVOT/BASE LOW above, which come from the Minervini trend-template's own swing detection. The two usually sit close together; shown separately when they genuinely differ. Only visible when VCP overlay is ON."],
    ["🟪 ENTRY ZONE HIGH (+5%)", "Minervini's own standard rule of thumb — up to 5% past the VCP pivot is still a reasonable entry before it's considered extended/chasing. A named rule applied on top of the real pivot, not a separately detected level."],
    ["🟪 Purple volume bars", "Real volume inside the detected VCP base — watch these bars shrink toward the pivot; that shrinking is the real \"volume dry-up\" signal. Only tinted when VCP overlay is ON."],
    ["🚀 VCP BREAKOUT", "The real candle where price first closed above the VCP engine's own pivot on this chart's data — a different real signal from the green MA50-reclaim BUY arrow above."],
  ];
  return (
    <div style={{ position: "relative", width: "100%", height: H }}>
      <div ref={elRef} style={{ width: "100%", height: H }} />
      {data && (
        // Top-LEFT so it never collides with the right price axis or the AI-TARGET label.
        // Fully opaque background (not ~95%) — the chart's horizontal price-
        // level reference lines span the full width and were faintly visible
        // through the card, crossing right through the rating text.
        <div style={{ position: "absolute", top: 10, left: 12, pointerEvents: "none", zIndex: 5,
          background: C.card || "#fff", border: `1px solid ${rColor}`, borderRadius: 12, padding: "8px 14px", boxShadow: "0 2px 10px rgba(0,0,0,0.18)", minWidth: 132 }}>
          {/* "OVERALL RATING" renamed (2026-07-29, real user-reported
              confusion) — read as THE single verdict, directly competing
              with the AI Score Card's own recommendation above even though
              they're two different real scores that can legitimately
              disagree. See the glossary entry (ⓘ) for the full explanation. */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: 1 }}>TREND & BASE RATING</span>
            {/* ⓘ hover glossary — moved inline here (2026-08-03, real live
                confusion) from a floating top-right button, which sat
                directly over the right price-scale axis, right where
                PIVOT/T1/PRICE's own labels render, reading as if it were
                attached to one of them. Now anchored to the exact metric it
                explains. pointerEvents:auto overrides the card's own
                pointerEvents:none (kept there so the card never blocks
                chart mouse/scroll interaction underneath it). */}
            <span style={{ position: "relative", display: "inline-flex", pointerEvents: "auto" }}>
              <span
                onMouseEnter={() => setShowInfo(true)} onMouseLeave={() => setShowInfo(false)}
                onClick={() => setShowInfo(v => !v)}
                style={{ cursor: "help", width: 14, height: 14, borderRadius: "50%", border: `1px solid ${C.textDim}`,
                  color: C.textDim, fontFamily: SANS, fontSize: 9, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                ⓘ
              </span>
              {showInfo && (
                <div style={{ position: "absolute", top: 18, left: 0, width: 288, textAlign: "left", cursor: "default",
                  background: (C.card || "#fff"), border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px",
                  boxShadow: "0 6px 24px rgba(0,0,0,0.28)", zIndex: 6 }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 6 }}>CHART LEVELS</div>
                  {glossary.map(([k, v]) => (
                    <div key={k} style={{ marginBottom: 6 }}>
                      <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.text }}>{k}</span>
                      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, lineHeight: 1.45 }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: SANS, fontSize: 30, fontWeight: 900, color: rColor, lineHeight: 1 }}>{rating}</span>
            <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, color: rColor, letterSpacing: 0.5 }}>{rWord}</span>
          </div>
          {verdict && (
            <div style={{ display: "inline-block", marginTop: 6, fontFamily: MONO, fontSize: 10, fontWeight: 800, color: "#fff", background: vColor, borderRadius: 5, padding: "2px 8px" }}>
              {verdict === "GO" ? "🟢 GO" : verdict === "WAIT" ? "🟡 WAIT" : "🔴 AVOID"}
            </div>
          )}
          {upside != null && <div style={{ fontFamily: MONO, fontSize: 10, color: "#f59e0b", marginTop: 5 }}>🎯 {upside > 0 ? "+" : ""}{upside}% to target</div>}
          {/* Minervini's template is a daily/weekly method — the rating and
              price levels above are always the real daily computation, even
              while you're looking at an intraday candle granularity. Say so
              rather than let it look like a live intraday rating. */}
          {data.intervalUsed && data.intervalUsed !== "1d" && (
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.textDim, marginTop: 5, fontStyle: "italic" }}>Rating reflects the daily setup</div>
          )}
        </div>
      )}
    </div>
  );
}
