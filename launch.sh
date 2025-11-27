#!/bin/bash

# THE-CLAW Launcher - Runs THE-CLAW in the background without a terminal window
# Usage: ./launch.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if dependencies are installed
if [ ! -d "$SCRIPT_DIR/claude-control-browser/node_modules" ]; then
    echo "Dependencies not found. Installing..."
    "$SCRIPT_DIR/bootstrap.sh" || {
        echo "Failed to install dependencies"
        exit 1
    }
fi

# Run the application in the background and detach from terminal
cd "$SCRIPT_DIR"
nohup ./start.sh > /dev/null 2>&1 &

# Print success message
echo "THE-CLAW is starting... 🚀"
