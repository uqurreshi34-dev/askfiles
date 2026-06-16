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

# Fix signing config in app/build.gradle — prebuild resets release to debug
$buildGradle = Join-Path $PSScriptRoot "android\app\build.gradle"
$content = Get-Content $buildGradle -Raw

# Add release signing config block if not present
if (-not ($content -match "keystoreProperties\['keyAlias'\]")) {
    $content = $content -replace 'signingConfigs \{', "signingConfigs {`n        release {`n            def keystorePropertiesFile = rootProject.file('keystore.properties')`n            def keystoreProperties = new java.util.Properties()`n            keystoreProperties.load(new java.io.FileInputStream(keystorePropertiesFile))`n            keyAlias keystoreProperties['keyAlias']`n            keyPassword keystoreProperties['keyPassword']`n            storeFile file(keystoreProperties['storeFile'])`n            storePassword keystoreProperties['storePassword']`n        }"
    Write-Host "Release signing config added to build.gradle" -ForegroundColor Green
} else {
    Write-Host "Release signing config already present" -ForegroundColor Yellow
}

# Ensure release build type uses release signing config
$content = $content -replace 'signingConfig signingConfigs\.debug', 'signingConfig signingConfigs.release'
Set-Content $buildGradle $content
Write-Host "Signing config set to release in build.gradle" -ForegroundColor Green
