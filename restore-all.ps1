& "$PSScriptRoot\restore-keystore.ps1"
& "$PSScriptRoot\restore-proguard.ps1"

# Restore JVM heap size in gradle.properties
$gradleProps = Join-Path $PSScriptRoot "android\gradle.properties"
if (Test-Path $gradleProps) {
    $content = Get-Content $gradleProps -Raw
    $content = $content -replace 'org\.gradle\.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m', 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=512m'
    Set-Content $gradleProps $content -NoNewline
    Write-Host "gradle.properties JVM heap restored to 4096m" -ForegroundColor Green
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
