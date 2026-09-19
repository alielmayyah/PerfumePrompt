#!/usr/bin/env bash
# Perfume Prompt Preparer - Linux/macOS Startup Script

set -e

echo "========================================================"
echo "  Perfume Prompt Preparer"
echo "========================================================"
echo ""

# Check if Node.js is installed
if ! command -v node >/dev/null 2>&1; then
    echo "[Error] Node.js is not installed on this system."
    echo "Please install Node.js (v20+ recommended) via your package manager:"
    echo "  Ubuntu/Debian: sudo apt update && sudo apt install -y nodejs npm"
    echo "  Fedora/RHEL:   sudo dnf install -y nodejs npm"
    echo "  Arch Linux:    sudo pacman -S nodejs npm"
    echo "  macOS:         brew install node"
    echo ""
    exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
    echo "First-time setup: installing dependencies..."
    npm install
fi

echo "Starting application on http://localhost:3000..."

# Open browser in background based on OS
if command -v xdg-open >/dev/null 2>&1; then
    (sleep 2 && xdg-open "http://localhost:3000") >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    (sleep 2 && open "http://localhost:3000") >/dev/null 2>&1 &
fi

exec npm run dev
