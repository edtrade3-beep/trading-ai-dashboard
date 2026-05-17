(function () {
  var FINANCE_LINE = "🟢 Fast & Easy Financing – All Credit Accepted\n🟢 ITIN Accepted – Low Down Payment Options\n🟢 Trade-Ins Welcome.";

  window.DixieAds = {
    buildFacebookAd: function (vehicle, pricing, finance, style, notes) {
      var fmt = window.DixieFormat;
      var payment = window.DixieCalc.monthlyPayment(pricing.suggested, finance.apr, finance.termMonths, finance.downPayment);
      var title = (vehicle.year + " " + vehicle.make + " " + vehicle.model + " " + vehicle.trim).trim();
      var paymentLine = "💸 Estimated payment: " + fmt.money(payment) + "/mo after " + fmt.money(finance.downPayment) + " down (W.A.C.)";
      var extra = notes ? "\n\n" + notes : "";

      if (style === "cash") {
        return title + "\n\n✅ Clean title\n✅ Nice condition\n✅ Ready to drive\n\n💰 Price: " + fmt.money(pricing.suggested) + "\n\nTrade-ins welcome.\n📩 Message us now." + extra;
      }
      if (style === "hot") {
        return title + " 🔥 HOT DEAL 🔥\n\n✅ " + vehicle.engine + "\n✅ " + vehicle.drive + "\n✅ " + vehicle.condition + " condition\n\n💰 Price: " + fmt.money(pricing.suggested) + "\n" + paymentLine + "\n\n" + FINANCE_LINE + "\n\n📩 Message now before it is gone." + extra;
      }
      return title + "\n\n✅ Clean title\n✅ " + vehicle.condition + " condition\n✅ Ready to drive\n\n💰 Price: " + fmt.money(pricing.suggested) + "\n" + paymentLine + "\n\n" + FINANCE_LINE + "\n\n📩 Message us now." + extra;
    }
  };
})();
