param([switch]$Restart)
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$entry=Join-Path $project 'scripts\market-engine.ts'
$logs=Join-Path $project 'work\logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$existing=Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($entry) }
if($Restart){foreach($process in $existing){Stop-Process -Id $process.ProcessId};$existing=$null}
if(-not $existing){
  Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('--import','tsx',('--env-file="'+(Join-Path $project '.env')+'"'),('"'+$entry+'"')) -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'market-engine.stdout.log') -RedirectStandardError (Join-Path $logs 'market-engine.stderr.log') | Out-Null
}
Write-Output 'Shared market engine uses loopback port 3110 by default. Website remains on port 3100.'
