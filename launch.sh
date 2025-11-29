#!/bin/bash

# THE-CLAW Launcher - Runs THE-CLAW in the background without a terminal window
# Usage: ./launch.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Auto-bootstrap check
if [ ! -d "$SCRIPT_DIR/claude-control-browser/node_modules" ] || [ ! -f "$SCRIPT_DIR/claude-control-browser/node_modules/electron/index.js" ]; then
    echo "🔧 Auto-bootstrapping dependencies..."
    cd "$SCRIPT_DIR"

    # Run bootstrap silently
    if ! ./bootstrap.sh > /tmp/claw-bootstrap.log 2>&1; then
        echo "⚠️  Auto-bootstrap failed. Check /tmp/claw-bootstrap.log"
        echo "Run './bootstrap.sh' manually to fix issues."
        exit 1
    fi
fi

# Run the application in the background and detach from terminal
cd "$SCRIPT_DIR"

# Log output for debugging
LOG_FILE="/tmp/claw-$(date +%s).log"
nohup ./start.sh > "$LOG_FILE" 2>&1 &

# Get the process ID
PID=$!

# Print success message
echo "✅ THE-CLAW is starting (PID: $PID)..."
echo "📝 Logs: $LOG_FILE"
echo ""
echo "To stop THE-CLAW, run: kill $PID"
