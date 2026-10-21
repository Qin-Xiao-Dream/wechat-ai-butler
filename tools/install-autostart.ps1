# 注册/注销"欣爱（微信后端）"的开机自启。
#
# 用启动文件夹的快捷方式，而不是计划任务：**不需要管理员权限**，
# 和控制台自启（Agent 控制台.lnk）保持同一套做法。
# 延迟启动的逻辑放在 tools\autostart.py 里（等网络/代理就绪），所以这里只是放个快捷方式。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File tools\install-autostart.ps1            # 注册
#   powershell -ExecutionPolicy Bypass -File tools\install-autostart.ps1 -Remove    # 注销
#   powershell -ExecutionPolicy Bypass -File tools\install-autostart.ps1 -Status    # 查看

param(
    [switch]$Remove,
    [switch]$Status
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir '欣爱（微信后端）.lnk'
# pythonw 不写死路径。原来固定成 D:\py39\pythonw.exe，那是原作者机器的安装位置；
# 换一台机器就会生成"指向空文件"的快捷方式——开机后什么都不发生，而且不报错、不弹窗。
# 探测顺序：环境变量 PYTHONW → config/console.env 里 start_stack.py 记录过的解释器 →
#           PATH 里的 pythonw → %LOCALAPPDATA%\Programs\Python 下的安装 → 旧路径 D:\py39。
function Resolve-Pythonw {
    $candidates = @()
    if ($env:PYTHONW) { $candidates += $env:PYTHONW }
    $envFile = Join-Path $projectRoot 'config\console.env'
    if (Test-Path -LiteralPath $envFile) {
        $hit = Select-String -LiteralPath $envFile -Pattern '^\s*PYTHON\s*=\s*(.+?)\s*$' | Select-Object -First 1
        if ($hit) {
            $py = $hit.Matches[0].Groups[1].Value.Trim('"').Trim("'")
            if ($py) { $candidates += (Join-Path (Split-Path -Parent $py) 'pythonw.exe') }
        }
    }
    $onPath = Get-Command pythonw.exe -ErrorAction SilentlyContinue
    if ($onPath) { $candidates += $onPath.Source }
    $localPy = Join-Path $env:LOCALAPPDATA 'Programs\Python'
    if (Test-Path -LiteralPath $localPy) {
        $candidates += (Get-ChildItem -LiteralPath $localPy -Filter 'pythonw.exe' -Recurse -Depth 1 -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | ForEach-Object { $_.FullName })
    }
    $candidates += 'D:\py39\pythonw.exe'
    foreach ($c in $candidates) {
        if ($c -and (Test-Path -LiteralPath $c)) { return $c }
    }
    return $null
}

$pythonw = Resolve-Pythonw
# 查状态/注销不强依赖 pythonw：机器上没装也该能看清"到底注册没注册"。
if (-not $pythonw -and -not ($Status -or $Remove)) {
    Write-Host '[错误] 找不到 pythonw.exe，已放弃注册（不会留下指向空路径的快捷方式）。' -ForegroundColor Red
    Write-Host '       指定路径后重试：$env:PYTHONW = "C:\...\pythonw.exe"' -ForegroundColor Yellow
    exit 1
}
if ($pythonw) { Write-Host "pythonw: $pythonw" }
$entry = Join-Path $projectRoot 'tools\autostart.py'
# 走这个包装脚本，而不是直接跑 pythonw tools\autostart.py：
# pythonw 直接启动时**不带 PYTHONUTF8**，一旦 site-packages 里混进非 GBK 的 .pth
# （pip 的 editable 安装会写 UTF-8），python 会在 site 阶段就崩，自启静默失效。
$wrapper = Join-Path $projectRoot 'tools\autostart-hidden.ps1'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

function Show-Status {
    Write-Host "启动文件夹: $startupDir"
    Write-Host "快捷方式:   $shortcutPath"
    if (Test-Path -LiteralPath $shortcutPath) {
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut($shortcutPath)
        Write-Host "状态:       已注册"
        Write-Host "  目标:     $($link.TargetPath)"
        Write-Host "  参数:     $($link.Arguments)"
        Write-Host "  工作目录: $($link.WorkingDirectory)"
    } else {
        Write-Host "状态:       未注册"
    }
    if ($pythonw) {
        Write-Host "pythonw 存在: $(Test-Path -LiteralPath $pythonw)  ($pythonw)"
    } else {
        Write-Host "pythonw 存在: 未找到（注册会失败）"
    }
    Write-Host "自启入口存在: $(Test-Path -LiteralPath $entry)"
    Write-Host "包装脚本存在: $(Test-Path -LiteralPath $wrapper)"
}

if ($Status) {
    Show-Status
    exit 0
}

if ($Remove) {
    if (Test-Path -LiteralPath $shortcutPath) {
        Remove-Item -LiteralPath $shortcutPath -Force
        Write-Host "已注销开机自启：$shortcutPath"
    } else {
        Write-Host "本来就没有注册"
    }
    exit 0
}

if (-not (Test-Path -LiteralPath $pythonw)) {
    throw "找不到 pythonw.exe：$pythonw（自启需要它来避免黑框）"
}
if (-not (Test-Path -LiteralPath $entry)) {
    throw "找不到自启入口：$entry"
}
if (-not (Test-Path -LiteralPath $wrapper)) {
    throw "找不到包装脚本：$wrapper"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = '-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $wrapper + '"'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = '开机自启：拉起微信 harness 后端（欣爱）'
$shortcut.WindowStyle = 7          # 最小化；powershell 再以隐藏方式拉起 pythonw
$shortcut.Save()

Write-Host "已注册开机自启：$shortcutPath"
Show-Status
