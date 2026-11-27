[CmdletBinding()]
param(
    [string]$SupabaseHost,
    [int]$SupabasePort,
    [string]$SupabaseUser,
    [string]$SupabaseDatabase,
    [ValidateSet('require', 'verify-ca', 'verify-full')]
    [string]$SslMode,
    [string]$EnvFile = '.env',
    [switch]$UsePasswordFromEnv
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Read-DotEnv([string]$Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $values }
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
            $value = $Matches[2].Trim()
            if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $values[$Matches[1]] = $value
        }
    }
    return $values
}

function First-Value($Map, [string[]]$Names, $Fallback = $null) {
    foreach ($name in $Names) {
        if ($Map.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($Map[$name])) { return $Map[$name] }
    }
    return $Fallback
}

function Convert-SecureStringToText([Security.SecureString]$Secure) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Invoke-Docker([string[]]$Arguments, [string]$FailureMessage) {
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$FailureMessage (docker exit code $LASTEXITCODE)." }
}

$envValues = Read-DotEnv $EnvFile
if ([string]::IsNullOrWhiteSpace($SupabaseHost)) { $SupabaseHost = First-Value $envValues @('SUPABASE_DB_HOST', 'SUPABASE_HOST') }
if ($SupabasePort -le 0) { $SupabasePort = [int](First-Value $envValues @('SUPABASE_DB_PORT', 'SUPABASE_PORT') 5432) }
if ([string]::IsNullOrWhiteSpace($SupabaseUser)) { $SupabaseUser = First-Value $envValues @('SUPABASE_DB_USER', 'SUPABASE_USER') }
if ([string]::IsNullOrWhiteSpace($SupabaseDatabase)) { $SupabaseDatabase = First-Value $envValues @('SUPABASE_DB_NAME', 'SUPABASE_DATABASE', 'SUPABASE_DB') 'postgres' }
if ([string]::IsNullOrWhiteSpace($SslMode)) { $SslMode = First-Value $envValues @('SUPABASE_SSLMODE') 'require' }

if ([string]::IsNullOrWhiteSpace($SupabaseHost) -or [string]::IsNullOrWhiteSpace($SupabaseUser)) {
    throw 'Thieu cau hinh Supabase. Dat SUPABASE_DB_HOST, SUPABASE_DB_PORT, SUPABASE_DB_USER, SUPABASE_DB_NAME trong .env hoac truyen tham so. Khong dat password trong tham so.'
}
if ($SupabaseHost -in @('db', 'localhost', '127.0.0.1')) { throw 'Host nguon trong giong PostgreSQL local; can host Direct connection hoac Session pooler cua Supabase.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Khong tim thay Docker CLI. Hay cai/mo Docker Desktop roi chay lai.' }
& docker info --format '{{.ServerVersion}}' 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Khong ket noi duoc Docker Desktop. Hay khoi dong Docker Desktop roi chay lai.' }

$clientImage = 'pgvector/pgvector:pg17'
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "uelpath_supabase_import_$stamp"
$dumpPath = Join-Path $tempRoot 'supabase_public.dump'
$localBackupPath = Join-Path $tempRoot 'local_before_restore.dump'
$restoreListPath = Join-Path $tempRoot 'restore.list'
New-Item -ItemType Directory -Path $tempRoot | Out-Null

if ($UsePasswordFromEnv) {
    $plainPassword = First-Value $envValues @('SUPABASE_PASSWORD', 'SUPERBASE_PASSWORD')
} else {
    $securePassword = Read-Host 'Supabase database password (input hidden)' -AsSecureString
    $plainPassword = Convert-SecureStringToText $securePassword
}
if ([string]::IsNullOrEmpty($plainPassword)) { throw 'Password Supabase khong duoc de trong.' }

try {
    $env:PGPASSWORD = $plainPassword
    Write-Host "Dang dump schema public tu Supabase bang PostgreSQL client 17 (SSL=$SslMode)..."
    $mount = "${tempRoot}:/backup"
    & docker run --rm -e PGPASSWORD -e "PGSSLMODE=$SslMode" -v $mount $clientImage pg_dump --host $SupabaseHost --port $SupabasePort --username $SupabaseUser --dbname $SupabaseDatabase --schema public --format custom --no-owner --no-privileges --file /backup/supabase_public.dump
    $dumpExit = $LASTEXITCODE
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    $plainPassword = $null
    if ($dumpExit -ne 0) {
        throw "pg_dump that bai. Kiem tra DNS/network; host/port Direct connection hoac Session pooler; SSL mode; user/password dung loai connection; va server khong moi hon client PostgreSQL 17. Khong co thay doi nao duoc ghi vao Supabase hay database local."
    }
    if (-not (Test-Path -LiteralPath $dumpPath) -or (Get-Item -LiteralPath $dumpPath).Length -le 0) { throw 'Archive dump khong ton tai hoac rong; dung truoc restore.' }
    $archiveList = & docker run --rm -v $mount $clientImage pg_restore --list /backup/supabase_public.dump
    if ($LASTEXITCODE -ne 0) { throw 'Archive dump bi loi hoac khong tuong thich: pg_restore --list that bai; dung truoc restore.' }
    # pg_dump --schema=public records CREATE SCHEMA but not extensions whose
    # objects live there. Preserve public so pg_trgm can be installed locally.
    $archiveList | ForEach-Object {
        if ($_ -match '^\d+;.* SCHEMA - public ') { '; preserve public schema: ' + $_ } else { $_ }
    } | Set-Content -LiteralPath $restoreListPath -Encoding Ascii

    Invoke-Docker @('compose', 'up', '-d', 'db') 'Khong khoi dong duoc service db local'
    Invoke-Docker @('compose', 'exec', '-T', 'db', 'sh', '-c', 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"') 'Service db local chua san sang'
    Write-Host "Dang backup database local hien tai vao $localBackupPath"
    Invoke-Docker @('compose', 'exec', '-T', 'db', 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges -f /tmp/uelpath_before_restore.dump') 'Khong backup duoc database local'
    Invoke-Docker @('compose', 'cp', 'db:/tmp/uelpath_before_restore.dump', $localBackupPath) 'Khong chep duoc backup local ra thu muc Temp'
    Invoke-Docker @('compose', 'exec', '-T', 'db', 'pg_restore', '--list', '/tmp/uelpath_before_restore.dump') 'Backup local khong hop le'
    if (-not (Test-Path -LiteralPath $localBackupPath) -or (Get-Item -LiteralPath $localBackupPath).Length -le 0) { throw 'Backup local rong; dung truoc restore.' }

    Write-Warning 'Buoc tiep theo se xoa/thay the object thuoc schema public trong service db LOCAL. Supabase chi duoc doc.'
    $confirmation = Read-Host 'Go chinh xac THAY THE LOCAL de tiep tuc'
    if ($confirmation -cne 'THAY THE LOCAL') { Write-Host 'Da huy truoc khi thay doi database local. Dump va backup van nam trong Temp.'; exit 2 }

    Invoke-Docker @('compose', 'cp', $dumpPath, 'db:/tmp/supabase_public.dump') 'Khong chep duoc dump vao service db local'
    Invoke-Docker @('compose', 'cp', $restoreListPath, 'db:/tmp/restore.list') 'Khong chep duoc restore list vao service db local'
    Invoke-Docker @('compose', 'exec', '-T', 'db', 'sh', '-c', 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public"') 'Khong cai duoc extension pg_trgm vao db local'
    Invoke-Docker @('compose', 'exec', '-T', 'db', 'sh', '-c', 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error --use-list=/tmp/restore.list /tmp/supabase_public.dump') 'Restore vao service db local that bai; dung local_before_restore.dump trong Temp de khoi phuc'
    Write-Host 'Restore hoan tat. So ban ghi uoc luong theo thong ke PostgreSQL:'
    Invoke-Docker @('compose', 'exec', '-T', 'db', 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -c "ANALYZE; SELECT schemaname, relname AS table_name, n_live_tup AS estimated_rows FROM pg_stat_user_tables WHERE schemaname = ''public'' ORDER BY relname;"') 'Restore xong nhung khong truy van duoc thong ke'
    Write-Host "Dump nguon va backup local duoc giu tai: $tempRoot"
}
catch {
    $message = $_.Exception.Message
    if ($message -match 'could not translate host name|Name or service not known') { $message = "Loi DNS: khong phan giai duoc host Supabase. $message" }
    elseif ($message -match 'SSL error|certificate verify failed|root certificate') { $message = "Loi SSL/certificate. Kiem tra SSL mode va CA. $message" }
    elseif ($message -match 'password authentication failed|no password supplied') { $message = "Loi xac thuc Supabase. Kiem tra user/password va loai connection. $message" }
    elseif ($message -match 'server version.*pg_dump version|server version mismatch') { $message = "Khong tuong thich phien ban pg_dump/server. $message" }
    Write-Error $message
    Write-Host "Cac file tam (neu da tao) duoc giu tai: $tempRoot"
    exit 1
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    $plainPassword = $null
    & docker compose exec -T db sh -c 'rm -f /tmp/supabase_public.dump /tmp/uelpath_before_restore.dump /tmp/restore.list' 1>$null 2>$null
}
