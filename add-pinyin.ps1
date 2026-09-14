# ASCII-only wrapper for Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$scriptFile = Join-Path $PSScriptRoot 'add-pinyin.py'
if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 -B $scriptFile @args
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python -B $scriptFile @args
} else {
    $bundledPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    if (-not (Test-Path -LiteralPath $bundledPython)) { throw 'Install Python 3.10+ and run this script again.' }
    & $bundledPython -B $scriptFile @args
}
exit $LASTEXITCODE
