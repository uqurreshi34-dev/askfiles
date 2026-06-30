# Restores android/app/proguard-rules.pro from the master copy after a prebuild wipes android/
$master = Join-Path $PSScriptRoot "proguard-rules.pro.master"
$target = Join-Path $PSScriptRoot "android\app\proguard-rules.pro"

if (-not (Test-Path $master)) {
    Write-Host "ERROR: proguard-rules.pro.master not found at project root." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $PSScriptRoot "android"))) {
    Write-Host "ERROR: android/ folder doesn't exist. Run prebuild first." -ForegroundColor Red
    exit 1
}
Copy-Item $master $target -Force
Write-Host "proguard-rules.pro restored to android/app/" -ForegroundColor Green
