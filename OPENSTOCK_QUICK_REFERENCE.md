# OpenStock Quick Reference & Cheat Sheet

## 🚀 One-Command Setup

```bash
# Option 1: Automated script (all setups)
chmod +x openstock_setup.sh
./openstock_setup.sh local    # local | docker | vercel | railway

# Option 2: Manual quick start
git clone https://github.com/Open-Dev-Society/OpenStock.git && cd OpenStock && pnpm install && pnpm dev
```

---

## 📋 Setup by Platform

### Local Development (5 min)
```bash
git clone https://github.com/Open-Dev-Society/OpenStock.git
cd OpenStock
pnpm install
cp .env.example .env.local
# Edit .env.local with API keys
pnpm dev                  # Terminal 1: port 3000
npx inngest-cli dev       # Terminal 2: port 8288
```

### Docker (3 min)
```bash
git clone https://github.com/Open-Dev-Society/OpenStock.git
cd OpenStock
cp .env.example .env
# Edit .env with API keys
docker compose up -d
# Access: http://localhost:3000
```

### Vercel (2 min)
```bash
# 1. Push to GitHub
# 2. Go to https://vercel.com/new
# 3. Import repository
# 4. Add environment variables
# 5. Deploy

# Auto-deploys on: git push origin main
```

### Railway (5 min)
```bash
npm install -g @railway/cli
railway login
cd OpenStock
railway init
railway add        # Select MongoDB
railway deploy
```

---

## 🔧 Environment Variables (Required)

```env
# Copy & paste, then edit with YOUR values

NODE_ENV=development

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/openstock

# Auth
BETTER_AUTH_SECRET=generate-random-hex-string
BETTER_AUTH_URL=http://localhost:3000

# APIs
NEXT_PUBLIC_FINNHUB_API_KEY=your_finnhub_key_here
FINNHUB_BASE_URL=https://finnhub.io/api/v1
GEMINI_API_KEY=your_gemini_key_here
INNGEST_SIGNING_KEY=your_inngest_key_here

# Email
NODEMAILER_EMAIL=your-email@gmail.com
NODEMAILER_PASSWORD=your_app_password_here

# Optional
AI_PROVIDER=gemini
ADANOS_API_KEY=your_adanos_key
```

**Get API Keys:**
- Finnhub: https://finnhub.io/dashboard
- Gemini: https://ai.google.dev
- MongoDB Atlas: https://cloud.mongodb.com
- Gmail app password: myaccount.google.com/apppasswords (after enabling 2FA)
- Inngest: https://app.inngest.com

---

## 📦 Common Commands

### Development
```bash
pnpm dev              # Next.js dev server (http://localhost:3000)
pnpm build            # Create production build
pnpm start            # Run production server
pnpm lint             # Check code style
pnpm test             # Run tests
pnpm test:db          # Test database connection
```

### Docker
```bash
docker compose up -d              # Start all services
docker compose down               # Stop all services
docker compose logs -f openstock  # View app logs
docker compose logs -f mongodb    # View database logs
docker compose restart            # Restart services
```

### Git & Deployment
```bash
git add .
git commit -m "message"
git push origin main              # Auto-deploys on Vercel
git log --oneline                 # View commit history
git revert <commit-hash>          # Rollback to previous version
```

### Database
```bash
pnpm test:db                      # Test connection
mongosh "mongodb://localhost:27017"  # MongoDB CLI (local)
mongodump --uri "$MONGODB_URI" --out ./backup  # Backup
mongorestore --drop --uri "$MONGODB_URI" ./backup  # Restore
```

### Troubleshooting
```bash
# Clear caches
rm -rf .next node_modules
pnpm install && pnpm build

# Check processes
lsof -i :3000          # What's using port 3000
lsof -i :27017         # What's using MongoDB port

# Kill process
kill -9 <PID>          # Force kill process

# View logs
docker compose logs openstock -f
npx inngest-cli dev    # Inngest logs at http://localhost:8288
```

---

## 🎯 Project Structure Quick Reference

```
OpenStock/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Login/signup pages
│   ├── (root)/            # Protected app pages
│   ├── api/               # API routes & Inngest
│   └── globals.css        # Tailwind styles
├── components/            # React components
│   ├── ui/               # shadcn/Radix components
│   └── forms/            # Custom form components
├── lib/                   # Business logic
│   ├── actions/          # Server actions
│   ├── inngest/          # Background jobs
│   ├── nodemailer/       # Email setup
│   └── utils.ts          # Helpers
├── database/              # MongoDB models
│   └── models/
├── .env.local            # Your config (don't commit)
├── .env.example          # Template
├── docker-compose.yml    # Docker setup
├── package.json          # Dependencies
└── README.md             # Project docs
```

---

## ✅ Deployment Checklist

### Pre-Deployment
- [ ] All env vars set correctly
- [ ] Database connection works: `pnpm test:db`
- [ ] Build succeeds: `pnpm build`
- [ ] No TypeScript errors
- [ ] Tested locally: `pnpm dev`
- [ ] Committed to git: `git push`

### Post-Deployment
- [ ] App loads in browser
- [ ] Create test account
- [ ] Search for stocks works
- [ ] Add to watchlist works
- [ ] Verify email received
- [ ] Check error logs for 5 min

---

## 🔗 Key Links

**Project**
- GitHub: https://github.com/Open-Dev-Society/OpenStock
- Issues: https://github.com/Open-Dev-Society/OpenStock/issues
- Discussions: https://github.com/Open-Dev-Society/OpenStock/discussions

**Documentation**
- Developer Guide: `OPENSTOCK_DEVELOPER_GUIDE.md`
- Deployment Guide: `OPENSTOCK_DEPLOYMENT_OPS_GUIDE.md`
- Architecture Guide: `OPENSTOCK_ADVANCED_ARCHITECTURE.md`
- Platform Build Guide: `OPENSTOCK_PLATFORM_BUILD_GUIDE.md`

**APIs & Services**
- Finnhub Docs: https://finnhub.io/docs/api
- Google Gemini: https://ai.google.dev/docs
- Better Auth: https://better-auth.vercel.app
- MongoDB: https://docs.mongodb.com
- Inngest: https://www.inngest.com/docs

**Platforms**
- Vercel: https://vercel.com
- Railway: https://railway.app
- Docker Hub: https://hub.docker.com

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| **Port 3000 in use** | `kill -9 $(lsof -t -i:3000)` |
| **MongoDB connection fails** | Check `MONGODB_URI` in .env, whitelist IP in Atlas |
| **API key errors** | Verify keys in .env, check API provider quotas |
| **Email not sending** | Use Gmail app password (not main password) |
| **Build fails** | `rm -rf .next && pnpm build` |
| **Dependencies error** | `rm -rf node_modules && pnpm install` |
| **Docker error** | `docker compose down && docker compose up -d --build` |
| **Inngest not running** | Start in separate terminal: `npx inngest-cli dev` |

---

## 📊 Performance Tips

```bash
# Monitor during development
docker stats                  # Docker resource usage
node --prof app.js           # Profiling

# Optimize build
pnpm build --profile         # Build analysis
npm ls                       # Check dependencies

# Database optimization
# Add indexes in MongoDB:
# db.users.createIndex({ email: 1 })
# db.watchlists.createIndex({ userId: 1 })
```

---

## 🚀 Scaling Checklist

As your app grows:

- [ ] Enable database read replicas (MongoDB Atlas)
- [ ] Add Redis caching layer
- [ ] Set up CDN (Vercel auto-handles)
- [ ] Implement request rate limiting
- [ ] Monitor database slow queries
- [ ] Set up alerts for errors
- [ ] Plan database migration strategy
- [ ] Load test before major releases

---

## 📝 Deployment Commands by Platform

### Vercel
```bash
# Install CLI
npm install -g vercel

# Deploy
vercel

# View logs
vercel logs

# Set variables
vercel env add SECRET_KEY
```

### Railway
```bash
# Install CLI
npm install -g @railway/cli

# Deploy
railway deploy

# View logs
railway logs

# Set variable
railway variables set KEY=value
```

### Docker
```bash
# Build
docker build -t openstock:latest .

# Push to registry
docker push username/openstock:latest

# Pull and run
docker run -p 3000:3000 username/openstock:latest
```

### Local/Manual
```bash
# Build
pnpm build

# Run
pnpm start

# Stop (Ctrl+C)
```

---

## 💡 Pro Tips

1. **Use `.env.example`** — Keep a template in repo for team reference
2. **Never commit secrets** — Add `.env*` to `.gitignore`
3. **Test locally first** — Always `pnpm dev && pnpm build` before pushing
4. **Monitor logs** — Watch for errors in real-time during testing
5. **Backup database** — Regular dumps: `mongodump --uri "$MONGODB_URI" --out ./backup`
6. **Use `pnpm`** — Faster than npm, better dependency management
7. **Watch Inngest logs** — http://localhost:8288 during development
8. **Check API quotas** — Finnhub has rate limits even on paid plans

---

## 🎓 Learning Path

1. **Week 1:** Local setup → Explore codebase → Run `pnpm dev`
2. **Week 2:** Docker setup → Practice deployment locally
3. **Week 3:** Deploy to staging (Vercel or Railway)
4. **Week 4:** Production deployment & monitoring

---

**Questions?** Check the full guides or open an issue on GitHub!

**Built openly, for everyone, forever free.** ❤️
