# 批次 D6：收口回归 —— 增量幂等 + reset 全链两轮幂等 + 全量门禁 + 文档终态

> 隶属 [PLAN.md](PLAN.md)。前置：D1-D5 全部合入。延续 C5 收口语义，新增「现有库增量幂等」实证（本轮无损要求的验收闭环）。

## 步骤

1. **现有库增量幂等双跑**（D1-D4 全部脚本在用户当前库上再各跑一遍）：
   - `node --import tsx/esm examples/kb-agent/scripts/nocobase-hub-modules.mts`（二跑断言全 kept/skip：迁移段检测 assignee 为 belongsTo 即跳过、加列段全 skip、新表存在即跳过）；
   - [setup-nocobase.mts](../../examples/kb-agent/scripts/setup-nocobase.mts) verify 全绿（含 D1/D2/D4 新断言组）；
   - [nocobase-n17-alignment.mts](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts) users 段二跑 skip；[nocobase-portal-deploy.mts](../../examples/kb-agent/scripts/nocobase-portal-deploy.mts) 双跑树哈希一致。
2. **reset 全链两轮幂等**（破坏性：drop 库重装 + 删三份 sqlite + 重启双网关——**会清掉用户演示期产生的数据**，执行前在收口实录中明示并留 PG 行数快照存档）：
   ```sh
   rm -f examples/kb-agent/workspace/{kg-graph,kb,lakehouse-catalog}.sqlite*
   node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts reset
   node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts   # 首跑
   node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts   # 二跑全 kept
   node --import tsx/esm examples/kb-agent/scripts/nocobase-portal-deploy.mts
   ```
   断言：两跑 EXIT=0；二跑全步 kept/skip。迁移算法两条建库路径都要验证：存量库走「string→迁移→belongsTo」三步（D1 已实测），全新库建表时声明即 belongsTo、ensurePortalFields 段检测即跳过——reset 首跑即全新库路径实测，二跑必须全 kept。`sqlite3` 直查 `kg_nodes>0`；users 行数 = Super Admin + 4 人名 + 9 AI 员工。
3. **用户视角复验**（重启网关后，:3080 + :13000 双入口，零 console error）：
   - hub Portal 全模块走查：我的任务有数据、任务表单 assignee 可选 AI 员工并提交、workload 分桶、知识库四页排序、资产/维保/人事/销售线索/采购单页面有数据、checklist 渲染；
   - CRM Portal 四页 + deals 详情（follow_ups/activities dealId filter）+ targets 页有数据；
   - 深链直开/刷新四条路由 200（D3 断言集复跑）；
   - 品牌面：portal header/侧栏/title/`DSH食品业务平台`、admin favicon、twitter:image 200；
   - 图谱：kg 三世界一致（网关 ≡ 磁盘）+ D5 证据归档确认；
   - 截图实录落 `examples/kb-agent/demos/acceptance-d6/`。
4. **全量门禁**：
   - `pnpm run test`（按改动面分区：webserver / kb-agent 脚本相关 / scenario 双门禁）；
   - `DSH_BUILD_CLIENT_PROFILE=official pnpm run build && pnpm run test:web`（品牌守卫契约；hmr-live 上游豁免维持）；
   - `pnpm run typecheck && pnpm run lint && pnpm run doc-sync`；
   - 五场景 demo `demo-full-journey.mts` 全 PASS（场景 3 flaky 边界：重跑即绿）；
   - lefthook pre-commit 每批提交零绕过（oxlint 折行/EOF 单空行/third-party-notices 再生）。
5. **文档终态**：
   - [handoff-2026-09-10.zh.md](../handoff-2026-09-10.zh.md) 0.a 追加 D 轮终态；**遗留债五项逐条勾销**（深链✓、fork 文案✓、hub schema 核验✓——本轮以 R1 全量扫描对齐替代"对上游核验"，口径写明、图谱真实点击✓、twitter:image/favicon✓）；0.b 归因表述修正（D5 已做则核对）；
   - [QUICKSTART.zh.md](../../examples/kb-agent/QUICKSTART.zh.md)：入口表更新（深链可直开）、已知边界更新（users 含 AI 员工与 4 人名行、枚举差异若降级则声明）、白标节补 portal fork 文案口径；
   - 本 PLAN 批次勾选 + 实录路径；
   - Agent Note：D1 字段迁移算法与前端 FK 合同（非平凡）、D3 深链 fallback 层裁决、D5 归因修正——按 [notes/README.md](../../.agents/notes/README.md) 规范。
6. `pnpm run doc-sync` 终验 EXIT=0。

## 验收断言

步骤 1-4 全绿 + 证据文件存在 + 文档链接可解析。缺任一即不通过。

## 风险与回滚

| 风险 | 预案 |
|---|---|
| reset 清用户演示数据引发验收争议 | 执行前行数快照存档 + 实录明示；用户点名"无损"针对修复过程（D1 已在现有库完成），收口幂等实证是既有惯例 |
| 全新库迁移路径与存量库路径分叉（全新库走声明式 belongsTo、存量库走迁移段） | 二者共用 ensurePortalFields 终态断言（字段 type=belongsTo + FK 名正确）；D6 步骤 2 首跑即全新库路径实测 |
| 全量 test 本机既有环境红 | 分区单跑取证 + CI 持矩阵（上轮 F9 定性维持） |
| 长驻网关批次间旧 inode | 每个数据面/服务端批次验收前探活重启（QUICKSTART reset 节义务） |
