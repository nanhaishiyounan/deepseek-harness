# Agent Note：W4-B6 回归演练挖出 FormGrid stepParams 整键覆盖缺陷，终验口径重立为「量化归零 + 任务完成性」双标准

Status: implemented

[English](2026-09-28-w4b6-form-grid-stepparams-key-clobber.md) | 中文

## 问题

W4-B6 终验的回归拦截力演练（人为删一个 FilterForm 块 → 断言应变红 → 幂等 heal 恢复 → 回绿）红腿如预期拦截，但恢复腿丢了数据：`w4-heal-b2.mts --all` 重跑后 `assignRuleGrids` 从 61 静默掉到 60，且没有任何断言报警（floor 恰好是 60）。根因：`/api/flowModels:save` 对 `stepParams` 是整键替换语义，而 B2 的两个写入点各自只带自己那半边——layout 重写只发 `stepParams: { gridSettings }`，`assignFormDefaults` 只发 `stepParams: { formModelSettings }`（它明明读了 `stepParamsBefore` 来算 pending 规则，save 时却没合并回去）。谁后写谁赢：首次全量 heal 以 assignRules 收尾（所以审计快照里 grid 只有 `formModelSettings` 没有 `gridSettings`），幂等重跑只缺 layout 时跳过 assignRules 写入、把它覆盖掉了。同形态的潜伏缺陷还有 `statCardRaw` 调用处：B3 时期的 `unitPrefix/unitSuffix/decimals` 可选 props 违反 `exactOptionalPropertyTypes`，直到未入库的 W4 全量代码第一次撞上完整 host typecheck 才浮出。

## 决策

把 `flowModels:save` 的 stepParams 当替换语义对待，两个写入点都改成兄弟键保留式展开（`assignFormDefaults` 写 `{ ...stepParamsBefore, formModelSettings }`；B2 layout 写 `{ ...tree.stepParams, gridSettings }`），然后重跑 heal 让受损 grid 自愈（assignRules 重写、两键共存——已现场验证）。statCard 调用用条件展开修复，对齐文件内既有的 `...(x === undefined ? {} : { x })` 习语。B6 验收标准本身重立为双腿且证据钉死：(1) 审计探针的 before/after 对拍必须每个缺陷计数归零或有入库豁免台账背书（单列的 L3 配置/<4 字段小表单、统计卡的页面分级、Edit 的 D5 引擎域只读）；(2) 八条角色旅程每条以任务完成性证据收口——统计卡数值与 SELECT 求和对拍（canvas 渲染导致 innerText 读不到，视觉读数 7/7 全中）、新建行携带 assignRules 默认值（草稿+当天）、Edit 往返逐字节一致、负例腿行数零变化——member 侧围栏同步复证（qc routes 0 行、终端 iframe 遵守 W3_TERMINAL_BASE）。

## 后果

演练记录从此记载的是一个真实「抓到并根治」的缺陷而非同义反复：破坏→红→heal→绿 循环是暴露「恰好压在断言 floor 上的顺序依赖覆盖」的唯一廉价手段。`setup-nocobase.mts verify` 继续守卫 W4 全部五个断言族加 W/W2/W3 每一条历史检查（本轮全绿）；before/after 对拍表（21/21 PASS）、旅程记录（55 张截图、20 条 SQL 对拍）与演练记录归档在 `research/2026-09-28-w4-completeness/`，`99-w4-deliverables.md` 为总表。已知残留登记在案而非隐藏：6+ 字段页的条件构建器 FilterForm 没有稳定自动化锚点（B1 pilot 截图 + 断言 + 13 张逐步截图承担证据）、n17 老 3 字段创建表单保留小表单豁免、旅程创建的草稿行留在演示库（卡基线先行读数使其无干扰）。

## 备选方案

- **把 assignRules floor 提到 61**——下一次合法的集合变更就会误红；缺陷在覆盖不在 floor。
- **写后对账而非修写入点**——第二次修复遍仍会在自己的 layout 写入上与同一替换语义竞态。
- **在 `dataOf` 内做深合并**——`flowModels:save` 是平台 API；合并责任属于知道自己拥有哪些键的调用方。
