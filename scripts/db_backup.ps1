# Sao luu DB gon nhe: chi dump khi du lieu thuc su thay doi, giu 3 ban moi nhat, in dung 1 dong.
# Dung:  .\scripts\db_backup.ps1 [-Tag truoc-admin] [-Force]
param([string]$Tag = 'auto', [switch]$Force)
$ErrorActionPreference = 'Continue'   # docker ghi tien trinh ra stderr, khong duoc coi la loi
Set-Location (Split-Path $PSScriptRoot -Parent)
$dir = 'data\backups'                      # data/ da nam trong .gitignore
New-Item -ItemType Directory -Force $dir | Out-Null
$fpFile = "$dir\.fingerprint"
$keep = 3

# Dau van tay: phien ban migration + so dong moi bang (rat nhe, khong dump)
$sql = "select md5(coalesce((select version_num from alembic_version limit 1),'') || ':' || coalesce((select string_agg(relname || '=' || (n_tup_ins + n_tup_upd + n_tup_del), ',' order by relname) from pg_stat_user_tables),''))"
$fp = ($sql | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' | Out-String).Trim()
if (-not $fp -or $fp.Length -ne 32) { Write-Output 'backup: LOI - khong doc duoc DB (Docker/db chua chay?)'; exit 1 }

$old = if (Test-Path $fpFile) { (Get-Content $fpFile -Raw).Trim() } else { '' }
if (-not $Force -and $fp -eq $old) { Write-Output 'backup: bo qua - du lieu khong doi so voi ban gan nhat'; exit 0 }

$out = "$dir\db_$(Get-Date -Format 'yyyyMMdd_HHmm')_$Tag.dump"
# Dump TRONG container roi docker cp (KHONG dung '>' cua PowerShell: no them BOM/doi ma hoa lam hong file nhi phan)
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/uel_backup.dump' | Out-Null
docker compose cp db:/tmp/uel_backup.dump $out 2>&1 | Out-Null
$ok = $false
if (Test-Path $out) {
  $size = (Get-Item $out).Length
  # kiem chung: file phai doc duoc bang pg_restore --list
  $chk = docker compose exec -T db sh -c 'pg_restore -l /tmp/uel_backup.dump >/dev/null 2>&1 && echo OK'
  $ok = ($size -gt 10000) -and ("$chk".Trim() -eq 'OK')
}
docker compose exec -T db sh -c 'rm -f /tmp/uel_backup.dump' | Out-Null
if (-not $ok) { if (Test-Path $out) { Remove-Item $out -Force }; Write-Output 'backup: LOI - dump rong hoac khong doc duoc'; exit 1 }
Set-Content -Path $fpFile -Value $fp -Encoding ascii
Get-ChildItem $dir -Filter 'db_*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $keep | Remove-Item -Force
Write-Output ("backup: da luu {0} ({1:N1} MB), giu {2} ban moi nhat" -f (Split-Path $out -Leaf), ($size / 1MB), $keep)
