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
