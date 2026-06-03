## setup-sdk.ps1 — Auto-detects Android SDK and writes local.properties
## Run: powershell -ExecutionPolicy Bypass -File scripts\setup-sdk.ps1

$candidates = @(
    "$env:LOCALAPPDATA\Android\Sdk",
    "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk",
    "C:\Android\Sdk"
)

$sdkPath = $null
foreach ($c in $candidates) {
    if (Test-Path "$c\platform-tools\adb.exe") {
        $sdkPath = $c
        break
    }
}

if (-not $sdkPath) {
    Write-Host "❌ Android SDK not found. Please install Android Studio first." -ForegroundColor Red
    Write-Host "   Download: https://developer.android.com/studio" -ForegroundColor Yellow
    exit 1
}

$escaped = $sdkPath -replace '\\', '\\\\'
$content = "sdk.dir=$escaped"
Set-Content -Path "$PSScriptRoot\..\android\local.properties" -Value $content -Encoding UTF8

Write-Host "✅ SDK found at: $sdkPath" -ForegroundColor Green
Write-Host "✅ Written to android/local.properties" -ForegroundColor Green
Write-Host ""
Write-Host "Now run: cd android && .\gradlew assembleDebug" -ForegroundColor Cyan
