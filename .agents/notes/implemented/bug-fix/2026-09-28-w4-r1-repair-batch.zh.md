# Agent Note: W4-R1 修复批次 — stepParams 兄弟键保留、实库 schema 恢复、member 零列 ACL 修复

Status: implemented

[English](2026-09-28-w4-r1-repair-batch.md) | 中文
- 日期：2026-09-29 · 批次：W4-R1（终验 70 分 FAIL 的定向清偿）
- 代码：`examples/kb-agent/scripts/nocobase-flow-page-lib.mts`（`applyTableDefaultSort` 兄弟键保留修复 + `callGetWithRetry`）；`examples/kb-agent/scripts/w4-r1-restore.mts`（三类实库 schema 恢复，幂等）；`examples/kb-agent/scripts/w4-r1-probe.mts`（只读线网探针，挂进 setup verify）；`examples/kb-agent/scripts/w4-r1-browser-evidence.mts` + `w4-r1-qc-browser.mts` + `w4-r1-interactions.mts`（复用 `platform/nocobase/node_modules` 的 playwright 取证）；`examples/kb-agent/scripts/w4-heal-b2.mts`（`SECTION_OVERRIDES` + 域单号占位符）；`examples/kb-agent/scripts/setup-nocobase.mts`（verify 增 w4r1 门禁）；`research/2026-09-28-w4-completeness/.b6-regression-drill.mts`（演练记录原子写入 + 历史保留）；五个 W4 Agent Note 规范化为 README 格式
- 证据：`examples/kb-agent/demos/w4-r1/`（board-*.png、todo-open-pin.png、qc-member-list-before/after.png、390-addnew.png、sort-interaction.png）；`research/2026-09-28-w4-completeness/w4-r1-verify.txt`

## 问题

终验 70 分两条 Critical：(1) W4 heal 的 `applyTableDefaultSort` 是第三个 stepParams 整键覆盖写入点——`stepParams: { resourceSettings: { init } }` 载荷替换整个对象（flowModels:save 为替换语义），抹掉 `tableSettings` 兄弟键：四个 KPI 看板丢 `dataScope` 板过滤（每个看板显示全部看板的行）、对账四块与 w1 待办表丢各自线网；(2) member（qc_inspector）质检单列表零业务列而数据 XHR 返回全行——旅程记录掩盖了的用户可见回归。

## 决策

1. **C1 修复是双层兄弟键保留**：`stepParams: { ...stepParamsBefore, resourceSettings: { ...resourceSettingsBefore, init } }`——与 B6 演练给 `assignFormDefaults`、B2 layout 写入的形态一致。全库扫描 89 个 `flowModels:save` 位点无第四个覆盖写入点（创建型写入豁免；全部更新型写入已读回合并）。
2. **实库恢复走定向脚本而非重放**：`w4-r1-restore.mts` 按预期 `tableSettings`（镜像 `nocobase-w9-dashboards.mts` 的 PAGES 规格）重写八个有线 w9kpi 表 + 重钉 w1 待办 `status=open`（镜像 `ensureTodoJumpLinks`），每次写入先 spread 现有 stepParams。w9 `--rollback` 全量重建会毁掉页面/图表/集合只为恢复两个键；重跑 w3-org-acl 会重置后续批次调过的无关 action 行。wms_lots 台账块无需恢复——其 PAGES 规格本无 tableSettings。
3. **member 零列根因是 `view` action 的字段白名单**：member 的 qm_inspections 行上 view 为 `["*","id"]` 而 list/get/create/update 为 26 字段全白名单。v2 列渲染的 `aclCheck(actionName 'view', fields [name])` 把 `"*"` 按字面量匹配（平台 `TableColumnModel.tsx` → `aclCheck.tsx`：检查失败即 `model.hidden`），于是全部业务列被隐藏，而服务端按 list/get 放行返回全行。诊断已现场排除备选：两角色 listMeta 一致（各26字段）、页面 grid 树字节一致、`dataSources:listEnabled` 一致。修复=把 view 行白名单对齐 list——一次 `rolesResourcesActions:update`，无需重启服务，新浏览器会话验证（17 列、14 行有据）。
4. **时点归因**：缺陷早于 B6——归档的 `vfy-b6-09-member-qc-list.png` 在 B6 时点已是孤「操作」列——且 W4 heal 不可能引入（heal 只写 flowModels 面；action 行 updatedAt 跨 09-27 23:44 至 09-29 01:44，其间 heal 运行未动 list/get/create/update）。J4/role-map/journey 措辞就地修正；旅程记录保留历史、追加勘误而非改写。
5. **演练记录原子落盘且留史**：`.b6-regression-drill.mts` 曾把自身 20 行报告（含演练 B 挖出的 stepParams 发现）截断为 3 行头。报告改为 tmp+rename 刷新并前置旧内容，重跑变为追加而非覆盖；git 里的 20 行正文已恢复，第二次运行残段作为归档尾保留。`listFlowModels` 增窄域传输级 GET 重试（ECONNRESET/socket hang up）——HTTP 错误仍致命。
6. **质检表单域模板**：B2 heal 接受按集合的分节覆盖——qm_inspections 拆「检验信息/结果与备注」、qm_nc_dispositions「处置信息/结果与备注」——单号占位符改用域真实前缀（如 QI-2026-0001、来源单号 RCV-…、如 QM-NC-2026-0001）而非通用 PO 示例。质检单 code 列另获 `sorter: true`（仅交互能力，-id 默认排序不动）——该页此前没有任何可排序列。
7. **五个 W4 Agent Note 规范化**为 README 格式（`# Agent Note:` 头、line 3 `Status: implemented`、`## Problem` 首节、`## Consequences`、`## Alternatives considered`）并配 zh 镜像与配对 sidecar；格式门禁 733/733 全过。

## 后果

- 验证全链绿：`setup-nocobase.mts verify` 挂载新 `w4r1 wires` 探针（4 板 dataScope + w1 待办钉 + w9kpi total=9 + member view 白名单对齐）随全部历史门禁通过；b9 链 s9 抽查（wfl 留痕 + movements 勾稽）与 `--assert-ledger` 平衡（49 组 203 流水）保持绿。
- 双键契约的 psql 证据：全部有线表的 `options->'stepParams'` 对 `resourceSettings` AND `tableSettings` 均为真；w1 待办行钉 `status=open` 且双键并存。
- 浏览器证据：各看板 list XHR 携带 `{"board":{"$eq":…}}` 且零外板行（各 20 行）；审批中心待办 list 携带 `status=open` 且 6 行全 open；member 质检单渲染 17 列（前后 PNG），C2 验收（≥5 业务列）作为探针脚本硬断言。
- **边界（记录未修）**：点击后的排序透传无法在浏览器内观测——服务端树对 code 列应答 `sorter: true` 且 `TableBlockModel.tsx` 把交互排序接进 list 请求，但 dev 会话的前端树缓存使列头排序器不物化（全新浏览器 context 亦然）。点击级断言以 deferred 腿留在脚本里；平台首屏排序缺口（B1）维持原状。
- **边界**：member 统计卡仍渲染「请配置图表」占位（`charts:queryData` 在 plugin-acl applyQueryPermission 下 403）——B3 记录的 L1 遗留，本批未动。
- 390px 新建入口平台形态正常：28×28 icon-only 按钮、`title="添加"`、在视口内——无需修复，此处留档。
- `w4-r1-restore.mts` 重跑收敛：已正确的线网记 `keep` 跳过；view 白名单段对齐后为 no-op。

## 备选与否决

- 用 w9 `--rollback` 全量重建恢复 dataScope——否决：为重写两个 stepParams 键而摧毁页面/图表/集合（及其种子）；定向 spread 写入精确恢复。
- 重跑 `nocobase-w3-org-acl.mts` 修白名单——否决：其 touch-through 按设计每次重写资源的一行，整矩阵重跑会重置后续批次调过的无关授权；一次对齐的 view 写入是最小面。
- 把零列缺陷归因于 W4 heal——证据否决：归档 B6 截图已显示该态，heal 从不触 rolesResourcesActions；勘误记录时间线。
