param([string]$RunName='acceptance')
$ErrorActionPreference='Stop'
if($RunName -notmatch '^acceptance(-[a-z0-9]+)?$'){throw 'Invalid acceptance run name'}
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$entry=Join-Path $project 'scripts\reliability-monitor.ts'
$directory=Join-Path $project ('work\reliability\'+$RunName)
if(Test-Path -LiteralPath (Join-Path $directory 'summary.json')) {throw 'Acceptance evidence already exists. Choose a new explicitly named run; existing evidence is preserved.'}
$existing=Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($entry) -and $_.CommandLine.Contains(('work/reliability/'+$RunName+' '))}
if($existing){throw 'Acceptance monitor is already running.'}
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$process=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('--import','tsx',('--env-file="'+(Join-Path $project '.env')+'"'),('"'+$entry+'"'),('work/reliability/'+$RunName),'1440') -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $directory 'stdout.log') -RedirectStandardError (Join-Path $directory 'stderr.log') -PassThru
@{pid=$process.Id;startedAt=(Get-Date).ToUniversalTime().ToString('o');directory=$directory;durationHours=24}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $directory 'process.json')
@{directory=('work/reliability/'+$RunName);pid=$process.Id;startedAt=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $project 'work\reliability\active.json')
Write-Output 'Separate finite 24-hour acceptance monitor started. No completed pass is claimed. Original endurance evidence is unchanged.'
