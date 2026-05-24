# Browser Switch

A Chromium extension that **conditionally routes links to a different browser executable** (or keeps them in the current window) based on configurable URL patterns.

---

## Why?

Some teams use multiple browsers for different contexts — e.g. internal tools must open in Chrome, while external sites open in Firefox. Browser Switch automates this: click any link, and the right browser opens automatically.

## How it works

```
User clicks link
      │
      ▼
Content script checks URL against cached rules
      │
      ├─ Action = "external"  ──► send URL to native messaging host
      │                              native host launches the other browser
      │
      └─ Action = "current"   ──► browser navigates normally
```

A background service worker listens for `webNavigation` events as a fallback for programmatic navigation (redirects, address-bar entries, etc.).

Opening a URL in a *different* executable requires a small helper program called the **native messaging host** — a Python script that runs on your machine and receives commands from the extension via stdin/stdout.

---

## Features

- **Glob URL patterns** — `*`, `**`, `?` wildcards (`https://*.company.com/**`)
- **Multiple target browsers** — Firefox, Chrome, Chromium, Edge, Brave, Vivaldi, Safari, custom path
- **Priority-ordered rules** — drag to reorder; first match wins
- **Enable / disable rules** individually
- **Popup** shows which rule matches the current page
- **Options page** for full rule management and browser path configuration
- **Native host test** button to verify the installation
- Cross-platform native host (Linux, macOS, Windows)

---

## Installation

### 1 — Load the extension

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.
3. Note your **extension ID** (a 32-char string like `abcdefghijklmnopabcdefghijklmnop`).

### 2 — Install the native messaging host

The native host is required to open links in *other* browsers.  
It is a single Python 3 script (`native-host/browser_switch_host.py`).

**Linux**
```bash
cd native-host
bash install.sh --extension-id YOUR_EXTENSION_ID
```

**macOS**
```bash
cd native-host
bash install-macos.sh --extension-id YOUR_EXTENSION_ID
```

**Windows (PowerShell)**
```powershell
cd native-host
.\install-windows.ps1 -ExtensionId YOUR_EXTENSION_ID
```

The installer:
- Copies `browser_switch_host.py` to a local directory
- Writes the native messaging manifest (`com.browserswitch.host.json`)
- Registers the manifest with Chrome, Chromium, Brave, Edge, Vivaldi (whichever are installed)

### 3 — Test the connection

Open the extension's **Options → Native Host** tab and click **Test native host**.

---

## Configuration

### Rules

Open the extension options (click the toolbar icon → **Manage rules**, or right-click → *Options*).

Each rule has:

| Field | Description |
|---|---|
| **Name** | Human-readable label |
| **URL pattern** | Glob pattern matched against the full URL |
| **Action** | `Open in external browser` or `Keep in current browser` |
| **Target browser** | Which browser to launch (when action = external) |
| **Enabled** | Toggle the rule on/off |

Rules are checked top-to-bottom; the first match wins. Drag to reorder.

**Pattern examples**

| Pattern | Matches |
|---|---|
| `https://*.company.com/**` | All pages under any subdomain of company.com (HTTPS) |
| `https://mail.google.com/*` | Gmail (any path, but not other Google domains) |
| `http://localhost/**` | Any local dev server |
| `**://internal.*/**` | Any scheme, any internal.* subdomain |

### Browser paths

Go to **Options → Browsers** to set custom executable paths for any browser.  
Leave blank to use the system default (the name on `$PATH`).

---

## Native messaging host details

| Item | Value |
|---|---|
| Host name | `com.browserswitch.host` |
| Protocol | Chrome native messaging (4-byte length-prefix + JSON) |
| Runtime | Python 3 (no extra dependencies) |

**Message from extension → host**
```json
{ "url": "https://example.com", "browser": "firefox" }
```

**Response from host → extension**
```json
{ "success": true }
```
or
```json
{ "success": false, "error": "firefox: command not found" }
```

---

## Project structure

```
extension/
  manifest.json         MV3 extension manifest
  background.js         Service worker: rule matching, native messaging, fallback navigation
  content.js            Click interceptor with cached rule evaluation
  popup/                Toolbar popup (shows matching rule for current tab)
  options/              Full options UI (rules + browsers + native host test)
  icons/                PNG icons (16, 48, 128 px)

native-host/
  browser_switch_host.py        Python native messaging host
  com.browserswitch.host.json   Manifest template
  install.sh                    Linux installer
  install-macos.sh              macOS installer
  install-windows.ps1           Windows installer
```

---

## Development

No build step required — the extension is plain HTML/CSS/JS.

```bash
# Lint / format (optional, requires Node)
npx eslint extension/

# Reload after editing
# chrome://extensions → click the ↺ icon next to Browser Switch
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Cannot connect to native host" | Run the installer and restart Chrome |
| Link opens in the same browser | Check that a rule matches (popup shows "No rule matches") |
| Rule not triggering | Make sure the rule is **Enabled** and the pattern includes the scheme (`https://…`) |
| Python not found (Windows) | Install Python 3 from python.org and add it to PATH |

---

## License

GNU General Public License v2 — see [LICENSE](LICENSE).
