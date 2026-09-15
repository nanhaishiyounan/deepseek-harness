# 批次 H6：AI 化覆盖新面 + 文档同步

> 隶属 [PLAN.md](PLAN.md)。前置：H1-H5。把本轮新增面对 AI 全覆盖（延续「AI 化覆盖新面」验收基调），并同步文档。规模：~8 文件改（配置/提示/文档）。

## 改动面 1：AI 覆盖新面盘点与补挂

1. **n18 全量重挂核对**：H4/H5 新表单（SRM 三表单+WMS 出入库两表单≈5+）已由 n18 扫挂——本批实测每表单头像球+一次中文流式填充（不全则查 formUid spine 完整性）。
2. **KG 新面 AI 入口**：agent 会话经 apiproxy 问「图谱质量/映射清单/本体版本」→ H3 的 kg.stats/kg.mappings 扩展可答——实测 3 问（质量数字/孤岛数/映射的 5 个 collection）。
3. **场景 tab 与业务系统联动（轻量，不建新基建）**：场景确认 Modal 起场景后，场景 probe 问题天然进会话（现有机制）；本批在精选场景文案/标签中补 2 个供应链场景描述与 SRM/WMS 呼应（改 scenarios.ts 需同步 [`scenario-catalog-sync.spec.ts`](../../scripts/scenario-catalog-sync.spec.ts) 对齐的 `examples/kb-agent/scenarios/` 目录——**若改 30 场景清单成本超预期则降级为不动场景目录，仅 QUICKSTART 叙述联动**，实施时按第 0 步评估）。
4. **AI 员工场景化（1 个，保守）**：复用 form-assistant 模式挂「供应商审核助理」语义（n18 已覆盖表单填充）；**不新增 AI 基建**——若要独立 AI 员工（读证照效期+评分建议）留 L 轮 AI 场景化批。

## 改动面 2：文档同步（doc-sync 面）

1. [`examples/kb-agent/QUICKSTART.zh.md`](../../examples/kb-agent/QUICKSTART.zh.md)：H 轮段（场景 tab、KG 管理/质量面、SRM/WMS 系统入口与演示剧本、kg-mappings.yml 迁移说明、SCHEMA_VERSION 3 运维注记）；
2. [`docs/subsystems/kb.md`](../../docs/subsystems/kb.md)：`ctx.kbGraph`/`ctx.kgBuild` 表面更新（版本化/mappings/qualityReport 新方法——gen-cordis-catalog 再生）；
3. Agent Note（非平凡变更义务）：① 场景 tab 迁移机制（view 座位 vs input.dock 座位语义）；② KG 本体版本化+映射文件化机制；③ 五系统工厂模式扩展（h4/h5 脚本骨架+JSBlockModel 探针结论）——三条分别落 `.agents/notes/implemented/`；
4. handoff 文档 `plans/handoff-*.zh.md` 惯例：H 轮交接段（0.h 节风格对齐 G 轮）。

## 验收断言（证据落 `demos/acceptance-h6/`）

1. 新表单头像球全量出现+填充实测（H4 3 个+H5 2 个，截图）；
2. KG 三问 agent 会话回答正确（质量/孤岛/映射清单，截图）；
3. QUICKSTART/kb.md 更新后 `pnpm run doc-sync` EXIT=0；
4. Agent Note 三条通过 `verify-agent-note-format`（pre-commit 门禁自然覆盖）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| scenarios.ts 变更触碰同步门禁（30 场景↔目录） | 低 | 降级路线：不动场景目录，仅文档叙述 |
| gen-cordis-catalog 再生波及其他 docs | 低 | 只再生受影响段；doc-sync 兜底 |

回滚：文档与配置独立提交，可单独 revert。
