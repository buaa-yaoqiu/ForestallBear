# Keep this wrapper ASCII-only for Windows PowerShell 5.1 (UTF-8 without BOM).
# Examples: ./maintain-data.ps1 check; ./maintain-data.ps1 pets --publish
$ErrorActionPreference = 'Stop'
$scriptFile = Join-Path $PSScriptRoot 'maintain-data.py'
if (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCommand = 'py'
    $pythonArgs = @('-3')
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCommand = 'python'
    $pythonArgs = @()
} else {
    $bundledPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    if (-not (Test-Path -LiteralPath $bundledPython)) { throw 'Install Python 3.10+ and run this script again.' }
    $pythonCommand = $bundledPython
    $pythonArgs = @()
}
if ($MyInvocation.ExpectingInput) {
    $previousOutputEncoding = $OutputEncoding
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    try {
        $input | & $pythonCommand @pythonArgs $scriptFile @args
    } finally {
        $OutputEncoding = $previousOutputEncoding
    }
} else {
    & $pythonCommand @pythonArgs $scriptFile @args
}
exit $LASTEXITCODE
