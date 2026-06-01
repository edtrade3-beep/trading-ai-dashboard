(function () {
  window.DixieAnalysis = {
    analyzeIndicators: function (data) {
      var emaBullish = data.price > data.ema9 && data.ema9 > data.ema21 && data.ema21 > data.ema200;
      var emaBearish = data.price < data.ema9 && data.ema9 < data.ema21 && data.ema21 < data.ema200;
      var vwapState = data.price >= data.vwap ? "above" : "below";
      var rsiState = data.rsi >= 70 ? "overbought" : data.rsi <= 30 ? "oversold" : "balanced";
      var nearResistance = Math.abs(data.resistance - data.price) / data.price <= 0.015;
      var nearSupport = Math.abs(data.price - data.support) / data.price <= 0.015;
      var range = Math.abs(data.resistance - data.support);
      return { emaBullish: emaBullish, emaBearish: emaBearish, vwapState: vwapState, rsiState: rsiState, nearResistance: nearResistance, nearSupport: nearSupport, range: range };
    }
  };
})();
