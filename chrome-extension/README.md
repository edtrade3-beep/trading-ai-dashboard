# Dixie Motors — Messenger Reply Helper (Chrome Extension)

A **manual** reply assistant for your personal Facebook customer messages.
It drafts professional replies — **you review and click Send yourself.**

✅ ToS-safe: never auto-sends, never auto-scrapes, never logs into anything.
It only reads text **you highlight** and writes drafts **you copy**.

---

## What it does

- **Generate Reply** — paste/highlight a customer message → get a smart draft
- **Edit before copying** — tweak the draft, then one-click copy
- **Quick templates** — greeting, financing, trade-in, appointment, etc.
- **Lead capture** — name, phone, vehicle, budget, down payment, appointment, notes
- **Saved leads** — stored locally on your computer
- **Export CSV** — download all leads for your records
- **CRM webhook** (optional) — auto-send each saved lead to your CRM
- **Telegram alert** (optional) — ping your phone when you save a 🔥 hot lead

### Built-in rules (always followed)
- Never says "guaranteed approval"
- Uses **W.A.C.** (with approved credit) for financing
- Always asks for **down payment + monthly budget**
- Asks **one question at a time**
- Replies in **Arabic** if customer writes Arabic, **Spanish** if Spanish
- Flags **legal / refund / title / contract** messages → tells you to handle personally

---

## Install (5 minutes)

1. Download/copy this `chrome-extension` folder to your computer.
2. Open Chrome → go to **chrome://extensions**
3. Turn on **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the `chrome-extension` folder
5. The 🚗 Dixie Motors icon appears in your toolbar — pin it.

> **Icon note:** if Chrome complains about a missing `icon.png`, either add any
> small PNG named `icon.png` to this folder, or remove the `"icons"` and
> `"default_icon"` lines from `manifest.json`. The extension works either way.

---

## First-time setup

1. Click the extension icon → **⚙️ Settings** tab
2. **Server URL** is pre-filled:
   `https://trading-ai-dashboard-i6pf.onrender.com`
   (this is your own platform — it generates the AI drafts securely)
3. *(Optional)* **CRM Webhook URL** — paste your CRM's webhook to auto-send leads
4. *(Optional)* Check **Telegram alert on hot leads** (your server's Telegram must be set up)
5. Click **Save Settings**

> The AI drafts require `ANTHROPIC_API_KEY` to be set on your server (Render.com
> dashboard → Environment). Without it, the extension falls back to smart
> templates — still useful, just not AI-personalized.

---

## Daily use

1. A customer messages you on Facebook.
2. **Highlight** their message → click the extension → **⬇ Use highlighted text**
   (or just paste it into the box).
3. Click **⚡ Generate Reply**.
4. Read the draft, **edit** anything, click **📋 Copy Reply**.
5. **Paste into Facebook and click Send yourself.** ✅
6. Switch to **📋 Lead** tab → fill in their info → **Save Lead**.
7. Anytime: **📁 Leads → Export CSV** for your records.

---

## Privacy

- All leads are stored **locally** in your browser (`chrome.storage.local`).
- Nothing is sent anywhere unless **you** set a webhook or Telegram alert.
- The only network call is the message you choose to generate a reply for.

---

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config (Manifest V3) |
| `popup.html` | The sidebar UI |
| `popup.js` | All logic (generate, copy, leads, CSV) |
| `content.js` | Reads your highlighted text on Facebook |
| `styles.css` | Styling |
| `README.md` | This file |
