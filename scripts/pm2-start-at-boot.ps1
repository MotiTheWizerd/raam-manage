# Make pm2-resurrect run at Windows STARTUP (no login needed) instead of at
# logon, so a power cut / crash / manual reboot brings raam-manage, raam-face
# and raam-vision back with nobody at the login screen.
#
# Run once, in an ADMIN PowerShell:
#   powershell -ExecutionPolicy Bypass -File C:\Users\User\programs\raam-manage\scripts\pm2-start-at-boot.ps1
# It asks for the Windows password of DESKTOP-LOP9JP6\User (Windows stores it
# encrypted; the task needs it to run while nobody is logged in).

$ErrorActionPreference = "Stop"
$user = "DESKTOP-LOP9JP6\User"

$cred = Get-Credential -UserName $user -Message "Windows password for $user (pm2 boot task)"
$pass = $cred.GetNetworkCredential().Password

$action = New-ScheduledTaskAction `
  -Execute "C:\Program Files\nodejs\node.exe" `
  -Argument '"C:\Users\User\AppData\Roaming\npm\node_modules\pm2\bin\pm2" resurrect'
# ONE trigger only (startup). A second logon trigger would resurrect again on
# top of the running daemon and could start duplicate port-binders.
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = "PT60S"   # let the network + Tailscale come up first
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName "pm2-resurrect" -Force `
  -Description "Restore raam-manage pm2 apps at Windows startup (no logon needed)" `
  -Action $action -Trigger $trigger -Settings $settings `
  -User $user -Password $pass -RunLevel Limited | Out-Null

$t = Get-ScheduledTask pm2-resurrect
Write-Host "OK - pm2-resurrect now runs at startup as $($t.Principal.UserId) (logon type: $($t.Principal.LogonType))"
