[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][uri]$WebUrl,
    [Parameter(Mandatory = $true)][uri]$ApiUrl
)

$ErrorActionPreference = 'Stop'

foreach ($url in @($WebUrl, $ApiUrl)) {
    if (-not $url.IsAbsoluteUri -or $url.Scheme -notin @('http', 'https') -or
        $url.UserInfo -or $url.AbsolutePath -ne '/' -or $url.Query -or $url.Fragment) {
        throw 'Hãy truyền URL gốc HTTP hoặc HTTPS cho web và API.'
    }
}

$webOrigin = $WebUrl.GetLeftPart([UriPartial]::Authority)
$apiOrigin = $ApiUrl.GetLeftPart([UriPartial]::Authority)
$paths = @('/api/health', '/api/semesters', '/api/programs', '/api/modules?size=1')
$failed = $false

Add-Type -AssemblyName System.Net.Http
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(90)
try {
    foreach ($path in $paths) {
        $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, "$apiOrigin$path")
        $request.Headers.Add('Origin', $webOrigin)
        $response = $null
        $watch = [Diagnostics.Stopwatch]::StartNew()
        try {
            $response = $client.SendAsync($request).GetAwaiter().GetResult()
            $watch.Stop()
            $status = [int]$response.StatusCode
            $corsOk = $response.Headers.Contains('Access-Control-Allow-Origin') -and
                (($response.Headers.GetValues('Access-Control-Allow-Origin') -join ', ') -ceq $webOrigin)
            $cors = if ($corsOk) { 'đúng origin web' } else { 'sai hoặc thiếu origin web' }
            Write-Output ('GET {0} | HTTP {1} | {2:F2} giây | CORS {3}' -f $path, $status, $watch.Elapsed.TotalSeconds, $cors)
            if (-not $response.IsSuccessStatusCode -or -not $corsOk) {
                $failed = $true
            }
        } catch {
            $failed = $true
            Write-Output ('GET {0} | không nhận được phản hồi HTTP | {1:F2} giây' -f $path, $watch.Elapsed.TotalSeconds)
        } finally {
            if ($path -eq $paths[0] -and $watch.Elapsed.TotalSeconds -gt 20) {
                Write-Warning 'Lần gọi đầu vượt 20 giây. Render có thể vừa khởi động lại sau khi ngủ.'
            }
            if ($null -ne $response) { $response.Dispose() }
            $request.Dispose()
        }
    }
} finally {
    $client.Dispose()
}

if ($failed) {
    throw 'Kiểm tra triển khai thất bại. Xem trạng thái HTTP và CORS ở trên.'
}
