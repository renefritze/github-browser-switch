#!/usr/bin/env python3
"""
Browser Switch – Native Messaging Host
=======================================
Receives messages from the Chrome extension and opens URLs in the
requested browser executable.

Protocol (Chrome native messaging):
  - 4-byte little-endian length prefix, then JSON payload (UTF-8).

Incoming message:
  { "url": "https://…", "browser": "firefox" }

  Special browser value "ping" is used for the connection test:
  { "url": "about:blank", "browser": "ping" }

Outgoing response:
  { "success": true }          – URL opened successfully
  { "success": false, "error": "…" }  – something went wrong
"""

import json
import platform
import struct
import subprocess
import sys

# ── Browser definitions ────────────────────────────────────────────────────────

SYSTEM = platform.system()  # "Linux", "Darwin", "Windows"

# Default executable names / paths per OS.
# The user can override these via the extension's "Browsers" settings page,
# which passes a "path" field in the message.
BROWSER_DEFAULTS: dict[str, dict[str, list[str]]] = {
    "firefox": {
        "Linux": ["firefox"],
        "Darwin": ["open", "-a", "Firefox"],
        "Windows": [r"C:\Program Files\Mozilla Firefox\firefox.exe"],
    },
    "chrome": {
        "Linux": ["google-chrome"],
        "Darwin": ["open", "-a", "Google Chrome"],
        "Windows": [r"C:\Program Files\Google\Chrome\Application\chrome.exe"],
    },
    "chromium": {
        "Linux": ["chromium-browser", "chromium"],
        "Darwin": ["open", "-a", "Chromium"],
        "Windows": [r"C:\Program Files\Chromium\Application\chrome.exe"],
    },
    "edge": {
        "Linux": ["microsoft-edge"],
        "Darwin": ["open", "-a", "Microsoft Edge"],
        "Windows": [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        ],
    },
    "safari": {
        "Darwin": ["open", "-a", "Safari"],
    },
    "brave": {
        "Linux": ["brave-browser", "brave"],
        "Darwin": ["open", "-a", "Brave Browser"],
        "Windows": [r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"],
    },
    "opera": {
        "Linux": ["opera"],
        "Darwin": ["open", "-a", "Opera"],
        "Windows": [r"C:\Users\Public\Desktop\Opera.lnk"],
    },
    "vivaldi": {
        "Linux": ["vivaldi-stable", "vivaldi"],
        "Darwin": ["open", "-a", "Vivaldi"],
        "Windows": [r"C:\Users\%USERNAME%\AppData\Local\Vivaldi\Application\vivaldi.exe"],
    },
}


def resolve_command(browser_id: str, custom_path: str | None) -> list[str]:
    """Return the shell command list to open a browser."""
    if custom_path:
        return [custom_path]
    candidates = BROWSER_DEFAULTS.get(browser_id, {}).get(SYSTEM, [])
    if not candidates:
        raise ValueError(
            f"Browser '{browser_id}' is not supported on {SYSTEM}. "
            "Set a custom path in the extension's Browsers settings."
        )
    return candidates


def launch_browser(cmd_candidates: list[str], url: str) -> None:
    """Try each candidate command until one works."""
    last_err: Exception | None = None
    for exe in cmd_candidates:
        try:
            # On macOS, "open -a Firefox <url>" has a different arg order.
            if exe == "open":
                # cmd_candidates is already the full list: ["open", "-a", "…"]
                subprocess.Popen(cmd_candidates + [url])
                return
            subprocess.Popen([exe, url])
            return
        except FileNotFoundError as e:
            last_err = e
    raise FileNotFoundError(
        f"None of the candidate executables were found: {cmd_candidates}. Last error: {last_err}"
    )


# ── Native messaging I/O ───────────────────────────────────────────────────────


def read_message() -> dict | None:
    raw_len = sys.stdin.buffer.read(4)
    if len(raw_len) < 4:
        return None
    length = struct.unpack("<I", raw_len)[0]
    payload = sys.stdin.buffer.read(length)
    return json.loads(payload.decode("utf-8"))


def send_message(msg: dict) -> None:
    payload = json.dumps(msg).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


# ── Main loop ──────────────────────────────────────────────────────────────────


def main() -> None:
    while True:
        msg = read_message()
        if msg is None:
            break  # extension closed the port

        browser_id = msg.get("browser", "")
        url = msg.get("url", "")
        custom_path = msg.get("path")  # optional override from the Browsers page

        # Connection test
        if browser_id == "ping":
            send_message({"success": True, "pong": True})
            continue

        try:
            cmd = resolve_command(browser_id, custom_path)
            # For macOS "open -a" we need to handle the args specially.
            if cmd[0] == "open" and "-a" in cmd:
                subprocess.Popen(cmd + [url])
            else:
                subprocess.Popen([cmd[0], url])
            send_message({"success": True})
        except Exception as exc:
            send_message({"success": False, "error": str(exc)})


if __name__ == "__main__":
    main()
