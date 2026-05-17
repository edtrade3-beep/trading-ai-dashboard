(function () {
  window.DixieFormat = {
    money: function (value) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
    },
    round2: function (value) {
      return Math.round(value * 100) / 100;
    },
    clamp: function (value, min, max) {
      return Math.max(min, Math.min(max, value));
    }
  };
})();
