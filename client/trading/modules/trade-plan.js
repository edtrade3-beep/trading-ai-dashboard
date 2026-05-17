(function () {
  function round2(v) { return Math.round(v * 100) / 100; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  window.DixiePlan = {
    buildTradePlan: function (data, state, score) {
      var bullishSignals = [
        data.trend === "Uptrend", data.structure === "Bullish BOS", state.emaBullish,
        state.vwapState === "above", data.newsSentiment === "Bullish", score.riskOn
      ].filter(Boolean).length;
      var bearishSignals = [
        data.trend === "Downtrend", data.structure === "Bearish BOS", state.emaBearish,
        state.vwapState === "below", data.newsSentiment === "Bearish", score.riskOff
      ].filter(Boolean).length;

      var bias = "Choppy";
      if (bullishSignals >= 4 && score.total >= 65) bias = "Bullish";
      if (bearishSignals >= 4 && score.total >= 60) bias = "Bearish";

      var control = bias === "Bullish" ? "Buyers control tape while price stays above value."
        : bias === "Bearish" ? "Sellers control tape while rallies fail into supply."
        : "Neither side has full control. Expect two-way liquidity grabs.";

      var holdLevel = bias === "Bearish" ? data.support : Math.max(data.support, data.ema21);
      var breakLevel = bias === "Bearish" ? Math.min(data.resistance, data.ema21) : data.support;

      var entry = bias === "Bullish" ? round2(Math.max(data.ema9, data.vwap))
        : bias === "Bearish" ? round2(Math.min(data.ema9, data.vwap))
        : round2((data.support + data.resistance) / 2);

      var stopLoss = bias === "Bullish" ? round2(Math.min(data.support, data.ema21) - state.range * 0.12)
        : bias === "Bearish" ? round2(Math.max(data.resistance, data.ema21) + state.range * 0.12)
        : round2(data.support - state.range * 0.08);

      var risk = Math.abs(entry - stopLoss) || Math.max(state.range * 0.1, Math.max(data.price * 0.005, 1));
      var target = bias === "Bearish" ? round2(entry - risk * 2.2) : round2(entry + risk * 2.2);
      var action = bias === "Choppy" || data.fakeoutRisk === "High" ? "WAIT" : bias === "Bullish" ? "BUY" : "SELL";
      var confidence = clamp(Math.round(score.total - (data.fakeoutRisk === "High" ? 12 : data.fakeoutRisk === "Medium" ? 6 : 0)), 35, 92);

      return { bias: bias, control: control, holdLevel: round2(holdLevel), breakLevel: round2(breakLevel), entry: entry, stopLoss: stopLoss, target: target, rr: "1:" + round2(Math.abs(target - entry) / risk), action: action, confidence: confidence };
    }
  };
})();
