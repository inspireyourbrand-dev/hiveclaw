# ============================================================
#  HiveClaw Installer — Windows (PowerShell)
#
#  Usage:
#    cd hiveclaw
#    powershell -ExecutionPolicy Bypass -File scripts\install.ps1
# ============================================================

$ErrorActionPreference = "Continue"

function Log-Success($msg) { Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Log-Warn($msg)    { Write-Host "  [!!]  $msg" -ForegroundColor Yellow }
function Log-Fail($msg)    { Write-Host "  [XX]  $msg" -ForegroundColor Red }
function Log-Info($msg)    { Write-Host "  [->]  $msg" -ForegroundColor Cyan }

Write-Host ""
Write-Host "  ================================================================" -ForegroundColor White
Write-Host "     H I V E C L A W   I N S T A L L E R" -ForegroundColor Cyan
Write-Host "     by HivePowered.AI" -ForegroundColor White
Write-Host "  ================================================================" -ForegroundColor White
Write-Host ""

$ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ROOT
$Errors = 0

# ---- 1. Check Node.js ----
Log-Info "Checking Node.js..."
try {
    $nodeVersion = (node --version 2>$null)
    if ($nodeVersion) {
        $major = [int]($nodeVersion -replace 'v','').Split('.')[0]
        if ($major -ge 22) {
            Log-Success "Node.js $nodeVersion"
        } else {
            Log-Fail "Node.js $nodeVersion — need v22+"
            Log-Info "Download from: https://nodejs.org"
            $Errors++
        }
    } else { throw "not found" }
} catch {
    Log-Fail "Node.js not found"
    Log-Info "Download from: https://nodejs.org (v22+)"
    $Errors++
}

# ---- 2. Check Git ----
Log-Info "Checking Git..."
try {
    $gitVersion = (git --version 2>$null)
    if ($gitVersion) {
        Log-Success $gitVersion
    } else { throw "not found" }
} catch {
    Log-Fail "Git not found — download from https://git-scm.com"
    $Errors++
}

# ---- 3. Check OpenClaw ----
Log-Info "Checking OpenClaw..."
try {
    $ocVersion = (openclaw --version 2>$null)
    if ($ocVersion) {
        Log-Success "OpenClaw $ocVersion"
    } else { throw "not found" }
} catch {
    Log-Warn "OpenClaw not found — installing..."
    try {
        npm install -g openclaw@latest 2>$null
        Log-Success "OpenClaw installed"
    } catch {
        Log-Warn "Could not install OpenClaw. Run: npm install -g openclaw@latest"
    }
}

# ---- 4. Install dependencies ----
Log-Info "Installing HiveClaw dependencies..."
if (Test-Path "package.json") {
    try {
        npm install 2>$null
        Log-Success "Dependencies installed"
    } catch {
        Log-Fail "npm install failed"
        $Errors++
    }
} else {
    Log-Fail "package.json not found"
    $Errors++
}

# ---- 5. Create .env ----
Log-Info "Setting up configuration..."
if (!(Test-Path ".env") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env"
    Log-Success "Created .env from template"
} elseif (Test-Path ".env") {
    Log-Success ".env already configured"
} else {
    Log-Warn "No .env.example — using defaults"
}

# ---- 6. Create directories ----
New-Item -ItemType Directory -Path "data" -Force | Out-Null
New-Item -ItemType Directory -Path "agents/workspace/active" -Force | Out-Null
New-Item -ItemType Directory -Path "agents/workspace/archived" -Force | Out-Null
New-Item -ItemType Directory -Path "agents/workspace/templates" -Force | Out-Null
New-Item -ItemType Directory -Path "agents/workspace/logs" -Force | Out-Null
Log-Success "Directories created"

# ---- 7. Verify components ----
Log-Info "Verifying installation..."
$components = 0
$total = 0

function Check-Component($path) {
    $script:total++
    if (Test-Path $path) {
        $script:components++
    } else {
        Log-Warn "Missing: $path"
    }
}

Check-Component "gateway\index.js"
Check-Component "hivecontrol\index.html"
Check-Component "hiveworkflow\engine.js"
Check-Component "hivemem\client.js"
Check-Component "agents\AGENTS.md"
Check-Component "Dockerfile"
Check-Component "docker-compose.yml"

$screens = @("dashboard","tasks","calendar","memory","projects","documents","team","office","workflow")
foreach ($screen in $screens) {
    Check-Component "hivecontrol\screens\$screen.html"
}

Log-Success "Components: $components/$total"

# ---- 8. Link CLI ----
Log-Info "Setting up CLI..."
try {
    npm link 2>$null
    Log-Success "'hiveclaw' command available"
} catch {
    Log-Warn "Could not link globally — use: node bin\hiveclaw.js"
}

# ---- Summary ----
Write-Host ""
Write-Host "  ================================================================" -ForegroundColor White
if ($Errors -eq 0) {
    Write-Host "  HiveClaw v1.0.0 installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Quick Start:" -ForegroundColor White
    Write-Host "    hiveclaw start              " -ForegroundColor Cyan -NoNewline
    Write-Host "Start the gateway"
    Write-Host "    hiveclaw status             " -ForegroundColor Cyan -NoNewline
    Write-Host "System health"
    Write-Host "    hiveclaw doctor             " -ForegroundColor Cyan -NoNewline
    Write-Host "Full diagnostics"
    Write-Host ""
    Write-Host "  Dashboard:" -ForegroundColor White
    Write-Host "    http://localhost:18789/__hiveclaw__/hivecontrol/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Docker:" -ForegroundColor White
    Write-Host "    docker compose up -d        " -ForegroundColor Cyan -NoNewline
    Write-Host "One-command deploy"
} else {
    Write-Host "  Installed with $Errors issue(s)" -ForegroundColor Yellow
    Write-Host "  Fix issues and re-run: powershell -ExecutionPolicy Bypass -File scripts\install.ps1" -ForegroundColor Cyan
}
Write-Host "  ================================================================" -ForegroundColor White
Write-Host ""
