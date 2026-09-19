#!/usr/bin/env bash
# Perfume Prompt Preparer - Linux Auto-Update & Launch Script

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "========================================================"
echo "  Perfume Prompt Preparer - Linux Edition"
echo "========================================================"
echo ""

VFILE="$DIR/installed_version.txt"
CUR_VER=""
if [ -f "$VFILE" ]; then
    CUR_VER="$(cat "$VFILE" | tr -d '[:space:]')"
fi

echo "[1/2] Checking for updates on GitHub..."
if command -v curl >/dev/null 2>&1; then
    LATEST_JSON="$(curl -s -L -H "User-Agent: PerfumePrompt-Updater" "https://api.github.com/repos/alielmayyah/PerfumePrompt/releases/latest" 2>/dev/null || true)"
    TAG="$(echo "$LATEST_JSON" | grep -o '"tag_name": *"[^"]*"' | head -n 1 | cut -d'"' -f4)"
    TAR_URL="$(echo "$LATEST_JSON" | grep -o '"browser_download_url": *"[^"]*PerfumePrompt-linux-x64\.tar\.gz"' | head -n 1 | cut -d'"' -f4)"

    if [ -n "$TAG" ] && [ -n "$TAR_URL" ] && { [ "$TAG" != "$CUR_VER" ] || [ ! -f "$DIR/server.js" ]; }; then
        echo "   Found new version: $TAG (current: ${CUR_VER:-none})"
        echo "   Downloading Linux update package..."
        TEMP_TAR="/tmp/perfumeprompt-$$.tar.gz"
        TEMP_DIR="/tmp/perfumeextract-$$"
        
        if curl -s -L -H "User-Agent: PerfumePrompt-Updater" "$TAR_URL" -o "$TEMP_TAR"; then
            echo "   Extracting update..."
            mkdir -p "$TEMP_DIR"
            tar -xzf "$TEMP_TAR" -C "$TEMP_DIR"
            
            SRC_DIR="$TEMP_DIR"
            if [ -d "$TEMP_DIR/PerfumePrompt-linux-x64" ]; then
                SRC_DIR="$TEMP_DIR/PerfumePrompt-linux-x64"
            fi
            
            for item in "$SRC_DIR"/* "$SRC_DIR"/.[!.]*; do
                [ -e "$item" ] || continue
                base="$(basename "$item")"
                if [ "$base" != ".data" ] && [ "$base" != "installed_version.txt" ]; then
                    cp -rf "$item" "$DIR/"
                fi
            done
            
            echo "$TAG" > "$VFILE"
            rm -rf "$TEMP_TAR" "$TEMP_DIR"
            echo "   ✓ Successfully updated to $TAG!"
        else
            echo "   ⚠️ Download failed. Continuing with current version..."
        fi
    elif [ -n "$TAG" ]; then
        echo "   ✓ Up to date ($TAG)"
    fi
else
    echo "   (curl not found, skipping online check)"
fi

echo ""
echo "[2/2] Starting server on http://localhost:3000..."

# Prefer bundled node binary, fallback to system node
NODE_BIN=""
if [ -x "$DIR/bin/node" ]; then
    NODE_BIN="$DIR/bin/node"
elif command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
fi

if [ -z "$NODE_BIN" ]; then
    echo "[Error] Node runtime not found. Please connect to internet once to auto-download."
    exit 1
fi

if command -v xdg-open >/dev/null 2>&1; then
    (sleep 2 && xdg-open "http://localhost:3000") >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    (sleep 2 && open "http://localhost:3000") >/dev/null 2>&1 &
fi

if [ -f "$DIR/server.js" ]; then
    exec "$NODE_BIN" "$DIR/server.js"
else
    exec "$NODE_BIN" node_modules/next/dist/bin/next start
fi
