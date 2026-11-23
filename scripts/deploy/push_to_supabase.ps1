[CmdletBinding()]
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'

if ($DryRun) {
    Write-Output @(
        '1. Đọc SUPABASE_DB_URL và chuẩn hóa Transaction pooler về cổng 6543 với sslmode=require.'
        '2. Xuất database Postgres trong Docker cục bộ ra SQL thuần bằng pg_dump --no-owner --no-acl.'
        '3. Hỏi xác nhận trước khi xóa toàn bộ schema public trên Supabase.'
        '4. Tạo lại schema public và nạp SQL bằng psql -f trong một giao dịch.'
        '5. Đặt search_path của database về public.'
        '6. In số dòng của modules, class_sections, programs và phiên bản Alembic.'
    )
    return
}

function Invoke-NativeQuietly {
    param([string]$Command, [string[]]$Arguments, [string]$FailureMessage, [string]$InputText)

    # Không chuyển tiếp stderr của Docker hoặc psql vào terminal hay transcript.
    $ErrorActionPreference = 'Continue'
    $PSNativeCommandUseErrorActionPreference = $false
    if ($null -ne $InputText -and $InputText.Length -gt 0) {
        $result = $InputText | & $Command @Arguments 2>$null
    } else {
        $result = & $Command @Arguments 2>$null
    }
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
    $result
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$configPath = Join-Path $repoRoot '.env.deploy'
try {
    $entries = @(Get-Content -LiteralPath $configPath -Encoding UTF8 |
        Where-Object { $_ -match '^\s*SUPABASE_DB_URL\s*=' })
} catch {
    throw 'Không đọc được cấu hình triển khai. Hãy tạo tệp .env.deploy tại thư mục gốc.'
}
if ($entries.Count -ne 1) {
    throw 'Hãy khai báo đúng một dòng SUPABASE_DB_URL trong .env.deploy.'
}
$url = ($entries[0] -replace '^\s*SUPABASE_DB_URL\s*=\s*', '').Trim()
if ($url -match '^([''"])(.*)\1$') {
    $url = $Matches[2]
}

# Tách URL thành biến của libpq để mật khẩu không xuất hiện trong đối số psql.
$urlPattern = '^postgres(?:ql)?://(?<user>postgres\.[a-z0-9]+):(?<password>[A-Za-z0-9]+)@(?<host>aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com):(?<port>5432|6543)/postgres(?:\?sslmode=require)?$'
if ($url -cnotmatch $urlPattern) {
    throw 'SUPABASE_DB_URL phải là URL pooler của Supabase cho database postgres, có mật khẩu chỉ gồm chữ và số, với sslmode=require nếu có tham số.'
}

$connectionEnvironment = @{
    PGHOST = $Matches['host']
    PGUSER = $Matches['user']
    PGPASSWORD = $Matches['password']
    # Dùng 6543 cho cả URL nhập với 5432 và URL đã dùng 6543.
    PGPORT = '6543'
    PGDATABASE = 'postgres'
    PGSSLMODE = 'require'
    PGCONNECT_TIMEOUT = '15'
    PGHOSTADDR = $null
    PGSERVICE = $null
    PGOPTIONS = $null
}

$docker = (Get-Command docker -CommandType Application -ErrorAction Stop).Source
# psql chạy BÊN TRONG container db (máy Windows thường không cài psql). Biến PG* được chuyển
# từ môi trường của tiến trình này vào container bằng `-e TÊN` (không kèm giá trị) nên mật khẩu
# không xuất hiện trong dòng lệnh.
$dumpName = 'uelcourses-' + [guid]::NewGuid().ToString('N') + '.sql'
$containerDump = '/tmp/' + $dumpName
$compose = @('compose', '-f', 'docker-compose.yml')
$passEnv = @()
foreach ($n in 'PGHOST','PGUSER','PGPASSWORD','PGPORT','PGDATABASE','PGSSLMODE','PGCONNECT_TIMEOUT') { $passEnv += @('-e', $n) }
$previousEnvironment = @{}

Push-Location -LiteralPath $repoRoot
try {
    Write-Host 'Đang xuất Postgres cục bộ ra SQL thuần.'
    # Để pg_dump ghi byte trực tiếp, giữ nguyên UTF-8 và định dạng COPY.
    $dumpCommand = 'umask 077; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=plain --no-owner --no-acl --file=' + $containerDump + ' # ignore trailing CR'
    Invoke-NativeQuietly -Command $docker -Arguments ($compose + @('exec', '-T', 'db', 'sh', '-s')) -InputText $dumpCommand `
        -FailureMessage 'pg_dump thất bại. Kiểm tra container db cục bộ và quyền đọc database.' | Out-Null
    Invoke-NativeQuietly -Command $docker -Arguments ($compose + @('exec', '-T', 'db', 'test', '-s', $containerDump)) `
        -FailureMessage 'Bản dump SQL rỗng hoặc không tạo được.' | Out-Null

    Write-Host ("Thao tác này sẽ XÓA toàn bộ schema public trên Supabase ({0})." -f $connectionEnvironment.PGUSER)
    $confirmation = Read-Host 'Nhập XOA PUBLIC để xác nhận'
    if ($confirmation -cne 'XOA PUBLIC') {
        Write-Output 'Đã hủy. Supabase chưa được kết nối.'
        return
    }

    foreach ($name in $connectionEnvironment.Keys) {
        $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $connectionEnvironment[$name], 'Process')
    }

    $dockerPsql = $compose + @('exec', '-T') + $passEnv + @('db', 'psql')
    $psqlArgs = @('-X', '-w', '-v', 'ON_ERROR_STOP=1')
    $restoreArgs = $dockerPsql + $psqlArgs + @(
        '--single-transaction',
        '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
        '-f', $containerDump,
        '-c', 'ALTER DATABASE postgres SET search_path TO public;'
    )
    Invoke-NativeQuietly -Command $docker -Arguments $restoreArgs `
        -FailureMessage 'Nạp SQL thất bại. Hãy kiểm tra kết nối, quyền và extension của database đích.' | Out-Null

    $countsSql = 'SELECT (SELECT count(*) FROM public.modules) AS modules, (SELECT count(*) FROM public.class_sections) AS class_sections, (SELECT count(*) FROM public.programs) AS programs, (SELECT string_agg(version_num, chr(44) ORDER BY version_num) FROM public.alembic_version) AS alembic_version;'
    Invoke-NativeQuietly -Command $docker -Arguments ($dockerPsql + $psqlArgs + @('-P', 'pager=off', '-c', $countsSql)) `
        -FailureMessage 'Đã nạp SQL nhưng không đọc được số dòng và phiên bản Alembic.'
} finally {
    foreach ($name in $previousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
    try {
        Invoke-NativeQuietly -Command $docker -Arguments ($compose + @('exec', '-T', 'db', 'rm', '-f', $containerDump)) `
            -FailureMessage 'Không xóa được tệp SQL tạm trong container db.' | Out-Null
    } catch {
        Write-Warning $_.Exception.Message
    } finally {
        Pop-Location
    }
}
