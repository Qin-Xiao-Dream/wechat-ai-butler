"""把 harness_overlay/overlay_files 覆盖安装到一份 DeepSeek Harness 检出。

为什么是"覆盖文件"而不是 `git apply` 补丁：
本仓库的微信适配器等包，是在我们自己的检出里用本地提交加进去的，官方仓库并不存在
那些提交；任何 `git diff` 形式的补丁都必然对不上（前像对象缺失）。完整文件快照
不依赖 git 历史，只要上游 API 大致一致就能装上。

用法：
    python install.py --target "D:\\code\\deepseek-harness"            # 先看计划（不写盘）
    python install.py --target "D:\\code\\deepseek-harness" --yes      # 真正复制
    python install.py --target "D:\\code\\deepseek-harness" --yes --delete   # 同时删掉 delete.txt 里的旧文件

参数：
    --target   目标 harness 检出目录（必须含 pnpm-workspace.yaml 或 apps/cli/src/bin.ts）
    --yes      真正写盘（不加只做 dry-run，打印将要覆盖/新增的文件）
    --delete   同时删除 delete.txt 里列出的文件（我们在重构中删掉的旧文件）
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OVERLAY = ROOT / "overlay_files"
DELETE_LIST = ROOT / "delete.txt"


def looks_like_harness(path: Path) -> bool:
    """粗判目标目录是不是一份 harness 检出。"""
    return (path / "pnpm-workspace.yaml").is_file() or (path / "apps" / "cli" / "src" / "bin.ts").is_file()


def overlay_files() -> list[str]:
    """列出覆盖层里的全部相对路径。"""
    result: list[str] = []
    for current, _dirs, names in os.walk(OVERLAY):
        for name in names:
            full = Path(current) / name
            result.append(str(full.relative_to(OVERLAY)).replace("\\", "/"))
    return sorted(result)


def main(argv: list[str]) -> int:
    """执行安装（默认 dry-run）。"""
    parser = argparse.ArgumentParser(description="把 overlay_files 覆盖到 harness 检出")
    parser.add_argument("--target", required=True, help="harness 检出目录")
    parser.add_argument("--yes", action="store_true", help="真正写盘")
    parser.add_argument("--delete", action="store_true", help="同时删除 delete.txt 里的旧文件")
    args = parser.parse_args(argv)

    target = Path(args.target).resolve()
    if not target.is_dir():
        print(f"目标目录不存在：{target}")
        return 2
    if not looks_like_harness(target):
        print(f"目标看起来不是 harness 检出（缺 pnpm-workspace.yaml 与 apps/cli/src/bin.ts）：{target}")
        return 2
    if not OVERLAY.is_dir():
        print(f"找不到 overlay_files：{OVERLAY}")
        return 2

    files = overlay_files()
    removed = []
    if DELETE_LIST.is_file():
        removed = [line.strip() for line in DELETE_LIST.read_text(encoding="utf-8").splitlines() if line.strip()]

    created = [rel for rel in files if not (target / rel).exists()]
    replaced = [rel for rel in files if (target / rel).exists()]
    print(f"目标：{target}")
    print(f"覆盖层文件：{len(files)} 个 → 新增 {len(created)}、覆盖 {len(replaced)}")
    print(f"删除清单：{len(removed)} 个（{'会删除' if args.delete else '默认不删，只提示'}）")

    if not args.yes:
        print("\n[dry-run] 将要覆盖的文件（前 20 个）：")
        for rel in (created + replaced)[:20]:
            print("  " + rel)
        if removed:
            print("\n[dry-run] delete.txt 内容：")
            for rel in removed:
                print("  - " + rel)
        print("\n加 --yes 才会真正写入。")
        return 0

    for rel in files:
        source = OVERLAY / rel
        destination = target / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    print(f"\n已写入 {len(files)} 个文件。")

    if removed:
        if args.delete:
            for rel in removed:
                path = target / rel
                if path.is_file():
                    path.unlink()
                    print(f"  已删除 {rel}")
        else:
            print("\n下面这些文件在我们的版本里已删除，建议一并删掉（或加 --delete）：")
            for rel in removed:
                marker = "" if (target / rel).exists() else "（已不存在）"
                print(f"  - {rel} {marker}")

    print("\n下一步：")
    print("  1) pnpm install")
    print("  2) npm run build:lib:host      # 类型检查 + 打包到各包的 lib/")
    print("  3) npx vitest run packages/webhook/webhook-weixin/tests")
    print("  4) 部署配置（模型/凭据/人格补丁）按仓库根目录的 config/ 示例自行准备")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
