#!/bin/bash

################################################################################
# OpenStock Complete Setup & Build Script
# Automates project initialization, dependencies, and deployment
# Usage: bash openstock_setup.sh [local|docker|vercel|railway]
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="OpenStock"
GITHUB_REPO="https://github.com/Open-Dev-Society/OpenStock.git"
SETUP_TYPE="${1:-local}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

################################################################################
# Helper Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          $1"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
}

################################################################################
# Validation Functions
################################################################################

check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 20+"
        exit 1
    fi
    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 20 ]; then
        log_error "Node.js version 20+ required (current: $(node -v))"
        exit 1
    fi
    log_success "Node.js $(node -v) detected"
    
    # Check package manager
    if command -v pnpm &> /dev/null; then
        PM="pnpm"
        log_success "pnpm detected"
    elif command -v npm &> /dev/null; then
        PM="npm"
        log_success "npm detected"
    else
        log_error "Neither pnpm nor npm found. Install Node.js or pnpm"
        exit 1
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed"
        exit 1
    fi
    log_success "Git detected"
    
    # Docker check (optional, only if Docker setup)
    if [ "$SETUP_TYPE" == "docker" ]; then
        if ! command -v docker &> /dev/null; then
            log_error "Docker is required for 'docker' setup type"
            exit 1
        fi
        log_success "Docker detected"
    fi
}

################################################################################
# Setup Functions
################################################################################

setup_local() {
    print_header "Setting up Local Development Environment"
    
    log_info "Installing dependencies with $PM..."
    if [ "$PM" == "pnpm" ]; then
        pnpm install
    else
        npm install
    fi
    log_success "Dependencies installed"
    
    log_info "Creating .env.local file..."
    if [ ! -f .env.local ]; then
        cat > .env.local << 'EOF'
# Core
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/openstock

# Authentication
BETTER_AUTH_SECRET=dev-secret-change-in-production
BETTER_AUTH_URL=http://localhost:3000

# Finnhub (Stock Data)
NEXT_PUBLIC_FINNHUB_API_KEY=your_finnhub_api_key_here
FINNHUB_BASE_URL=https://finnhub.io/api/v1

# AI Provider
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here

# Email
NODEMAILER_EMAIL=your-email@gmail.com
NODEMAILER_PASSWORD=your_app_password_here

# Inngest
INNGEST_SIGNING_KEY=your_inngest_signing_key_here
EOF
        log_success ".env.local created"
        log_warning "⚠️  Edit .env.local with your API keys before running"
    else
        log_warning ".env.local already exists"
    fi
    
    log_info "Building application..."
    if [ "$PM" == "pnpm" ]; then
        pnpm build
    else
        npm run build
    fi
    log_success "Build completed"
    
    print_local_next_steps
}

setup_docker() {
    print_header "Setting up Docker Environment"
    
    log_info "Creating .env file for Docker..."
    if [ ! -f .env ]; then
        cat > .env << 'EOF'
# Core
NODE_ENV=development

# Database (Docker Compose)
MONGODB_URI=mongodb://root:example@mongodb:27017/openstock?authSource=admin

# Authentication
BETTER_AUTH_SECRET=dev-secret-change-in-production
BETTER_AUTH_URL=http://localhost:3000

# Finnhub
NEXT_PUBLIC_FINNHUB_API_KEY=your_finnhub_api_key_here
FINNHUB_BASE_URL=https://finnhub.io/api/v1

# AI Provider
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here

# Email
NODEMAILER_EMAIL=your-email@gmail.com
NODEMAILER_PASSWORD=your_app_password_here

# Inngest
INNGEST_SIGNING_KEY=your_inngest_signing_key_here
EOF
        log_success ".env created"
    fi
    
    log_info "Building Docker image..."
    docker compose build
    log_success "Docker image built"
    
    log_info "Starting services..."
    docker compose up -d
    log_success "Services started"
    
    log_info "Waiting for MongoDB to be ready..."
    sleep 5
    
    print_docker_next_steps
}

setup_vercel() {
    print_header "Setting up Vercel Deployment"
    
    log_info "Vercel setup requires connecting your GitHub repository"
    log_info ""
    log_info "Steps:"
    log_info "1. Push your code to GitHub (if not already there)"
    log_info "2. Go to https://vercel.com/new"
    log_info "3. Click 'Import Git Repository'"
    log_info "4. Select your OpenStock repository"
    log_info "5. Configure environment variables (see .env.example)"
    log_info "6. Click 'Deploy'"
    log_info ""
    
    print_vercel_next_steps
}

setup_railway() {
    print_header "Setting up Railway Deployment"
    
    if ! command -v railway &> /dev/null; then
        log_info "Installing Railway CLI..."
        npm install -g @railway/cli
    fi
    
    log_info "Initializing Railway project..."
    railway init
    
    log_info "Connecting repository..."
    railway connect
    
    log_info "Setting environment variables..."
    railway variables set NODE_ENV=production
    railway variables set NEXT_PUBLIC_FINNHUB_API_KEY=your_key_here
    
    log_success "Railway setup complete"
    
    print_railway_next_steps
}

################################################################################
# Next Steps Functions
################################################################################

print_local_next_steps() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║              Local Development - Next Steps                ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${YELLOW}1. Update .env.local with your API keys:${NC}"
    echo "   - Get Finnhub key: https://finnhub.io/dashboard"
    echo "   - Get Gemini key: https://ai.google.dev"
    echo "   - Get Gmail app password (enable 2FA first)"
    echo ""
    echo -e "${YELLOW}2. Start development servers:${NC}"
    echo "   Terminal 1: $PM dev"
    echo "   Terminal 2: npx inngest-cli@latest dev"
    echo ""
    echo -e "${YELLOW}3. Access the application:${NC}"
    echo "   http://localhost:3000"
    echo ""
    echo -e "${YELLOW}4. Test database connection:${NC}"
    echo "   $PM test:db"
    echo ""
}

print_docker_next_steps() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║               Docker - Next Steps                          ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${YELLOW}1. Update .env with your API keys${NC}"
    echo ""
    echo -e "${YELLOW}2. Start Inngest (optional, for background jobs):${NC}"
    echo "   docker exec -it openstock npx inngest-cli@latest dev"
    echo ""
    echo -e "${YELLOW}3. Access the application:${NC}"
    echo "   http://localhost:3000"
    echo ""
    echo -e "${YELLOW}4. View logs:${NC}"
    echo "   docker compose logs -f openstock"
    echo ""
    echo -e "${YELLOW}5. Stop services:${NC}"
    echo "   docker compose down"
    echo ""
}

print_vercel_next_steps() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║              Vercel Deployment - Next Steps               ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${YELLOW}Environment Variables to set in Vercel:${NC}"
    echo "   MONGODB_URI"
    echo "   BETTER_AUTH_SECRET"
    echo "   BETTER_AUTH_URL"
    echo "   NEXT_PUBLIC_FINNHUB_API_KEY"
    echo "   GEMINI_API_KEY"
    echo "   INNGEST_SIGNING_KEY"
    echo "   NODEMAILER_EMAIL"
    echo "   NODEMAILER_PASSWORD"
    echo ""
    echo -e "${YELLOW}Documentation:${NC}"
    echo "   https://vercel.com/docs/projects/overview"
    echo ""
}

print_railway_next_steps() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║             Railway Deployment - Next Steps                ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${YELLOW}1. Add MongoDB plugin:${NC}"
    echo "   railway add"
    echo "   Select 'MongoDB'"
    echo ""
    echo -e "${YELLOW}2. Set all required environment variables${NC}"
    echo "   railway variables set KEY=VALUE"
    echo ""
    echo -e "${YELLOW}3. Deploy:${NC}"
    echo "   railway deploy"
    echo ""
    echo -e "${YELLOW}4. View logs:${NC}"
    echo "   railway logs"
    echo ""
}

################################################################################
# Main Execution
################################################################################

main() {
    clear
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                  $PROJECT_NAME Setup Script                    ║"
    echo "║         Build & Deploy Your Stock Market Platform           ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    
    log_info "Setup Type: $SETUP_TYPE"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Run appropriate setup
    case $SETUP_TYPE in
        local)
            setup_local
            ;;
        docker)
            setup_docker
            ;;
        vercel)
            setup_vercel
            ;;
        railway)
            setup_railway
            ;;
        *)
            log_error "Invalid setup type: $SETUP_TYPE"
            log_info "Usage: bash openstock_setup.sh [local|docker|vercel|railway]"
            exit 1
            ;;
    esac
    
    echo ""
    log_success "Setup completed successfully! 🎉"
    echo ""
}

main "$@"
