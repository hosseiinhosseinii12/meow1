#Requires -Version 5.1
<#
.SYNOPSIS
    SELF BOT - Windows setup script.
.DESCRIPTION
    Prepares the project for local run and Railway deployment.
.PARAMETER SkipVenv      Don't create the virtual environment.
.PARAMETER SkipEnv       Don't touch .env.
.PARAMETER InitGit       Run git init, commit, and push if -Remote is given.
.PARAMETER Remote        GitHub repository URL to push to.
.PARAMETER InstallRailway Install the Railway CLI and link.
.PARAMETER Yes           Answer yes to all prompts.
#>
[CmdletBinding()]
param(
    [switch]$SkipVenv,
    [switch]$SkipEnv,
    [switch]$InitGit,
    [string]$Remote = "",
    [switch]$InstallRailway,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"
# NOTE: do NOT use Set-StrictMode -Version Latest here; it breaks $Matches checks.

function Write-Step([string]$Text) { Write-Host ""; Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text)   { Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn2([string]$Text){ Write-Host "  [!]  $Text" -ForegroundColor Yellow }
function Write-Err2([string]$Text) { Write-Host "  [X]  $Text" -ForegroundColor Red }

function Confirm-OrYes([string]$Question) {
    if ($Yes) { return $true }
    $a = Read-Host "$Question [y/N]"
    return [bool]($a -match '^(y|yes)$')
}

function Test-Cmd([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function New-FileIfMissing([string]$Path, [string]$Content) {
    if (Test-Path $Path) {
        Write-Warn2 "$Path already exists - left untouched."
        return $false
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $full = Join-Path (Get-Location) $Path
    [System.IO.File]::WriteAllText($full, $Content, $utf8)
    Write-Ok "created $Path"
    return $true
}

function Find-Python {
    foreach ($cand in @("python", "python3", "py")) {
        if (Test-Cmd $cand) {
            try {
                $v = (& $cand --version 2>&1) -join " "
                if ($v -match 'Python (\d+)\.(\d+)') {
                    $maj = [int]$Matches[1]
                    $min = [int]$Matches[2]
                    if ($maj -ge 3 -and $min -ge 9) { return $cand }
                }
            } catch { }
        }
    }
    return $null
}

# ---------------------------------------------------------------------------
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "SELF BOT - setup" -ForegroundColor Magenta
Write-Host "project folder: $root"

if (-not (Test-Path "app.py")) {
    Write-Err2 "app.py not found in $root. Put setup.ps1 next to app.py."
    exit 1
}

# ---------------------------------------------------------------------------
# 1. python
# ---------------------------------------------------------------------------
Write-Step "Checking Python"
$py = Find-Python
if (-not $py) {
    Write-Err2 "Python 3.9+ not found."
    Write-Host "  Install it from https://www.python.org/downloads/windows/ (tick 'Add python.exe to PATH')."
    exit 1
}
$pyVer = (& $py --version 2>&1) -join " "
Write-Ok "$pyVer ($py)"

# ---------------------------------------------------------------------------
# 2. project files
# ---------------------------------------------------------------------------
Write-Step "Writing project files"

$requirements = @"
telethon>=1.34
python-dotenv>=1.0
qrcode[pil]>=7.4
PySocks>=1.7
rich>=13.7
"@
[void](New-FileIfMissing "requirements.txt" $requirements)

$dockerfile = @"
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DB_PATH=/data

RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data

CMD ["python", "-u", "app.py"]
"@
[void](New-FileIfMissing "Dockerfile" $dockerfile)

$dockerignore = @"
__pycache__/
*.pyc
*.pyo
.venv/
venv/
.env
data/
*.session
*.session-journal
*.db
*.db-wal
*.db-shm
.git/
.gitignore
setup.ps1
README.md
"@
[void](New-FileIfMissing ".dockerignore" $dockerignore)

$gitignore = @"
# python
__pycache__/
*.py[cod]
.venv/
venv/
.env

# bot data
data/
*.session
*.session-journal
*.db
*.db-wal
*.db-shm

# editors / os
.vscode/
.idea/
Thumbs.db
.DS_Store
"@
[void](New-FileIfMissing ".gitignore" $gitignore)

# ---------------------------------------------------------------------------
# 3. .env
# ---------------------------------------------------------------------------
if (-not $SkipEnv) {
    Write-Step "Environment file (.env)"
    if (Test-Path ".env") {
        Write-Warn2 ".env already exists - not overwriting."
    } else {
        Write-Host "  BOT_TOKEN and API_ID/API_HASH are required."
        Write-Host "  Get API_ID/API_HASH at https://my.telegram.org -> API development tools"
        Write-Host "  Get BOT_TOKEN from @BotFather"

        $botToken = ""
        while (-not $botToken) {
            $botToken = (Read-Host "  BOT_TOKEN").Trim()
            if (-not $botToken) { Write-Warn2 "BOT_TOKEN cannot be empty." }
        }

        $apiId = ""
        while ($apiId -notmatch '^\d+$') {
            $apiId = (Read-Host "  API_ID (digits)").Trim()
            if ($apiId -notmatch '^\d+$') { Write-Warn2 "API_ID must be digits." }
        }

        $apiHash = ""
        while (-not $apiHash) {
            $apiHash = (Read-Host "  API_HASH (32 hex chars)").Trim()
            if (-not $apiHash) { Write-Warn2 "API_HASH cannot be empty." }
        }

        $ownerId = (Read-Host "  OWNER_ID (your numeric Telegram id, optional)").Trim()

        $useProxy = (Read-Host "  USE_PROXY [true/false] (default false)").Trim()
        if (-not $useProxy) { $useProxy = "false" }
        $proxyUrl = ""
        if ($useProxy -match '^(true|1|yes)$') {
            $proxyUrl = (Read-Host "  PROXY_URL (e.g. socks5://127.0.0.1:1080)").Trim()
            $useProxy = "true"
        } else {
            $useProxy = "false"
        }

        $envContent = @"
# --- SELF BOT ---
BOT_TOKEN=$botToken
API_ID=$apiId
API_HASH=$apiHash
OWNER_ID=$ownerId

USE_PROXY=$useProxy
PROXY_URL=$proxyUrl

ALLOW_ALL_USERS=true

# local: leave blank -> ./data
# railway: /data (must match the volume mount path)
"@
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        $envPath = Join-Path $root ".env"
        [System.IO.File]::WriteAllText($envPath, $envContent, $utf8)
        Write-Ok "created .env"

        $sample = $envContent
        $sample = $sample -replace '(?m)^BOT_TOKEN=.*$', 'BOT_TOKEN=123456:ABC-DEF...'
        $sample = $sample -replace '(?m)^API_ID=.*$', 'API_ID=1234567'
        $sample = $sample -replace '(?m)^API_HASH=.*$', 'API_HASH=0123456789abcdef0123456789abcdef'
        $sample = $sample -replace '(?m)^OWNER_ID=.*$', 'OWNER_ID=0'
        $samplePath = Join-Path $root ".env.example"
        [System.IO.File]::WriteAllText($samplePath, $sample, $utf8)
        Write-Ok "created .env.example"
    }
}

# ---------------------------------------------------------------------------
# 4. venv + pip
# ---------------------------------------------------------------------------
$venvPython = $py
if (-not $SkipVenv) {
    Write-Step "Creating virtual environment (.venv)"
    if (-not (Test-Path ".venv")) {
        & $py -m venv .venv
        if ($LASTEXITCODE -ne 0) { Write-Err2 "venv creation failed."; exit 1 }
        Write-Ok "created .venv"
    } else {
        Write-Ok ".venv already exists"
    }
    $venvPython = Join-Path $root ".venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        Write-Err2 "venv python not found at $venvPython"
        exit 1
    }
}

Write-Step "Installing dependencies"
& $venvPython -m pip install --upgrade pip setuptools wheel | Out-Host
& $venvPython -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { Write-Err2 "pip install failed."; exit 1 }
Write-Ok "dependencies installed"

& $venvPython -c "import telethon, dotenv, qrcode, socks, rich; print('imports ok')"
if ($LASTEXITCODE -ne 0) { Write-Err2 "import check failed."; exit 1 }
Write-Ok "import check passed"

# ---------------------------------------------------------------------------
# 5. run helper
# ---------------------------------------------------------------------------
$runPs1 = @'
# Runs the bot with the project's virtualenv (if present).
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
$py = ".\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
& $py -u app.py @args
'@
[void](New-FileIfMissing "run.ps1" $runPs1)

# ---------------------------------------------------------------------------
# 6. git
# ---------------------------------------------------------------------------
if ($InitGit) {
    Write-Step "Git"
    if (-not (Test-Cmd "git")) {
        Write-Warn2 "git not installed - skipping."
    } else {
        if (-not (Test-Path ".git")) {
            git init | Out-Host
            git branch -M main | Out-Host
            Write-Ok "git repository initialized"
        } else {
            Write-Ok "git repository already exists"
        }
        git add . | Out-Host

        $hasCommit = $true
        try {
            git rev-parse --verify HEAD *> $null
        } catch {
            $hasCommit = $false
        }

        if (-not $hasCommit) {
            git -c user.name="selfbot" -c user.email="selfbot@local" commit -m "Initial commit" | Out-Host
        } else {
            git -c user.name="selfbot" -c user.email="selfbot@local" commit -m "Update project files" | Out-Host
        }

        if ($Remote) {
            $existing = @(git remote 2>$null)
            if ($existing -contains "origin") {
                git remote set-url origin $Remote | Out-Host
            } else {
                git remote add origin $Remote | Out-Host
            }
            git push -u origin main | Out-Host
            Write-Ok "pushed to $Remote"
        } else {
            Write-Warn2 "no -Remote given - push manually:  git remote add origin <url>; git push -u origin main"
        }
    }
}

# ---------------------------------------------------------------------------
# 7. railway cli
# ---------------------------------------------------------------------------
if ($InstallRailway) {
    Write-Step "Railway CLI"
    if (-not (Test-Cmd "railway")) {
        if (Test-Cmd "npm") {
            Write-Host "  installing @railway/cli globally via npm..."
            npm install -g @railway/cli | Out-Host
        } elseif (Test-Cmd "winget") {
            Write-Host "  installing Railway CLI via winget..."
            winget install --id Railway.CLI -e --accept-source-agreements --accept-package-agreements | Out-Host
        } else {
            Write-Warn2 "npm/winget not found - install the Railway CLI manually:"
            Write-Host "      https://docs.railway.com/guides/cli"
        }
    }
    if (Test-Cmd "railway") {
        $railVer = (& railway --version 2>&1) -join " "
        Write-Ok "railway CLI available: $railVer"
        if (Confirm-OrYes "Run 'railway login' now?") {
            railway login
        }
        if (Confirm-OrYes "Run 'railway link' now (pick/create the project)?") {
            railway link
        }
    }
}

# ---------------------------------------------------------------------------
# 8. summary
# ---------------------------------------------------------------------------
Write-Step "Done"
Write-Host @"
Next steps
----------
LOCAL:
   .\run.ps1
   (or: .\.venv\Scripts\python.exe -u app.py)

   Then open Telegram, send /start to your bot, log in, and inside a group
   (from your own account) send:
       .activegroupsbet      -> activate group for MiaoBet
       .activemeow           -> start the meow loop
       .stopmeow             -> stop the meow loop

RAILWAY (after pushing to GitHub):
   1. railway.app -> New Project -> Deploy from GitHub repo
   2. Variables tab: BOT_TOKEN, API_ID, API_HASH, OWNER_ID,
                     USE_PROXY=false, ALLOW_ALL_USERS=true
   3. Volumes tab:   add a volume, mount at  /data
   4. Deploy. Logs should show: "bot started as @..." and "bot ready".

Notes
-----
 * Never commit .env or data/ - they contain your token and session.
 * Only ONE instance may run with the same user.session / sqlite file.
 * If Telegram is blocked from Railway, set USE_PROXY=true and PROXY_URL=...
"@ -ForegroundColor Gray