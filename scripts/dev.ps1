<#
  Lệnh tiện ích dùng chung cho mọi AI/lập trình viên (Windows PowerShell 5.1+).
  Chạy từ bất kỳ đâu:  .\scripts\dev.ps1 <lệnh> [tham số]

  init     Tạo .env (mật khẩu DB ngẫu nhiên) nếu chưa có
  up       Khởi động db (Postgres) + workspace (container làm việc dùng chung)
  down     Dừng các container
  setup    Cài thư viện Python (api) + Node (web) trong container
  test     pytest (api, bỏ qua RAG) + vitest (web)
  test-rag pytest riêng cho api/tests/rag
  run ...  Chạy lệnh bất kỳ trong container (thư mục /workspace), vd: run python -m app.cli seed
  job ...  Như api nhưng trong container RIÊNG `jobs` — dùng cho việc chạy lâu (parse, OCR) để không bị giết khi phiên khác
           khởi động lại `workspace`. Vd: job python -m app.cli parse-outlines --workers 8
  api ...  Như run nhưng ở /workspace/api, vd: api python -m app.cli import-classes ../data/x.json
  web ...  Như run nhưng ở /workspace/web, vd: web npm run build
  shell    Mở bash trong container
  psql     Mở psql vào database
  migrate  alembic upgrade head (khi đã có Alembic)
  status   Trạng thái container + git
  ctx      Tạo docs/CONTEXT_PACK.md (dán cho AI không đọc được file)
#>
param(
    [Parameter(Position = 0)][string]$Cmd = 'help',
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$files = @('-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml')

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Chưa cài Docker Desktop.' }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker chưa chạy: hãy mở Docker Desktop, đợi biểu tượng báo "running", rồi thử lại.' }
}
function Invoke-Compose {
    param([string[]]$ComposeArgs)
    # PowerShell 5.1 coi stderr của lệnh native là lỗi khi ErrorActionPreference=Stop; docker ghi tiến trình ra stderr.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & docker compose @files @ComposeArgs 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $prev }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
function Invoke-InWorkspace {
    param([string]$Dir, [string[]]$Command)
    if (-not $Command -or $Command.Count -eq 0) { throw 'Thiếu lệnh cần chạy.' }
    Invoke-Compose (@('exec', '-T', '-w', $Dir, 'workspace') + $Command)
}

switch ($Cmd) {
    'init' {
        if (Test-Path .env) { 'Đã có .env — giữ nguyên.'; break }
        $chars = (48..57) + (65..90) + (97..122)
        $pw = -join (1..24 | ForEach-Object { [char]($chars | Get-Random) })
        (Get-Content .env.example -Encoding utf8) -replace 'POSTGRES_PASSWORD=.*', "POSTGRES_PASSWORD=$pw" |
            Set-Content .env -Encoding utf8
        'Đã tạo .env (không commit file này).'
    }
    'up' {
        Assert-Docker
        if (-not (Test-Path .env)) { & $PSCommandPath init }
        Invoke-Compose @('up', '-d', '--build', 'db', 'workspace', 'jobs')
    }
    'down' { Assert-Docker; Invoke-Compose @('down') }
    'setup' {
        Assert-Docker
        Invoke-InWorkspace '/workspace/api' @('pip', 'install', '-r', 'requirements-dev.txt')
        if (Test-Path api\requirements-rag.txt) {
            try { Invoke-InWorkspace '/workspace/api' @('pip', 'install', '-r', 'requirements-rag.txt') } catch { 'Cảnh báo: requirements-rag.txt không cài đủ (bỏ qua).' }
        }
        Invoke-InWorkspace '/workspace/web' @('npm', 'install')
    }
    'test' {
        Assert-Docker
        Invoke-InWorkspace '/workspace/api' @('pip', 'install', '-r', 'requirements-dev.txt')
        Invoke-InWorkspace '/workspace/api' @('python', '-m', 'pytest', '-q', '--ignore=tests/rag')
        Invoke-InWorkspace '/workspace/web' @('npm', 'test')
    }
    'test-rag' { Assert-Docker; Invoke-InWorkspace '/workspace/api' @('python', '-m', 'pytest', '-q', 'tests/rag') }
    'run' { Assert-Docker; Invoke-InWorkspace '/workspace' $Rest }
    'job' { Assert-Docker; Invoke-Compose (@('exec', '-T', '-w', '/workspace/api', 'jobs') + $Rest) }
    'api' { Assert-Docker; Invoke-InWorkspace '/workspace/api' $Rest }
    'web' { Assert-Docker; Invoke-InWorkspace '/workspace/web' $Rest }
    'shell' { Assert-Docker; & docker compose @files exec workspace bash }
    'psql' {
        Assert-Docker
        & docker compose @files exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    }
    'migrate' { Assert-Docker; Invoke-InWorkspace '/workspace/api' @('alembic', 'upgrade', 'head') }
    'status' {
        if (-not (Test-Path .env)) { 'Chưa có .env — chạy: .\scripts\dev.ps1 init' }
        else { try { Assert-Docker; Invoke-Compose @('ps') } catch { "Docker: $($_.Exception.Message)" } }
        git status --short
        git log --oneline -5
    }
    'ctx' { & (Join-Path $PSScriptRoot 'context_pack.ps1') }
    default { Get-Help $PSCommandPath | Out-String | Write-Output }
}
