#!/usr/bin/env bash
# Perfume Prompt Preparer - Linux/macOS Startup Script

set -e

echo "========================================================"
echo "  Perfume Prompt Preparer"
echo "========================================================"
echo ""

# 1. Automatically pull latest updates from GitHub if inside a git clone
if [ -d ".git" ] && command -v git >/dev/null 2>&1; then
    echo "[1/3] Checking for latest updates from GitHub..."
    if git pull --quiet origin main 2>/dev/null; then
        echo "  ✓ Up to date with latest GitHub version!"
    else
        echo "  ⚠️ Offline or remote unreachable. Continuing with local version..."
    fi
    echo ""
fi

# 2. Check if Node.js is installed
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

# 3. Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
    echo "[2/3] First-time setup: installing dependencies..."
    npm install
    echo ""
fi

echo "[3/3] Starting application on http://localhost:3000..."

# Open browser in background based on OS
if command -v xdg-open >/dev/null 2>&1; then
    (sleep 2 && xdg-open "http://localhost:3000") >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    (sleep 2 && open "http://localhost:3000") >/dev/null 2>&1 &
fi

exec npm run dev
