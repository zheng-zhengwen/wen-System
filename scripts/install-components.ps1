# awenops optional component installer (Windows / PowerShell 5.1+)
#
# Components:
#   all         - awenAgent runtime (default)
#   awen-agent - awenAgent runtime (Agent + knowledge base + retrieval)
#   legacy      - old Hermes compatibility chain
#   hermes      - official Hermes Agent installer
#   ollama      - Ollama + nomic-embed-text (local models)
#   codex       - Node.js + OpenAI Codex CLI
#   claude      - Node.js + Claude Code CLI

param(
    [ValidateSet("all", "awen-agent", "legacy", "hermes", "ollama", "codex", "claude", "status")]
    [string]$Component = "all"
)

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptRoot

function Write-Info($msg) { Write-Host "[awenops] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[awenops] WARN: $msg" -ForegroundColor Yellow }
function Test-Cmd($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $extras = @(
        "$env:USERPROFILE\.bun\bin",
        "$env:USERPROFILE\.hermes\bin",
        "$env:USERPROFILE\.hermes\node\bin",
        "$env:USERPROFILE\.awenops\node",
        "$RepoRoot\server\.venv\Scripts",
        "$env:LOCALAPPDATA\Programs\Ollama",
        "$env:USERPROFILE\.local\bin"
    )
    $env:Path = (($extras + $machine + $user) -join ";")
}

function Show-Status {
    Refresh-Path
    $hermes = Get-Command hermes -ErrorAction SilentlyContinue
    $awen = Get-Command awen -ErrorAction SilentlyContinue
    $bun = Get-Command bun -ErrorAction SilentlyContinue
    $node = Get-Command node -ErrorAction SilentlyContinue
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    $ollama = Get-Command ollama -ErrorAction SilentlyContinue
    $codex = Get-Command codex -ErrorAction SilentlyContinue
    $claude = Get-Command claude -ErrorAction SilentlyContinue
    Write-Host "awenAgent: $(if ($awen) { $awen.Source } else { 'not installed' })"
    Write-Host "Hermes: $(if ($hermes) { $hermes.Source } else { 'not installed' })"
    Write-Host "Bun:    $(if ($bun) { $bun.Source } else { 'not installed' })"
    Write-Host "Node:   $(if ($node) { $node.Source } else { 'not installed' })"
    Write-Host "npm:    $(if ($npm) { $npm.Source } else { 'not installed' })"
    Write-Host "Ollama: $(if ($ollama) { $ollama.Source } else { 'not installed' })"
    Write-Host "Codex:  $(if ($codex) { $codex.Source } else { 'not installed' })"
    Write-Host "Claude: $(if ($claude) { $claude.Source } else { 'not installed' })"
    Write-Host "Brain:  $env:USERPROFILE\brain"
    Write-Host "awen:  $env:USERPROFILE\.awen\knowledge"
}

function Add-UserPath($dir) {
    if (-not (Test-Path $dir)) { return }
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $parts = @()
    if ($userPath) { $parts = $userPath -split ";" | Where-Object { $_ } }
    if ($parts -notcontains $dir) {
        [Environment]::SetEnvironmentVariable("Path", (($parts + $dir) -join ";"), "User")
    }
    Refresh-Path
}

function Install-UserNode {
    Refresh-Path
    if (Test-Cmd "npm") {
        Write-Info "npm already installed: $((Get-Command npm).Source)"
        return
    }

    Write-Info "npm not found. Installing user-level Node.js LTS..."
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    if (($env:PROCESSOR_ARCHITECTURE -eq "ARM64") -or ($env:PROCESSOR_ARCHITEW6432 -eq "ARM64")) { $arch = "arm64" }

    $base = "https://nodejs.org/dist/latest-v22.x"
    $sum = Invoke-RestMethod "$base/SHASUMS256.txt"
    $zipName = (($sum -split "`n") | ForEach-Object {
        if ($_ -match "(node-v[0-9.]+-win-$arch\.zip)") { $Matches[1] }
    } | Select-Object -First 1)
    if (-not $zipName) { throw "Could not find a Windows $arch Node.js LTS zip from nodejs.org." }

    $tmp = Join-Path $env:TEMP $zipName
    $targetRoot = "$env:USERPROFILE\.awenops"
    $nodeDir = Join-Path $targetRoot "node"
    $extractDir = Join-Path $targetRoot "node-extract"
    if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
    New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
    Invoke-WebRequest "$base/$zipName" -OutFile $tmp
    Expand-Archive -Path $tmp -DestinationPath $extractDir -Force

    $expanded = Get-ChildItem $extractDir -Directory | Select-Object -First 1
    if (-not $expanded) { throw "Node.js extraction failed." }
    if (Test-Path $nodeDir) { Remove-Item -Recurse -Force $nodeDir }
    Move-Item $expanded.FullName $nodeDir
    Remove-Item -Recurse -Force $extractDir
    Add-UserPath $nodeDir

    if (-not (Test-Cmd "npm")) { throw "Node.js was extracted, but npm is still not found. Restart awenops and retry." }
    Write-Info "Node.js installed: $((Get-Command node).Source)"
}

function Install-NpmPackage($commandName, $packageName) {
    Refresh-Path
    if (Test-Cmd $commandName) {
        Write-Info "$commandName already installed: $((Get-Command $commandName).Source)"
        return
    }
    Install-UserNode
    Refresh-Path
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npm) { throw "npm not found. Cannot install $commandName." }
    Write-Info "Installing/updating ${commandName}: $packageName"
    & $npm.Source install -g $packageName
    if ($LASTEXITCODE -ne 0) { throw "npm install -g $packageName failed." }
    Refresh-Path
    if (-not (Test-Cmd $commandName)) {
        Write-Warn "$commandName was installed, but the command is not visible in this session. Restart awenops or recheck."
    } else {
        Write-Info "$commandName installed: $((Get-Command $commandName).Source)"
    }
}

function Install-awenAgent {
    Refresh-Path
    # Windows x64 免-Python package: awenAgent is bundled INTO awenopsServer.exe —
    # nothing to install, awenops starts it from the exe. Skip entirely.
    if (Test-Path (Join-Path $RepoRoot "awenopsServer.exe")) {
        Write-Info "awenAgent is bundled into awenopsServer.exe — no separate install needed."
        return
    }
    if (Test-Cmd "awen") {
        Write-Info "awenAgent already installed: $((Get-Command awen).Source)"
    } else {
        $VenvPy = Join-Path $RepoRoot "server\.venv\Scripts\python.exe"
        if (-not (Test-Path $VenvPy)) {
            $python = Get-Command python -ErrorAction SilentlyContinue
            if (-not $python) { $python = Get-Command py -ErrorAction SilentlyContinue }
            if (-not $python) { throw "Python not found. Run scripts\install.ps1 first or install Python 3.9+." }
            Write-Info "Creating server virtualenv for awenAgent..."
            & $python.Source -m venv (Join-Path $RepoRoot "server\.venv")
        }
        if (-not (Test-Path $VenvPy)) { throw "server virtualenv was not created: $VenvPy" }

        $awenAgentSource = $env:AWEN_AGENT_LOCAL
        # Agent source shipped inside the prebuilt bundle → install OFFLINE.
        $BundledAgent = Join-Path $RepoRoot "agent"
        if ([string]::IsNullOrWhiteSpace($awenAgentSource) -and (Test-Path (Join-Path $BundledAgent "pyproject.toml"))) {
            $awenAgentSource = $BundledAgent
        }
        $SiblingAgent = Join-Path (Split-Path -Parent $RepoRoot) "awen-agent"
        if ([string]::IsNullOrWhiteSpace($awenAgentSource) -and (Test-Path $SiblingAgent)) {
            $awenAgentSource = (Resolve-Path $SiblingAgent).Path
        }
        if (-not [string]::IsNullOrWhiteSpace($awenAgentSource) -and (Test-Path $awenAgentSource)) {
            Write-Info "Installing awenAgent from local source: $awenAgentSource"
            & $VenvPy -m pip install -e $awenAgentSource
        } else {
            $awenAgentRepo = if ($env:AWEN_AGENT_REPO) { $env:AWEN_AGENT_REPO } else { "https://github.com/zheng-zhengwen/awen-agent.git" }
            # Default to the latest *release tag*, not main: installing main ships
            # unreleased code and disagrees with the "update available" prompt,
            # which compares against the release tag. Falling back to main is
            # forbidden: a network failure must not change the code being deployed.
            $awenAgentRef = $env:AWEN_AGENT_REF
            if ([string]::IsNullOrWhiteSpace($awenAgentRef)) {
                try {
                    $rel = Invoke-RestMethod -TimeoutSec 8 -Headers @{ "User-Agent" = "awenops" } `
                        -Uri "https://api.github.com/repos/zheng-zhengwen/awen-agent/releases/latest"
                    $awenAgentRef = $rel.tag_name
                } catch { $awenAgentRef = $null }
            }
            if ([string]::IsNullOrWhiteSpace($awenAgentRef)) {
                throw "No published awenAgent release is reachable. Set AWEN_AGENT_REF to an approved release tag, or AWEN_AGENT_LOCAL to an explicitly selected local source. No main fallback was installed."
            }
            Write-Info "Installing awenAgent from Git: $awenAgentRepo@$awenAgentRef"
            & $VenvPy -m pip install "git+$awenAgentRepo@$awenAgentRef"
        }
        if ($LASTEXITCODE -ne 0) { throw "awenAgent pip install failed." }
        Refresh-Path
    }

    $UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath("UserProfile") }
    $awenHome = Join-Path $UserHome ".awen"
    New-Item -ItemType Directory -Force -Path (Join-Path $awenHome "knowledge") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $awenHome "models") | Out-Null

    $awen = Get-Command awen -ErrorAction SilentlyContinue
    if (-not $awen) {
        $fallback = Join-Path $RepoRoot "server\.venv\Scripts\awen.exe"
        if (Test-Path $fallback) { $awen = [pscustomobject]@{ Source = $fallback } }
    }
    if (-not $awen) { throw "awen command not found after installation." }
    try { & $awen.Source self doctor | Out-Host } catch { Write-Warn "awenAgent doctor reported warnings: $_" }
    try { & $awen.Source retrieval sync --json | Out-Null } catch {}
    try { & $awen.Source self service-start --host 127.0.0.1 --port 8765 | Out-Host } catch {
        Write-Warn "awenAgent service did not start now; awenops will retry automatically when opened."
    }
    Write-Info "awenAgent ready: $($awen.Source)"
    Write-Info "Knowledge root: $awenHome\knowledge"
}

function Install-Hermes {
    Refresh-Path
    if (Test-Cmd "hermes") {
        Write-Info "Hermes already installed: $((Get-Command hermes).Source)"
        return
    }
    Write-Info "Installing Hermes Agent..."
    Invoke-Expression (Invoke-RestMethod "https://hermes-agent.nousresearch.com/install.ps1")
    Refresh-Path
    if (Test-Cmd "hermes") {
        Write-Info "Hermes installed: $((Get-Command hermes).Source)"
    } else {
        Write-Warn "Hermes installer ran, but hermes is not visible in this session. Restart awenops or recheck."
    }
}

function Get-OllamaCommand {
    Refresh-Path
    $ollama = Get-Command ollama -ErrorAction SilentlyContinue
    if ($ollama) { return $ollama.Source }
    $fallback = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
    if (Test-Path $fallback) {
        Add-UserPath (Split-Path -Parent $fallback)
        return $fallback
    }
    return $null
}

function Install-Ollama {
    Refresh-Path
    $ollamaPath = Get-OllamaCommand
    if (-not $ollamaPath) {
        Write-Info "Installing Ollama..."
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            & $winget.Source install --id Ollama.Ollama --exact --silent --accept-source-agreements --accept-package-agreements
            if ($LASTEXITCODE -ne 0) { Write-Warn "winget install returned code $LASTEXITCODE; trying official installer." }
        }
        $ollamaPath = Get-OllamaCommand
        if (-not $ollamaPath) {
            $installer = Join-Path $env:TEMP "OllamaSetup.exe"
            Invoke-WebRequest "https://ollama.com/download/OllamaSetup.exe" -OutFile $installer -UseBasicParsing
            $p = Start-Process -FilePath $installer -ArgumentList "/S" -Wait -PassThru
            if ($p.ExitCode -ne 0) { Write-Warn "Ollama installer exited with code $($p.ExitCode)." }
        }
        Refresh-Path
        $ollamaPath = Get-OllamaCommand
    } else {
        Write-Info "Ollama already installed: $ollamaPath"
    }
    if (-not $ollamaPath) { throw "ollama command not found after installation." }

    Write-Info "Starting Ollama if needed..."
    try { Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden | Out-Null } catch {}
    Start-Sleep -Seconds 2

    Write-Info "Pulling local embedding model: nomic-embed-text"
    & $ollamaPath pull nomic-embed-text
    if ($LASTEXITCODE -ne 0) { throw "ollama pull nomic-embed-text failed." }

    Write-Info "Ollama ready: $ollamaPath"
}

if ($Component -eq "status") { Show-Status; exit 0 }
if ($Component -eq "all" -or $Component -eq "awen-agent") { Install-awenAgent }
if ($Component -eq "legacy") { Install-Hermes }
if ($Component -eq "hermes") { Install-Hermes }
if ($Component -eq "ollama") { Install-Ollama }
if ($Component -eq "codex") { Install-NpmPackage "codex" "@openai/codex" }
if ($Component -eq "claude") { Install-NpmPackage "claude" "@anthropic-ai/claude-code" }
Show-Status
