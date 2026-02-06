param(
  [string]$PythonVersion = "3.11.8",
  [ValidateSet("amd64", "arm64")]
  [string]$Architecture = "amd64",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$DesktopDir = Split-Path -Parent $PSScriptRoot
$SuiteRoot = Split-Path -Parent $DesktopDir
$RuntimeDir = Join-Path $DesktopDir "runtime"
$RuntimePythonDir = Join-Path $RuntimeDir "python"
$RequirementsFile = Join-Path $RuntimeDir "requirements-suite.txt"

Write-Host "Easylab Suite: preparing bundled Python runtime..." -ForegroundColor Cyan
Write-Host "Suite root: $SuiteRoot"
Write-Host "Runtime dir: $RuntimePythonDir"

if (!(Test-Path $RequirementsFile)) {
  throw "Missing requirements file: $RequirementsFile"
}

if ((Test-Path $RuntimePythonDir) -and !$Force) {
  $existing = Get-ChildItem -Path $RuntimePythonDir -Force -ErrorAction SilentlyContinue
  if ($existing.Count -gt 0) {
    throw "Runtime folder already contains files. Re-run with -Force to rebuild: $RuntimePythonDir"
  }
}

if ($Force -and (Test-Path $RuntimePythonDir)) {
  Write-Host "Clearing existing runtime folder (Force)..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force $RuntimePythonDir
}

New-Item -ItemType Directory -Force -Path $RuntimePythonDir | Out-Null

$pyParts = $PythonVersion.Split(".")
if ($pyParts.Length -lt 2) {
  throw "Invalid PythonVersion '$PythonVersion'. Expected format like 3.11.8"
}
$pyMajorMinor = "$($pyParts[0])$($pyParts[1])"

$embedZipName = "python-$PythonVersion-embed-$Architecture.zip"
$embedUrl = "https://www.python.org/ftp/python/$PythonVersion/$embedZipName"
$embedZipPath = Join-Path $RuntimeDir $embedZipName

Write-Host "Downloading Python embeddable distribution:" -ForegroundColor Cyan
Write-Host "  $embedUrl"
Invoke-WebRequest -Uri $embedUrl -OutFile $embedZipPath

Write-Host "Extracting..." -ForegroundColor Cyan
Expand-Archive -Path $embedZipPath -DestinationPath $RuntimePythonDir -Force
Remove-Item -Force $embedZipPath

$pthFile = Join-Path $RuntimePythonDir "python$pyMajorMinor._pth"
if (!(Test-Path $pthFile)) {
  throw "Expected ._pth file not found: $pthFile"
}

Write-Host "Configuring python path (.pth)..." -ForegroundColor Cyan
$lines = Get-Content $pthFile -Encoding Ascii
$updated = @()
$sawSite = $false
$sawSitePackages = $false

foreach ($line in $lines) {
  if ($line -match "^\s*#\s*import\s+site\s*$") {
    $updated += "import site"
    $sawSite = $true
    continue
  }
  if ($line -match "^\s*import\s+site\s*$") {
    $updated += $line
    $sawSite = $true
    continue
  }
  if ($line -eq "Lib\site-packages") {
    $sawSitePackages = $true
  }
  $updated += $line
}

if (!$sawSite) {
  $updated += "import site"
}
if (!$sawSitePackages) {
  $updated += "Lib\site-packages"
}

Set-Content -Path $pthFile -Value $updated -Encoding Ascii

$getPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$getPipPath = Join-Path $RuntimeDir "get-pip.py"

Write-Host "Bootstrapping pip..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $getPipUrl -OutFile $getPipPath

$pythonExe = Join-Path $RuntimePythonDir "python.exe"
if (!(Test-Path $pythonExe)) {
  throw "python.exe not found at $pythonExe"
}

& $pythonExe $getPipPath | Out-Host
Remove-Item -Force $getPipPath

Write-Host "Installing suite dependencies into Lib\\site-packages..." -ForegroundColor Cyan
$sitePackages = Join-Path $RuntimePythonDir "Lib\\site-packages"
New-Item -ItemType Directory -Force -Path $sitePackages | Out-Null

& $pythonExe -m pip install --no-warn-script-location -r $RequirementsFile --target $sitePackages | Out-Host

Write-Host "Smoke import check..." -ForegroundColor Cyan
& $pythonExe -c "import fastapi, uvicorn, streamlit, pandas, numpy, openpyxl, matplotlib; print('OK: python runtime ready')" | Out-Host

Write-Host "Done." -ForegroundColor Green

