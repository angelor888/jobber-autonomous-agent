#!/bin/bash

# Jobber Autonomous Agent - Startup Script
# This script ensures everything is ready before starting the agent

set -e

echo "🚀 Jobber Autonomous Agent - Startup Sequence"
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js version
echo -n "Checking Node.js version... "
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="16.0.0"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
    echo -e "${GREEN}✓${NC} Node.js $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js $NODE_VERSION (requires >= $REQUIRED_VERSION)"
    exit 1
fi

# Check environment file
echo -n "Checking environment configuration... "
if [ -f .env ]; then
    echo -e "${GREEN}✓${NC} .env file found"
else
    echo -e "${YELLOW}⚠${NC} .env file not found, copying from template"
    cp .env.example .env
    echo -e "${RED}!${NC} Please configure .env file with your Jobber credentials"
    exit 1
fi

# Validate required environment variables
echo "Validating configuration..."
MISSING_VARS=()

# Check required variables
[ -z "$JOBBER_CLIENT_ID" ] && MISSING_VARS+=("JOBBER_CLIENT_ID")
[ -z "$JOBBER_CLIENT_SECRET" ] && MISSING_VARS+=("JOBBER_CLIENT_SECRET")
[ -z "$JOBBER_REDIRECT_URI" ] && MISSING_VARS+=("JOBBER_REDIRECT_URI")

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}✗${NC} Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "Please set these in your .env file"
    exit 1
else
    echo -e "${GREEN}✓${NC} All required variables present"
fi

# Check multi-user configuration
echo -n "Checking multi-user support... "
if [ "$MULTI_USER_ENABLED" != "false" ]; then
    echo -e "${GREEN}✓${NC} Multi-user webhooks ENABLED"
else
    echo -e "${RED}✗${NC} Multi-user support is DISABLED"
    echo "  This means only the authenticated user's actions will trigger webhooks!"
    echo "  Set MULTI_USER_ENABLED=true in .env to fix this"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install --production
else
    echo -e "${GREEN}✓${NC} Dependencies installed"
fi

# Create required directories
echo "Creating required directories..."
mkdir -p logs data
echo -e "${GREEN}✓${NC} Directories ready"

# Check port availability
PORT=${PORT:-3000}
echo -n "Checking port $PORT availability... "
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}✗${NC} Port $PORT is already in use"
    echo "  Either stop the other process or set a different PORT in .env"
    exit 1
else
    echo -e "${GREEN}✓${NC} Port $PORT is available"
fi

# Run pre-flight health check
echo "Running pre-flight checks..."
node scripts/preflight.js
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Pre-flight checks passed"
else
    echo -e "${RED}✗${NC} Pre-flight checks failed"
    exit 1
fi

echo ""
echo "============================================"
echo -e "${GREEN}✓ All checks passed!${NC}"
echo ""
echo "🎯 IMPORTANT: Multi-User Webhook Support"
echo "This agent receives webhooks for ALL Jobber users, not just the authenticated account."
echo "Make sure you've configured webhooks in Jobber Developer Portal."
echo ""
echo "Starting Jobber Autonomous Agent..."
echo "============================================"
echo ""

# Start the application
if [ "$NODE_ENV" = "production" ]; then
    # Production mode with PM2
    if command -v pm2 &> /dev/null; then
        pm2 start ecosystem.config.js
        echo -e "${GREEN}✓${NC} Agent started with PM2"
        echo "Run 'pm2 logs jobber-agent' to view logs"
    else
        # Fallback to direct node
        node src/index.js
    fi
else
    # Development mode
    if [ -f "node_modules/.bin/nodemon" ]; then
        npm run dev
    else
        node src/index.js
    fi
fi