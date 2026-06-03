# install-android-sdk.ps1
# Run: powershell -ExecutionPolicy Bypass -File "E:\NHAI Hackathon\scripts\install-android-sdk.ps1"

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

$SDK_ROOT  = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
$TOOLS_URL = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
$TOOLS_ZIP = "$env:TEMP\cmdline-tools.zip"
$TOOLS_DIR = "$SDK_ROOT\cmdline-tools\latest"

$COMPONENTS = @(
    "platform-tools",
    "build-tools;34.0.0",
    "platforms;android-34",
    "ndk;25.1.8937393"
)

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function OK($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function ERR($msg)  { Write-Host "    [FAIL] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "================================================" -ForegroundColor Yellow
Write-Host "  Android SDK Auto-Installer" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Yellow

# 1. Create SDK directory
Step "Creating SDK directory at $SDK_ROOT"
New-Item -ItemType Directory -Force -Path $TOOLS_DIR | Out-Null
OK "Directory created"

# 2. Download command-line tools
Step "Downloading Android Command-Line Tools (~150 MB)"
Write-Host "    URL: $TOOLS_URL" -ForegroundColor DarkGray
if (Test-Path $TOOLS_ZIP) { Remove-Item $TOOLS_ZIP -Force }
Invoke-WebRequest -Uri $TOOLS_URL -OutFile $TOOLS_ZIP -UseBasicParsing
OK "Downloaded to $TOOLS_ZIP"

# 3. Extract zip
Step "Extracting"
$extractTemp = "$env:TEMP\cmdline-extract"
if (Test-Path $extractTemp) { Remove-Item $extractTemp -Recurse -Force }
Expand-Archive -Path $TOOLS_ZIP -DestinationPath $extractTemp -Force

$innerDir = Join-Path $extractTemp "cmdline-tools"
if (Test-Path $innerDir) {
    Get-ChildItem $innerDir | ForEach-Object { Move-Item $_.FullName $TOOLS_DIR -Force }
} else {
    Get-ChildItem $extractTemp | ForEach-Object { Move-Item $_.FullName $TOOLS_DIR -Force }
}
Remove-Item $extractTemp -Recurse -Force
Remove-Item $TOOLS_ZIP -Force
OK "Extracted to $TOOLS_DIR"

# 4. Set environment variables
Step "Setting ANDROID_HOME environment variable"
$env:ANDROID_HOME     = $SDK_ROOT
$env:ANDROID_SDK_ROOT = $SDK_ROOT
$env:Path             = "$SDK_ROOT\cmdline-tools\latest\bin;$SDK_ROOT\platform-tools;$env:Path"

[System.Environment]::SetEnvironmentVariable("ANDROID_HOME",     $SDK_ROOT, "User")
[System.Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $SDK_ROOT, "User")

$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*cmdline-tools*") {
    $toAdd = "$SDK_ROOT\cmdline-tools\latest\bin;$SDK_ROOT\platform-tools"
    [System.Environment]::SetEnvironmentVariable("Path", "$toAdd;$userPath", "User")
}
OK "ANDROID_HOME = $SDK_ROOT"
OK "PATH updated permanently"

# 5. Accept licenses
Step "Accepting SDK licenses (non-interactive)"
$sdkmanager = "$TOOLS_DIR\bin\sdkmanager.bat"
$yesInput = ("y`n" * 10)
try {
    $yesInput | & $sdkmanager --sdk_root=$SDK_ROOT --licenses 2>&1 | Out-Null
    OK "Licenses accepted"
} catch {
    Write-Host "    [WARN] License step had an error - continuing anyway" -ForegroundColor Yellow
}

# 6. Install SDK components
Step "Installing SDK components (downloads ~1-2 GB, takes 5-15 min on slow connections)"
foreach ($comp in $COMPONENTS) {
    Write-Host "    Installing $comp ..." -NoNewline -ForegroundColor White
    $out = & $sdkmanager --sdk_root=$SDK_ROOT $comp 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "    $out" -ForegroundColor DarkRed
    }
}

# 7. Write local.properties
Step "Writing android/local.properties"
$localProps  = "E:\NHAI Hackathon\android\local.properties"
$escapedPath = $SDK_ROOT -replace "\\", "\\\\"
$escapedPath = $escapedPath -replace ":", "\\:"
"sdk.dir=$escapedPath" | Set-Content -Path $localProps -Encoding UTF8
OK "Written: $localProps"
Write-Host "    Content: sdk.dir=$escapedPath" -ForegroundColor DarkGray

# 8. Verify
Step "Verification"
$checks = [ordered]@{
    "SDK root"           = $SDK_ROOT
    "platform-tools dir" = "$SDK_ROOT\platform-tools"
    "build-tools 34"     = "$SDK_ROOT\build-tools\34.0.0"
    "android-34 platform"= "$SDK_ROOT\platforms\android-34"
    "NDK 25.1.8937393"   = "$SDK_ROOT\ndk\25.1.8937393"
    "adb.exe"            = "$SDK_ROOT\platform-tools\adb.exe"
    "local.properties"   = $localProps
}
$allGood = $true
foreach ($label in $checks.Keys) {
    if (Test-Path $checks[$label]) {
        OK $label
    } else {
        ERR "$label -- NOT FOUND at $($checks[$label])"
        $allGood = $false
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Yellow
if ($allGood) {
    Write-Host "  SUCCESS - Android SDK is ready!" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Open a NEW PowerShell window, then run:" -ForegroundColor White
    Write-Host "    cd `"E:\NHAI Hackathon\android`"" -ForegroundColor Yellow
    Write-Host "    .\gradlew assembleDebug" -ForegroundColor Yellow
} else {
    Write-Host "  PARTIAL - Some components missing." -ForegroundColor Red
    Write-Host "  Re-run this script or install missing pieces via Android Studio SDK Manager." -ForegroundColor Red
    Write-Host "================================================" -ForegroundColor Yellow
}
