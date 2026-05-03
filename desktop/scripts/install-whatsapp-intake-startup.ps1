param(
  [string]$EasylabExe = "$env:LOCALAPPDATA\Programs\Easylab Suite\Easylab Suite.exe",
  [string]$TaskName = "Easylab WhatsApp Intake",
  [switch]$Disable
)

$ErrorActionPreference = "Stop"

if ($Disable) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task: $TaskName"
  } else {
    Write-Host "Scheduled task was not installed: $TaskName"
  }
  exit 0
}

if (-not (Test-Path -LiteralPath $EasylabExe)) {
  throw "Easylab executable not found: $EasylabExe"
}

$workingDirectory = Split-Path -Parent $EasylabExe
$action = New-ScheduledTaskAction `
  -Execute $EasylabExe `
  -Argument "--labnote-whatsapp-intake" `
  -WorkingDirectory $workingDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Runs the Easylab Lab Notebook WhatsApp intake receiver at Windows login." `
  -Force | Out-Null

$tailscale = Get-Service -Name Tailscale -ErrorAction SilentlyContinue
if ($tailscale) {
  Write-Host "Tailscale service: $($tailscale.Status), startup: $($tailscale.StartType)"
} else {
  Write-Warning "Tailscale service was not found. Install and sign into Tailscale before enabling Funnel."
}

Write-Host "Installed scheduled task: $TaskName"
Write-Host "Receiver command: `"$EasylabExe`" --labnote-whatsapp-intake"
