<#
  Listen Along (Discord) installer.

  Checks that Vencord (Discord) and Spicetify (Spotify) are both present and patched, then installs
  the mod into both:
    - Vencord:   builds Vencord from source with the ListenAlongBridge plugin and deploys it
    - Spicetify: adds "Listen Along (Discord)" to Spicetify Marketplace's Installed tab
  Safe to re-run any time, e.g. after a Discord / Vencord / Spotify / Spicetify update or reinstall.

  Switches:
    -NoUpdate       reuse the Vencord source already in .\vencord-src instead of pulling the latest
    -SkipVencord    only do the Spicetify side
    -SkipSpotify    only do the Vencord side
#>
[CmdletBinding()]
param(
    [switch]$NoUpdate,
    [switch]$SkipVencord,
    [switch]$SkipSpotify
)

$ErrorActionPreference = 'Stop'
$root       = $PSScriptRoot
$plugSrc    = Join-Path $root 'vencord-plugin\listenAlongBridge'
$vcSrc      = Join-Path $root 'vencord-src'
$vcData     = Join-Path $env:APPDATA 'Vencord'
$discordDir = Join-Path $env:LOCALAPPDATA 'Discord'
$spotifyDir = Join-Path $env:APPDATA 'Spotify'
$spiceCfg   = Join-Path $env:APPDATA 'spicetify'
$stamp      = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$GH_USER    = 'rajb16'
$GH_REPO    = 'discord-spotify-listen-along'
$DEBUG_PORT = 9230

function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  [ok]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Run($exe, [string[]]$arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "$exe $($arguments -join ' ') failed (exit $LASTEXITCODE)" }
}

# ---------------------------------------------------------------- locate things
function Find-Spicetify {
    $c = Get-Command spicetify -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    foreach ($p in @("$env:LOCALAPPDATA\Microsoft\WinGet\Links\spicetify.exe", "$env:LOCALAPPDATA\spicetify\spicetify.exe")) {
        if (Test-Path $p) { return $p }
    }
    return $null
}
function Get-DiscordApp {
    if (-not (Test-Path $discordDir)) { return $null }
    Get-ChildItem $discordDir -Directory -Filter 'app-*' |
        Sort-Object { try { [version]($_.Name -replace '^app-', '') } catch { [version]'0.0' } } -Descending |
        Select-Object -First 1
}
function Test-VencordPatched($app) {
    $asar = Join-Path $app.FullName 'resources\app.asar'
    (Test-Path (Join-Path $app.FullName 'resources\_app.asar')) -and (Test-Path $asar) -and
        ([IO.File]::ReadAllText($asar, [Text.Encoding]::GetEncoding('latin1')) -match 'Vencord')
}
function Stop-App($name) {
    $p = Get-Process $name -ErrorAction SilentlyContinue
    if ($p) { $p | Stop-Process -Force; Start-Sleep -Seconds 2; return $true }
    return $false
}
function Start-Discord { Start-Process (Join-Path $discordDir 'Update.exe') -ArgumentList '--processStart', 'Discord.exe' }
function Start-Spotify([string[]]$extra = @()) {
    $exe = Join-Path $spotifyDir 'Spotify.exe'
    if ($extra.Count) { Start-Process $exe -ArgumentList $extra } else { Start-Process $exe }
}

# ---------------------------------------------------------------- preflight
Step 'Checking what is installed'
$problems = @()
$spicetify = Find-Spicetify
$app = Get-DiscordApp

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { $problems += 'git is not installed (winget install Git.Git)' }
$nodeMajor = 0
try { $nodeMajor = [int]((node -v) -replace '^v(\d+).*', '$1') } catch { }
if ($nodeMajor -lt 22) { $problems += "Node.js 22 or newer is required (found: $(if ($nodeMajor) { $nodeMajor } else { 'none' })). winget install OpenJS.NodeJS" }
else { Ok "Node.js $nodeMajor, git present" }

if (-not $SkipVencord) {
    if (-not $app) { $problems += "Discord not found in $discordDir" }
    elseif (-not (Test-Path (Join-Path $vcData 'dist\patcher.js'))) { $problems += "Vencord is not installed (no $vcData\dist). Run the official Vencord installer first: https://vencord.dev/download" }
    elseif (-not (Test-VencordPatched $app)) { $problems += "Discord ($($app.Name)) is not patched with Vencord, probably because Discord just updated. Run the official Vencord installer (repair), then re-run this." }
    else { Ok "Discord $($app.Name) is patched with Vencord" }
}
if (-not $SkipSpotify) {
    if (-not (Test-Path (Join-Path $spotifyDir 'Spotify.exe'))) { $problems += "Spotify not found in $spotifyDir" }
    elseif (-not $spicetify) { $problems += 'Spicetify is not installed (https://spicetify.app)' }
    else { Ok "Spotify and Spicetify found ($spicetify)" }
}
if ($problems) {
    $problems | ForEach-Object { Bad $_ }
    Write-Host "`nNothing was changed. Fix the above and run install.bat again." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------- Vencord side
if (-not $SkipVencord) {
    Step 'Vencord: building the ListenAlongBridge plugin'
    $discordWasRunning = Stop-App 'Discord'

    # keep what was there before
    $bk = Join-Path $vcData "backup-$stamp"
    New-Item -ItemType Directory $bk | Out-Null
    Copy-Item (Join-Path $vcData 'dist') (Join-Path $bk 'dist') -Recurse
    if (Test-Path (Join-Path $vcData 'settings\settings.json')) { Copy-Item (Join-Path $vcData 'settings\settings.json') $bk }
    Ok "backed up current Vencord files to $bk"

    if (-not (Test-Path (Join-Path $vcSrc '.git'))) {
        Run git @('clone', '--depth', '1', 'https://github.com/Vendicated/Vencord.git', $vcSrc)
    } elseif (-not $NoUpdate) {
        try { Run git @('-C', $vcSrc, 'pull', '--ff-only') } catch { Warn "could not update Vencord source, using what is there ($_)" }
    }
    $pm = (Get-Content (Join-Path $vcSrc 'package.json') -Raw | ConvertFrom-Json).packageManager
    $pnpm = if ($pm -match '^pnpm@[\d.]+') { $Matches[0] } else { 'pnpm@latest' }

    # plugin + the extension it serves to Spotify
    $assets = Join-Path $plugSrc 'assets'
    New-Item -ItemType Directory $assets -Force | Out-Null
    foreach ($f in 'listenAlong.js', 'preview.png') { Copy-Item (Join-Path $root "spicetify\$f") $assets -Force }
    Copy-Item (Join-Path $root 'README.md') $assets -Force
    $dest = Join-Path $vcSrc 'src\userplugins\listenAlongBridge'
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    New-Item -ItemType Directory (Join-Path $vcSrc 'src\userplugins') -Force | Out-Null
    Copy-Item $plugSrc $dest -Recurse

    Push-Location $vcSrc
    try {
        Run npx @('-y', $pnpm, 'install', '--frozen-lockfile')
        Run npx @('-y', $pnpm, 'build')
    } finally { Pop-Location }
    Ok 'built'

    Copy-Item (Join-Path $vcSrc 'dist\*') (Join-Path $vcData 'dist') -Recurse -Force
    Run node @((Join-Path $root 'scripts\enable-plugin.mjs'), (Join-Path $vcData 'settings\settings.json'), 'ListenAlongBridge')
    Ok 'deployed to Vencord and enabled the plugin'

    if ($discordWasRunning) { Start-Discord; Ok 'restarted Discord' } else { Warn 'Discord was not running; start it to load the plugin' }
}

# ---------------------------------------------------------------- Spicetify side
if (-not $SkipSpotify) {
    Step 'Spicetify: adding the extension to Marketplace'
    $spotifyWasRunning = Stop-App 'Spotify'

    # Spotify updates undo Spicetify's patch; the supported fix is "backup apply".
    if (-not (Test-Path (Join-Path $spotifyDir 'Apps\xpui\index.html'))) {
        Warn 'Spotify is not patched by Spicetify (probably just updated); running "spicetify backup apply"'
        Run $spicetify @('backup', 'apply')
        Stop-App 'Spotify' | Out-Null
    } else { Ok 'Spotify is patched by Spicetify' }

    $viaMarketplace = $false
    if (Test-Path (Join-Path $spiceCfg 'CustomApps\marketplace')) {
        # Marketplace's data lives in Spotify's own storage, so Spotify has to be started once with a debug port.
        Start-Spotify @("--remote-debugging-port=$DEBUG_PORT", '--remote-allow-origins=*')
        $up = $false
        foreach ($i in 1..40) {
            Start-Sleep -Seconds 2
            try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$DEBUG_PORT/json/version" -TimeoutSec 2 | Out-Null; $up = $true; break } catch { }
        }
        if ($up) {
            Start-Sleep -Seconds 15      # let Marketplace create / migrate its database
            & node (Join-Path $root 'scripts\marketplace-entry.mjs') $DEBUG_PORT (Join-Path $root 'manifest.json') $GH_USER $GH_REPO
            $viaMarketplace = ($LASTEXITCODE -eq 0)
        }
        Stop-App 'Spotify' | Out-Null    # also closes the debug port
    }

    if ($viaMarketplace) {
        # make sure it is not loaded twice (older installs used the plain Spicetify extension list)
        $cur = (Get-Content (Join-Path $spiceCfg 'config-xpui.ini') -Raw)
        if ($cur -match '(?m)^extensions\s*=.*listenAlong\.js') { Run $spicetify @('config', 'extensions', 'listenAlong.js-'); Run $spicetify @('apply') ; Stop-App 'Spotify' | Out-Null }
        Ok 'added "Listen Along (Discord)" to Marketplace > Installed'
    } else {
        Warn 'Marketplace entry not possible (Marketplace missing or never opened); installing as a plain Spicetify extension instead'
        Copy-Item (Join-Path $root 'spicetify\listenAlong.js') (Join-Path $spiceCfg 'Extensions\listenAlong.js') -Force
        Run $spicetify @('config', 'extensions', 'listenAlong.js')
        Run $spicetify @('apply')
        Stop-App 'Spotify' | Out-Null
        Ok 'installed as a Spicetify extension'
    }

    if ($spotifyWasRunning) { Start-Spotify; Ok 'restarted Spotify' } else { Warn 'Spotify was not running; start it to load the extension' }
}

# ---------------------------------------------------------------- verify
Step 'Verifying'
if (-not $SkipVencord) {
    $tries = 0; $answered = $false
    while ($tries -lt 15 -and -not $answered) {
        $tries++; Start-Sleep -Seconds 2
        try { $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:19777/state' -TimeoutSec 2; $answered = ($r.StatusCode -eq 200) } catch { }
    }
    if ($answered) { Ok 'plugin bridge answers on 127.0.0.1:19777' }
    elseif (Get-Process Discord -ErrorAction SilentlyContinue) { Warn 'Discord is running but the bridge is not answering yet. Give it a few seconds, or check Vencord settings > Plugins > ListenAlongBridge.' }
    else { Warn 'Discord is not running, so the bridge could not be checked.' }
}
Write-Host "`nDone. In Discord, click Listen Along on a friend who is playing something." -ForegroundColor Green
