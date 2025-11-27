#!/bin/bash
set -e

echo "🎬 Starting THE-CLAW..."

# Check if dependencies are installed
if [ ! -d "claude-control-browser/node_modules" ]; then
    echo "❌ Dependencies not installed. Running bootstrap first..."
    ./bootstrap.sh
fi

# Start the application with optimizations for 6 concurrent windows
cd claude-control-browser

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
