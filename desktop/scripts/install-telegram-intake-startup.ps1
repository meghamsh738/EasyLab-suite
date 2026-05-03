param(
  [string]$EasylabExe = "$env:LOCALAPPDATA\Programs\Easylab Suite\Easylab Suite.exe",
  [string]$TaskName = "Easylab Telegram Intake",
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
  -Argument "--labnote-telegram-intake" `
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
  -Description "Runs the Easylab Lab Notebook Telegram intake poller at Windows login." `
  -Force | Out-Null

Write-Host "Installed scheduled task: $TaskName"
Write-Host "Poller command: `"$EasylabExe`" --labnote-telegram-intake"
