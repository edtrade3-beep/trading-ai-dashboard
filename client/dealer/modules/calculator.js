(function () {
  window.DixieCalc = {
    estimatePrice: function (vehicle) {
      var currentYear = new Date().getFullYear();
      var age = Math.max(currentYear - Number(vehicle.year || currentYear), 0);
      var mileage = Number(vehicle.mileage || 0);
      var price = Number(vehicle.price || 0);
      var make = String(vehicle.make || "").toLowerCase();
      var model = String(vehicle.model || "").toLowerCase();
      var condition = vehicle.condition || "Good";
      var base = 31000 - age * 2100;
      if (["toyota", "honda", "lexus", "acura"].includes(make)) base *= 1.08;
      if (["chevrolet", "ford", "gmc"].includes(make)) base *= 1.03;
      if (model.includes("tahoe") || model.includes("truck")) base *= 1.1;
      base -= Math.max(mileage - 60000, 0) * 0.05;
      base *= ({ Excellent: 1.08, "Very Good": 1.04, Good: 1, Fair: 0.92, Rough: 0.84 }[condition] || 1);
      if (price > 0) base = base * 0.72 + price * 0.28;
      var suggested = Math.max(Math.round(base / 100) * 100, 4000);
      var low = Math.round(suggested * 0.95);
      var high = Math.round(suggested * 1.1);
      var cleanTrade = Math.round(suggested * 0.87);
      var roughTrade = Math.round(suggested * 0.78);
      var recon = Math.round(Math.max(500, suggested * 0.03));
      var pack = 995;
      var totalCost = cleanTrade + recon + pack;
      var frontEnd = Math.max(high - totalCost, 0);
      var ratio = cleanTrade > 0 ? totalCost / cleanTrade : 0;
      return { suggested: suggested, low: low, high: high, cleanTrade: cleanTrade, roughTrade: roughTrade, recon: recon, pack: pack, totalCost: totalCost, frontEnd: frontEnd, ratio: ratio };
    },
    monthlyPayment: function (amount, apr, months, downPayment) {
      var principal = Math.max(Number(amount || 0) - Number(downPayment || 0), 0);
      var rate = Number(apr || 0) / 100 / 12;
      var term = Math.max(Number(months || 72), 1);
      if (!principal) return 0;
      if (!rate) return Math.round(principal / term);
      return Math.round((principal * rate) / (1 - Math.pow(1 + rate, -term)));
    },
    scoreDeal: function (vehicle, pricing) {
      var score = 0;
      var mileage = Number(vehicle.mileage || 0);
      var make = String(vehicle.make || "").toLowerCase();
      score += Math.min(pricing.frontEnd / 150, 40);
      score += Math.min((pricing.high - pricing.cleanTrade) / 200, 25);
      score += mileage <= 80000 ? 15 : mileage <= 120000 ? 10 : 5;
      if (["toyota", "honda", "lexus", "acura"].includes(make)) score += 10;
      if (["chevrolet", "ford", "gmc"].includes(make)) score += 7;
      if (pricing.ratio <= 0.82) score += 12;
      else if (pricing.ratio <= 0.9) score += 8;
      else if (pricing.ratio <= 1) score += 4;
      return Math.round(score);
    }
  };
})();
