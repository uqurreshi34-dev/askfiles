# Restores android/keystore.properties from the master copy after a prebuild wipes android/
$master = Join-Path $PSScriptRoot "keystore.properties.master"
$target = Join-Path $PSScriptRoot "android\keystore.properties"

if (-not (Test-Path $master)) {
    Write-Host "ERROR: keystore.properties.master not found at project root." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $PSScriptRoot "android"))) {
    Write-Host "ERROR: android/ folder doesn't exist. Run prebuild first." -ForegroundColor Red
    exit 1
}
Copy-Item $master $target -Force
Write-Host "keystore.properties restored to android/" -ForegroundColor Green
