$dir = "android\app\build\outputs\mapping\release"
if (-not (Test-Path $dir)) {
    Write-Host "STOP: mapping\release missing - wrong folder or R8 did not run. NOT verified." -ForegroundColor Red
} elseif (Test-Path "$dir\missing_rules.txt") {
    Write-Host "missing_rules.txt EXISTS - add these to proguard-rules.pro before shipping:" -ForegroundColor Yellow
    Get-Content "$dir\missing_rules.txt"
} else {
    Write-Host "CLEAN - mapping dir present, no missing_rules. R8 resolved everything." -ForegroundColor Green
}
