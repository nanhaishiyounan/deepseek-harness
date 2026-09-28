# W4 轮交付总表 · 全平台表单表格完备性（B1–B6 全批次收官）

> 口径：用户原话「这不是演示系统，是要商业化实际交付的」「所有页面、所有表单/表格，还有其他，都要修改完善」。
> 验收双标准 = **量化基线 before/after 对拍全归零**（[w4-b6-baseline-after.txt](w4-b6-baseline-after.txt)）+ **八角色真实旅程任务完成性双证**（[w4-b6-journey.txt](w4-b6-journey.txt) + [w4-b6-psql.txt](w4-b6-psql.txt)）。
> 页面存在性截图不算数——每条旅程以「筛选生效 / 默认值落库 / 统计卡数值 == SELECT / Edit 往返一致 / 负例零落库」收口。

## 1. 用户反馈逐项处置结论

| # | 用户反馈（原话要点） | 处置 | 终验结论 |
|---|---|---|---|
| 1 | 「所有页面，不只是新增的」 | B1 表格全域（78 页排序 + 37 页筛选 + 150 金额列 + 100 关联列 + 16 状态列）+ B2 表单全域（105 表单）+ B3 页面层（67 页统计卡 + 18 图表标题）；27 个 n17/n13 老页同一套标准 | **✅ 全域归零**：无筛选页 0、无排序 0、金额无格式化 0/144、关联无标题 0/99、状态裸 Text 0、单列（L1/L2）0（21 单列全为 L3/小表单豁免，台账 [w4-b6-baseline-after.json](w4-b6-baseline-after.json)） |
| 2 | 「表单/表格按实际产品需求完善」 | L1–L4 分级 checklist（30 条行业标准裁剪）+ 八角色动线校准；完备性 ≠ 堆满 | **✅ 达标**：必填 308/952（≥260 目标）、placeholder 299、assignRules 61 表单、图表标题 148/148、统计卡 L1 30 页 ≥3 + L2 20 页 ≥1（17 无卡页全为 L3/L4） |
| 3 | 「该新增块插件就增加」 | FilterFormBlockModel（36 页）+ ChartBlockModel 统计卡（统计卡 130+）+ MarkdownBlockModel（说明/空态 30+）+ DividerItemModel 分节 | **✅ 断言固化**：filterFormBlocks ≥36、chartsNoTitle=0、L1 卡数 ≥3 全进 `setup verify`（w4b1/b3 断言族全绿） |
| 4 | 「原本的页面还是原样」 | 老页全量 heal 同标准；B4 结构治理（死页 2 退役 + 13 组重复页逐组裁决 + 4 改名）；B5 菜单 16→12 组 | **✅ 结构零回归**：flowPage 90（92−2 退役 CSV 留档）、12 组无空组无重复、icon 无空格无重复、93 页可达、routes 198 零孤儿 |
| 5 | 「商业化实际交付」 | B6 终验：量化对拍全表 + 八角色旅程 + 断言固化 verify + 回归拦截力演练 | **✅ 双标准全过**（本文档 §2/§3/§4） |

## 2. 量化基线 before/after 对拍全表（21/21 PASS）

完整表与豁免台账见 [w4-b6-baseline-after.txt](w4-b6-baseline-after.txt)（机器可读版 w4-b6-baseline-after.json）。要点：

| 基线项 | before | after |
|---|---|---|
| 表单单列（L1/L2） | 105/105 | **0**（21 单列全命中 L3/小表单豁免） |
| 必填率 | 17.7%（128/725） | **32.4%（308/952）** |
| 表格无筛选（页）/无排序 | 37/78 · 78/78 | **0 · 0** |
| 金额/日期列无格式化 | 150/150 · — | **0/144 · 0/63** |
| 关联列空/裸 ID | 100 列/51 页 | **0/99 列** |
| 状态裸 Text/无彩标 | 14+2 列 | **0 · 0** |
| 无统计卡（L1/L2 口径） | 67/78 | **L1/L2 缺卡 0**（17 无卡页全 L3/L4） |
| 图表无标题 | 18/18 | **0/148** |
| 菜单 | 16 组 N1–N8 八缺陷 | **12 组 · 空组 0 · 重复 0 · icon 异常 0** |
| 死页 | 1 | **0**（复活 0） |

## 3. 八角色旅程 J1–J8（8/8 全通）

逐旅程判定与证据链见 [w4-b6-journey.txt](w4-b6-journey.txt)（55 张截图 + 20 条 SQL 对拍 + 统计卡视觉读数 7/7 全中）：

| 旅程 | 角色 | 关键完成性证据 |
|---|---|---|
| J1 | 采购员 | 统计卡 4/4 视觉+psql 双对拍（3/10/¥1,474,740/22）；新建 PO-J1-737059 落库 `draft`+需求日期=当天；必填负例 22→22 零落库；筛选证据组合（B1 pilot 铁证 + w4b1 断言 + 13 张构建器截图） |
| J2 | 计划员 | 排序对拍（页首行 MPS-202610-01 == psql 同序首行）；行详情；MRP 快照可达 |
| J3 | 车间主任 | 关联列产品名（psql JOIN 一致，非裸 ID）；彩标 57 tag；排程明细（B4 改名页）+ 排产甘特 v1 |
| J4 | 质检员（member 端） | qc_inspector 菜单裁剪 + 页级围栏（routes 0 行）；卡对拍（待检 22/合格 40）；终端 iframe `:13110/terminals/inspect.html`（W3_TERMINAL_BASE 生效） |
| J5 | 仓管员 | 三卡双对拍（397,400/397,155/195）；千分位；筛选空列表空态引导 |
| J6 | 销售员 | 报价单必填负例 17→17 零落库；3 字段小表单（B2 豁免单列）；创建正例由 J1 同 assignRules 通道背书 |
| J7 | 财务 | four-ledger 彩标（DOM 7 样式类）；应收 Σ1,401,890 / 应付 Σ1,474,740 psql 对拍；图表标题由 w4b3 断言背书 |
| J8 | 管理员 | 员工 Edit 往返闭环（13800000001→13900000001→13800000001）；删除确认负例 6→6 零落库；审批流配置 admin 可见 |

双端：admin 全旅程 + member（qc_inspector）J4；390px 抽查 3 页（采购订单 1408px/质检单 2608px/库存查询 1558px 横向滚动可用）。

## 4. 断言固化与回归拦截力

- `setup-nocobase.mts verify` 全绿：w4b1~w4b5 五族断言 + W/W2/W3 全部历史断言（[w4-b6-verify.txt](w4-b6-verify.txt)）。
- **fails-loud 演练**（[w4-b6-regression-drill.txt](w4-b6-regression-drill.txt)）：A 轮删 FilterForm 块 → w4b1 断言红（filterFormBlocks 35<36 + pagesNoFilter=1）→ 幂等 heal 重建 → 绿；B 轮表单改回单列 → w4b2 断言红（singleColEligible=1）→ heal 恢复 → 绿。
- **演练附带产出（真缺陷根治）**：B2 heal 幂等重跑时 layout 重写与 assignFormDefaults 的 stepParams 互相整键覆盖（flowModels:save 为替换语义），导致 assignRuleGrids 61→60 静默回归（断言 floor=60 踩线未拦）。修复为兄弟键保留式写入（`{ ...stepParamsBefore, formModelSettings }` / `{ ...tree.stepParams, gridSettings }`）并自愈复验（61 回归 + 两键共存）。Agent Note 留档。

## 5. 零回归总验（全绿）

9 步链 s1–s9、`--assert-ledger`（49 组 203 流水 balanced）、trees anomalies=0、approval-engine/kpi-run selftest、verify（含 W4 新断言 + 全部历史）、typecheck（修复 examples 面 B3 遗留 exactOptionalPropertyTypes 后全绿）、oxlint staged——汇总 [w4-b6-final-gates.txt](w4-b6-final-gates.txt)。

## 6. 遗留表（登记在案，不阻塞交付）

| # | 项 | 说明 | 建议轮次 |
|---|---|---|---|
| L1 | member 统计卡上游 ACL 课题 | ChartBlock 查询走集合级 ACL，member 侧统计卡数值口径需按角色数据授权细化（当前 83 集合授权下卡片对 member 显示全量口径数字的页已由 W3 ACL 裁剪，卡本身口径文字标注兜底） | W5 |
| L2 | FilterForm 条件构建器自动化 | 采购订单页等 6+ 字段页渲染为条件构建器（+添加条件），自研组件无稳定自动化锚点；本轮以 B1 pilot 截图铁证 + 断言 + 13 张逐步截图组合取证。E2E 自动化需平台侧 test-id 支持 | 平台缺口 |
| L3 | n17 老页 3 字段小表单 | 报价单 create 为 3 字段（<4 字段 B2 豁免单列），无分节/关联选择；与 B2 标准表单形态差异已留档 | W5（若业务需要可扩字段） |
| L4 | 旅程测试数据 | J1/J6 旅程经 UI 创建的草稿单据（PO-J1-*）留在库中（草稿态不参与统计卡对拍口径前读数）；演示库可接受 | — |
| L5 | 生产性能复测 | W3 遗留 #4 延续（独立课题） | W5+ |
| L6 | 列级筛选 / 表格聚合行 / FormStep | D11 明确不做（平台缺口 + 统计卡替代已落地） | 平台缺口 |

## 7. W5 候选

1. **member 统计卡角色化口径**（L1 课题：卡片查询按 ACL 数据域过滤或按角色隐藏）。
2. **E2E 自动化锚点**：FilterForm 构建器 test-id、统计卡数值 DOM 化（canvas → 文本节点可断言）。
3. **配置页字段汉化深化**（W3 遗留 #3 已部分清偿，wfl 四表域剩余英文枚举）。
4. **生产性能复测**（W3 #4）。
5. **报价单等 n17 单据表单字段扩展**（若业务确认需要客户关联/有效期等字段）。

## 8. B1–B6 交付面索引

| 批次 | 主题 | 关键工件 |
|---|---|---|
| B1 | 表格标准全域（排序/筛选/格式化/关联/彩标） | w4-heal-b1.mts + heal-run-*.txt + rollback-drill |
| B2 | 表单标准全域（两栏/必填/默认值/占位/Edit/Delete） | w4-heal-b2.mts + journey 截图 |
| B3 | 页面层（统计卡/图表标题/说明/空态/iframe env） | w4-heal-b3.mts + page-levels.json 台账 |
| B4 | 结构治理（退役/重复页/改名/v1 决策） | w4-heal-b4.mts + verdicts.json + CSV 留档 |
| B5 | 菜单 IA（16→12 组 + 角色映射） | w4-heal-b5.mts + role-map.md |
| B6 | 终验（本批） | baseline-after + journey + verify + drill + final-gates + 本文档 |
