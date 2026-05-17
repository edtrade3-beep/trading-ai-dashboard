(function () {
  var VIN_MAP = {
    "1HG": { year: 2019, make: "Honda", model: "Accord", trim: "Sport", body: "Sedan", engine: "2.4L 4 Cyl", drive: "FWD" },
    "2T3": { year: 2018, make: "Toyota", model: "RAV4", trim: "XLE", body: "SUV", engine: "2.5L 4 Cyl", drive: "AWD" },
    "1GN": { year: 2017, make: "Chevrolet", model: "Tahoe", trim: "LT", body: "SUV", engine: "5.3L V8", drive: "4WD" },
    "5FR": { year: 2016, make: "Acura", model: "MDX", trim: "Tech", body: "SUV", engine: "3.5L V6", drive: "AWD" }
  };
  var DEFAULT_VEHICLE = { year: 2019, make: "Toyota", model: "Camry", trim: "SE", body: "Sedan", engine: "2.5L 4 Cyl", drive: "FWD" };

  window.DixieVin = {
    normalize: function (value) {
      return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
    },
    decode: function (vin) {
      var clean = window.DixieVin.normalize(vin);
      var item = VIN_MAP[clean.slice(0, 3)] || DEFAULT_VEHICLE;
      return {
        vin: clean, year: item.year, make: item.make, model: item.model,
        trim: item.trim, body: item.body, engine: item.engine, drive: item.drive,
        fuel: "Gasoline", transmission: "Automatic", mileage: 85000,
        condition: "Good", price: 18995
      };
    }
  };
})();
