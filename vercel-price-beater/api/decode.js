// Vercel serverless function — GET /api/decode?vin=XXXX  (free, NHTSA, no key)
const pick = (r, v) => { const row = r.find(x => String(x.Variable || "").trim() === v); const val = String(row?.Value || "").trim(); return val && val !== "Not Applicable" && val !== "0" ? val : ""; };

module.exports = async (req, res) => {
  const vin = String((req.query && req.query.vin) || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
  if (vin.length !== 17) return res.status(400).json({ error: "VIN must be 17 alphanumeric characters" });
  try {
    const data = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`).then(r => r.json());
    const r = data?.Results || [];
    const year = Number(pick(r, "Model Year")) || 0, make = pick(r, "Make"), model = pick(r, "Model");
    if (!year || !make || !model) return res.status(200).json({ vin, error: "Could not decode this VIN" });
    const displ = pick(r, "Displacement (L)"), cyls = pick(r, "Engine Number of Cylinders");
    const engine = [displ ? `${Number(displ).toFixed(1)}L` : "", cyls ? `${cyls} Cyl` : ""].filter(Boolean).join(" ") || "—";
    return res.status(200).json({ vin, year, make, model, trim: pick(r, "Series") || pick(r, "Trim") || "", body: pick(r, "Body Class") || "", engine, drive: pick(r, "Drive Type") || "", fuel: pick(r, "Fuel Type - Primary") || "" });
  } catch (e) { return res.status(502).json({ error: "Decode service unavailable" }); }
};
