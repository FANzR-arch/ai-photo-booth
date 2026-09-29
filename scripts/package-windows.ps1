param([string]$OutputName = ('SNAP-CLUB-Windows-' + (Get-Date -Format 'yyyyMMdd-HHmmss')))
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
if (!(Test-Path 'dist/web/index.html')) { throw 'Build the app first.' }
if ($OutputName -notmatch '^[A-Za-z0-9_-]+$') { throw 'Use a simple output name.' }
$releaseRoot = Join-Path $projectRoot 'releases'
$packageRoot = Join-Path $releaseRoot $OutputName
if (Test-Path -LiteralPath $packageRoot) { throw 'Output already exists; choose a new name.' }
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
$folders = @('apps','assets','config','packages','tests','scripts','node_modules','dist')
foreach ($folder in $folders) { Copy-Item -LiteralPath (Join-Path $projectRoot $folder) -Destination $packageRoot -Recurse }
New-Item -ItemType Directory -Path (Join-Path $packageRoot 'docs') | Out-Null
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'docs') | Where-Object Name -ne 'evidence' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $packageRoot 'docs') -Recurse }
foreach ($name in @('package.json','package-lock.json','tsconfig.json','vite.config.ts','README.md','.env.example','.gitignore','start-photo-booth.cmd','start-demo.cmd','启动拍照亭.cmd','演示说明.txt')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $packageRoot
}
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
# Distributable packages contain an empty configuration template, never local credentials.
Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination (Join-Path $packageRoot '.env')
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
