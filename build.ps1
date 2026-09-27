<#
.SYNOPSIS
    Builds Task Manager+ and produces a portable executable, a zip archive and an MSI installer in ./artifacts.

.PARAMETER Configuration
    Build configuration, Release by default.

.PARAMETER SkipTests
    Skips the unit test run.
#>
[CmdletBinding()]
param(
    [ValidateSet('Release', 'Debug')]
    [string] $Configuration = 'Release',
    [switch] $SkipTests
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$artifacts = Join-Path $root 'artifacts'
$output = Join-Path $artifacts 'TaskManagerPlus'

function Invoke-Step([string] $Name, [scriptblock] $Action) {
    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE."
    }
}

# The PawnIO sensor driver installer (GPL-2.0, https://github.com/namazso/PawnIO) is bundled unmodified
# so users get CPU temperatures without a separate download. The hash pins the exact official release.
$pawnIo = @{
    Url    = 'https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe'
    Sha256 = '1F519A22E47187F70A1379A48CA604981C4FCF694F4E65B734AAA74A9FBA3032'
    Path   = Join-Path $artifacts 'third-party/PawnIO_setup.exe'
}
Write-Host '==> Fetch PawnIO installer' -ForegroundColor Cyan
if (-not (Test-Path $pawnIo.Path) -or (Get-FileHash $pawnIo.Path -Algorithm SHA256).Hash -ne $pawnIo.Sha256) {
    New-Item -ItemType Directory -Force (Split-Path $pawnIo.Path) | Out-Null
    Invoke-WebRequest -Uri $pawnIo.Url -OutFile $pawnIo.Path -UseBasicParsing
    if ((Get-FileHash $pawnIo.Path -Algorithm SHA256).Hash -ne $pawnIo.Sha256) {
        throw 'The downloaded PawnIO installer does not match the expected SHA-256 hash.'
    }
}

Push-Location (Join-Path $root 'ui')
try {
    Invoke-Step 'Install UI dependencies' { npm ci --no-audit --no-fund }
    Invoke-Step 'Build UI' { npm run build }
}
finally {
    Pop-Location
}

if (-not $SkipTests) {
    Invoke-Step 'Run unit tests' { dotnet test (Join-Path $root 'tests/TaskManagerPlus.Core.Tests') -c $Configuration }
}

if (Test-Path $output) {
    Remove-Item $output -Recurse -Force
}

Invoke-Step 'Publish app' {
    dotnet publish (Join-Path $root 'src/TaskManagerPlus/TaskManagerPlus.csproj') `
        -c $Configuration `
        -o $output `
        --artifacts-path (Join-Path $artifacts 'obj') `
        --self-contained true `
        -p:PublishSingleFile=true `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:DebugType=none
}

$version = (Select-Xml -Path (Join-Path $root 'Directory.Build.props') -XPath '//Version').Node.InnerText
$name = "TaskManagerPlus-$version-win-x64"
$exe = Join-Path $artifacts "$name.exe"
$zip = Join-Path $artifacts "$name.zip"

# Two download options: the portable executable on its own, and a zip with the license for
# browsers and networks that block executable downloads.
Copy-Item (Join-Path $output 'TaskManagerPlus.exe') $exe -Force
Copy-Item (Join-Path $root 'LICENSE') (Join-Path $output 'LICENSE.txt') -Force
Copy-Item (Join-Path $root 'THIRD-PARTY-NOTICES.txt') (Join-Path $output 'THIRD-PARTY-NOTICES.txt') -Force
if (Test-Path $zip) {
    Remove-Item $zip -Force
}

Compress-Archive -Path (Join-Path $output '*') -DestinationPath $zip

# Third option: a Windows Installer package with Start menu and desktop shortcuts and a normal uninstall entry.
$msiOutput = Join-Path $artifacts 'msi'
Invoke-Step 'Build installer' {
    dotnet build (Join-Path $root 'installer/TaskManagerPlus.Installer.wixproj') `
        -c $Configuration `
        -o $msiOutput `
        -p:PublishDir="$output\"
}
$msi = Join-Path $artifacts "$name.msi"
Copy-Item (Join-Path $msiOutput "$name.msi") $msi -Force

Write-Host "Done: $exe" -ForegroundColor Green
Write-Host "Done: $zip" -ForegroundColor Green
Write-Host "Done: $msi" -ForegroundColor Green
