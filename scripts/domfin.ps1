# Domfin's launcher for Windows, run by domfin.cmd (macOS and Linux: ./domfin):
#
#   domfin.cmd setup            installs what Domfin needs and skips what's there
#   domfin.cmd start [--demo]   runs domfin-api and the app together
#
# Go and Node.js, when missing or too old, are downloaded into .tools\ in
# Domfin's folder and never installed on the system. It runs on Windows
# PowerShell 5.1, the one every Windows 10 and 11 has, and it's saved with a
# BOM so that PowerShell reads the accents in what it prints (in Spanish,
# like everything Domfin's users read).

$ErrorActionPreference = 'Stop'
# Invoke-WebRequest is many times slower while it draws its progress bar.
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $PSScriptRoot
$Tools = Join-Path $Root '.tools'
$ApiBin = Join-Path $Tools 'bin\domfin-api.exe'
# What the app's dependencies were installed from: npm ci again when it changes.
$AppStamp = Join-Path $Root 'app\node_modules\.domfin-setup'

# Where Go and Node.js come from; a mirror can stand in for either.
$GoMirror = if ($env:DOMFIN_GO_MIRROR) { $env:DOMFIN_GO_MIRROR } else { 'https://dl.google.com/go' }
$NodeMirror = if ($env:DOMFIN_NODE_MIRROR) { $env:DOMFIN_NODE_MIRROR } else { 'https://nodejs.org/dist' }
# Never let go download a toolchain of its own: setup brings the right one.
$env:GOTOOLCHAIN = 'local'

$script:Quiet = $false
$script:InstalledTools = $false
$script:Work = ''
$script:DemoDir = ''
$script:Api = $null
$script:App = $null

function Write-Ok([string] $Text) {
  if ($script:Quiet) { return }
  Write-Host '  ok ' -ForegroundColor Green -NoNewline
  Write-Host $Text
}

function Write-Step([string] $Text) {
  Write-Host '  -> ' -ForegroundColor DarkGray -NoNewline
  Write-Host $Text
}

function Write-Note([string] $Text) {
  if ($script:Quiet) { return }
  Write-Host '  !  ' -ForegroundColor Yellow -NoNewline
  Write-Host $Text
}

function Stop-Domfin([string] $Text) {
  Write-Host ''
  Write-Host "x $Text" -ForegroundColor Red
  Clear-Domfin
  exit 1
}

function Show-Usage {
  Write-Host 'Domfin: tus finanzas, en tu computadora.'
  Write-Host ''
  Write-Host 'Uso: .\domfin.cmd <comando>'
  Write-Host ''
  Write-Host '  setup              Instala lo que Domfin necesita (Go, Node.js, los módulos'
  Write-Host '                     de domfin-api y las dependencias de la app) y salta lo'
  Write-Host '                     que ya tienes.'
  Write-Host '  start              Arranca domfin-api y la app, y abre la app en tu'
  Write-Host '                     navegador. Usa los puertos 8080 y 8081, o los siguientes'
  Write-Host '                     libres si están ocupados. Ctrl+C apaga las dos y los'
  Write-Host '                     libera. Si falta algo, corre setup antes.'
  Write-Host '  start --demo       Igual, con datos de ejemplo en vez de tu base, en los'
  Write-Host '                     puertos 8090 y 8091 para correr junto a tu Domfin. Se'
  Write-Host '                     borran al salir.'
  Write-Host ''
  Write-Host 'Opciones de start:'
  Write-Host '  --api-port <n>     Un puerto fijo para domfin-api.'
  Write-Host '  --app-port <n>     Un puerto fijo para la app.'
}

# Clear-Domfin stops what start started and removes the temporary folders.
function Clear-Domfin {
  if ($script:App -and -not $script:App.HasExited) {
    # Metro runs workers of its own: end the whole tree.
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & taskkill.exe /PID $script:App.Id /T /F *> $null
    $ErrorActionPreference = $old
  }
  if ($script:Api -and -not $script:Api.HasExited) {
    Stop-Process -Id $script:Api.Id -Force -ErrorAction SilentlyContinue
  }
  foreach ($dir in @($script:DemoDir, $script:Work)) {
    if ($dir -and (Test-Path -LiteralPath $dir)) {
      Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

# --- Helpers --------------------------------------------------------------

# Test-AtLeast VERSION MINIMUM: whether VERSION (like 1.26.7) is MINIMUM or newer.
function Test-AtLeast([string] $Version, [string] $Minimum) {
  $a = @($Version -split '\.')
  $b = @($Minimum -split '\.')
  for ($i = 0; $i -lt 3; $i++) {
    $x = 0
    $y = 0
    if ($i -lt $a.Count) { $x = [int]($a[$i] -replace '\D.*$', '') }
    if ($i -lt $b.Count) { $y = [int]($b[$i] -replace '\D.*$', '') }
    if ($x -gt $y) { return $true }
    if ($x -lt $y) { return $false }
  }
  return $true
}

# Invoke-Quiet FILE ARGUMENTS: what a program prints, or $null when it fails.
function Invoke-Quiet([string] $File, [string[]] $Arguments) {
  if (-not (Get-Command $File -ErrorAction SilentlyContinue)) { return $null }
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $File @Arguments 2> $null
    if ($LASTEXITCODE -ne 0) { return $null }
    return (@($out) -join "`n")
  } catch {
    return $null
  } finally {
    $ErrorActionPreference = $old
  }
}

# Invoke-Checked FILE ARGUMENTS FAILURE: runs a program where its output shows,
# and stops with FAILURE if it fails.
function Invoke-Checked([string] $File, [string[]] $Arguments, [string] $Failure, [switch] $Silent) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($Silent) { & $File @Arguments | Out-Null } else { & $File @Arguments | Out-Host }
    $code = $LASTEXITCODE
  } catch {
    $code = 1
  } finally {
    $ErrorActionPreference = $old
  }
  if ($code -ne 0) { Stop-Domfin $Failure }
}

# Use-LocalTools puts the Go and Node.js in .tools\, if any, first on PATH.
function Use-LocalTools {
  $go = Join-Path $Tools 'go\bin'
  $node = Join-Path $Tools 'node'
  if (Test-Path -LiteralPath (Join-Path $go 'go.exe')) { $env:Path = "$go;$env:Path" }
  if (Test-Path -LiteralPath (Join-Path $node 'node.exe')) { $env:Path = "$node;$env:Path" }
}

# Get-HaveNote TOOL FOLDER: how Write-Ok lists a tool that was already there.
function Get-HaveNote([string] $Tool, [string] $Folder) {
  $found = Get-Command $Tool -ErrorAction SilentlyContinue
  if ($found -and $found.Path -and $found.Path.StartsWith($Tools, [StringComparison]::OrdinalIgnoreCase)) {
    return "ya estaba en .tools\$Folder"
  }
  return 'ya lo tenías'
}

function Get-WorkDir {
  if (-not $script:Work) {
    $script:Work = Join-Path ([IO.Path]::GetTempPath()) ('domfin-setup-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $script:Work | Out-Null
  }
  return $script:Work
}

function Save-Download([string] $Url, [string] $File) {
  try {
    Invoke-WebRequest -Uri $Url -OutFile $File -UseBasicParsing
  } catch {
    Stop-Domfin "No pude descargar $Url. ¿Tienes conexión a Internet?"
  }
}

# Assert-Sum FILE SUM: the download is what its publisher says it is.
function Assert-Sum([string] $File, [string] $Sum) {
  $got = (Get-FileHash -Algorithm SHA256 -LiteralPath $File).Hash
  if ($got -ne $Sum.Trim()) {
    Stop-Domfin "$(Split-Path -Leaf $File) no coincide con su suma SHA-256, así que no lo uso. Vuelve a intentarlo."
  }
}

function Expand-Zip([string] $Zip, [string] $Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  # Windows 10 and 11 ship tar, which unzips far faster than Expand-Archive;
  # when it can't (an old Windows, an odd path), Expand-Archive does.
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
  if ($null -ne (Invoke-Quiet $tar @('-xf', $Zip, '-C', $Destination))) { return }
  Expand-Archive -LiteralPath $Zip -DestinationPath $Destination -Force
}

# Get-Arch: the names Go and Node.js give this processor.
function Get-Arch {
  $arch = $env:PROCESSOR_ARCHITECTURE
  if ($env:PROCESSOR_ARCHITEW6432) { $arch = $env:PROCESSOR_ARCHITEW6432 }
  if ($arch -eq 'AMD64') { return @{ Go = 'amd64'; Node = 'x64' } }
  if ($arch -eq 'ARM64') { return @{ Go = 'arm64'; Node = 'arm64' } }
  Stop-Domfin "No sé instalar Go y Node.js para $arch. Instálalos a mano (mira el README) y vuelve a correr .\domfin.cmd setup."
}

# Replace-Tool FOLDER NAME: moves an unpacked tool from the work folder into .tools\NAME.
function Replace-Tool([string] $Folder, [string] $Name) {
  New-Item -ItemType Directory -Force -Path $Tools | Out-Null
  $dest = Join-Path $Tools $Name
  if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
  Move-Item -LiteralPath $Folder -Destination $dest
}

# --- Go -------------------------------------------------------------------

function Get-GoModVersion([string] $Pattern) {
  foreach ($line in Get-Content -LiteralPath (Join-Path $Root 'api\go.mod')) {
    if ($line -match $Pattern) { return $Matches[1] }
  }
  return ''
}

# The oldest Go that builds domfin-api, from api\go.mod.
$GoMin = Get-GoModVersion '^go (\d[\d.]*)'

# Get-GoVersion: the version of the Go on PATH (1.26.7), or ''.
function Get-GoVersion {
  # Away from api\, so go reports itself and not what go.mod asks for.
  Push-Location ([IO.Path]::GetTempPath())
  try { $out = Invoke-Quiet 'go' @('version') } finally { Pop-Location }
  if ($out -match 'go version go(\S+)') { return $Matches[1] }
  return ''
}

function Install-Go {
  $arch = Get-Arch
  $version = Get-GoModVersion '^toolchain go(\d[\d.]*)'
  if (-not $version) { $version = $GoMin }
  if ($version -notmatch '^\d+\.\d+\.\d+') { $version = "$version.0" }
  $file = "go$version.windows-$($arch.Go).zip"
  $work = Get-WorkDir
  Write-Step "Bajando Go $version (unos 80 MB)..."
  Save-Download "$GoMirror/$file.sha256" (Join-Path $work "$file.sha256")
  Save-Download "$GoMirror/$file" (Join-Path $work $file)
  Assert-Sum (Join-Path $work $file) (Get-Content -Raw -LiteralPath (Join-Path $work "$file.sha256"))
  Expand-Zip (Join-Path $work $file) (Join-Path $work 'go-zip')
  Replace-Tool (Join-Path $work 'go-zip\go') 'go'
}

function Confirm-Go {
  $have = Get-GoVersion
  if ($have -and (Test-AtLeast $have $GoMin)) {
    Write-Ok "Go $have ($(Get-HaveNote 'go' 'go'))"
    return
  }
  if ($have) {
    Write-Step "Tu Go ($have) es muy viejo: domfin-api necesita $GoMin o más nuevo."
  } else {
    Write-Step 'Falta Go, para domfin-api.'
  }
  Install-Go
  Use-LocalTools
  $script:InstalledTools = $true
  $have = Get-GoVersion
  if (-not $have -or -not (Test-AtLeast $have $GoMin)) {
    Stop-Domfin 'Bajé Go a .tools\go, pero no arranca en esta computadora.'
  }
  Write-Ok "Go $have (nuevo, en .tools\go)"
}

# --- Node.js --------------------------------------------------------------

function Get-NodeVersion {
  $out = Invoke-Quiet 'node' @('--version')
  if ($out -match '^v(\d+\.\d+\.\d+)') { return $Matches[1] }
  return ''
}

# Test-NodeSupported VERSION: the Node.js versions React Native runs on
# (its engines: ^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25).
function Test-NodeSupported([string] $Version) {
  $major = [int]($Version -split '\.')[0]
  if ($major -eq 20) { return (Test-AtLeast $Version '20.19.4') }
  if ($major -eq 22) { return (Test-AtLeast $Version '22.13.0') }
  if ($major -eq 24) { return (Test-AtLeast $Version '24.3.0') }
  return ($major -ge 25)
}

function Install-Node {
  $arch = Get-Arch
  $work = Get-WorkDir
  $index = Join-Path $work 'index.tab'
  Save-Download "$NodeMirror/index.tab" $index
  # Newest first; the 10th column names the LTS line, or is "-".
  $version = ''
  foreach ($line in (Get-Content -LiteralPath $index | Select-Object -Skip 1)) {
    $columns = $line -split "`t"
    if ($columns.Count -gt 9 -and $columns[9] -ne '-') {
      $version = $columns[0]
      break
    }
  }
  if (-not $version) { Stop-Domfin "No encontré la versión LTS de Node.js en $NodeMirror." }
  $name = "node-$version-win-$($arch.Node)"
  $file = "$name.zip"
  Write-Step "Bajando Node.js $($version.TrimStart('v')) (LTS, unos 35 MB)..."
  $sums = Join-Path $work 'SHASUMS256.txt'
  Save-Download "$NodeMirror/$version/SHASUMS256.txt" $sums
  $sum = ''
  foreach ($line in Get-Content -LiteralPath $sums) {
    $columns = $line -split '\s+'
    if ($columns.Count -ge 2 -and $columns[1] -eq $file) {
      $sum = $columns[0]
      break
    }
  }
  if (-not $sum) { Stop-Domfin "Node.js $($version.TrimStart('v')) no tiene versión para win-$($arch.Node)." }
  Save-Download "$NodeMirror/$version/$file" (Join-Path $work $file)
  Assert-Sum (Join-Path $work $file) $sum
  Expand-Zip (Join-Path $work $file) (Join-Path $work 'node-zip')
  Replace-Tool (Join-Path $work "node-zip\$name") 'node'
}

function Confirm-Node {
  $have = Get-NodeVersion
  $npm = Get-Command 'npm' -ErrorAction SilentlyContinue
  if ($have -and (Test-NodeSupported $have) -and $npm) {
    Write-Ok "Node.js $have ($(Get-HaveNote 'node' 'node'))"
    return
  }
  if (-not $have) {
    Write-Step 'Falta Node.js, para la app.'
  } elseif (-not (Test-NodeSupported $have)) {
    Write-Step "Tu Node.js ($have) no le sirve a la app: necesita 20.19.4, 22.13, 24.3 o más nuevo."
  } else {
    Write-Step "Tu Node.js ($have) no trae npm."
  }
  Install-Node
  Use-LocalTools
  $script:InstalledTools = $true
  $have = Get-NodeVersion
  if (-not $have -or -not (Test-NodeSupported $have)) {
    Stop-Domfin 'Bajé Node.js a .tools\node, pero no arranca en esta computadora.'
  }
  Write-Ok "Node.js $have (nuevo, en .tools\node)"
}

# --- Domfin ---------------------------------------------------------------

function Confirm-Git {
  $out = Invoke-Quiet 'git' @('--version')
  if ($out -match 'git version (\S+)') {
    Write-Ok "Git $($Matches[1]) (ya lo tenías)"
  } else {
    Write-Note 'Falta Git. Domfin funciona sin él, pero lo necesitas para actualizarlo (git pull): https://git-scm.com/downloads'
  }
}

function Confirm-Api {
  Push-Location (Join-Path $Root 'api')
  try {
    # With GOPROXY=off, go mod download only succeeds if every module is here.
    $proxy = $env:GOPROXY
    $env:GOPROXY = 'off'
    $cached = $null -ne (Invoke-Quiet 'go' @('mod', 'download'))
    $env:GOPROXY = $proxy
    if ($cached) {
      Write-Ok 'Módulos de domfin-api (ya estaban)'
    } else {
      Write-Step 'Bajando los módulos de domfin-api...'
      Invoke-Checked 'go' @('mod', 'download') 'No pude bajar los módulos de domfin-api.'
      Write-Ok 'Módulos de domfin-api (descargados)'
    }

    if (Test-Path -LiteralPath $ApiBin) {
      $built = (Get-Item -LiteralPath $ApiBin).LastWriteTimeUtc
      $newer = Get-ChildItem -LiteralPath (Join-Path $Root 'api') -Recurse -File |
        Where-Object { $_.LastWriteTimeUtc -gt $built } | Select-Object -First 1
      if (-not $newer) {
        Write-Ok 'domfin-api compilada (ya estaba al día)'
        return
      }
      Write-Step 'Compilando domfin-api...'
    } else {
      Write-Step 'Compilando domfin-api (la primera vez tarda unos minutos)...'
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ApiBin) | Out-Null
    Invoke-Checked 'go' @('build', '-buildvcs=false', '-o', $ApiBin, './cmd/api') 'No pude compilar domfin-api.'
    Write-Ok 'domfin-api compilada'
  } finally {
    Pop-Location
  }
}

function Confirm-App {
  $lock = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Root 'app\package-lock.json')).Hash.ToLowerInvariant()
  $major = (Get-NodeVersion) -replace '\..*$', ''
  $stamp = "$lock node$major windows-$env:PROCESSOR_ARCHITECTURE"
  if ((Test-Path -LiteralPath $AppStamp) -and ((Get-Content -Raw -LiteralPath $AppStamp).Trim() -eq $stamp)) {
    Write-Ok 'Dependencias de la app (ya estaban)'
    return
  }
  Write-Step 'Instalando las dependencias de la app (npm ci, tarda unos minutos)...'
  Push-Location (Join-Path $Root 'app')
  try {
    Invoke-Checked 'npm' @('ci', '--no-audit', '--no-fund', '--loglevel=error') 'No pude instalar las dependencias de la app.'
  } finally {
    Pop-Location
  }
  Set-Content -LiteralPath $AppStamp -Value $stamp -Encoding ASCII
  Write-Ok 'Dependencias de la app (instaladas)'
}

function Invoke-Setup([bool] $Quiet) {
  $script:Quiet = $Quiet
  if (-not $Quiet) {
    Write-Host 'Domfin: revisando lo que hace falta'
    Write-Host ''
  }
  Use-LocalTools
  Confirm-Git
  Confirm-Go
  Confirm-Node
  Confirm-Api
  Confirm-App
  if ($Quiet) { return }
  Write-Host ''
  Write-Host 'Listo. Arranca Domfin con:'
  Write-Host ''
  Write-Host '  .\domfin.cmd start'
  Write-Host ''
  Write-Host 'O pruébalo con datos de ejemplo:'
  Write-Host ''
  Write-Host '  .\domfin.cmd start --demo'
  if ($script:InstalledTools) {
    Write-Host ''
    Write-Host 'Go y Node.js quedaron en .tools\, solo para Domfin: no se instalaron en tu sistema.'
  }
}

# --- start ----------------------------------------------------------------

function Test-PortBusy([int] $Port) {
  try {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  } catch {
    # Without the NetTCPIP module, try to connect.
    $client = New-Object Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1', $Port); return $true } catch { return $false } finally { $client.Close() }
  }
}

# Get-FreePort FROM SKIP: the first port from FROM on that nothing listens on,
# other than SKIP, or 0 after a hundred.
function Get-FreePort([int] $From, [int] $Skip) {
  for ($port = $From; $port -lt $From + 100; $port++) {
    if ($port -ne $Skip -and -not (Test-PortBusy $port)) { return $port }
  }
  return 0
}

# Test-Domfin PORT: whether what listens on PORT is a domfin-api.
function Test-Domfin([int] $Port) {
  try {
    $body = (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/updates" -UseBasicParsing -TimeoutSec 3).Content
    return ($body -match '"version"')
  } catch {
    return $false
  }
}

function Get-Port([string] $Value) {
  if ($Value -notmatch '^\d+$') { Stop-Domfin "`"$Value`" no es un puerto: usa un número, como 8090." }
  return [int]$Value
}

function Invoke-Start([string[]] $Options) {
  $demo = $false
  # 0: not given, Domfin picks one.
  $apiPort = 0
  $appPort = 0
  for ($i = 0; $i -lt $Options.Count; $i++) {
    $option = $Options[$i]
    if ($option -eq '--demo') {
      $demo = $true
    } elseif ($option -eq '--api-port' -or $option -eq '--app-port') {
      if ($i + 1 -ge $Options.Count) { Stop-Domfin "Falta el número de puerto después de $option." }
      $i++
      if ($option -eq '--api-port') { $apiPort = Get-Port $Options[$i] } else { $appPort = Get-Port $Options[$i] }
    } elseif ($option -match '^--api-port=(.*)$') {
      $apiPort = Get-Port $Matches[1]
    } elseif ($option -match '^--app-port=(.*)$') {
      $appPort = Get-Port $Matches[1]
    } elseif ($option -eq '-h' -or $option -eq '--help') {
      Show-Usage
      return
    } else {
      Stop-Domfin "No conozco la opción $option. Mira .\domfin.cmd help."
    }
  }
  Invoke-Setup $true
  Use-LocalTools

  # The usual ports, or the next free ones when they're taken. The demo has
  # its own, to run next to the real Domfin; the browser keeps each port's
  # settings apart, so neither changes the other's. A port given with
  # --api-port or --app-port has to be free.
  $usualApi = 8080
  $usualApp = 8081
  if ($demo) {
    $usualApi = 8090
    $usualApp = 8091
  }
  $busy = 'El puerto {0} está ocupado. Usa otro, o no digas ninguno y Domfin busca uno libre.'
  $reuse = $false
  if ($apiPort -ne 0) {
    if (Test-PortBusy $apiPort) {
      # A domfin-api already there, with the real data, is used as it is.
      if ($demo -or -not (Test-Domfin $apiPort)) { Stop-Domfin ($busy -f $apiPort) }
      $reuse = $true
    }
  } elseif (-not $demo -and (Test-PortBusy $usualApi) -and (Test-Domfin $usualApi)) {
    $apiPort = $usualApi
    $reuse = $true
  } else {
    $apiPort = Get-FreePort $usualApi $usualApp
    if ($apiPort -eq 0) { Stop-Domfin 'No encontré un puerto libre para domfin-api.' }
    if ($apiPort -ne $usualApi) { Write-Step "El puerto $usualApi está ocupado: domfin-api usa el $apiPort." }
  }
  if ($appPort -ne 0) {
    if (Test-PortBusy $appPort) { Stop-Domfin ($busy -f $appPort) }
  } else {
    $appPort = Get-FreePort $usualApp $apiPort
    if ($appPort -eq 0) { Stop-Domfin 'No encontré un puerto libre para la app.' }
    if ($appPort -ne $usualApp) { Write-Step "El puerto $usualApp está ocupado: la app usa el $appPort." }
  }
  if ($apiPort -eq $appPort) { Stop-Domfin 'domfin-api y la app no pueden usar el mismo puerto.' }

  if ($demo) {
    $script:DemoDir = Join-Path ([IO.Path]::GetTempPath()) ('domfin-demo-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $script:DemoDir | Out-Null
    $env:DOMFIN_DATA_DIR = $script:DemoDir
    Write-Step 'Preparando los datos de ejemplo...'
    Push-Location (Join-Path $Root 'api')
    try {
      Invoke-Checked 'go' @('run', '-buildvcs=false', './cmd/demo') 'No pude preparar los datos de ejemplo.' -Silent
    } finally {
      Pop-Location
    }
  }

  if ($reuse) {
    Write-Step "domfin-api ya está corriendo en el puerto ${apiPort}: uso esa."
  } else {
    $env:PORT = "$apiPort"
    $script:Api = Start-Process -FilePath $ApiBin -WorkingDirectory (Join-Path $Root 'api') -NoNewWindow -PassThru
    $ready = $false
    for ($i = 0; $i -lt 150 -and -not $ready; $i++) {
      try {
        Invoke-WebRequest -Uri "http://127.0.0.1:$apiPort/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ready = $true
      } catch {
        if ($script:Api.HasExited) { Stop-Domfin 'domfin-api no arrancó: mira el error de arriba.' }
        Start-Sleep -Milliseconds 200
      }
    }
    if (-not $ready) { Stop-Domfin "domfin-api no responde en el puerto $apiPort." }
  }

  $env:EXPO_PUBLIC_API_URL = "http://localhost:$apiPort"
  # Domfin promises to only go online for the BCRD rate and new versions:
  # no telemetry or checks from Expo while it runs.
  if (-not $env:EXPO_NO_TELEMETRY) { $env:EXPO_NO_TELEMETRY = '1' }
  if (-not $env:EXPO_OFFLINE) { $env:EXPO_OFFLINE = '1' }

  Write-Host ''
  if ($demo) { Write-Host 'Domfin está corriendo con datos de ejemplo' } else { Write-Host 'Domfin está corriendo' }
  Write-Host "  App: http://localhost:$appPort (se abre sola en tu navegador)"
  Write-Host "  API: http://localhost:$apiPort"
  Write-Host '  Para apagar Domfin, presiona Ctrl+C.'
  Write-Host ''

  # Through Start-Process, Expo gets the console itself and stays interactive.
  $node = (Get-Command 'node').Path
  $expo = Join-Path $Root 'app\node_modules\expo\bin\cli'
  $script:App = Start-Process -FilePath $node -ArgumentList ('"{0}" start --web --port {1}' -f $expo, $appPort) -WorkingDirectory (Join-Path $Root 'app') -NoNewWindow -PassThru
  Wait-Process -Id $script:App.Id
}

$command = if ($args.Count -gt 0) { [string]$args[0] } else { 'help' }
$rest = @()
if ($args.Count -gt 1) { $rest = @($args[1..($args.Count - 1)] | ForEach-Object { [string]$_ }) }

try {
  if ($command -eq 'setup') {
    Invoke-Setup ($rest -contains '--quiet')
  } elseif ($command -eq 'start') {
    Invoke-Start $rest
  } elseif ($command -eq 'help' -or $command -eq '-h' -or $command -eq '--help') {
    Show-Usage
  } else {
    Write-Host "No conozco el comando `"$command`"."
    Write-Host ''
    Show-Usage
    exit 2
  }
} finally {
  Clear-Domfin
}
