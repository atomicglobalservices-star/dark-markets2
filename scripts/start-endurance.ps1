param()
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script=Join-Path $project 'scripts\supervise-endurance.ps1'
$existing=Get-CimInstance Win32_Process | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($script) -and $_.Name -match 'pwsh|powershell'}
if($existing){Write-Output 'Endurance supervisor is already running.';exit 0}
Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoProfile','-File',('"'+$script+'"')) -WorkingDirectory $project -WindowStyle Hidden | Out-Null
Write-Output 'Finite 24-hour monitor started. Read work/endurance/summary.json for progress. No pass is claimed before completion.'
