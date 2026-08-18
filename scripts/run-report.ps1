# 定时执行日报脚本，加载 .env 后调用 node src/index.js
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

# 加载 .env 文件中的环境变量
$envFile = Join-Path $ProjectDir ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and $line -notmatch '^\s*#') {
      $parts = $line -split '=', 2
      if ($parts.Count -eq 2) {
        $key = $parts[0].Trim()
        $val = $parts[1].Trim()
        if ($val -match '^"(.*)"$' -or $val -match "^'(.*)'$") {
          $val = $val.Substring(1, $val.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($key, $val, "Process")
      }
    }
  }
}

# 执行日报
$logFile = Join-Path $ProjectDir "report.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] 开始执行日报..." | Out-File -Append -FilePath $logFile -Encoding utf8

try {
  $output = & node (Join-Path $ProjectDir "src\index.js") 2>&1
  $output | Out-File -Append -FilePath $logFile -Encoding utf8
  "[$timestamp] 日报执行完成" | Out-File -Append -FilePath $logFile -Encoding utf8
} catch {
  "[$timestamp] 执行失败：$($_.Exception.Message)" | Out-File -Append -FilePath $logFile -Encoding utf8
  exit 1
}