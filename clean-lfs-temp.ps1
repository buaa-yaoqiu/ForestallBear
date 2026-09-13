# Delete only old numeric regular files in this repository's LFS scratch directory.
$ErrorActionPreference = 'Stop'
if (Get-Process -Name 'git-lfs' -ErrorAction SilentlyContinue) { throw 'Git LFS is active; refusing cleanup.' }
$scratch = Get-Item -LiteralPath 'D:\Coding\ForestallBear\.git\lfs\tmp'
if ($scratch.FullName -ne 'D:\Coding\ForestallBear\.git\lfs\tmp' -or ($scratch.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unexpected scratch directory.' }
$cutoff = (Get-Date).AddMinutes(-10)
$stale = @(Get-ChildItem -LiteralPath $scratch.FullName -File | Where-Object { $_.Name -match '^\d+$' -and $_.LastWriteTime -lt $cutoff -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) })
$total = ($stale | Measure-Object Length -Sum).Sum
foreach ($file in $stale) { Remove-Item -LiteralPath $file.FullName -Force }
Write-Output "Removed $($stale.Count) stale LFS scratch files ($total bytes)."
