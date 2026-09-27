# Agent Note: W 轮 R1 定向修复——tableSettings wire、fail-closed 列表读取与 rollback 前缀

Status: implemented

[English](2026-09-26-w9-r1-targeted-fixes.md) | 中文

## 问题

W 轮终验（84 分，code-review 40 + design-system 70 两维度 FAIL）定位了五个阻断缺陷与七个建议项，全部落在 B9 看板接缝上：`--rollback` 销毁零行（uid 过滤永不匹配）、留页检查误计他批次的块、列表读取对截断首页做对账、看板表格首屏落在最旧回算日、四页混板同显一份全集（filter 从未到达请求）。

## 决策

**v2 表块 filter/sort 的真实 wire 是 `stepParams.tableSettings.{dataScope,defaultSorting}`，不是 `resourceSettings.init.filter`。** `resourceSettings.init` 只把 dataSourceKey/collectionName 喂给 resource getter，停在那里的 `filter` 是死键。`tableSettings` flow 未声明 `on`/`manual`，引擎在 beforeRender 自动执行它：`dataScope` action 经 `resource.addFilterGroup` 应用三段式过滤组（`{logic, items: [{path, operator, value}]}`），`sortingRule` action 经 `resource.setSort` 应用排序。`flowModels:save` 全量替换 `stepParams`，因此每次 save 都携带完整对象。四页现在写 `dataScope.filter`（board `$eq`——页面维度；选它而非按页枚举 kpi_code 集合，是为了新增指标码不会让某页漏行）加 `defaultSorting.sort = [{field: 'calc_date', direction: 'desc'}]`。活体验证：每页的 `kpi_snapshots:list` 请求各自携带 board filter 与 `sort[]=-calc_date`，首屏即今日批次。

**所有列表读取 fail-closed。** kpi-run/w9-dashboards/h5-wms/w6-mfg-exec/mrp-run 的 `rowsOf` 在 `meta.total > rows.length`（或无 total 且返回行数恰为 pageSize）时抛错，不再静默对半个真值做对账——1982 行快照配 pageSize 1000 就是活的失败样本。`kpi-run` 导出纯函数门（`assertFullPage`）供 selftest 钉住两种负例；`reconcile` 以 pageSize 4000 读取。

**`--rollback` 匹配 `withN17Prefix` 实际铸造的前缀。** `withN17Prefix('w9kpi', tag)` 返回 `w9kpi${tag}${key}`——没有 `n17-` 分隔符——所以 `startsWith('n17-w9kpi')` 永不匹配；改为 `startsWith('w9kpi')`（w7mrp 惯例）。顺带修掉两条相邻死线：`collections:destroy` 的 `?cascade=true` 挂在第二个 `?` 后从未被解析（现为 `&`）；批次随集合一并删除 kpi_snapshots 只读守卫行。活体 rollback 销毁 88 个 spine 模型，TableBlock/TableColumn/RootPage/BlockGrid/chart 各类零残留，组与集合同清。

**留页检查加 uid 与 ownership 双重限定。** `pageHasBlock` 改用 lib 的 `batchScopedRows`（w9kpi 前缀排除同集合的他批次块——如 h5-wms 的 wms_lots 台账）加 `gridOwnerRoutes`/`blockOwnedByPage`（页面自身 route 排除共享 kpi_snapshots 的 w9 姊妹页）。

**验证器点名的口径修正。** `lot_pass_rate` 分母只计已判定 OQC 行（pending/空 result 不入——未判定批不是不合格批）；`PRESENT_ONLY` 补 pending_approvals/shortage_alerts/inbound_lines 三码，90 天回放不再把今日待办数复读到每个历史日。

## 后果

`tableSettings` wire 是本 harness 今后编排 v2 表块的模板；`resourceSettings.init.filter` 不得复现。`verify` 逐页断言该 wire（漂移的块带 rollback 指引 fail-loud）、断言只读守卫（admin 对 kpi_snapshots 收窄为 view/list/get/export——kpi-run 经 root token 仍是唯一写者）、断言 fail-closed 快照读取。business-advisor persona 补看板查询技能（Home「问经营」chip 不再落到没有该能力的同事）；KpiFacts 接口声明 workCenterCount/oqcInspections 与 ReportFact.duration_min，退役三处 `as` 断言逃逸。

## 备选方案

- **按页 kpi_code `$in` 过滤**——渲染结果相同，但枚举会在第一次新增指标码时与 KPI_DEFS 脱钩；board 列就是集合自带的页面维度。
- **截断时翻页而非抛错**——当前所有调用方都要完整集合；抛错文案写明该调大的 pageSize，真有调用方超出规模时再翻页。
- **重跑时静默改写旧 wire 块**——`flowModels:save` 全量替换 stepParams，部分修复难以推理；fail-loud 加 `--rollback`（两分钟、全程取证的可复跑重建）是确定性路径。
- **建议项「N21 死链残留悬空方括号 ×10」**——四种扫描模式（空 `[]`、`[文字]` 无后随 `(`、`\]` 转义、中文紧邻方括号）只命中合法类型/mermaid/KaTeX 语法；无法复现的目标不盲改，已在交付文档记录。

## 验证

`--rollback` 前后模型计数与零残留清扫（`r1-01/02/03`）；重建 + 90 天回填（1982 行）+ `nocobase-w9-dashboards.mts --verify` OK + `setup-nocobase.mts verify` OK（`r1-04..06、r1-08`）；`--reconcile` 输出正确 latest（今日）且无「（无行）」（`r1-07`）；`--selftest` 绿（含新增截断负例）；四页活体截图与 DevTools 网络面板 filter/sort URL（`r1-10..14`，`research/2026-09-25-w-round/r1-evidence/`）；`pnpm vitest run packages/client/ui-mobile packages/connector/tool-nocobase` 660/660；typecheck 与 oxlint 对全部触及文件 0 报错。
