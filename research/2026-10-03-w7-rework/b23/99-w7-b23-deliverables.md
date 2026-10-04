# W7-B2+B3 交付索引：存量改造第二/三域合并批（53 页）

> 批次：plan-w7 §4 B2（生产 15 + 仓储 14）+ B3（质量 7 + 供应链 8 + 组织 5 + 资产 3 + 基础数据 1）。实施 2026-10-03。B0 主题/globalStyle 与 B1 heal 框架为基座；本批新增页范围圈定与 uiSchema.enum 渲染渠道。

## 主体改动

| 文件 | 内容 |
|---|---|
| `examples/kb-agent/scripts/w7b23-heal.mts` | 新建：53 页 heal（--dry-run/--apply/--assert/--rollback）。B23_PAGES 页范围圈定（gridOwnerRoutes 归属链，W6 共享 collection 页不越界）；STATUS_PALETTE v3 + 本域实测补值 111+（证照效期窗口/IQC 严格度/WMS 事务与状态族/资产维保/HR/MRP/QM 类型与严格度）；六类 walk 之外新增 **fieldEnum 渠道**（运行时 enum Tag 渲染源 = 字段 uiSchema.enum，经 fields:update 重写，B1 盲区） |
| `research/2026-10-03-w7-rework/b23/.w7b23-shot.mjs` | 53 页 after 截图 + DOM 美学断言（表格页 6 检查点 / 看板矩阵页形态面 / iframe 终端 shot-only） |
| `research/2026-10-03-w7-rework/b23/.w7b23-retake.mjs` | 检验读数加载态假阴补拍（等 thead 后重探） |
| Agent Note 三件套 | `.agents/notes/implemented/architecture/2026-10-03-w7-b23-legacy-domain-heal.{md,zh.md,i18n.yaml}` |

## heal 命中面（两轮 apply）

| 轮 | 命中 |
|---|---|
| phase1（flowModels 面） | recolor=56、columnOptions=64、numberProps=16（含 1 条首跑 ENOENT 后补记）、selectOptions=3、statcardRegen=69 |
| phase2（fieldEnum 面） | fieldEnum=56（uiSchema.enum → v3；含 regulatory_risk/rating/bom_status 等 flowModels 之外的枚举源） |

journal 264 条（69 statcardRegen + 64 columnOptions + 56 fieldOptions + 56 fieldEnum + 16 numberProps + 3 selectOptions），`w7-b23-heal-rollback.json` 逆序重放。数据面单独归一：`srm_suppliers.iqc_level='standard'` 1 行 → `normal`（枚举外脏值）。

## 53 页清单与改造

| # | 页 | 域 | 改造 |
|---|---|---|---|
| b2-01 | BOM 管理 | 生产 | 双表主子 recolor、统计卡重生成 |
| b2-02 | BOM 工序 | 生产 | recolor、统计卡 |
| b2-03 | 工作中心 | 生产 | 双表 recolor、统计卡 |
| b2-04 | 生产订单 | 生产 | 13 列 recolor/数字千分位、统计卡×N |
| b2-05 | 排程明细 | 生产 | recolor、kit_policy 补值 |
| b2-06 | 领料单 | 生产 | recolor、统计卡 |
| b2-07 | 退料单 | 生产 | recolor（posted 已过账 green）、统计卡 |
| b2-08 | 报工记录 | 生产 | qc_status（not_required 免检）、duration_min 千分位 |
| b2-09 | 完工单 | 生产 | oqc_status、统计卡 |
| b2-10 | MO 执行视图 | 生产 | 双表 18 列 recolor、千分位 |
| b2-11 | 计划工作台 | 生产 | mrp_suggestions/mrp_confirm_intents（confirm 采纳/dismiss 忽略） |
| b2-12 | MRP 快照 | 生产 | 12 列数字表千分位、plan_type（MO/PR） |
| b2-13 | 主生产计划 | 生产 | 双表 15 列、driver（so/forecast） |
| b2-14 | 生产订单看板 | 生产 | 形态面（tag soft/pill/noLegacyHex） |
| b2-15 | 车间终端 | 生产 | shot-only（B5 iframe 壳） |
| b2-16 | 仓库库区 | 仓储 | temp_zone（ambient/chilled/frozen）、recolor |
| b2-17 | 库位平面图 | 仓储 | wms_bins.status（occupied/disabled/idle/frozen） |
| b2-18 | 入库单 | 仓储 | status（receiving/posted）、receipt_type 三值、统计卡 |
| b2-19 | 出库单 | 仓储 | status、shipment_type（sales/picking）、统计卡 |
| b2-20 | 库存查询 | 仓储 | wms_stock.status（good/blocked 等）、三数量列千分位、统计卡、行详情工厂页 |
| b2-21 | 批次主数据 | 仓储 | wms_lots.status（quarantined 隔离 orange/frozen）、统计卡 |
| b2-22 | 盘点管理 | 仓储 | status（counting/difference/adjusting/frozen）、count_type、109 块页 |
| b2-23 | 移库管理 | 仓储 | in_transit blue |
| b2-24 | 库存流水 | 仓储 | move_type 14 值中性化（收货/上架/拣货/车间发料/报废…） |
| b2-25 | 预留管理 | 仓储 | reserved/consumed、ref_type（SO/MO/SHIPMENT） |
| b2-26 | 补货预警 | 仓储 | status 预警族 |
| b2-27 | 盘点计划 | 仓储 | hub_inv_products（safety_stock/lead_time_days 千分位、abc_class） |
| b2-28 | 月度收发存 | 仓储 | 12 列数字台账千分位、source（full_replay/incremental） |
| b2-29 | 收货终端 | 仓储 | shot-only（B5 iframe 壳） |
| b3-01 | 质检单 | 质量 | 16 列 recolor、insp_type（IQC/IPQC/OQC/CCP 中性）、rigor 三态、result |
| b3-02 | 检验读数 | 质量 | recolor、数字列（补拍腿） |
| b3-03 | 处置看板 | 质量 | 形态面 + 统计卡 |
| b3-04 | AQL 抽样方案 | 质量 | rigor（normal/tightened/reduced）、severity（major/minor） |
| b3-05 | 季度绩效物化 | 质量 | srm_score_cards 四分项千分位、rating_change（up/flat/down） |
| b3-06 | 质检看板 | 质量 | 形态面 |
| b3-07 | 质检工作台 | 质量 | shot-only（B5 iframe 壳） |
| b3-08 | 供应商档案 | 供应链 | lifecycle_status 八值五态、category 四值中性化、audit_grade A-E、iqc_level 四态+standard 归一、regulatory_risk 规范化（A级(低)→A级）、统计卡（leg07 A 级页） |
| b3-09 | 供应商准入 | 供应链 | lifecycle/recolor、统计卡 |
| b3-10 | 证照效期预警 | 供应链 | warn_status 窗口色阶（ok 绿→w30 红）、cert_type 五值 |
| b3-11 | 审核检查表 | 供应链 | weight 千分位、recolor |
| b3-12 | 审核评分录入 | 供应链 | score_* 四列千分位、grade |
| b3-13 | 绩效评分卡 | 供应链 | 6 数字列千分位、rating、rating_change |
| b3-14 | 供应商绩效雷达 | 供应链 | recolor、统计卡 |
| b3-15 | 整改跟踪 | 供应链 | 看板形态面 |
| b3-16 | 员工 | 组织 | status 九值（resigned/onleave/terminated 等）（leg04 A 级页） |
| b3-17 | 部门 | 组织 | recolor |
| b3-18 | 请假审批 | 组织 | type（annual/sick/personal）、status、days 千分位 |
| b3-19 | 组织架构 | 组织 | departments/users 双表 recolor |
| b3-20 | 权限矩阵 | 组织 | 形态面（noLegacyHex） |
| b3-21 | 资产台账 | 资产 | status（in_use/repair/assigned/in_stock）、category 三值中性 |
| b3-22 | 维保记录 | 资产 | type（repair/inspection/calibration 语义色）、status、统计卡（leg 遗留页） |
| b3-23 | 维保服务商 | 资产 | category（certification/legal/misc）、status |
| b3-24 | 分类维护 | 基础数据 | 四 hub_md_* 表 recolor |

## 审计美学问题清偿（02-pc-aesthetic-findings.md 本批域）

| 发现 | 处置 |
|---|---|
| leg04#6 在职 Tag 泛白 | fieldEnum recolor（active=Positive 绿 soft），B0 globalStyle soft 底渲染 ✓ |
| leg04#1/#2/#4/#5/#7（部门列链接/基线/栅格/筛选分隔/分页层级） | B0 globalStyle（行高 48-52/行分隔/tnum）+ 平台链接 token（#1E4E8C）；结构性项（头像/分页组件级）记 B6 复核 |
| leg07#1 状态枚举色语义崩坏（含 standard 裸值） | v3+fieldEnum：合格绿/优选蓝/受限红/加严橙/冻结橙/暂停检验红；standard 脏值 SQL 归一 ✓（DOM 实测逐 Tag 验证） |
| leg07#2 KPI 数字比例 3.4:1 | statcard regen（28/600/#1F2630+60% 单位）✓ |
| leg07#4 A/B/C/D 胶囊无差异 | recolor 规范化 A绿/B蓝/C橙/D灰/E红；「A级(低)」双语义注解拆平 ✓ |
| leg07#5/#8 胶囊几何/行分隔 | B0 tag pill+行分隔 1px #EFEFEF ✓ |
| leg07#3/#6/#7（筛选维度/侧栏对比度/全局蓝） | 筛选表单结构性（B6 候选）；侧栏选中/蓝语义收敛属 B0 层 1/2 面 |
| leg08#2 数量三列无 tnum | B0 globalStyle 全表格 tnum + numberProps 千分位 ✓（DOM 实测 100 右对齐格） |
| leg08#4 统计卡不等高 | statcard regen 统一规格 ✓ |
| leg08#1 库位编码等宽字体 | B0 tnum 兜底数字位；列级 monospace 未做 → 遗留 |
| leg08#3/#5/#6/#7（截断/双蓝/偏移/工具栏分组） | #5/#6 B0 链接 token+tag pill 已收敛；#3/#7 平台组件面（B6 复核） |
| §3 TOP10 #1/#2/#4/#5/#6/#9 | B0+B2B3 共同达成（本批 DOM 断言逐页验证）；#3 列级 heal；#7 JSBlock→B5；#8 空态→平台（B6）；#10 iframe→B5 |

## 证据链

| 类别 | 结果 / 路径 |
|---|---|
| heal 断言 | `w7b23-heal --assert` OK：pages=53、enumColumns=71 colorMismatch=0、numberNoRight=0/104、numberNoSeparator=0/104、dateNoRight=0/29、dateNoFormat=0/29、bareNumeric=0、statcards=69 statcardLegacy=0、columnOptionMismatch=0/70、selectOptionMismatch=0/3、**fieldEnumMismatch=0/61** |
| DOM 美学断言 | 53/53：44 表格页 6 检查点全 PASS + 6 看板/矩阵页形态面 PASS + 3 iframe shot-only；`.w7b23-shot-report.json` |
| after 截图 | `after/w7-b2-01..29-*.png` + `w7-b3-01..24-*.png`（1440×900 与 b0/before 同机位）；对比图集 = `research/2026-10-03-w7-rework/b0/before/leg07-*.png` vs `after/w7-b3-08-供应商档案.png`（leg04→b3-16、leg08→b2-20 同理）；已拷 `demos/acceptance-w7/` |
| W6 回归 | `w6b4-assert` ALL PASS；`w6b5-insp` assert PASS（--seed 演练行 + `w6-b5-shoot.mjs` 向导重放 28✓ 后）；`w6b8-assert` PASS——fieldEnum 改字段定义后复跑（w6b4/b5/b8 log 见本目录） |
| 主题断言 | `w7b0-theme --assert` OK（themes=6 defaults=w7-forge） |
| gates | `pnpm run typecheck` exit 0；oxlint staged（w7b23-heal.mts）0 warnings 0 errors |
| 回滚面 | `w7-b23-heal-rollback.json`（264 条，含 fieldEnum before-enum） |

## 遗留（进入后续批次）

- **B1 渲染面债**：B1 22 页的字段 uiSchema.enum 仍是 W4 时代映射（如 crm_customers.type factory=绿），flowModels 面绿而渲染面旧——B1 交付对「Tag 中文化/中性化」的叙述在渲染面未达成。B4 前置：crm_/so_/pur_ fieldEnum 补写（复用本批渠道）。
- `frozen` 一词两义（状态「冻结」橙 vs 温区「冷冻」元数据）在仓库库区 temp_zone 列涂橙；如需精确分色需按字段分 palette。
- 库位编码列级 monospace（leg08#1 半项）；列表页空态双文案、分页器层级、工具栏分组（平台组件面，B6 终验复核）。
- JSBlock 内硬编码色（库位平面图平面图块等）与 iframe 终端三页壳 → B5 层 3b。
- 统计卡 sparkline/同比仍按 B1 裁定待数据可行性。
- 首轮 apply 因 research 目录缺失 ENOENT 中断过一次（1 条 numberProps 落库未记账，before 态已重建补记入 journal；rerun 幂等收敛）。
