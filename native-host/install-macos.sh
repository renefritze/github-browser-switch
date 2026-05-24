#!/usr/bin/env bash
# Browser Switch – Native Host Installer (macOS)
# ================================================
# Usage:
#   bash install-macos.sh [--extension-id EXT_ID]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_NAME="com.browserswitch.host"
INSTALL_DIR="$HOME/Library/Application Support/BrowserSwitch"
HOST_SCRIPT="$INSTALL_DIR/browser_switch_host.py"
MANIFEST_JSON="$INSTALL_DIR/${HOST_NAME}.json"

EXT_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --extension-id) EXT_ID="$2"; shift 2;;
    *) echo "Unknown option: $1" >&2; exit 1;;
  esac
done

if [[ -z "$EXT_ID" ]]; then
  echo "Browser Switch – Native Host Installer (macOS)"
  echo "================================================"
  echo ""
  echo "You need your extension ID from chrome://extensions (enable Developer mode)."
  read -rp "Extension ID: " EXT_ID
fi

[[ -z "$EXT_ID" ]] && { echo "Error: Extension ID required." >&2; exit 1; }

mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/browser_switch_host.py" "$HOST_SCRIPT"
chmod +x "$HOST_SCRIPT"

cat > "$MANIFEST_JSON" <<JSON
{
  "name": "$HOST_NAME",
  "description": "Browser Switch native messaging host",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXT_ID}/"
  ]
}
JSON

echo "Manifest written to $MANIFEST_JSON"

register() {
  local dir="$1"
  mkdir -p "$dir"
  cp "$MANIFEST_JSON" "$dir/${HOST_NAME}.json"
  echo "  Registered: $dir"
}

echo "Registering …"

NMH_BASE="$HOME/Library/Application Support"

register "$NMH_BASE/Google/Chrome/NativeMessagingHosts"
[[ -d "$NMH_BASE/Chromium" ]]             && register "$NMH_BASE/Chromium/NativeMessagingHosts"
[[ -d "$NMH_BASE/BraveSoftware/Brave-Browser" ]] && register "$NMH_BASE/BraveSoftware/Brave-Browser/NativeMessagingHosts"
[[ -d "$NMH_BASE/Vivaldi" ]]              && register "$NMH_BASE/Vivaldi/NativeMessagingHosts"
[[ -d "$NMH_BASE/Microsoft Edge" ]]       && register "$NMH_BASE/Microsoft Edge/NativeMessagingHosts"

echo ""
echo "✓ Installation complete!"
