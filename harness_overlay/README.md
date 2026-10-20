# harness_overlay：对 DeepSeek Harness 的改动（完整文件快照）

后端是 **DeepSeek Harness**。本目录是"把它改成微信管家后端"的那一层改动。

> **安装请看 [`MANIFEST.md`](MANIFEST.md)**：里面写清了基线提交、文件清单、安装步骤与脱敏说明。

## 这里是什么

```
harness_overlay/
├─ overlay_files/     # 85 个**完整文件**（按仓库内路径组织，直接覆盖到检出里）
├─ delete.txt         # 我们在重构中删掉的 8 个旧文件（装完建议删掉）
├─ install.py         # 覆盖安装脚本：默认 dry-run，加 --yes 才写盘
├─ MANIFEST.md        # 基线、清单、步骤、脱敏说明
├─ MANIFEST.json      # 每个文件的 SHA-256
└─ reference.diff     # 仅作人工审阅：相对基线的**已跟踪文件**差异（不含未跟踪文件）
```

## 为什么不是 `git apply` 补丁

`packages/webhook/webhook-weixin`（微信 iLink 适配器）和 `tool-codex` / `tool-opencode`
在我们自己的检出里是**本地提交新增**的包，官方仓库没有这些提交，也没有对应的前像对象。
所以任何 `git diff` 形式的补丁都必然打不上（v1.1 就是栽在这里：0 个可应用）。
完整文件快照不依赖 git 历史，直接覆盖即可。

## 一分钟安装

```bash
python harness_overlay/install.py --target /path/to/deepseek-harness           # 看计划
python harness_overlay/install.py --target /path/to/deepseek-harness --yes --delete
cd /path/to/deepseek-harness
pnpm install && npm run build:lib:host
npx vitest run packages/webhook/webhook-weixin/tests
```

部署层（模型定义 / 密钥 / 人格补丁 / 启动器 / 控制台）不在本目录，见仓库根目录的
`config/`、`start_stack.py`、`console/`、`tools/` 与 `docs/`。
