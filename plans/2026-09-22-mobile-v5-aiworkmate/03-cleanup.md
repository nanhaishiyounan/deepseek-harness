# B3 · findings 一次性清尾 + 复验

> 上游：[02-acceptance.md](02-acceptance.md)（acceptance-report.md findings 清单）| 执行：修复 + 逐项复验 + 文档收口 | 产出：`research/2026-09-22-mobile-v5-aiworkmate/cleanup-report.md`

## 1. 批次目标

把 B2 findings 一次性清零（配方 F：全部修复不辩解、不顺手扩散范围），逐项给出复验证据，doc-sync 收口，v5 整体达到可交付状态。

## 2. 执行规则

1. **P0/P1 全修**；P2 逐条裁决：修复或转为显式记录（README 已知限制 / Agent Note / 后续 TODO），不允许无声消失。
2. 修复不顺手重构：每条 finding 的修复范围锁定在其复现路径涉及的最小文件集（dsh-find-simplifications 的边界纪律反向适用——不加新抽象）。
3. 修复引入的新行为若属非平凡变更，测试同步改（tests describe behavior）。
4. 振荡防线：若某 finding 修复后复验再 FAIL，停止第三次尝试，升级为显式记录 + 根因分析进 cleanup-report（不做无限修补循环）。

## 3. 复验协议（逐 finding）

- 每个 finding 一条复验记录：修复 diff 摘要 → 复现步骤重跑 → 证据（截图/命令输出）→ 判定 CLOSED 或 ESCALATED。
- 涉及视觉的 finding 复验必须重新截图（同名覆盖或 -fixed 后缀）。
- 涉及真实 API 的 finding 复验走 02 §2.2 剧本的对应步骤（不整段重跑，只跑受影响段 + 一次完整冒烟）。

## 4. 收口门禁

```sh
pnpm vitest run packages/client/ui-mobile
pnpm run typecheck && pnpm run lint
pnpm run test:web -- mobile
pnpm run doc-sync            # 文档收口（README/QUICKSTART/notes 链接与预算）
```

## 5. 最终交付检查单

1. acceptance-report 全部 findings 有 CLOSED/ESCALATED 判定，ESCALATED 有去向（已知限制/Note/TODO）。
2. `research/2026-09-22-mobile-v5-aiworkmate/` 目录完整：设计五阶段 + verify 截图族 + acceptance-report + cleanup-report。
3. 硬约束六条最终态复核（真实 LLM / v3 表单落库 / wire 无写 / PC 预览 / 两态 / 模拟不进 log）。
4. 文档终态：README 双语、QUICKSTART、mobile.ts/LoginView 注释、Agent Note v5、docs/config-catalog 与 web-server 叙述（如有涉及）。
5. git 提交规范（多 N 批次合并惯例，pre-commit 六道门禁通过）。
6. cleanup-report.md 落盘：findings 处置总表 + 复验证据索引 + v5 最终已知限制清单。
