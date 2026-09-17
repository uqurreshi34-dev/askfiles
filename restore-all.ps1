& "$PSScriptRoot\restore-keystore.ps1"
& "$PSScriptRoot\restore-proguard.ps1"

# Restore JVM heap and metaspace in gradle.properties
$gradleProps = Join-Path $PSScriptRoot "android\gradle.properties"
if (Test-Path $gradleProps) {
    $content = Get-Content $gradleProps -Raw
    $content = $content -replace 'org\.gradle\.jvmargs=.*', 'org.gradle.jvmargs=-Xmx6144m -XX:MaxMetaspaceSize=2048m'
    Set-Content $gradleProps $content -NoNewline
    Write-Host "gradle.properties JVM args restored to 6144m heap / 2048m metaspace" -ForegroundColor Green
} else {
    Write-Host "ERROR: android/gradle.properties not found." -ForegroundColor Red
}

# Restore R8 full mode
if (Test-Path $gradleProps) {
    $content = Get-Content $gradleProps -Raw

    if ($content -notmatch 'android\.enableR8\.fullMode=true') {
        Add-Content $gradleProps "`nandroid.enableR8.fullMode=true"
        Write-Host "Added android.enableR8.fullMode=true" -ForegroundColor Green
    } else {
        Write-Host "android.enableR8.fullMode already present" -ForegroundColor Yellow
    }
} else {
    Write-Host "ERROR: android/gradle.properties not found for R8 flags." -ForegroundColor Red
}

# Restore SDK 36 override (Play API-level policy)
if (Test-Path $gradleProps) {
    $content = Get-Content $gradleProps -Raw

    if ($content -notmatch 'android\.targetSdkVersion=36') {
        Add-Content $gradleProps "`nandroid.compileSdkVersion=36`nandroid.targetSdkVersion=36"
        Write-Host "Added SDK 36 override (compileSdk + targetSdk)" -ForegroundColor Green
    } else {
        Write-Host "SDK 36 override already present" -ForegroundColor Yellow
    }
} else {
    Write-Host "ERROR: android/gradle.properties not found for SDK override." -ForegroundColor Red
}
