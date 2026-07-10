# 🍎 New MacBook Setup — AM Trading Platform

Getting everything running on a fresh Mac. Your **code lives in GitHub** and your
**platform runs on Render** — nothing is trapped on the old laptop. This is mostly:
install tools → clone the repo → done. ~30–45 min.

> Open this file from GitHub on the new Mac: it's in the repo root.

---

## 1. Install Homebrew (the Mac app installer)
Open **Terminal** (Cmd+Space → type "Terminal") and paste:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Follow the prompts. When it finishes, it prints 2 lines to run (adding brew to your
PATH) — run those.

## 2. Install the tools
```bash
brew install node git
brew install --cask visual-studio-code google-chrome
```
(You can swap Chrome for Brave: `brew install --cask brave-browser`.)

## 3. Install & sign in to Claude Code
```bash
npm install -g @anthropic-ai/claude-code
```
Then start it and sign in:
```bash
claude
```
It'll open a browser to log in with your Anthropic account. Done once.

## 4. Set up git (first time on a new machine)
```bash
git config --global user.name "Dixie"
git config --global user.email "ed.dixiemotors@gmail.com"
```

## 5. Clone your project — this brings ALL your code back
```bash
cd ~
mkdir -p code && cd code
git clone https://github.com/edtrade3-beep/trading-ai-dashboard.git
cd trading-ai-dashboard
```
Everything is now on the new Mac. Open it in the editor:
```bash
code .
```
…and start Claude Code in the project folder:
```bash
claude
```
Claude reads your project files and is instantly back up to speed.

## 6. (Optional) Run the server locally
You usually don't need to — the live platform runs on Render. But to test locally:
```bash
node server.js
```
Then open http://localhost:3000 (or the port it prints).

---

## ✅ What you DON'T need to worry about
- **Your live platform** → runs on **Render**, unaffected by the laptop swap.
- **Your API keys (Alpaca, Anthropic, etc.)** → set in the **Render dashboard**
  (cloud), NOT on your laptop. They keep working. You only touch them if you run
  the server locally — then create a `.env` file with the same keys.
- **Your code** → all in GitHub, restored by `git clone`.

## ⚠️ Two small things that DON'T auto-transfer
- **Your browser watchlist** (Terminal → My Watchlist) is stored in the *browser*,
  so it's per-machine. Re-add your names on the Mac, or ask Claude to add an
  export/import button.
- **Claude Code memory + past chat history** live in `~/.claude` on the old
  laptop. To carry them over, copy that folder from Windows
  (`C:\Users\dixie\.claude`) to `~/.claude` on the Mac. Optional — the code is
  what matters, and that's in GitHub.

---

## Mac quick reference (coming from Windows)
| Windows | Mac |
|---|---|
| `Ctrl` | `Cmd` (⌘) for most shortcuts |
| Explorer | Finder |
| `Ctrl+Shift+R` (hard refresh) | `Cmd+Shift+R` |
| PowerShell | Terminal (zsh) |

That's it — you're running. Everything important was already safe in the cloud.
