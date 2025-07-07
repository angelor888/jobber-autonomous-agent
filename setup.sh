#!/bin/bash

# Jobber Autonomous Agent - Quick Setup Script
# This script helps you set up the project quickly

echo "🚀 Jobber Autonomous Agent - Quick Setup"
echo "========================================"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first."
    exit 1
fi

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p src/{agent,api,config,middleware,server,services,utils}
mkdir -p tests scripts docs

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Copy environment file
if [ ! -f .env ]; then
    echo "🔧 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env with your Jobber credentials"
fi

# Create logs directory
mkdir -p logs

# Run verification
echo "🔍 Running verification..."
npm run verify

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your Jobber credentials"
echo "2. Run 'npm run dev' to start locally"
echo "3. Deploy to Heroku with 'git push heroku main'"
echo ""
echo "📚 Documentation: https://github.com/angelor888/jobber-autonomous-agent"