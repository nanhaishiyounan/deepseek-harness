# W7 PC 面全量页面清单（存量美学重设计审计基线）

- 审计时点：2026-10-03 17:29–20:00（UTC+8），live 实地审计
- 审计对象：NocoBase 2.x @ http://127.0.0.1:13000（admin 视角）
- 方法：纯读 —— 唯一 POST 为 `/api/auth:signIn`，其余全部 GET（desktopRoutes:list / flowModels:list / themeConfig:list）；截图为浏览器导航 + 视口捕获
- 数据源：`.fetch-routes.mjs`（拉取）、`.audit-analyze.mjs`（离线分析）、原始存档 `api-desktopRoutes.json`（143,170 B）/ `api-flowModels-flat.json`（6,932,730 B）、派生 `audit-pages-w7.json` / `audit-routes-flat.md` / `audit-summary-w7.json`
- W4 基线对照：research/2026-09-28-w4-completeness/01-page-inventory.md（206 路由基线）

## 1. 路由总量与类型分布（W7 时点实测）

| type | W7 实测 | W4 基线 | 差值 |
|---|---:|---:|---:|
| group | 14 | 16 | −2（W4-B4 菜单 IA 合并 + W6 新增预警中心/食品合规） |
| page (v1 legacy) | 3 | 3 | 0 |
| tabs | 114 | 95 | +19 |
| flowPage | 111 | 92 | +19 |
| **合计** | **242** | **206** | **+36** |

- flowModels 块行：**9591**（W4 时点 7222，+2369，W6 新页块增量）
- 每页 tab 数：111 页全部恰好 1 tab（114 tabs 中 3 个为多 tab 页/挂载位）
- 顶级 14 组：CRM 客户(5) / 项目与协同(9) / 资产管理(8) / 组织与系统(5) / 基础数据(1) / 供应链(8) / 仓储管理(14) / 采购管理(8) / 生产与计划(19) / 销售管理(10) / 质量管理(11) / 经营分析(6) / 预警中心(2) / 食品合规(3)，另顶级散页 2（经营总览、AI 工作台）

## 2. 按 createdAt 分桶（flowPage 111 页，上海时区）

| 桶 | 页数 | 说明 |
|---|---:|---|
| pre-0918（n13/n17 第一代 + h4/h5 域） | 39 | 存量老页主体 |
| 0918-0928（w1/w3~w9 + W4 治理） | 48 | W 周形态升级页 |
| w5-0929-0930（W5 补页） | 3 | 项目/任务列表/里程碑（n17e1* uid） |
| w6-1001-plus（W6 新建） | **21** | 全部为 w6b* uid 新页 |

- W6 21 页构成：预警中心 2（预警列表/预警规则）、食品合规 3（效期看板/批次追溯/召回管理）、质量 4（CCP 配置/CCP 记录/检验工作台/出厂检验报告）、生产 4（工程变更单/配方版本与变更/APS 瓶颈与负荷/APS what-if 沙箱）、资产 5（设备台账/维保计划/维保工单/计量校准/维保日历）、销售 1（商机管道）、经营分析 1（财务工作台）、顶级 1（经营总览）
- **B7 比价矩阵无独立路由**：JSBlock 挂在 W3「比价表」页（w3purb7o0r3yqi45，块含 JSBlockModel:1 + AssignFormModel 定标表单）——路由 createdAt 不变、schema 层新增
- **B6 客户 360/报价/今日待办不在路由层**：商机管道为 IframeBlock，内嵌 3080 网关多 Tab 工作台（CRM 工作台/客户 360/报价转单/商机管道 Tab 组），admin 会话不被 iframe 引擎接受时呈现签到墙（见 02 报告 w6-09）
- W4 存档 uid 比对：24 个 schemaUid 不在 W4 存档（21 个 W6 真新页 + 3 个 n17e1 补页），反推 3 个 W4 uid 已在 W4-B4 治理中退役

## 3. 全量页面清单（111 flowPage + 3 v1 = 114 页面单元）

形态判定依据：audit-pages-w7.json 每页 blocks 构成（TableBlockModel/ChartBlockModel/KanbanBlockModel/CalendarBlockModel/JSBlockModel/IframeBlockModel/AIChatBoxBlockModel 计数）。
改造状态：存量老页（pre-0918）/ W4W5 形态升级（0918-0928 + w5 桶）/ W6 已改（w6 桶 + 比价表挂载）。
美学分级：**A=难看且业务重要 / B=难看次要 / C=尚可**（依据：02 报告 18 张截图实证 + 块构成 + W4 审计结论继承）。

### 3.1 CRM 客户（5 页，全存量）

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| 客户 | /admin/n17sys042q2lz | v2 | 表格+统计卡（表1+图2） | 存量老页 | **A** |
| 销售线索 | /admin/n17rwc527ujwt | v2 | 表格+统计卡（表1+图2） | 存量老页 | **A** |
| 联系人 | /admin/n17c3lkyg9zjd6 | v2 | 表格+统计卡（表1+图1） | 存量老页 | **A** |
| 产品与服务 | /admin/n17f2wwpqs60dtk | v2 | 表格+统计卡（表1+图2） | 存量老页 | **A** |
| 客户仪表盘 | /admin/n17f2jumvap76nm8 | v2 | 表格+图（与「客户」页集合重复） | 存量老页 | B |

### 3.2 销售管理（10 页：9 存量 + 1 W6）

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| 订单 | /admin/n17vu68623sj9i | v2 | 表格+统计卡（表1+图3+MD） | 存量老页 | **A** |
| 报价单 | /admin/n17v6xfvzxoj0f | v2 | 表格+统计卡 | 存量老页 | **A** |
| 回款 | /admin/n17f2c15ji684n8g | v2 | 表格+统计卡 | 存量老页 | **A** |
| 发票 | /admin/n17f2utwb01mi3ha | v2 | 表格+统计卡 | 存量老页 | **A** |
| 销售仪表盘 | /admin/n17f2y9wfrggxyo | v2 | 表格+图（与「回款」重复） | 存量老页 | B |
| 销售订单 | /admin/w7mrp4w590rm0ws8 | v2 | 双表主子+统计卡（表2+图4） | W4W5 形态升级 | **A** |
| 销售看板 | /admin/w3b3utj5a15khmq | v2 | 纯看板（Kanban1，6 块裸页） | W4W5 形态升级 | B |
| 交期日历 | /admin/w3b3x8ymuxey8q | v2 | 日历（Calendar2） | W4W5 形态升级 | B |
| 计划日历 | /admin/w3b3ass8lwvxiy | v2 | 日历（Calendar2） | W4W5 形态升级 | B |
| 商机管道 | /admin/w6b6c6iqjj61zo9 | **iframe** | iframe 多 Tab CRM 工作台（签到墙态） | **W6 已改** | **A** |

### 3.3 采购管理（8 页：7 存量 + 1 W6 挂载）

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| 采购申请 | /admin/w3pura0kyqfx4f9 | v2 | 双表主子+统计卡（表2+图4） | W4W5 形态升级 | **A** |
| 询价管理 | /admin/w3purlvif0v23bun | v2 | 双表主子+统计卡 | W4W5 形态升级 | B |
| 供应商报价 | /admin/w3pur9w1c3yg3rjd | v2 | 表格+统计卡 | W4W5 形态升级 | B |
| 比价表 | /admin/w3purb7o0r3yqi45 | **v2+JSBlock** | 表格+比价矩阵 JSBlock+定标表单 | **W6 已改（B7 挂载）** | **A** |
| 采购订单 | /admin/w3puryzkva06iuhh | v2+JSBlock | 双表主子+统计卡+泳道 JSBlock | W4W5 形态升级+W6 | **A** |
| 发票匹配 | /admin/w3pur45681oxtcsi | v2+JSBlock | 表格+三单匹配 JSBlock+图4 | W4W5 形态升级+W6 | **A** |
| 付款申请 | /admin/w3pur3an4pwnr1eo | v2 | 表格+统计卡 | W4W5 形态升级 | B |
| 采购看板 | /admin/w3b3x35bfqctwkn | v2 | 纯看板（6 块裸页） | W4W5 形态升级 | B |

### 3.4 生产与计划（19 页：15 存量 + 4 W6）

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| BOM 管理 | /admin/w5mfga37ztlt6orc | v2 | 双表主子+统计卡 | W4W5 形态升级 | **A** |
| BOM 工序 | /admin/w5mfgkkvs7a4ijya | v2 | 表格+统计卡 | W4W5 形态升级 | B |
| 工作中心 | /admin/w5mfg3eil2n4n0kr | v2 | 双表主子+图2 | W4W5 形态升级 | B |
| 生产订单 | /admin/w5mfgntyu7wy20a | v2 | 表格+统计卡（表1+图4，13 列） | W4W5 形态升级 | **A** |
| 排程明细 | /admin/w5mfgp352sily7f | v2 | 表格+FilterForm | W4W5 形态升级 | B |
| 领料单 | /admin/w6mfgsp029qziym | v2 | 表格+统计卡 | W4W5 形态升级 | **A** |
| 退料单 | /admin/w6mfg1zez6dqkcgh | v2 | 表格+统计卡 | W4W5 形态升级 | B |
| 报工记录 | /admin/w6mfglmxq9mhbkur | v2 | 表格+统计卡 | W4W5 形态升级 | B |
| 完工单 | /admin/w6mfgp1rrz08ffa | v2 | 表格+统计卡 | W4W5 形态升级 | B |
| MO 执行视图 | /admin/w6mfgmct2tf2braf | v2 | 双表（18 列宽表） | W4W5 形态升级 | B |
| 计划工作台 | /admin/w7mrphtm8t9tzlk8 | v2 | 双表+FilterForm | W4W5 形态升级 | B |
| MRP 快照 | /admin/w7mrpowj6l93nn0a | v2 | 表格+FilterForm（12 列数字表） | W4W5 形态升级 | B |
| 主生产计划 | /admin/w7mrpyru4s708nwn | v2 | 双表主子（15 列） | W4W5 形态升级 | B |
| 生产订单看板 | /admin/w3b39xulomz8jj | v2 | 纯看板（6 块裸页） | W4W5 形态升级 | B |
| 车间终端 | /admin/w3b6guuruqly03t | **iframe** | iframe 终端（url 绑 127.0.0.1:13110） | W4W5 形态升级 | B |
| 工程变更单 | /admin/w6b4bcr7wfgjxww | v2 | 表格+FilterForm（ECO） | **W6 已改** | **A** |
| 配方版本与变更 | /admin/w6b4bnn0n7n2p2i | **JSBlock** | 纯 JSBlock（BOM 版本树+ECO） | **W6 已改** | **A** |
| APS瓶颈与负荷 | /admin/w6b8a3fg2qshtalw | **JSBlock** | 纯 JSBlock（负荷热力矩阵+瓶颈归因） | **W6 已改** | **A** |
| APS what-if沙箱 | /admin/w6b8a9z9q2cliq77 | **JSBlock** | 纯 JSBlock（what-if 模拟） | **W6 已改** | **A** |

### 3.5 质量管理（11 页：7 存量 + 4 W6）

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| 质检单 | /admin/w8qmjvyv8p5j7j | v2 | 表格+统计卡（16 列） | W4W5 形态升级 | **A** |
| 检验读数 | /admin/w8qmg3yelbk0rzm | v2 | 表格 | W4W5 形态升级 | B |
| 处置看板 | /admin/w8qm472nluqt32x | v2 | 看板+统计卡 | W4W5 形态升级 | B |
| AQL 抽样方案 | /admin/w8qm15rxe53v8hh | v2 | 表格 | W4W5 形态升级 | B |
| 季度绩效物化 | /admin/w8qm8sx2tj9j0kb | v2 | 表格 | W4W5 形态升级 | B |
| 质检看板 | /admin/w3b3uw3d0mrz1b | v2 | 纯看板（6 块裸页） | W4W5 形态升级 | B |
| 质检工作台 | /admin/w3b6nour73ecwgb | **iframe** | iframe 终端（url 绑 13110） | W4W5 形态升级 | B |
| CCP监控配置 | /admin/w6b4c4t709ypn92m | v2 | 表格+FilterForm | **W6 已改** | **A** |
| CCP监控记录 | /admin/w6b4ce752lctbwp8 | v2 | 表格+FilterForm（12 列） | **W6 已改** | **A** |
| 检验工作台 | /admin/w6b5icrrgz5z9gu | **iframe** | iframe 触屏工作台（队列三视图+全屏向导，签到墙态） | **W6 已改** | **A** |
| 出厂检验报告 | /admin/w6b5ruwgh0d52fif | v2 | 表格+FilterForm | **W6 已改** | **A** |

### 3.6 仓储管理（14 页，全存量）

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| 仓库库区 | /admin/h5wms50cuimohzz7 | v2 | 表格+图1 | 存量老页 | B |
| 库位平面图 | /admin/h5wms1nju21hb5c8 | v2+JSBlock | 表格+平面图 JSBlock | 存量老页 | B |
| 入库单 | /admin/h5wmsrh8ls7pkv5i | v2 | 表格+统计卡 | 存量老页 | **A** |
| 出库单 | /admin/h5wmsvwkqjiiaxdj | v2 | 表格+统计卡 | 存量老页 | **A** |
| 库存查询 | /admin/h5wms9v2hly0cg6j | v2 | 表格+行详情工厂（Details+CreateForm+AI 按钮） | 存量老页+W4 升级 | **A** |
| 批次主数据 | /admin/h5wmsgd4pntmwvg | v2 | 表格+统计卡 | 存量老页 | B |
| 盘点管理 | /admin/h5wms2hmkvlfsmtf | v2 | 表格+行详情+表单（109 块） | 存量老页+W4 升级 | B |
| 移库管理 | /admin/h5wmspyqfovkqjff | v2 | 表格 | 存量老页 | B |
| 库存流水 | /admin/h5wms9srcrn5fhiq | v2 | 表格 | 存量老页 | B |
| 预留管理 | /admin/h5wms9zlhetpzwl | v2 | 表格 | W4W5 形态升级 | B |
| 补货预警 | /admin/h5wmstw8iug4upxs | v2 | 表格 | W4W5 形态升级 | B |
| 盘点计划 | /admin/h5wmsddav9gkxtl | v2 | 表格 | W4W5 形态升级 | B |
| 月度收发存 | /admin/h5wmslacezwb94s | v2 | 表格（12 列数字台账） | W4W5 形态升级 | B |
| 收货终端 | /admin/w3b66yns80jnq92 | **iframe** | iframe 终端（url 绑 13110） | W4W5 形态升级 | B |

### 3.7 供应链（8 页，全存量）

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| 供应商档案 | /admin/h4srm2u9xiqx09jb | v2 | 表格+图2+JSRecordAction | 存量老页（W4 评最优域） | **A** |
| 供应商准入 | /admin/h4srm6hfqnpnrqu5 | v2 | 表格+图2 | 存量老页 | B |
| 证照效期预警 | /admin/h4srmjjlvbjei4fd | v2 | 表格+图2 | 存量老页 | B |
| 审核检查表 | /admin/h4srmuvf86en2kn | v2 | 表格 | 存量老页 | B |
| 审核评分录入 | /admin/h4srmflpebqkuz | v2 | 表格+图2 | 存量老页 | B |
| 绩效评分卡 | /admin/h4srms4w5viez9zp | v2 | 表格+图2（9 列含 6 数字列） | 存量老页 | B |
| 供应商绩效雷达 | /admin/h4srmaf4rurtt17p | v2 | 表格+图2 | 存量老页 | B |
| 整改跟踪 | /admin/h4srm25tmro1wjuw | v2 | 看板 | 存量老页 | B |

### 3.8 资产管理（8 页：3 存量 + 5 W6）

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| 资产台账 | /admin/n17wr2jbz8fl2i | v2 | 表格+统计卡 | 存量老页 | B |
| 维保记录 | /admin/n17f34o4bhrzg1w | v2 | 表格+统计卡 | 存量老页 | **A** |
| 维保服务商 | /admin/n17f3t3gtwv502s | v2 | 表格+统计卡 | 存量老页 | B |
| 设备台账 | /admin/w6b8ekr28fjs4b0k | v2 | 表格+FilterForm | **W6 已改** | **A** |
| 维保计划 | /admin/w6b8e2y41rty9rx | v2 | 表格+FilterForm | **W6 已改** | **A** |
| 维保工单 | /admin/w6b8eupafgchxsnf | v2 | 表格+FilterForm（12 列） | **W6 已改** | **A** |
| 计量校准 | /admin/w6b8erufav9515p | v2 | 表格+FilterForm | **W6 已改** | **A** |
| 维保日历 | /admin/w6b8eci1cpbqsgtj | **JSBlock** | 纯 JSBlock（月历+工单条） | **W6 已改** | **A** |

### 3.9 经营分析（6 页：5 存量 + 1 W6）

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| 经营看板 | /admin/w9kpi7zv98whvfpv | v2 | 表格+FilterForm+图2（首屏表格化） | W4W5 形态升级 | B |
| 供应链看板 | /admin/w9kpijpea6p6exnm | v2 | 表格+FilterForm+图3 | W4W5 形态升级 | B |
| 库存看板 | /admin/w9kpiatwzi4gjbff | v2 | 表格+FilterForm+图3（首屏为 17 行明细表） | W4W5 形态升级 | B |
| 生产看板 | /admin/w9kpirvxmfx12l2i | v2 | 表格+FilterForm+图2 | W4W5 形态升级 | B |
| 应收应付对账 | /admin/w9kpisldougonly | v2 | 四表+FilterForm+图2（75 块） | W4W5 形态升级 | B |
| 财务工作台 | /admin/w6b9fgcovvinqe85 | **JSBlock** | 纯 JSBlock（催收候选+任务卡） | **W6 已改** | **A** |

### 3.10 项目与协同（9 页，全存量）

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| AI 工作台 | /admin/n13ai2efgqippp44 | v2+AI | AIChatBox+表格+FilterForm | 存量老页 | C |
| 工单 | /admin/n17etqhllqqa28 | v2 | 表格+统计卡 | 存量老页 | B |
| 知识文章 | /admin/n17f38lga4ln4s65 | v2 | 表格+统计卡 | 存量老页 | B |
| 任务看板 | /admin/n17f12u108kzzyk1 | v2 | 看板（8 块） | 存量老页 | C |
| 任务日历 | /admin/n17f1ns70eshqwy | v2 | 日历（9 块） | 存量老页 | C |
| 审批中心 | /admin/w1w167h6joi0ck6 | v2 | 双表+FilterForm+JSRecord（54 块） | W4W5 形态升级 | B |
| 审批流配置 | /admin/w3b4u2r9nnjqvi | v2+JSBlock+iframe | 四表+流程设计器（84 块） | W4W5 形态升级 | B |
| 项目 | /admin/n17e1kqp4orpph5 | v2 | 表格+统计卡 | W5 补页 | B |
| 任务列表 | /admin/n17e1ilgn22ts32 | v2 | 表格+统计卡 | W5 补页 | B |
| 里程碑 | /admin/n17e1m63re4tgre8 | v2 | 表格+统计卡 | W5 补页 | B |

（注：项目与协同实际 9 行含 W5 补 3 页；表内 10 行因 AI 工作台为顶级散页计入本域叙事）

### 3.11 组织与系统（5 页，全存量）

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| 员工 | /admin/n17lhe5qyxu1g | v2 | 表格+统计卡 | 存量老页 | **A** |
| 部门 | /admin/n17f3er0aw80yc8i | v2 | 表格+图1 | 存量老页 | B |
| 请假审批 | /admin/n17f3wqpzee9wo2g | v2 | 表格+统计卡 | 存量老页 | B |
| 组织架构 | /admin/w3b57ix4086om95 | v2+JSBlock | 双表+组织树 JSBlock | W4W5 形态升级 | C |
| 权限矩阵 | /admin/w3b5m8kwiakieq | **JSBlock** | 纯 JSBlock（部门×员工权限矩阵） | W4W5 形态升级 | C |

### 3.12 基础数据 / 预警中心 / 食品合规 / 顶级

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| 分类维护（基础数据） | /admin/n17f3rnd403uzlkc | v2 | 四表平铺（64 块） | 存量老页 | B |
| 预警列表（预警中心） | /admin/w6b2dwgwk6zc3i | v2 | 表格+图8+FilterForm | **W6 已改** | **A** |
| 预警规则（预警中心） | /admin/w6b2rdacw363qjf7 | v2 | 表格（17 块） | **W6 已改** | **A** |
| 效期看板（食品合规） | /admin/w6b3k0jfsyskif | **JSBlock** | 纯 JSBlock（分档热区矩阵） | **W6 已改** | **A** |
| 批次追溯（食品合规） | /admin/w6b3by6ukynxfou | **JSBlock** | 纯 JSBlock（DAG+侧栏） | **W6 已改** | **A** |
| 召回管理（食品合规） | /admin/w6b3r1wnc10bflfg | v2+JSBlock | 表格+召回 JSBlock | **W6 已改** | **A** |
| 经营总览（顶级） | /admin/w6b9cdzrc2lst1dm | **JSBlock** | 纯 JSBlock（驾驶舱：KPI+趋势+账龄+异常+九步） | **W6 已改** | **A** |

### 3.13 v1 legacy 页（3 页）

| 页面 | url | 类型 | 当前形态 | 改造状态 | 美学 |
|---|---|---|---|---|---|
| 排产甘特 | /admin/96yet9a0x45 | v1 | GanttBlockProvider/mfg_order_operations | 存量老页（v1） | **A** |
| 任务甘特 | /admin/zs3oqvlgqq0 | v1 | GanttBlockProvider/hub_pj_tasks | 存量老页（v1） | B |
| 应用中心 | /admin/c9c6wzppejk | v1 | app-hub 聚合页 | 存量老页（v1） | C |

## 4. 美学分级统计（114 页面单元）

| 分级 | 页数 | 占比 | 构成 |
|---|---:|---:|---|
| **A 难看且业务重要** | **45** | 39.5% | 存量核心单据/列表 24（CRM8+员工+维保记录+供应商档案+仓储3+采购3+比价表+生产3+销售订单+质检单+排产甘特）+ **W6 全部 21 页** |
| **B 难看次要** | **63** | 55.3% | 存量边缘列表/看板/日历/iframe 终端/老经营看板 |
| **C 尚可** | **6** | 5.3% | AI 工作台、任务看板、任务日历、组织架构、权限矩阵、应用中心 |

- W6 21 页全 A 的依据：用户第十一轮反馈「W6 新生成页面难看」+ 02 报告 9 张 W6 代表截图实证硬伤（伪零条形图/异常清单 8 行重复/4 套圆角/JSBlock 双体系割裂/DAG 彩虹边框/效期警示色缺失/维保日历格失衡/APS 瓶颈视觉权重弱/iframe 签到墙）+ 其余 12 页继承 v2 表格共性缺陷
- 存量 A 级 24 页 = W7 重设计第一优先级；B 级 63 页 = 第二批统一模板重设计；C 级 6 页 = 保留或微调

## 5. 存量待改页按域统计（111 flowPage − 21 W6 = 90 + 3 v1 = 93 页）

| 域 | 存量页数 | 其中 A 级 |
|---|---:|---:|
| 仓储管理 | 14 | 3（入库单/出库单/库存查询） |
| 生产与计划 | 15 | 3（BOM/生产订单/领料单） |
| 销售管理 | 9 | 5（订单/报价单/回款/发票/销售订单） |
| 质量管理 | 7 | 1（质检单） |
| 项目与协同 | 9 | 0 |
| 供应链 | 8 | 1（供应商档案） |
| 采购管理 | 7 | 3（采购申请/比价表/采购订单+发票匹配） |
| 资产管理 | 3 | 1（维保记录） |
| 经营分析 | 5 | 0 |
| 组织与系统 | 5 | 1（员工） |
| CRM 客户 | 5 | 4 |
| 基础数据 | 1 | 0 |
| 顶级（AI 工作台） | 1 | 0 |
| v1 legacy | 3 | 1（排产甘特） |
| **合计** | **93** | **24** |

（采购域 A 级 4 页：采购申请/比价表/采购订单/发票匹配，表格内以「比价表+采购订单」合并计数 3，以页计为 4——以本注为准 A 级存量合计 24~25，取 24 为口径基线，发票匹配并入采购订单行）

## 6. 页面类型分布汇总（形态学）

| 类型 | 页数 | 说明 |
|---|---:|---|
| v2 表格页（含主子双表/统计卡/图） | 87 个 TableBlock 分布于 78 页 | 全站主体形态 |
| v2 纯看板 | 7 | 整改跟踪/处置看板/任务看板 + w3b3 四看板 |
| v2 日历 | 3 | 任务日历/交期日历/计划日历（CalendarBlock 共 3 页 6 块） |
| JSBlock 纯页/挂载 | 16 处 | W6 8 纯页 + 库位平面图/审批流配置/组织架构/权限矩阵/召回/比价/采购订单/发票匹配挂载 |
| IframeBlock | 6 | 车间终端/质检工作台/收货终端/审批流配置内嵌 + W6 检验工作台/商机管道 |
| v1 legacy | 3 | 两甘特 + 应用中心 |
| AIChatBox | 1 | AI 工作台 |
