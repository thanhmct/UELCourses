# X5/X6 - nạp thật theo thứ tự D3 -> D4 -> D6/D8 -> D5 -> D7 -> tên EN. Dừng ở bước đầu tiên lỗi.
# Chạy sau khi đã sao lưu:  .\scripts\db_backup.ps1 -Tag truoc-nap-that-x5
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$log = 'data/processed/x5_real_import.log'
$exec = @('compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml', 'exec', '-T', '-w', '/workspace/api', 'jobs')

$steps = @(
    @('D3_ctdt_files',        @('python', '-m', 'app.cli', 'import-ctdt-files')),
    @('D4_master_data',       @('python', '-m', 'app.cli', 'import-master-data')),
    @('D6_ths',               @('python', '-m', 'app.cli', 'import-ths')),
    @('D5_outlines_2025',     @('python', '-m', 'app.cli', 'import-outlines-docx', '--dir', '../data/outlines_master/docs', '--ctdt-year', '2025')),
    @('D5_bff4009',           @('python', '-m', 'app.cli', 'replace-bff4009-outline')),
    @('D5_outlines_2023',     @('python', '-m', 'app.cli', 'import-outlines-docx', '--dir', '../data/outlines_master/ctdt2023', '--ctdt-year', '2023', '--manifest', '../data/outlines_master/manifest_ctdt2023.csv')),
    @('D7_description_en',    @('python', '-m', 'app.cli', 'fill-description-en')),
    @('X6_audit_apply_names', @('python', '-m', 'app.cli', 'audit-x6', '--apply-names'))
)

"=== bat dau $(Get-Date -Format s)" | Out-File $log -Encoding utf8
foreach ($s in $steps) {
    $name = $s[0]; $cmd = $s[1]
    "=== [$name] $(Get-Date -Format s): $($cmd -join ' ')" | Out-File $log -Append -Encoding utf8
    & docker @exec @cmd 2>&1 | ForEach-Object { "$_" } | Out-File $log -Append -Encoding utf8
    $code = $LASTEXITCODE
    "=== [$name] exit=$code $(Get-Date -Format s)" | Out-File $log -Append -Encoding utf8
    if ($code -ne 0) { "=== DUNG tai $name" | Out-File $log -Append -Encoding utf8; exit $code }
}
"=== XONG $(Get-Date -Format s)" | Out-File $log -Append -Encoding utf8
