# W 轮 R2 收尾批次 — 五项遗留修复记录

日期：2026-09-26 · 前序：B0~B9 + R1（证据在 `r1-evidence/`）· 本批次证据：`r2-01` ~ `r2-04`

## 逐项结果

| # | 任务 | 结果 | 关键证据 |
|---|------|------|----------|
| 1 | N21 悬空方括号 ×10 精确定位 | **修复 12 处**（验证器实报 ×10 全部命中 N21 demo 对；另发现 b5 note `[level2]` ×2 一并修复） | `r2-01-brackets/`（改进扫描器：剥离代码围栏+内联代码；before 12 → after CLEAN；format/classification 710 绿；pairing 1159 对重录后全绿） |
| 2 | 欢迎屏 16 表单文案对齐 | preset.yml capabilities 10→16 项（与 `registryCapabilityLine()` 派生口径逐字一致，含「质检记录→质检登记」名称纠正）；`.dsh` 镜像同步 identical | `r2-02-welcome/test.txt`（13 tests 含新增 16 表单全量断言；YAML 解析 count=16；mirror identical=true） |
| 3 | 单据 code 唯一守卫 | write.ts 引擎侧 fail-loud：`CODE_UNIQUENESS_COLUMNS` 列映射（5×`code` + `wms_receipts.receipt_no`，live 列名核实）+ `enforceCodeUniqueness()`（对称 `enforceCreateGates` 惯例，nb_create 写前查重） | `r2-03-code-guard/`（负例：重复 code 被拒且零写入 wire；31/31 tests；live 六集合存量重复=0） |
| 4 | 脚本域 fetch 超时 | `nocobase-flow-page-lib.mts` 的 `call()` 加 `AbortSignal.timeout`（默认 30s，`NOCOBASE_TIMEOUT_MS` 覆盖），具名超时报错 | `r2-04-timeout/evidence.txt`（挂死端口 + 150ms 极小超时：223ms 内 abort、报错含超时值与覆盖提示） |
| 5 | calc_date 日界对齐 | kpi-run.mts 三处 UTC「今天」（PRESENT_ONLY 判定/backfill 起点/--calc-kpi）统一 `shanghaiDate()`（UTC+8 分桶）；selftest 加 3 边界用例 | `r2-04-timeout/selftest.txt`（UTC 20:00=沪次日 04:00 归次日；UTC 15:59 归当日；UTC 16:00 翻日——全过） |

## 定位方法修正（任务 1 的教训）

R1 扫描未复现的原因：扫描器未剥离反引号内联代码（`[{path,...}]` 等合法类型注解被噪音淹没）且未覆盖 B9 触碰的 N21 demo 文件。R2 改进扫描器（`r2-scan-brackets.mjs`：跳过围栏+内联代码）后精确命中：`[路径]`后随 `` `文件名` `` 的死链残留形态（git diff 证实 B9 把 `[path](../../../../platform/...)` 的 url 剥掉留下 `[path]`）。

## 总门禁

- `setup-nocobase.mts verify`：OK（全链路 b0~b9 项全过）
- `pnpm vitest run packages/client/ui-mobile packages/connector/tool-nocobase`：**663/663 全绿**（≥660 达标）
- typecheck：tool-nocobase 0 错、ui-mobile 0 错
- oxlint（lefthook staged 配置 `.oxlintrc.staged.json`，改动 5 文件）：0 warnings 0 errors（默认配置实测 26 errors，全部为 B0~B9 未提交批次存量债务，行号全部落在既有函数区间，非本批引入、不在 staged 门禁内）
- note 门禁：format 710 绿 / classification 710 绿 / pairing 1159 对全一致（b5 双语修改后 `--write` 重录）
- 服务存活：:3080 → 200；:13110 → 响应（404 仅路由名不匹配，服务在）

## 改动文件（产品面 11，证据另计）

1. `examples/kb-agent/demos/nocobase-full-features/N21-attachment-visibility.md`（×5）
2. `examples/kb-agent/demos/nocobase-full-features/N21-attachment-visibility.direct-baseline.md`（×5）
3. `.agents/notes/implemented/architecture/2026-09-26-b5-mfg-planning-fcs.md` + `.zh.md` + `.i18n.yaml`（pairing 重录）
4. `examples/kb-agent/agent-presets/mobile-form-assistant/preset.yml` + `.dsh` 镜像
5. `packages/client/ui-mobile/tests/form-registry.client.spec.ts`（+1 断言块）
6. `packages/connector/tool-nocobase/src/write.ts`（+守卫 60 行）
7. `packages/connector/tool-nocobase/tests/tool-nocobase.spec.ts`（+2 测试、mock +pur_orders）
8. `examples/kb-agent/scripts/nocobase-flow-page-lib.mts`（+timeout；另：flowModels:list 的 pageSize 2000→6000——B9 后 flowModels 行数已逼近 2000 上限，w9 脚本按全量分页读取会静默截断，6000 与 setup-nocobase verify 的同一上限对齐；R3 补记声明）
9. `examples/kb-agent/scripts/kpi-run.mts`（+shanghaiDate、3 处替换、3 边界用例）
