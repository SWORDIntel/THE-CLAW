#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🎬 Starting THE-CLAW..."
echo ""

# Auto-bootstrap: Check if dependencies are installed or corrupted
if [ ! -d "$SCRIPT_DIR/claude-control-browser/node_modules" ] || [ ! -f "$SCRIPT_DIR/claude-control-browser/node_modules/electron/index.js" ]; then
    echo "📦 Auto-bootstrapping dependencies..."
    cd "$SCRIPT_DIR"

    # Run bootstrap script non-interactively if possible
    if [ -z "$INTERACTIVE" ]; then
        export INTERACTIVE=0
    fi

    ./bootstrap.sh || {
        echo "❌ Auto-bootstrap failed. Please run './bootstrap.sh' manually"
        exit 1
    }
fi

# Start the application with optimizations for 6 concurrent windows
cd "$SCRIPT_DIR/claude-control-browser"

echo ""
echo "📊 Optimizing performance for 6 concurrent browser windows..."
echo "   - V8 code caching enabled"
echo "   - GPU acceleration enabled"
echo "   - Memory optimization enabled"
echo ""

# Performance optimizations for multiple browser windows
export NODE_OPTIONS="--max-old-space-size=4096 --enable-source-maps"
export ELECTRON_DISABLE_SANDBOX=1
export ENABLE_V8_CODE_CACHE=1

# Launch with performance flags
exec npm start -- \
  --enable-gpu-rasterization \
  --enable-features=V8CodeCaching \
  --disable-device-discovery-notifications \
  --disable-background-networking \
  --disable-breakpad \
  --disable-client-side-phishing-detection \
  --disable-component-extensions-with-background-pages \
  --disable-default-apps \
  --disable-extensions \
  --disable-popup-blocking \
  --disable-prompt-on-repost \
  --disable-sync \
  --disable-translate \
  --metrics-recording-only \
  --mute-audio \
  --no-default-browser-check \
  --no-pings
