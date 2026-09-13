# 批次 F5：收口回归——幂等双跑 + 全量门禁 + 证据归档 + Agent Note + 文档同步

> 隶属 [PLAN.md](PLAN.md)。前置：F1-F4 全部完成（F4 走降级路径也算完成）。本批不改产品行为，只做闭环验证与资产沉淀。结构对齐 [E4/E5 收口惯例](../../plans/acceptance-fixes-2026-09-13/04-closeout-regression.md)。

## 改动面

### 1. 现有库增量幂等双跑（不 reset，基调不变）

1. 依序重跑 F1-F4 种子脚本（f1 → f2 → f3 → [f4 图表段] → n18）：断言全部 kept / 孤儿 0 / 无重复挂载；
2. all 链端到端重跑：F 轮新增步骤外的既有步骤行为与 E6 基线一致（kept/无破坏）；重点回归 `nocobase-hub-modules.mts` 对新 flowPage 的跳过逻辑（E1 已有「flowPage 持有的 title 跳过 block 重放」，F 轮 15 页全部进入该路径——**这是 F 轮铺量后最可能暴露的既有交互**）；
3. 不做 reset 全链两轮（口径同 E4：F 轮无 fields 迁移、无新 collection——若 F3 补了 titleField 元数据则属 collections 元数据更新，仍非 schema 变更，口径不变）。

### 2. 全量门禁

| 门禁 | 说明 |
|---|---|
| `pnpm run typecheck` | F 轮 3-4 个新种子脚本的类型面 |
| `pnpm run lint` | oxlint 分区 |
| `pnpm run doc-sync` | QUICKSTART 双语 + 本计划文档链接 |
| `pnpm run test`（分区） | 预期 packages/* 零 diff；分区以实际 diff 为准 |
| `verify` 断言组 | v2 flowPage 期望值（25±分类维护形态）、`n18ai-` 按钮期望、既有 Portal/品牌/深链断言 |

按 dsh-pre-push-checks 原则匹配证据与改动面；只报告实际跑过的命令。

### 3. 证据归档

- `demos/acceptance-f{1..5}/`：F1 ≥6 / F2 ≥6 / F3 ≥8 / F4 ≥2（或降级探查存档）/ F5（幂等双跑实录 + 门禁 EXIT 清单）；
- `demos/acceptance-f/rollback-records.json` 终态归档；`probe-notes-f.md`（各批第 0 步探查结论汇总——它是后续轮次的 第一手输入，对齐 E1 probe-notes 惯例）。

### 4. Agent Note（非平凡变更义务）

1. **新 Note**：v2 视图区块升级机制（看板/日历工厂扩展 + fixture→直发映射方法 + 脊柱校验按页型扩展 + 多块页形态结论）——归 `.agents/notes/implemented/architecture/`，双语；
2. **修订 E1 Note**：[2026-09-13-nocobase-v1-to-v2-flowpage-upgrade](../../../.agents/notes/implemented/architecture/2026-09-13-nocobase-v1-to-v2-flowpage-upgrade.zh.md) 的「已知边界」节——「看板/日历/甘特保持 v1」改写为 F1 终态结论（看板/日历已升级、甘特边界依据修正为「server authoring 零支持」而非「无区块模型」）；英文版同步。

### 5. 文档同步

- QUICKSTART 双语：v2 页清单终态（25±）、甘特边界新表述、仪表盘双入口差异、AI 生成图表用法、工作台/分类维护新形态；
- handoff：[handoff-2026-09-10.zh.md](../../plans/handoff-2026-09-10.zh.md) 追加 0.f 节（F 轮修复清单 + 证据路径 + 遗留边界更新：甘特、Chart 降级结论（若有）、E 轮边界①的关闭）。

## 验收断言

1. 幂等双跑输出全 kept/孤儿 0（实录文件）；
2. 门禁表全部 EXIT=0（按实际 diff 裁剪后全绿，报告只列跑过的命令）；
3. 五个证据目录齐全、截图可打开且文件名自述；
4. 新 Agent Note 落盘且过 `verify-agent-note-classification`；E1 Note 修订完成（双语）；
5. `git log` 基线 `683d32a32d` 之上为 F1-F5 提交序列，每批独立可 revert；提交链不推送（维持口径）；
6. E 轮遗留边界①（看板/日历/甘特无 AI 入口）状态更新：看板/日历已关闭，甘特改述。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| hub-modules 重跑与新 flowPage 交互（跳过逻辑未覆盖某页型） | 中 | 双跑断言逐页 kept；发现即补 hub-modules 跳过分支（E1 先例：flowPage title 跳过） |
| all 链重跑暴露既有步骤非幂等（旧债） | 低 | 如实记录并区分归属；非 F 轮引入不阻塞（登记遗留项） |
| 长驻服务 inode 陈旧（BUG-4 惯例） | 低 | 验收前网关冒烟 5×200 + 探活重启 |
| 门禁 flaky | 低 | 空载重跑取证，不反复空转（D6 先例） |

**回滚**：本批无产品行为改动；任一门禁红则回到所属批次修复。
