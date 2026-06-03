# install-sdk-components.ps1 — clean rewrite
$SDK = "C:\Users\HP\AppData\Local\Android\Sdk"
$MGR = "$SDK\cmdline-tools\latest\bin\sdkmanager.bat"

# ── Write license files ───────────────────────────────────────────────────────
# CRITICAL: Must use UTF-8 WITHOUT BOM — sdkmanager rejects BOM-prefixed files
# CRITICAL: Must use LF line endings — `n in PowerShell = LF
$enc = New-Object System.Text.UTF8Encoding($false)  # $false = no BOM
$licDir = "$SDK\licenses"
New-Item -ItemType Directory -Force -Path $licDir | Out-Null

function Write-Lic([string]$file, [string[]]$hashes) {
    # Format: LF + hash1 + LF + hash2 (leading newline is required by sdkmanager)
    $content = "`n" + ($hashes -join "`n")
    [System.IO.File]::WriteAllText("$licDir\$file", $content, $enc)
}

Write-Host "Writing license files (no BOM, LF endings)..."
Write-Lic "android-sdk-license" @(
    "8933bad161af4178b1185d1a37fbf41ea5269c55",
    "d56f5187479451eabf01fb78af6dfcb131a6481e"   # added in newer sdkmanager
)
Write-Lic "android-sdk-preview-license" @(
    "84831b9409646a918e30573bab4c9c91346d8abd",
    "504667f4c0de7af1a06de9f4b1727b84351f2910"
)
Write-Lic "android-googletv-license"      @("601085b94cd77f0b54ff86406957099ebe79c4d6")
Write-Lic "android-sdk-arm-dbt-license"   @("859f317696f67ef3d7f30a50a5560e7834b43903")
Write-Lic "google-gdk-license"            @("33b6a2b64607f11b759f320ef9dff4ae5c47d97a")
Write-Lic "intel-android-extra-license"   @("d975f751698a77b662f1254ddbeed3901e976f5a")
Write-Lic "mips-android-sysimage-license" @("e9acab5b5fbb560a72cfaecce8946896ff6aab9d")
Write-Host "  Done. License files: $(Get-ChildItem $licDir | Measure-Object | Select-Object -Expand Count)"

# ── Install components using & operator (no cmd wrapper, no quoting issues) ───
$components = @(
    "platform-tools",
    "build-tools;34.0.0",
    "platforms;android-34",
    "ndk;25.1.8937393"
)

foreach ($comp in $components) {
    Write-Host "`nInstalling $comp ..."
    # Use & to call .bat directly — PowerShell handles quoting correctly
    & $MGR "--sdk_root=$SDK" $comp
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] $comp installed"
    } else {
        Write-Host "  [FAILED] $comp — exit code $LASTEXITCODE"
    }
}

# ── Verify ────────────────────────────────────────────────────────────────────
Write-Host "`n===== VERIFICATION ====="
$results = @{
    "platform-tools" = "$SDK\platform-tools\adb.exe"
    "build-tools 34" = "$SDK\build-tools\34.0.0"
    "android-34"     = "$SDK\platforms\android-34"
    "NDK 25"         = "$SDK\ndk\25.1.8937393"
}
$allOK = $true
foreach ($k in $results.Keys) {
    if (Test-Path $results[$k]) {
        Write-Host "  [OK]      $k"
    } else {
        Write-Host "  [MISSING] $k"
        $allOK = $false
    }
}
Write-Host "========================="
if ($allOK) {
    Write-Host "`nSUCCESS. Open a NEW PowerShell and run:"
    Write-Host "  cd `"E:\NHAI Hackathon\android`""
    Write-Host "  .\gradlew assembleDebug"
} else {
    Write-Host "`nSome components failed. See output above."
}
