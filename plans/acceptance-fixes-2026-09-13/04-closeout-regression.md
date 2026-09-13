# 批次 E4：收口回归——幂等双跑 + 全量门禁 + 证据归档 + Agent Note + 文档同步

> 隶属 [PLAN.md](PLAN.md)。前置：E1-E3 全部完成。本批不改产品行为，只做闭环验证与资产沉淀。

## 改动面

### 1. 现有库增量幂等双跑（不 reset，基调不变）

1. 依序重跑 E1-E3 涉及的种子脚本（e1 → n18 → n17 卡片段）：断言全部 kept / update 0 / 孤儿 0 / 无重复挂载；
2. all 链端到端重跑一遍（[`setup-nocobase.mts`](../../examples/kb-agent/scripts/setup-nocobase.mts) 的 all 入口）：除 E1/E3 新增步骤外，其余步骤行为与 D 轮 D6 基线一致（kept/无破坏）；
3. 不做 reset 全链两轮——D 轮 D6 已实证 reset 链，E 轮不新增结构性 schema 变更（无 fields 迁移、无新 collection），reset 回归留给下一次触碰 schema 的轮次。

### 2. 全量门禁

| 门禁 | 说明 |
|---|---|
| `pnpm run typecheck` | 种子脚本/portal fork 改动的类型面 |
| `pnpm run lint` | oxlint 分区（E2 portal diff 面重点） |
| `pnpm run doc-sync` | QUICKSTART 双语 + 本计划文档链接 |
| `pnpm run test`（分区） | webserver 分区（E2 若碰代理面则必跑；E 轮预期不碰 webserver 代码——若 E2 实施确未改 packages/ 下代码，分区范围以实际 diff 为准） |
| `verify` 既有 Portal/NocoBase 断言组 | 品牌面/PORTAL_BASE/深链 fallback 回归兜底 |

按 [dsh-pre-push-checks](../../.agents/skills/dsh-pre-push-checks/SKILL.md) 原则匹配证据与改动面：种子脚本与 portal fork 是本轮主面，packages/* 预期零 diff。

### 3. 证据归档

- `examples/kb-agent/demos/acceptance-e{1,2,3,4}/`：E1 ≥6 张（悬浮球/AI 按钮/owner 下拉 AI 员工/提交后表格行/任务列表同款/看板 v1 回归）、E2 ≥3 张、E3 ≥2 张、E4（幂等双跑实录输出 + 门禁 EXIT 码清单）；
- E1 的第 0 步探查结论（m2o/date 模型形态、fields.target 报错定性、uiSchemas 孤儿行为）归档 `examples/kb-agent/demos/acceptance-e1/probe-notes.md`——它是后续轮次（看板 v2 化等）的第一手输入。

### 4. Agent Note（非平凡变更义务）

E1 落 1 篇：admin v1→v2 页面升级机制（工厂复刻 + kind 扩展边界 + n18 自动挂载复用 + 「同名 kept」幂等模式），归 `.agents/notes/implemented/` 对应分类（NocoBase 侧机制与既有 N17/N18 note 同区）；分类按 [dsh-archive-agent-notes](../../.agents/skills/dsh-archive-agent-notes/SKILL.md) 规范。E2/E3 为局部修复，随 PR 描述即可，不单独立 note。

### 5. 文档同步

- QUICKSTART：E1 已知边界（看板/甘特 v1 无 AI 组件）+ E2 配置引导 + E3 定位节，三批已落，本批只做最终一致性检查（一屏导览顺序合理、无重复陈述）；
- handoff：若维护 handoff 文档（plans/handoff-*.md 链），追加 E 轮条目（修复清单 + 证据路径 + 遗留边界：看板 v2 化、fields.target 版本错配定性结论、portal-sdk settings 形态上游依赖）。

## 验收断言

1. 幂等双跑输出全 kept/update 0/孤儿 0（实录文件）；
2. 门禁表全部 EXIT=0（或按实际 diff 裁剪后全绿，报告只列跑过的命令）；
3. 四个证据目录齐全、截图可打开且文件名自述；
4. Agent Note 落盘且通过分类校验（`verify-agent-note-classification`）；
5. `git log` 基线 `14fc2f01d6` 之上为 E1-E4 提交序列，每批独立可 revert；提交链仍不推送（维持 D 轮口径，推送由用户决定）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| all 链重跑暴露既有步骤非幂等（与 E 轮无关的旧债） | 低 | 如实记录并区分归属；非 E 轮引入则不阻塞本批（登记为遗留项） |
| 长驻 :3080/:13000 服务批次间 inode 陈旧（BUG-4 惯例） | 低 | 验收前探活重启（QUICKSTART 义务，D 轮惯例） |
| 门禁在并行资源争抢下 flaky（D6 先例：5 个 flaky 空载重跑全过） | 低 | 空载重跑取证，不反复空转 |

**回滚**：本批无产品行为改动，无需回滚；任一门禁红则回到所属批次修复。
