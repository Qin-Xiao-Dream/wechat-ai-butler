# tools/ · 维护脚本

这些脚本**原先散落在系统临时目录**（`%TEMP%\opencode\`），被项目里的代码引用着——
等于项目依赖了随时可能被清理、且写满本机绝对路径的外部文件。现在收进项目内并脱敏：

- 不写死任何本机绝对路径（`C:\Users\<某人>`、`D:\py39`、`G:\...`）
- 用 `Path(__file__)`、`Path.home()`、环境变量推导位置
- 不含密钥、token、聊天内容

## 脚本清单

| 脚本 | 用途 |
|---|---|
| `stop_stack.py` | 停止欣爱（harness）进程；被 `switch_model.py` 与控制台复用。**会先写"暂停守护"标记**（`--no-pause` 可跳过，给"重启"用） |
| `stop_all.py` / `stop_all.cmd` | **全部停止：先关前端（控制台/守护），再关后端（harness + 本地 Gemma）** |
| `inject.py` | 向本机调试注入口（默认 3081）发消息，免真手机联调 |
| `check_state.py` | 只读查看：发送队列、投递、租约、时间线/图谱规模 |
| `trace_pipeline.py` | 追踪一条消息的完整链路（哪一步卡住一眼可见） |
| `reset_weixin_state.py` | 清调试数据（**默认不动长期记忆**，要清加 `--purge-memory`） |
| `bench_memory.py` | 时间线写入性能基准（防写入变慢拖住主链路） |
| `make_backup.py` | 参数化版本备份（替代历史上散落的一串 `make_backup_vNN.py`） |
| `autostart.py` | **开机自启入口**：等网络/代理就绪后拉起 harness（见下） |
| `autostart-hidden.ps1` | 自启的"带环境变量"包装：设 `PYTHONUTF8=1` 后隐藏拉起 `autostart.py` |
| `install-autostart.ps1` | 注册/注销/查看自启快捷方式（`-Remove` / `-Status`） |

## 后端守护（心跳）与"停不干净"的坑

控制台里跑着一个**后端守护**：每 30 秒真发 HTTP 探活 3080/3081，连续失败 3 次就自动重启整条链路
（冷却 5 分钟、每小时最多 4 次）。参数与日志在 `config/heartbeat.json`、`runtime/heartbeat.log`，
界面上是「服务状态」页的 **后端守护（心跳）** 卡片。

由此有一条必须遵守的约定：**想停后端，就得先让守护让路**，否则它几秒内会把服务拉回来
（表现为"怎么关都关不干净"）。各条路径都已经处理好了：

| 你的动作 | 守护的表现 |
|---|---|
| 控制台点「停止后端服务」 | 自动暂停（写 `runtime/guardian.pause`） |
| 命令行跑 `tools\stop_stack.py` | 先写暂停标记，再停 |
| `tools\stop_all.py`（关机前/想全关） | ①写暂停标记 → ②关前端（守护随之消失）→ ③关后端 |
| 进程自己崩了 | **自动重启**（这是它的本职） |

恢复自动重启：控制台卡片点「恢复自动重启」（会删掉标记），或直接删 `runtime/guardian.pause`。
标记是持久的，**控制台重启也照样有效**。

## 开机自启（欣爱后端）

启动文件夹里的 `欣爱（微信后端）.lnk` → `powershell -File tools\autostart-hidden.ps1` →
（设好 UTF-8 环境后）隐藏拉起 `pythonw tools\autostart.py`。**不需要管理员权限**。

为什么中间要加一层包装脚本：Windows 上 pip 的 editable 安装会把 `.pth` 写成 **UTF-8**，
而 Python 默认按系统 GBK 读 `.pth` —— 这台机器上真实发生过（别的项目装的
`__editable__.aiec-*.pth` 带中文路径），结果是**任何 python 命令都启动失败**、自启静默失效。
所以凡是我们拉起 Python 的地方（自启、控制台启停、守护重启）统一带 `PYTHONUTF8=1`。

`autostart.py` 解决三件事，所以别直接把 `start_stack.py` 丢进启动文件夹：

1. **延迟启动**：开机时网络/代理（Clash 127.0.0.1:7897）常常还没起，启动器的代理探测与微信
   token 探活会得到错误结论。默认等 45 秒（`--delay` 可改）。
2. **没有黑框**：`pythonw` 下没有控制台，`print` 无处可去；脚本把 stdout/stderr 接到
   `runtime/autostart.log`，出问题能查。
3. **幂等**：端口已在监听就什么都不做（手动启动过、或控制台拉起过，都不会重复拉一套）。

```powershell
# 注册 / 注销 / 查看
powershell -ExecutionPolicy Bypass -File tools\install-autostart.ps1
powershell -ExecutionPolicy Bypass -File tools\install-autostart.ps1 -Remove
powershell -ExecutionPolicy Bypass -File tools\install-autostart.ps1 -Status

# 自启入口自身
python tools\autostart.py --check          # 只体检，不启动
pythonw tools\autostart.py --delay 90      # 手动按自启方式拉起
```

## 用法示例

```bash
python tools/check_state.py                 # 先看链路是否健康
python tools/inject.py "帮我查一下房租"      # 注入一条测试消息
python tools/trace_pipeline.py              # 追踪最近一条消息
python tools/bench_memory.py                # 写入性能回归
python tools/make_backup.py v3.6 "说明"     # 备份
```

## 没有收回来的东西

系统临时目录里还有约 200 个**一次性探针与数据转储**（`session_dump.txt`、`*_probe.jsonl`、
各类 `dump_*` / `probe_*` 实验脚本）。它们**故意不收进项目**，原因有二：

1. 多数含**聊天原文、会话导出、token 片段**——收进项目等于把隐私搬进仓库；
2. 它们是针对当时那个问题的一次性实验，没有复用价值。

需要时留在临时目录即可；项目运行不依赖它们。
