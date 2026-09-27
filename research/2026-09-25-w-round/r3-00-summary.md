# W 轮 R3 债务清偿批次 — 终验 PASS_WITH_DEBT 全项收口记录

日期：2026-09-26 · 前序：B0~B9 + R1 + R2（R2 见 `r2-00-summary.md`）· 本批次证据：`r3-01` ~ `r3-04`

## Important 5 项对照

| # | 债务 | 修法 | 结果 | 证据 |
|---|------|------|------|------|
| 1 | nb_update 侧门（改 code 绕过 create 守卫） | [`enforceCodeUniqueness`](../../../packages/connector/tool-nocobase/src/write.ts) 加 `excludeId`（查重读 ≤5 占用者、任一非自身行命中即抛 create 同款四要素消息）；nb_update 在编辑锁后、写入前接入；模块头+函数 JSDoc 标注侧门已封 | **收口**：撞号拒且零 update wire、新号放行、自身同值放行（excludeId）、非 code 字段零查重调用 — 3 新负例全绿 | `r3-01-update-guard/vitest-full.txt`（670/670） |
| 2a | TOCTOU 披露 | 守卫 JSDoc + write 模块头显式声明：create/update 路径 list→write 非原子 TOCTOU；缓解=引擎串行+fail-loud 重试；根治=DB 唯一索引 | **收口** | `git diff packages/connector/tool-nocobase/src/write.ts` |
| 2b | DB 唯一索引根治 | `setup-nocobase.mts` 新迁移段 `stepUniqueDocIndexes`：六守卫列（5×code + wms_receipts.receipt_no）各建部分唯一索引 `WHERE <col> IS NOT NULL AND <col> <> ''`（与守卫空号语义一致）；建前重复 preflight fail-loud（计数报错）；`IF NOT EXISTS` 幂等；挂 `all` 链 + 独立 `unique-indexes` 命令；`verify` 断言六索引在位。**取舍**：未用 NocoBase 字段 unique（元数据路线在既有安装不可靠），SQL 部分索引直接/幂等/可回滚 | **收口**：六索引建成；幂等重跑零变更；活体 REST 重复 code → **HTTP 400**（`订单号 already exists`）、空号 200 合法；回滚闭环 DROP → 重复落库 200 → 清理 → 重建 → 重复再拒 400 | `r3-02-unique-index/`（apply.txt / rerun-idempotent.txt / rest-negative.{mjs,txt} / rollback-demo.{mjs,txt} / verify.txt） |
| 3 | 镜像真测试 + spec 修正 | [`form-registry.client.spec.ts`](../../../packages/client/ui-mobile/tests/form-registry.client.spec.ts) 真读 `preset.yml`（readFileSync + js-yaml 自根 manifest createRequire 解析——非 ui-mobile 依赖）：capabilities[0] == `registryCapabilityLine()` 逐字；description 十六类按 formRegistry 顺序枚举；`.dsh` 镜像逐字节 identical；兜底 == preset 各行。头注释 fifteen→sixteen；原 verbatim 措辞标题改「derives from preset.yml capabilities」 | **收口**：4 新测试全绿 | `r3-01-update-guard/vitest-full.txt`（17/17 in file） |
| 4 | preset.yml description 口径 | 「十类（采购/请购/…）」→「十六类业务单据（采购单/请购单/收货单/供应商登记/质检登记/入库单/出库单/回款记录/移库申请/预留登记/BOM 登记/生产订单/领料登记/报工登记/完工登记/销售订单）」（formRegistry 实际顺序、斜杠分隔沿原文案风格）；`.dsh` 镜像同步 identical；agent.cordis.yml 头注释 fifteen→sixteen 一并对齐 | **收口** | `diff preset.yml .dsh镜像 → identical`（测试内断言） |
| 5 | 兜底对称 | [`colleagues.ts`](../../../packages/client/ui-mobile/src/client/colleagues.ts) `fillAssistantWelcome` 补第 5 条「查库存、看补货预警、报盘点实盘，一句话出报告卡」（与 preset 第 5 条逐字一致）；Welcome 接口 JSDoc (2-4)→(2-5)；极小单测断言兜底 capabilities == preset 解析结果 | **收口** | 镜像 describe 第 4 测（vitest-full.txt） |

## Minor 5 项对照

| # | 债务 | 修法 | 结果 |
|---|------|------|------|
| 6 | R2 补档 + R3 新档 | `2026-09-26-w-round-r2-write-guards` + `2026-09-26-w-round-r3-debt-closure` 各落三件套（md/zh.md/i18n.yaml，bug-fix/）；pairing `--write` 录制 | **收口**：format 712 绿 / classification 712 绿 / pairing 1161 对全一致 |
| 7 | dup-check.sh | `#!/bin/bin/zsh` → `#!/bin/zsh`；`CODE_UNIQUENESS_COLLECTIONS` → `CODE_UNIQUENESS_COLUMNS`（实际常量名） | **收口** |
| 8 | r2-00-summary 数字 | 「默认配置的 20 errors」→「实测 26 errors，全部为 B0~B9 未提交批次存量债务」 | **收口** |
| 9 | NOCOBASE_TIMEOUT_MS 报错 | import 时校验：非整数/零/负抛 `NOCOBASE_TIMEOUT_MS 必须为正整数毫秒，当前值 …（解析为 …）` | **收口**：abc/-5/0 三负例 + 150 合法值活体证据 `r3-04-minors/timeout-validation.txt`（正例见 `r4-02-timeout-valid-value.txt`：双正例 300000+150 → verify 全绿） |
| 10 | pageSize 声明 | r2-00-summary 改动文件 #8 补记：flow-page-lib `flowModels:list` pageSize 2000→6000（B9 后逼近 2000 上限、与 setup verify 同上限对齐；R3 补记声明） | **收口** |

## 总门禁

- `pnpm vitest run packages/client/ui-mobile packages/connector/tool-nocobase`：**670/670 全绿**（R2 基线 663 + 3 update 守卫负例 + 4 镜像测试）
- `setup-nocobase.mts verify`：**OK**（含新增六唯一索引断言；全链路 b0~b9 项全过）
- `pnpm run typecheck`：0 错
- staged oxlint（`.oxlintrc.staged.json`，27 改动 ts/tsx/mts）：**0 errors**（2 warnings 为 B 轮既有 unused-disable 指令，views.client.spec.tsx:946/959，非本批触碰行）
- note 门禁：format 712 绿 / classification 712 绿 / pairing 1161 对全一致（两份新档 `--write` 录制）
- 服务存活：:3080 → 200（dsh web）；:13000 NocoBase signIn 200（REST 负例实测走此端口）；:13110 approval-engine API 在（路由式 404 为正常形态，QUICKSTART :202）

## 改动文件（产品面 8，notes/证据另计）

1. `packages/connector/tool-nocobase/src/write.ts`（excludeId 守卫 + update 接入 + TOCTOU JSDoc ×2）
2. `packages/connector/tool-nocobase/tests/tool-nocobase.spec.ts`（+3 负例）
3. `examples/kb-agent/scripts/setup-nocobase.mts`（stepUniqueDocIndexes + unique-indexes 命令 + all 链 + verify 断言）
4. `packages/client/ui-mobile/tests/form-registry.client.spec.ts`（真读镜像测试 ×4 + 头注释/标题修正）
5. `packages/client/ui-mobile/src/client/colleagues.ts`（兜底第 5 条 + JSDoc ×2）
6. `examples/kb-agent/agent-presets/mobile-form-assistant/preset.yml`（description 十六类）
7. `examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml`（fifteen→sixteen）
8. `examples/kb-agent/scripts/nocobase-flow-page-lib.mts`（timeout 非法值校验）

另：`r2-03-code-guard/dup-check.sh`（shebang+常量名）、`r2-00-summary.md`（26 errors + pageSize 补记）、两份 Agent Note 三件套。
