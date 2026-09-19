@echo off
title Perfume Prompt Preparer
echo ========================================================
echo   Perfume Prompt Preparer
echo ========================================================
echo.

REM 1. Check for latest release on GitHub, download and extract if newer
echo [1/2] Checking for updates on GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$repo = 'alielmayyah/PerfumePrompt';" ^
  "$vFile = 'installed_version.txt';" ^
  "$cur = if (Test-Path $vFile) { (Get-Content $vFile).Trim() } else { '' };" ^
  "try {" ^
  "  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
  "  $rel = Invoke-RestMethod -Uri \"https://api.github.com/repos/$repo/releases/latest\" -Headers @{ 'User-Agent' = 'PerfumePrompt-Updater' };" ^
  "  $tag = $rel.tag_name;" ^
  "  $asset = $rel.assets | Where-Object { $_.name -eq 'PerfumePrompt-Portable.zip' } | Select-Object -First 1;" ^
  "  if ($asset -and ($cur -ne $tag -or -not (Test-Path 'server.js'))) {" ^
  "    Write-Host \"   Found new version ($tag)! Current: $($cur -replace '^$', 'none')\" -ForegroundColor Yellow;" ^
  "    Write-Host \"   Downloading update package...\" -ForegroundColor Cyan;" ^
  "    $zip = Join-Path $env:TEMP ('PerfumePrompt-update-' + [Guid]::NewGuid().ToString('N') + '.zip');" ^
  "    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -Headers @{ 'User-Agent' = 'PerfumePrompt-Updater' };" ^
  "    Write-Host \"   Extracting update...\" -ForegroundColor Cyan;" ^
  "    $tempDir = Join-Path $env:TEMP ('PerfumeExtract-' + [Guid]::NewGuid().ToString('N'));" ^
  "    Expand-Archive -Path $zip -DestinationPath $tempDir -Force;" ^
  "    $src = if (Test-Path (Join-Path $tempDir 'PerfumePrompt-Portable')) { Join-Path $tempDir 'PerfumePrompt-Portable' } else { $tempDir };" ^
  "    Get-ChildItem -Path $src | ForEach-Object {" ^
  "      if ($_.Name -ne '.data' -and $_.Name -ne 'installed_version.txt') {" ^
  "        Copy-Item -Path $_.FullName -Destination . -Recurse -Force" ^
  "      }" ^
  "    };" ^
  "    Remove-Item $zip -Force -ErrorAction SilentlyContinue;" ^
  "    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
  "    Set-Content -Path $vFile -Value $tag;" ^
  "    Write-Host \"   ✓ Successfully updated to $tag!\" -ForegroundColor Green;" ^
  "  } else {" ^
  "    Write-Host \"   ✓ Up to date ($tag)\" -ForegroundColor Green;" ^
  "  }" ^
  "} catch {" ^
  "  Write-Host \"   ⚠️ Offline or remote unreachable. Continuing with local version...\" -ForegroundColor DarkGray;" ^
  "}"

echo.
echo [2/2] Starting server on http://localhost:3000...
start http://localhost:3000

REM Prefer bundled standalone node.exe, otherwise fall back to system node
if exist "bin\node.exe" (
    bin\node.exe server.js
) else (
    where node >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        if exist "server.js" (
            node server.js
        ) else (
            npm run dev
        )
    ) else (
        echo [Error] Node.js not found. Please connect to the internet once to auto-download the package.
        pause
    )
)
