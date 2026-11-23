<#
  Gom ngữ cảnh dự án vào MỘT file Markdown (docs/CONTEXT_PACK.md) để dán cho AI không đọc được thư mục
  (vd ChatGPT web). Không chứa dữ liệu trong data/ hay token.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$out = Join-Path $root 'docs\CONTEXT_PACK.md'
$skip = '\\(node_modules|\.venv|\.venv-rag|\.next|\.next-preview|__pycache__|\.git|\.pytest_cache|data|outlines_2025)(\\|$)'

function Add-File([string]$title, [string]$path) {
    if (Test-Path $path) {
        "`n---`n## $title (`"$path`")`n"
        Get-Content $path -Encoding utf8 -Raw
    }
}

$sb = New-Object System.Text.StringBuilder
function Add([string]$s) { [void]$sb.AppendLine($s) }

Add "# CONTEXT PACK — UELPATH (tạo lúc $(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
Add "> Dán toàn bộ file này vào đầu cuộc trò chuyện. Sau đó nói rõ việc bạn muốn làm tiếp. Không chứa token hay dữ liệu cá nhân."
Add (Add-File 'Quy tắc chung' 'AGENTS.md')
Add (Add-File 'Trạng thái bàn giao' 'docs\HANDOFF.md')
Add (Add-File 'Quyết định đã chốt' 'docs\DECISIONS.md')
Add (Add-File 'Kiến trúc & hợp đồng API' 'ARCHITECTURE.md')

Add "`n---`n## Cây thư mục (độ sâu 3, bỏ thư viện/dữ liệu)`n"
Add '```'
Get-ChildItem -Recurse -Depth 2 -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch $skip } |
    ForEach-Object { $rel = $_.FullName.Substring($root.Length + 1); if ($_.PSIsContainer) { "$rel\" } else { $rel } } |
    ForEach-Object { Add $_ }
Add '```'

Add "`n---`n## Git`n"
Add '```'
(git log --oneline -15 2>$null) | ForEach-Object { Add $_ }
Add '--- status'
(git status --short 2>$null) | Select-Object -First 40 | ForEach-Object { Add $_ }
Add '```'

$sb.ToString() | Set-Content $out -Encoding utf8
$kb = [math]::Round((Get-Item $out).Length / 1KB)
"Đã tạo $out ($kb KB)."
if ($kb -gt 150) { 'Cảnh báo: file lớn, có thể vượt giới hạn dán của một số AI; cân nhắc chỉ dán AGENTS.md + docs/HANDOFF.md.' }
