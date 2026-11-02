$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $project
$folder=Join-Path $project 'work\endurance'
New-Item -ItemType Directory -Force $folder | Out-Null
$node=(Get-Command node.exe).Source
for($attempt=0;$attempt -lt 4;$attempt++){
  $state=Join-Path $folder 'state.json'
  if(Test-Path -LiteralPath $state){$data=Get-Content -LiteralPath $state -Raw|ConvertFrom-Json;if($data.finishedAt){break}}
  $process=Start-Process -FilePath $node -ArgumentList @('--import','tsx','--env-file=.env','scripts/endurance.ts') -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $folder "runner-$attempt.stdout.log") -RedirectStandardError (Join-Path $folder "runner-$attempt.stderr.log") -PassThru
  $process.WaitForExit()
  if($process.ExitCode -eq 0){break}
}
