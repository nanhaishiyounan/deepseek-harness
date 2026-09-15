# 批次 H7：终审回归（H 轮收口）

> 隶属 [PLAN.md](PLAN.md)。前置：H1-H6 全部。延续 G 轮终审模式。规模：纯验证+证据归档。

## 验收断言（证据落 `demos/acceptance-h7/`）

1. **幂等双跑**：
   - `setup-nocobase.mts`（含 H4/H5 扩断言）重放 ×2 全 kept（种子 marker 命中、flowModels kept-spine、n18ai- 计数稳定）；
   - `setup-dsh-data.mts` 全链 ×2（kg-build 指纹 skip、kg_build_runs 不新增非 skip 审计）；
   - kg-build.mts 断言电池全绿（含幂等二跑零漂移）。
2. **门禁全绿**：`pnpm run typecheck && pnpm run lint && pnpm run doc-sync` EXIT=0；`pnpm run test`（受影响包全量：client 组/kb 组/examples）；kg-tools/cold-blank-session 快照双跑一致。
3. **真机全回归**（:3080/:13000/:5432 + admin@nocobase.com/admin123）：
   - DSH 工作台：7 业务 tab（场景独立/他 tab 无 hero）+ 既有 tab 零回归（检索/入库/资产/连接器/图谱/业务）；
   - 图谱 tab：质量与映射面板+NL 模板查询；
   - NocoBase admin：既有 26 v2 页 + CRM/Hub Portal（G 轮资产）零回归 + H4/H5 新页（SRM 6 表 8 页+WMS 9 表 9 页）全活；
   - AI 面：n18ai- 新下限+悬浮球+新表单填充+KG 三问；
   - PG tail 无新增错误。
4. **两轮幂等基调**：H 轮种子/构建链第二轮重放零漂移（断言 1 的证据即两轮证据）。
5. **证据归档**：`demos/acceptance-h{1..7}/` 全量（每批 before/after 截图+断言输出）；H 轮 handoff 文档定稿。
6. **提交链**：每批独立提交、可独立 revert；H 轮提交链在 `0573e344ba` 之上叠加不推送（延续惯例）。

## 风险

| 风险 | 等级 | 预案 |
|---|---|---|
| 终审发现批间交叉回归（H1 快照 vs H3 面板同页） | 低 | H1 在前 H3 在后的排程已解耦；终审发现问题回对应批修（最小修+文档对齐模式） |
| verify 计数类断言漂移（n18ai- 手工配置按钮混入） | 低 | KNOWN_HAND_CONFIGURED_AI_BUTTONS 白名单机制沿用 |
