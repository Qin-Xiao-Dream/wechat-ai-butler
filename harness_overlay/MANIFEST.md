# harness_overlay 交付清单

本目录是"把 DeepSeek Harness 改成微信管家后端"的那一层改动，**用完整文件快照交付**，不用 `git apply`。

## 为什么不是补丁

`packages/webhook/webhook-weixin`（微信 iLink 适配器）以及 `tool-codex` / `tool-opencode` 等，
在我们自己的检出里是**本地提交新增**的包，官方仓库里没有这些提交、也没有对应的前像对象。
任何基于 `git diff` 的补丁都必然对不上（这正是 v1.1 的问题：25 个补丁文件 0 个可应用）。
所以这里改为"**把这些文件整份拷进去**"。

## 基线

| 项目 | 值 |
|---|---|
| 上游 tag（实测可用） | `dsh-v0.1.6-alpha.2` |
| 作者原始导入点 | `0e3e35b`（`chore: import upstream deepseek harness baseline`，非公开仓库提交） |
| 交付文件数 | 85 |
| 需要删除的旧文件 | 8（见 `delete.txt`） |

> **v1.3 更正**：早期快照实际只有 83 个文件——`runtime/weixinConnector.ts`（核心装配层）与
> `runtime/modelFailover.ts` 未随仓库发布。前者已从原始部署目录找回，后者依据
> `tests/modelFailover.spec.ts` 的规格重建（文件头有说明），并已重算 `MANIFEST.json` 的 SHA-256。
>
> **基线校正**：overlay 的 `tsconfig.host.json` 引用 `packages/util/lazy-require`，而该包在
> `dsh-v0.1.6-alpha.1` 中尚不存在、从 `alpha.2` 起才有；`apps/cli/package.json` 又停在
> `alpha.1` 的版本号。据此判断作者基线是 alpha.1 与 alpha.2 之间的 master 提交，
> 实测 **`dsh-v0.1.6-alpha.2`** 可用（仅需把 `packages/fs/tool-present` 改成
> `packages/deliverables/tool-present`，该包在 alpha.2 已迁移）。

> 我们的部署是在这个快照上开发的。上游如果大幅改动同名的包（尤其是 `packages/core/tools`、
> `packages/llm`、`packages/compaction`），覆盖后可能需要自己适配；`overlay_files` 里的文件是**完整内容**，
> 可以直接 diff 对照。

## 内容

```
harness_overlay/
├─ overlay_files/          # 85 个完整文件（按仓库内路径组织，直接覆盖）
├─ delete.txt              # 8 个我们在重构中删掉的旧文件（装完建议删掉）
├─ install.py              # 覆盖安装脚本（默认 dry-run）
├─ MANIFEST.json           # 每个文件的 SHA-256
└─ reference.diff          # 仅作人工审阅：相对基线 0e3e35b 的已跟踪文件差异（不含未跟踪文件）
```

| 目录 | 文件数 | 说明 |
|---|---|---|
| `packages/webhook/webhook-weixin/` | 66 | 微信适配器本体：iLink 协议、媒体加解密、会话宿主、入站/出站协调、时间线/图谱记忆、桥接工具、单消费者租约 |
| `packages/webhook/tool-codex/`、`tool-opencode/` | 3 + 3 | 外部 agent 工具（会话预校验、取消时杀进程树） |
| `packages/llm/llm/`、`packages/llm/llm-pi-ai/` | 4 + 3 | 中文短协议（zh-wire）、请求探测（probe） |
| `packages/compaction/compaction-basic/` | 3 | 压缩预算与摘要参数 |
| `packages/core/tools/`、`packages/sandbox*/`、`packages/ptc-runtime/`、`packages/interaction/user-approval/` | 36 + 32 | 工具注册表/沙箱/审批的适配改动 |
| `packages/bundle/base/`、`apps/cli/package.json`、`tsconfig.host.json` | 4 | 组合与应用入口 |

## 安装

```bash
# 1) 准备与基线同版本的检出（或自己适配的版本）
# 2) 覆盖文件（先 dry-run 看计划）
python harness_overlay/install.py --target /path/to/deepseek-harness
python harness_overlay/install.py --target /path/to/deepseek-harness --yes --delete

# 3) 装依赖并构建（构建同时做类型检查）
pnpm install
npm run build:lib:host

# 4) 跑微信适配器的测试
npx vitest run packages/webhook/webhook-weixin/tests
```

部署层（模型定义、密钥、人格补丁、启动器、控制台）**不在本目录**，见仓库根目录的 `config/`、`start_stack.py`、`console/`、`tools/`。

## 脱敏说明

- 已用真实 token / API Key / 账号指纹 / 微信 user id / 本机路径做全量指纹扫描：**0 命中**；
- 源码与测试里不含聊天记录；
- 测试夹具中的路径统一为合成路径（`C:\work\...`），仅用于验证路径编码，不含任何真实数据。
