#!/usr/bin/env bash
# Browser Switch – Native Host Installer (Linux)
# ================================================
# Installs the Python native messaging host and registers it with
# Chromium-based browsers for the current user.
#
# Usage:
#   bash install.sh [--extension-id EXT_ID]
#
# The extension ID can be found in chrome://extensions (developer mode on).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_NAME="com.browserswitch.host"
INSTALL_DIR="$HOME/.local/lib/browserswitch"
HOST_SCRIPT="$INSTALL_DIR/browser_switch_host.py"
MANIFEST_JSON="$INSTALL_DIR/${HOST_NAME}.json"

EXT_ID=""

# ── Parse arguments ────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --extension-id) EXT_ID="$2"; shift 2;;
    *) echo "Unknown option: $1" >&2; exit 1;;
  esac
done

# ── Prompt for extension ID if not provided ────────────────────────────────────
if [[ -z "$EXT_ID" ]]; then
  echo "Browser Switch – Native Host Installer"
  echo "======================================="
  echo ""
  echo "You need your extension ID from chrome://extensions (enable Developer mode)."
  read -rp "Extension ID: " EXT_ID
fi

if [[ -z "$EXT_ID" ]]; then
  echo "Error: Extension ID is required." >&2
  exit 1
fi

# ── Install files ──────────────────────────────────────────────────────────────
echo ""
echo "Installing to $INSTALL_DIR …"
mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/browser_switch_host.py" "$HOST_SCRIPT"
chmod +x "$HOST_SCRIPT"

# ── Write the manifest ─────────────────────────────────────────────────────────
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

# ── Register manifest for each browser ────────────────────────────────────────
register() {
  local dir="$1"
  mkdir -p "$dir"
  ln -sf "$MANIFEST_JSON" "$dir/${HOST_NAME}.json"
  echo "  Registered: $dir"
}

echo ""
echo "Registering native messaging manifest …"

# Google Chrome
[[ -d "$HOME/.config/google-chrome" ]]         && register "$HOME/.config/google-chrome/NativeMessagingHosts"
# Chromium
[[ -d "$HOME/.config/chromium" ]]              && register "$HOME/.config/chromium/NativeMessagingHosts"
# Brave
[[ -d "$HOME/.config/BraveSoftware/Brave-Browser" ]] && register "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
# Vivaldi
[[ -d "$HOME/.config/vivaldi" ]]               && register "$HOME/.config/vivaldi/NativeMessagingHosts"
# Microsoft Edge
[[ -d "$HOME/.config/microsoft-edge" ]]        && register "$HOME/.config/microsoft-edge/NativeMessagingHosts"
# Opera
[[ -d "$HOME/.config/opera" ]]                 && register "$HOME/.config/opera/NativeMessagingHosts"

echo ""
echo "✓ Installation complete!"
echo ""
echo "Now open the extension Options → Native Host tab and click 'Test native host'."
