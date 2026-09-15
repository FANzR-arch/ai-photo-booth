param([string]$OutputName = ('SNAP-CLUB-Windows-' + (Get-Date -Format 'yyyyMMdd-HHmmss')))
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
if (!(Test-Path '.env') -or !(Test-Path 'dist/web/index.html')) { throw 'Build the app and configure .env first.' }
if ($OutputName -notmatch '^[A-Za-z0-9_-]+$') { throw 'Use a simple output name.' }
$releaseRoot = Join-Path $projectRoot 'releases'
$packageRoot = Join-Path $releaseRoot $OutputName
if (Test-Path -LiteralPath $packageRoot) { throw 'Output already exists; choose a new name.' }
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
$folders = @('apps','assets','config','packages','tests','scripts','node_modules','dist')
foreach ($folder in $folders) { Copy-Item -LiteralPath (Join-Path $projectRoot $folder) -Destination $packageRoot -Recurse }
New-Item -ItemType Directory -Path (Join-Path $packageRoot 'docs') | Out-Null
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'docs') | Where-Object Name -ne 'evidence' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $packageRoot 'docs') -Recurse }
Get-ChildItem -LiteralPath $projectRoot -File | Where-Object { $_.Name -ne '.env' -and $_.Name -notmatch '\.log$' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $packageRoot }
$runtimeRoot = Join-Path $packageRoot 'runtime'
New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
$nodePath = (Get-Command node).Source
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $runtimeRoot 'node.exe')
$nodeVersion = (& $nodePath -p process.version).Trim()
$licensePath = Join-Path $projectRoot "assets/licenses/NODE-$nodeVersion-LICENSE.txt"
if (!(Test-Path -LiteralPath $licensePath)) { throw "Add the official license for Node $nodeVersion before packaging." }
Copy-Item -LiteralPath $licensePath -Destination (Join-Path $runtimeRoot 'NODE-LICENSE.txt')
# Optional npm/npx are included for colleagues who also want to edit/build the full source.
$nodeRoot = Split-Path $nodePath -Parent
foreach ($name in @('npm.cmd','npx.cmd')) { if (Test-Path (Join-Path $nodeRoot $name)) { Copy-Item -LiteralPath (Join-Path $nodeRoot $name) -Destination $runtimeRoot } }
if (Test-Path (Join-Path $nodeRoot 'node_modules/npm')) {
    New-Item -ItemType Directory -Path (Join-Path $runtimeRoot 'node_modules') | Out-Null
    Copy-Item -LiteralPath (Join-Path $nodeRoot 'node_modules/npm') -Destination (Join-Path $runtimeRoot 'node_modules') -Recurse
}
# Only required demo configuration; no fixed LAN IP, visitor database, or photo history.
$env:BOOTH_PACKAGE_TARGET = $packageRoot
@'
const fs=require('node:fs');const path=require('node:path');const dotenv=require('dotenv');
const e=dotenv.parse(fs.readFileSync('.env'));if(!e.SEEDREAM_API_KEY||!e.SEEDREAM_MODEL)throw Error('Missing demo API configuration');
fs.writeFileSync(path.join(process.env.BOOTH_PACKAGE_TARGET,'.env'),`GENERATION_MODE=seedream\nPORT=4377\nIMAGE_COUNT=1\nSEEDREAM_API_KEY=${e.SEEDREAM_API_KEY}\nSEEDREAM_MODEL=${e.SEEDREAM_MODEL}\nPICKUP_BASE_URL=\n`);
'@ | & $nodePath
if ($LASTEXITCODE -ne 0) { throw 'Configuration packaging failed.' }
# CRLF batch files and BOM text are readable on Windows regardless of editor defaults.
Get-ChildItem -LiteralPath $packageRoot -Filter '*.cmd' | ForEach-Object {
    $content = [IO.File]::ReadAllText($_.FullName) -replace '\r?\n', "`r`n"
    [IO.File]::WriteAllText($_.FullName, $content, [Text.Encoding]::ASCII)
}
$notes = Join-Path $packageRoot '演示说明.txt'
[IO.File]::WriteAllText($notes,[IO.File]::ReadAllText($notes),[Text.UTF8Encoding]::new($true))
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = Join-Path $releaseRoot ($OutputName + '.zip')
[IO.Compression.ZipFile]::CreateFromDirectory($packageRoot,$zipPath,[IO.Compression.CompressionLevel]::Optimal,$true)
Copy-Item -LiteralPath $notes -Destination (Join-Path $releaseRoot ($OutputName + '-说明.txt'))
Get-Item -LiteralPath $zipPath | Select-Object FullName,Length
