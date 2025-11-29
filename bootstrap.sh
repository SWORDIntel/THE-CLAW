#!/bin/bash
set -e

echo "🚀 Bootstrapping THE-CLAW environment..."
echo ""

# Function to install Node.js using nvm
install_nodejs_nvm() {
    echo "📥 Installing Node.js via nvm..."

    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        source "$HOME/.nvm/nvm.sh"
        nvm install node
    else
        echo "Installing nvm first..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        nvm install node
    fi
}

# Function to install Node.js using apt (Linux)
install_nodejs_apt() {
    if ! command -v apt-get &> /dev/null; then
        return 1
    fi
    echo "📥 Installing Node.js via apt..."
    sudo apt-get update && sudo apt-get install -y nodejs npm
}

# Function to install Node.js using brew (macOS)
install_nodejs_brew() {
    if ! command -v brew &> /dev/null; then
        return 1
    fi
    echo "📥 Installing Node.js via Homebrew..."
    brew install node
}

# Function to prompt user for Node.js installation
prompt_install_nodejs() {
    echo ""
    echo "❌ Node.js is not installed (required: v16+)"
    echo ""
    echo "Installation options:"
    echo "  1) Auto-install using nvm (recommended)"
    echo "  2) Auto-install using apt (Linux)"
    echo "  3) Auto-install using Homebrew (macOS)"
    echo "  4) Download from https://nodejs.org/ (manual)"
    echo ""
    read -p "Choose option (1-4): " choice

    case $choice in
        1) install_nodejs_nvm ;;
        2) install_nodejs_apt || echo "apt-get not available" ;;
        3) install_nodejs_brew || echo "Homebrew not available" ;;
        4) echo "Please install Node.js from https://nodejs.org/ and re-run this script"; exit 1 ;;
        *) echo "Invalid choice"; prompt_install_nodejs ;;
    esac
}

# Detect Node.js installation
if ! command -v node &> /dev/null; then
    prompt_install_nodejs
fi

NODE_VERSION=$(node -v)
echo "✓ Node.js version: $NODE_VERSION"

# Detect npm installation
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please reinstall Node.js."
    exit 1
fi

NPM_VERSION=$(npm -v)
echo "✓ npm version: $NPM_VERSION"

# Navigate to application directory
cd claude-control-browser

# Check if node_modules exists and is valid
if [ -d "node_modules" ]; then
    echo ""
    echo "🔍 Checking existing installation..."

    if [ ! -f "node_modules/electron/index.js" ]; then
        echo "⚠️  Corrupted installation detected. Reinstalling..."
        rm -rf node_modules package-lock.json
        npm install
    else
        echo "✓ Installation is valid"
        # Check if packages need updating
        npm install --prefer-offline --no-audit 2>/dev/null || npm install
    fi
else
    echo ""
    echo "📦 Installing dependencies for claude-control-browser..."
    npm install
fi

# Fix security vulnerabilities
echo ""
echo "🔒 Checking for security vulnerabilities..."
if npm audit --audit-level=high 2>&1 | grep -q "vulnerabilities"; then
    read -p "Found security issues. Run 'npm audit fix'? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm audit fix
    fi
fi

echo ""
echo "✅ Bootstrap complete!"
