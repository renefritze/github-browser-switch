# Browser Switch – Native Host Installer (Windows)
# ==================================================
# Run in PowerShell (as administrator is NOT required for per-user install).
# Usage:
#   .\install-windows.ps1 [-ExtensionId YOUR_EXT_ID]

param(
    [string]$ExtensionId = ""
)

$HostName   = "com.browserswitch.host"
$InstallDir = "$env:LOCALAPPDATA\BrowserSwitch"
$HostScript = "$InstallDir\browser_switch_host.py"
$Manifest   = "$InstallDir\$HostName.json"

if (-not $ExtensionId) {
    Write-Host "Browser Switch – Native Host Installer (Windows)"
    Write-Host "=================================================="
    Write-Host ""
    Write-Host "Find your extension ID in chrome://extensions (enable Developer mode)."
    $ExtensionId = Read-Host "Extension ID"
}

if (-not $ExtensionId) {
    Write-Error "Extension ID is required."
    exit 1
}

# ── Install files ──────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Force "$PSScriptRoot\browser_switch_host.py" $HostScript

# ── Write manifest ─────────────────────────────────────────────────────────────
$ManifestContent = @"
{
  "name": "$HostName",
  "description": "Browser Switch native messaging host",
  "path": "$($HostScript -replace '\\', '\\')",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$ExtensionId/"
  ]
}
"@
Set-Content -Path $Manifest -Value $ManifestContent -Encoding UTF8
Write-Host "Manifest written to $Manifest"

# ── Register in Windows Registry ───────────────────────────────────────────────
# Chrome / Chromium look in HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\
# (and the equivalent for other browsers).

function Register-NativeHost {
    param([string]$RegPath)
    try {
        New-Item -Path $RegPath -Force | Out-Null
        Set-ItemProperty -Path $RegPath -Name "(default)" -Value $Manifest
        Write-Host "  Registered: $RegPath"
    } catch {
        Write-Warning "  Could not register $RegPath : $_"
    }
}

$Base = "HKCU:\SOFTWARE"

Register-NativeHost "$Base\Google\Chrome\NativeMessagingHosts\$HostName"
Register-NativeHost "$Base\Chromium\NativeMessagingHosts\$HostName"
Register-NativeHost "$Base\Microsoft\Edge\NativeMessagingHosts\$HostName"
Register-NativeHost "$Base\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName"

Write-Host ""
Write-Host "✓ Installation complete!"
Write-Host ""
Write-Host "Make sure Python 3 is on your PATH, then test via the extension's Options → Native Host."
