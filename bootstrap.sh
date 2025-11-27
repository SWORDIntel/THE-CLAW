#!/bin/bash
set -e

echo "🚀 Bootstrapping THE-CLAW environment..."

# Detect Node.js installation
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16 or higher."
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✓ Node.js version: $NODE_VERSION"

# Detect npm installation
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm."
    exit 1
fi

NPM_VERSION=$(npm -v)
echo "✓ npm version: $NPM_VERSION"

# Install dependencies for claude-control-browser
echo ""
echo "📦 Installing dependencies for claude-control-browser..."
cd claude-control-browser
npm install

echo ""
echo "✅ Bootstrap complete! Run './start.sh' to start the application."
