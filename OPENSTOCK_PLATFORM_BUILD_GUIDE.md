# OpenStock Platform Build & Integration Guide

**Complete instructions for building and integrating OpenStock into your platform.**

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Platform Setup Options](#platform-setup-options)
3. [Build Process](#build-process)
4. [Integration Steps](#integration-steps)
5. [Configuration](#configuration)
6. [Deployment](#deployment)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Option A: Automated Setup (Recommended)

```bash
# Download and run the automated setup script
chmod +x openstock_setup.sh
./openstock_setup.sh local    # or: docker, vercel, railway
```

### Option B: Manual Setup

```bash
# Clone repository
git clone https://github.com/Open-Dev-Society/OpenStock.git
cd OpenStock

# Install dependencies
pnpm install  # or: npm install

# Configure environment
cp .env.example .env.local

# Start development
pnpm dev
```

---

## Platform Setup Options

### 1. Local Development

**Best for:** Development, testing, learning

#### Prerequisites
- Node.js 20+
- MongoDB (local or MongoDB Atlas)
- pnpm or npm

#### Setup Steps

```bash
# 1. Clone & install
git clone https://github.com/Open-Dev-Society/OpenStock.git
cd OpenStock
pnpm install

# 2. Create .env.local
cat > .env.local << 'EOF'
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/openstock
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_FINNHUB_API_KEY=your_finnhub_key
GEMINI_API_KEY=your_gemini_key
NODEMAILER_EMAIL=your-email@gmail.com
NODEMAILER_PASSWORD=your_app_password
INNGEST_SIGNING_KEY=your_inngest_key
EOF

# 3. Start development servers
pnpm dev              # Terminal 1: Next.js server (port 3000)
npx inngest-cli dev   # Terminal 2: Inngest (port 8288)

# 4. Test database connection
pnpm test:db

# 5. Open browser
# http://localhost:3000
```

**File Structure:**
```
OpenStock/
├── app/              # Next.js pages & routes
├── components/       # React components
├── lib/             # Server actions, utilities
├── database/        # MongoDB models
├── .env.local       # Your configuration
└── package.json
```

---

### 2. Docker Deployment

**Best for:** Production-ready, consistent environments

#### Prerequisites
- Docker & Docker Compose
- No Node.js needed (runs in container)

#### Setup Steps

```bash
# 1. Clone repository
git clone https://github.com/Open-Dev-Society/OpenStock.git
cd OpenStock

# 2. Create .env file
cat > .env << 'EOF'
NODE_ENV=production
MONGODB_URI=mongodb://root:example@mongodb:27017/openstock?authSource=admin
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_FINNHUB_API_KEY=your_finnhub_key
GEMINI_API_KEY=your_gemini_key
NODEMAILER_EMAIL=your-email@gmail.com
NODEMAILER_PASSWORD=your_app_password
INNGEST_SIGNING_KEY=your_inngest_key
EOF

# 3. Start services
docker compose up -d

# 4. Verify
docker compose logs -f openstock
curl http://localhost:3000

# 5. Stop (when done)
docker compose down
```

**What it includes:**
- OpenStock app container (Next.js)
- MongoDB container with persistent volume
- Auto-restart on failure
- Health checks enabled

**Access:**
- Application: http://localhost:3000
- MongoDB: localhost:27017

---

### 3. Vercel Deployment (Recommended for Production)

**Best for:** Scalable production, auto-scaling, seamless CI/CD

#### Prerequisites
- GitHub account & repository
- Vercel account (free)

#### Setup Steps

```bash
# 1. Push code to GitHub
git clone https://github.com/Open-Dev-Society/OpenStock.git
cd OpenStock
git remote set-url origin https://github.com/YOUR_USERNAME/OpenStock.git
git push origin main

# 2. Connect to Vercel
# Go to: https://vercel.com/new
# - Click "Import Git Repository"
# - Select your OpenStock repo
# - Click "Import"

# 3. Set Environment Variables
# In Vercel Dashboard → Settings → Environment Variables:
# Add each variable:
MONGODB_URI=your_mongodb_atlas_uri
BETTER_AUTH_SECRET=generate_new_secret
BETTER_AUTH_URL=https://your-vercel-url.vercel.app
NEXT_PUBLIC_FINNHUB_API_KEY=your_finnhub_key
GEMINI_API_KEY=your_gemini_key
INNGEST_SIGNING_KEY=your_inngest_key
NODEMAILER_EMAIL=noreply@yourdomain.com
NODEMAILER_PASSWORD=your_app_password

# 4. Deploy
# Click "Deploy" in Vercel dashboard

# 5. After each push, auto-deploys
git add .
git commit -m "Update feature"
git push origin main  # Automatic deployment starts
```

**Features:**
- Auto-scaling (no configuration needed)
- CDN edge caching
- Built-in analytics
- One-click rollback
- Custom domains

**Cost:**
- Free tier: Generous limits
- Pro: ~$20/month for additional features

---

### 4. Railway.app Deployment

**Best for:** Full-stack apps, database included

#### Prerequisites
- Railway account (free)
- GitHub or GitLab account

#### Setup Steps

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login to Railway
railway login

# 3. Initialize project
cd OpenStock
railway init

# 4. Add MongoDB plugin
railway add
# Select: MongoDB

# 5. Set environment variables
railway variables set NODE_ENV=production
railway variables set MONGODB_URI=your_atlas_uri
railway variables set BETTER_AUTH_SECRET=generate_secret
railway variables set NEXT_PUBLIC_FINNHUB_API_KEY=your_key
railway variables set GEMINI_API_KEY=your_key
railway variables set INNGEST_SIGNING_KEY=your_key
railway variables set NODEMAILER_EMAIL=your_email
railway variables set NODEMAILER_PASSWORD=your_password

# 6. Deploy
railway deploy

# 7. View logs
railway logs

# 8. Get URL
railway status
```

**Features:**
- Built-in MongoDB support
- Environment variable management
- Auto-deployment on push
- Observability built-in

---

## Build Process

### Development Build

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Output: Ready on http://localhost:3000
```

### Production Build

```bash
# Create optimized build
pnpm build

# Start production server
pnpm start

# Output: Ready on http://localhost:3000 (production mode)
```

### Docker Build

```bash
# Build image
docker build -t openstock:latest .

# Run container
docker run -p 3000:3000 --env-file .env openstock:latest

# Or use compose
docker compose up -d --build
```

### Vercel Build (Automatic)

```
Vercel automatically:
1. Detects Next.js framework
2. Installs dependencies
3. Runs `next build`
4. Deploys built artifacts
5. Reports build logs

View build logs in Vercel Dashboard → Deployments
```

---

## Integration Steps

### Step 1: Prepare Your Repository

```bash
# Clone OpenStock
git clone https://github.com/Open-Dev-Society/OpenStock.git
cd OpenStock

# Create your own repository
git remote set-url origin https://github.com/YOUR_ORG/openstock-fork.git

# Push to your repo
git branch -M main
git push -u origin main
```

### Step 2: Set Up Environment

Create `.env.local` (development) or `.env.production` (production):

```env
# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/openstock

# Authentication
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
BETTER_AUTH_URL=https://yourdomain.com

# APIs
NEXT_PUBLIC_FINNHUB_API_KEY=your_key
FINNHUB_BASE_URL=https://finnhub.io/api/v1
GEMINI_API_KEY=your_key
ADANOS_API_KEY=your_key (optional)

# Email
NODEMAILER_EMAIL=noreply@yourdomain.com
NODEMAILER_PASSWORD=your_app_password

# Inngest
INNGEST_SIGNING_KEY=your_key
```

### Step 3: Install Dependencies

```bash
# Using pnpm (recommended)
pnpm install

# Or npm
npm install
```

### Step 4: Test Locally

```bash
# Start dev server
pnpm dev

# In another terminal, start Inngest
npx inngest-cli@latest dev

# Test database
pnpm test:db

# Open browser
# http://localhost:3000
```

### Step 5: Deploy

Choose your platform from above and follow deployment steps.

---

## Configuration

### Required Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `MONGODB_URI` | Database connection | `mongodb+srv://...` |
| `BETTER_AUTH_SECRET` | Auth encryption | `<random-hex-string>` |
| `BETTER_AUTH_URL` | Auth callback URL | `https://yourdomain.com` |
| `NEXT_PUBLIC_FINNHUB_API_KEY` | Stock data API | `<finnhub-key>` |
| `GEMINI_API_KEY` | AI email generation | `<gemini-key>` |
| `INNGEST_SIGNING_KEY` | Background jobs | `<inngest-key>` |
| `NODEMAILER_EMAIL` | Email sender | `noreply@example.com` |
| `NODEMAILER_PASSWORD` | Email password | `<app-password>` |

### Optional Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ADANOS_API_KEY` | Sentiment insights | (disabled) |
| `AI_PROVIDER` | Primary AI service | `gemini` |
| `MINIMAX_API_KEY` | Fallback AI | (disabled) |
| `NODE_ENV` | Environment | `development` |

### API Key Sources

**Finnhub** (Stock Data)
- Free tier available
- Get key: https://finnhub.io/dashboard
- Docs: https://finnhub.io/api/docs

**Google Gemini** (AI)
- Free tier: 60 requests/minute
- Get key: https://ai.google.dev
- Docs: https://ai.google.dev/docs

**MongoDB** (Database)
- M0 free tier (512MB)
- Sign up: https://cloud.mongodb.com
- Get URI from cluster connection screen

**Gmail** (Email)
- Need app password (not main password)
- Enable 2FA first
- Get at: myaccount.google.com/apppasswords

---

## Deployment

### Deployment Checklist

- [ ] All environment variables set
- [ ] Database connection tested (`pnpm test:db`)
- [ ] Build succeeds (`pnpm build`)
- [ ] No TypeScript errors
- [ ] Tested locally (`pnpm dev`)
- [ ] Committed to main branch
- [ ] Deployment initiated

### Vercel Deployment Checklist

- [ ] GitHub repo created and pushed
- [ ] Vercel project imported
- [ ] Environment variables set in Vercel dashboard
- [ ] Deploy button clicked (or auto-deploys on push)
- [ ] Build succeeds in Vercel UI
- [ ] Application loads at `https://your-project.vercel.app`

### Docker Deployment Checklist

- [ ] `.env` file created with all secrets
- [ ] Docker and Docker Compose installed
- [ ] Run `docker compose up -d`
- [ ] Container starts without errors
- [ ] MongoDB accepts connections
- [ ] App accessible at `http://localhost:3000`

### Monitoring After Deployment

```bash
# Vercel
# Go to: https://vercel.com/dashboard
# - View real-time logs
# - Monitor analytics
# - Check error tracking

# Docker
docker compose logs -f openstock      # View app logs
docker compose logs -f mongodb        # View database logs

# Local
# Check terminal output for errors
# Use browser DevTools (F12) for frontend issues
```

---

## Troubleshooting

### Database Connection Issues

```bash
# Error: MongoNetworkError
# Solution: Check connection string
echo $MONGODB_URI

# Test local MongoDB
mongosh "mongodb://localhost:27017"

# Test MongoDB Atlas
# Check IP whitelist: https://cloud.mongodb.com
# Add your IP address to Network Access
```

### Environment Variables Not Loaded

```bash
# Verify .env file exists
ls -la .env.local

# Reload environment
# Kill dev server (Ctrl+C) and restart
pnpm dev

# Check variable is set
echo $NEXT_PUBLIC_FINNHUB_API_KEY
```

### Build Fails with TypeScript Errors

```bash
# Clear Next.js cache
rm -rf .next

# Rebuild
pnpm build

# Or fix errors:
# Review error message
# Fix TypeScript issues in code
# Rebuild
```

### Docker Container Won't Start

```bash
# Check logs
docker compose logs openstock

# Check if port is in use
lsof -i :3000

# Kill process using port
kill -9 <PID>

# Restart
docker compose up -d
```

### Inngest Functions Not Running

```bash
# Ensure Inngest CLI is running
npx inngest-cli@latest dev

# Check signing key is correct
echo $INNGEST_SIGNING_KEY

# View function logs at
# http://localhost:8288
```

### Email Not Sending

```bash
# Test Nodemailer config
node -e "
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASSWORD
  }
});
t.verify((err, ok) => console.log(err || ok));
"

# Fix: Use Gmail app password (not main password)
# Enable 2FA: myaccount.google.com
# Generate app password: myaccount.google.com/apppasswords
```

---

## Next Steps

### After Successful Deployment

1. **Create User Account**
   - Go to sign-up page
   - Create test account
   - Verify email received

2. **Test Features**
   - Search for stocks (Finnhub)
   - Add to watchlist
   - View stock details
   - Verify email notifications work

3. **Monitor Production**
   - Check error logs regularly
   - Monitor database usage
   - Set up alerts for failures

4. **Customize**
   - Update branding
   - Add custom features
   - Configure API rate limits
   - Set up analytics

5. **Scale**
   - Add caching layer (Redis)
   - Implement CDN
   - Add database replicas
   - Enable auto-scaling

---

## Support & Resources

- **GitHub Issues:** https://github.com/Open-Dev-Society/OpenStock/issues
- **API Documentation:** See `/API_DOCS.md` in project
- **Development Guide:** `OPENSTOCK_DEVELOPER_GUIDE.md`
- **Deployment Guide:** `OPENSTOCK_DEPLOYMENT_OPS_GUIDE.md`
- **Architecture Guide:** `OPENSTOCK_ADVANCED_ARCHITECTURE.md`

---

## Platform Comparison

| Platform | Setup Time | Cost | Scaling | Best For |
|----------|-----------|------|---------|----------|
| **Local** | 10 min | Free | N/A | Development |
| **Docker** | 5 min | Free | Manual | Testing/CI |
| **Vercel** | 5 min | Free-20$/mo | Auto | Production |
| **Railway** | 10 min | Free-5$/mo | Auto | Full-stack |

---

## Quick Commands Reference

```bash
# Development
pnpm dev              # Start dev server
npx inngest-cli dev   # Start Inngest (separate terminal)
pnpm test:db          # Test database connection

# Building
pnpm build            # Production build
pnpm lint             # Check code style
pnpm test             # Run tests

# Docker
docker compose up -d           # Start services
docker compose down            # Stop services
docker compose logs -f openstock  # View logs

# Environment
nano .env.local       # Edit environment variables
echo $MONGODB_URI     # Check variable

# Deployment
git push origin main  # Push to GitHub (auto-deploy on Vercel)
vercel               # Deploy via Vercel CLI
railway deploy       # Deploy via Railway CLI
```

---

**Built openly, for everyone, forever free.** ❤️

© Open Dev Society
