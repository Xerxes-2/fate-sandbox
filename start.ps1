$ErrorActionPreference = "Stop"

if (-not (Get-Command pi -ErrorAction SilentlyContinue)) {
  Write-Error "pi is not installed. Install pi coding agent first."
  exit 1
}

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host "Starting $(Split-Path -Leaf $ProjectRoot)..."

New-Item -ItemType Directory -Force -Path ".\sessions" | Out-Null
New-Item -ItemType Directory -Force -Path ".\.pi\agent" | Out-Null

$ProjectAuth = ".\.pi\agent\auth.json"
$GlobalAuth = Join-Path $HOME ".pi\agent\auth.json"

if ((-not (Test-Path $ProjectAuth)) -and (Test-Path $GlobalAuth)) {
  Copy-Item $GlobalAuth $ProjectAuth
  Write-Host "Copied auth.json into project-local pi config."
}

$SettingsPath = ".\.pi\agent\settings.json"
if (-not (Test-Path $SettingsPath)) {
  @"
{
  "theme": "dark"
}
"@ | Set-Content -Path $SettingsPath -Encoding UTF8
  Write-Host "Created project-local pi settings: .pi/agent/settings.json"
  Write-Host "Set defaultProvider/defaultModel there if needed."
}

$DevMode = $env:TAVERN2AGENT_DEV -eq "1"
$Settings = @{}

if (Test-Path $SettingsPath) {
  try {
    $Settings = Get-Content $SettingsPath -Raw | ConvertFrom-Json -AsHashtable
  } catch {
    $Settings = @{}
  }
}

if (-not $Settings.ContainsKey("theme")) {
  $Settings["theme"] = "dark"
}
if (-not $Settings.ContainsKey("subagents")) {
  $Settings["subagents"] = @{}
}
$Settings["subagents"]["disableBuiltins"] = -not $DevMode

$Settings | ConvertTo-Json -Depth 20 | Set-Content -Path $SettingsPath -Encoding UTF8

if ($DevMode) {
  Write-Host "Dev mode: pi-subagents builtin agents are enabled."
} else {
  Write-Host "Player mode: pi-subagents builtin coding agents are disabled."
  Write-Host "Dev mode: set `$env:TAVERN2AGENT_DEV='1'; then run .\start.ps1"
}

if ($env:FATE_RENDER_MODEL) {
  Write-Host "Render pass model override: FATE_RENDER_MODEL=$env:FATE_RENDER_MODEL"
} else {
  Write-Host "Render pass reuses the settlement model."
}

$env:PI_CODING_AGENT_DIR = ".\.pi\agent"
$env:PI_CLAUDE_OAUTH_REINJECT_SCOPE = "never"

& pi `
  --no-skills `
  --skill ".\skills" `
  -e ".\extension.ts" `
  -e ".\extensions\compaction-policy\index.ts" `
  -e ".\extensions\player-panel\index.ts" `
  -e ".\extensions\rewind\index.ts" `
  -e ".\extensions\two-pass-render\index.ts" `
  --session-dir ".\sessions" `
  --no-context-files `
  @args

$PiExit = $LASTEXITCODE

Write-Host ""
Write-Host "------------------------------------------------------------"
Write-Host "Before sharing this project, remove local secrets and saves:"
Write-Host "  .pi/agent/auth.json, sessions/, state/"
Write-Host "------------------------------------------------------------"

exit $PiExit
