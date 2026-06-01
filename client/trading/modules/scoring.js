(function () {
  var WEIGHTS = { trend: 30, momentum: 20, volume: 15, news: 20, macro: 15 };

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  window.DixieScoring = {
    weights: WEIGHTS,
    calculateScores: function (data, state) {
      var trend = 0;
      if (data.trend === "Uptrend") trend += 12;
      if (data.trend === "Downtrend") trend += 12;
      if (data.structure === "Bullish BOS" || data.structure === "Bearish BOS") trend += 10;
      if (state.emaBullish || state.emaBearish) trend += 8;
      trend = clamp(trend, 0, WEIGHTS.trend);

      var momentum = 8;
      if (state.vwapState === "above" && data.trend === "Uptrend") momentum += 4;
      if (state.vwapState === "below" && data.trend === "Downtrend") momentum += 4;
      if (data.rsi >= 55 && data.rsi <= 68 && data.trend === "Uptrend") momentum += 5;
      if (data.rsi <= 45 && data.rsi >= 32 && data.trend === "Downtrend") momentum += 5;
      if (data.divergence === "Bullish" || data.divergence === "Bearish") momentum += 3;
      if (state.rsiState === "overbought" || state.rsiState === "oversold") momentum -= 2;
      momentum = clamp(momentum, 0, WEIGHTS.momentum);

      var volume = 5;
      if (data.volumeCharacter === "Accumulation" || data.volumeCharacter === "Distribution") volume += 6;
      if (data.volumeSpike === "Yes") volume += 4;
      volume = clamp(volume, 0, WEIGHTS.volume);

      var news = 10;
      if (data.newsSentiment === "Bullish") news += 7;
      if (data.newsSentiment === "Bearish") news -= 5;
      if (data.catalyst && data.catalyst.trim()) news += 3;
      news = clamp(news, 0, WEIGHTS.news);

      var macro = 6;
      var riskOn = data.spyTrend === "Uptrend" && data.qqqTrend === "Uptrend" && data.vix < 18;
      var riskOff = (data.spyTrend === "Downtrend" || data.qqqTrend === "Downtrend") && data.vix > 20;
      if (riskOn) macro += 6;
      if (riskOff) macro -= 3;
      if (data.dxy < 104.5) macro += 2;
      if (data.yield10y < data.yield2y) macro += 1;
      macro = clamp(macro, 0, WEIGHTS.macro);

      return { trend: trend, momentum: momentum, volume: volume, news: news, macro: macro, total: trend + momentum + volume + news + macro, riskOn: riskOn, riskOff: riskOff };
    }
  };
})();
