# Price Beater — standalone (Vercel)

A self-contained "Am I the cheapest dealer?" tool. Static page + serverless functions. No database.

## Deploy to Vercel

1. **Push this folder** (`vercel-price-beater/`) to a GitHub repo (or its own repo).
2. On **vercel.com → New Project**, import the repo. If this is a subfolder, set the **Root Directory** to `vercel-price-beater`.
3. **Settings → Environment Variables** — add at least one (more = better/fallback):
   | Variable | Where to get it |
   |---|---|
   | `MARKETCHECK_API_KEY` | marketcheck.com (real listings) |
   | `AUTODEV_API_KEY` | auto.dev (real listings, free tier) |
   | `BRAVE_API_KEY` | brave.com/search/api (free 2,000/mo) |
   | `SERPAPI_KEY` | serpapi.com (free 100/mo) |
4. **Deploy.** Your URL: `https://your-project.vercel.app`

Engines run in order **MarketCheck → Auto.dev → Brave → SerpAPI** — the first one that returns listings wins.

## Use it
- Add a vehicle by **VIN** (auto-decodes) or by typing Year/Make/Model + your price.
- Or **Import CSV** (columns: Year, Make, Model, Trim, VIN, Mileage, Price — any order).
- **Scan All** → each row shows the **cheapest competing dealer**, its **price**, **location**, a **link**, and a **suggested reprice**.
- **Export CSV** to download the results.

## Endpoints
- `POST /api/scan` `{ year, make, model, trim, zip, myPrice }` → cheapest dealer listings
- `GET /api/decode?vin=...` → decoded year/make/model/trim (free, NHTSA)

Inventory and scan results are stored in your browser (localStorage) — nothing is saved server-side.
