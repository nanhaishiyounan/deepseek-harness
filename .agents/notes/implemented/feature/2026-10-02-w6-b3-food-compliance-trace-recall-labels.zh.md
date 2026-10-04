# Agent Note: W6-B3：食品合规核心包（效期看板 + 追溯 DAG + 召回 + 条码打印）

Status: implemented

[English](2026-10-02-w6-b3-food-compliance-trace-recall-labels.md) | 中文

W6 计划（plans/plan-w6.zh.md §B3）把食品行业调研结论（research/2026-10-01-w6-research/pt2-food-industry.md）落成四个交付件。此前追溯数据链只有 CLI 断言（kpi-run --trace），交付面全缺：无批次谱系视图、无召回工作流、无条码标签。本批一次交付四件套，全部消费 B2 规则引擎与既有八域数据底座，不另起炉灶。

## Problem

食品合规交付件缺失：没有效期看板、没有批次追溯视图、没有召回流程、没有条码打印。

## 落地内容

- **效期看板**（NocoBase v2 页「效期看板」，食品合规组）——JSBlock 自绘：KPI 条（临期+过期/已过期/≤7 天/≤30 天/B2 效期预警未关闭）+ 品类×剩余天数五档热力矩阵（已过期/临期监管线/30-90/>90/缺日期）+ 点格下钻批次清单（批号/品名/生产/到期/剩余/在库=Σwms_movements/预警状态）。红档口径与 B2 scanner 同一条 SQL CASE（LEAST(30, 监管分档 45/20/15/10/3)），B2 的 wfl_alerts 效期行是看板一等输入（行内🔴未处理/🟠已认领）。
- **批次追溯 DAG**（v2 页「批次追溯」）——分层泳道 DAG 而非树形（调研结论：混料/分批使树形重复展开，DAG 才是准确模型）。泳道=供应商/收货/原料在库批/生产工单/成品批/销售订单/发运/客户；选锚点批次 + 方向（双向/正向/反向）双向展开；「召回范围」开关高亮正向闭包+无关节点降灰+侧栏受影响三清单（成品批次/发运订单/客户）；断链批次明示「链路不完整：缺 XX 环节（数据质量信号）」。数据底座：`v_trace_nodes`/`v_trace_edges` 两个 PG 视图（append-only——视图只读，谱系边不写）；闭包=递归 CTE（CLI 断言与召回圈定共用同一 SQL）；JSBlock 前端建图与视图同构（同 wiring 列，--assert 对拍计数）。
- **追溯底座补全**（w6b3-trace --migrate）：wms_receipts 补 `lot_id` 外键回填（孤儿收货自动补建批次档案——四日期按 shelf_life_days 推导，状态待检；残留孤儿 fail-loud）；完工单无 lot_no 自动建批（四日期效期继承，completed_at 空时回退 MO released_at）。
- **召回管理**（recall_orders 集合 + v2 页「召回管理」）——食安法第 63 条四动作状态机：initiated（发起停售）→ notify → notified → execute → executing → close（记录说明必填）→ closed。范围圈定=正向递归闭包冻结进 scope 快照（受影响成品批次/订单/客户三清单，创建时冻结——后续链路改动不回写已发起召回）；服务端 RC-YYYYMMDD-NNN 发号（一条 INSERT..SELECT max 原子完成，B1 服务端发号口径）；责任人通知走 B2 alert-center in-app 渠道；发起白名单 admin/quality_lead/qc_inspector 服务端卡口（越权 fail-loud）。转移表显式 (action, from_state) 二元组——actOnAlert 同款模式，owner/admin 限定、跳步/外人/缺说明一律 0 行拒绝。
- **条码打印**（`examples/kb-agent/labels/` 轻量 SPA + 引擎路由）——**零依赖手写 Code128/GS1-128 编解码器**（labels/src/code128.ts：107 图案表取自 JsBarcode 权威表 [MIT]，B/C 码集自适应切换；解码器=条宽→11 模块图案→码集状态机，生成-再解码 round-trip 即扫码枪视角）。GS1-128 承载法定最小四 AI（01 GTIN-14 + 10 批号 + 11 生产 + 17 到期；固定长 AI 免 GS 分隔符）；标签文本行=批号/品名/生产到期/供应商（食安法第 50/51 条记录要素）；GTIN 产品级：sku 纯数字用之，否则前缀 9+产品 id 内部确定性 GTIN-14。引擎三路由：GET /labels（SPA 静态，designer 同款 committed-bundle）、GET /label/lots.json（选批器数据）、GET /label/lot.svg（服务端 SVG，mobile/打印页共用）；POST /recall/create、/recall/act 挂引擎（CLI 第三入口同函数）。打印走浏览器 window.print + @media print；PDF 由 CDP page.pdf 采证。
- **mobile 批次条码**：批次档案（wms_lots）进 keeper/qc_inspector 单据目录与网关 scope 表；单据详情页行携带 lot_no 即渲染条码卡（img 引擎 SVG，他机可扫；引擎离线降级为提示文案）。

## 关键取舍

- **条码库不用 bwip-js 而是手写**：仓库依赖树无 bwip-js；计划允许「SVG 生成」路径。编码器 ~230 行零依赖，SPA/引擎/断言三面共享一份（examples/labels/src/code128.ts），解码器同时是验收断言（SVG bars→解码→四 AI 与库对账），比引入运行时依赖更可验证。
- **NocoBase 集合不能骑裸 SQL 视图**（无 view-collection 先例）：DAG 页拉 10 个原始集合前端建图；视图只服务 CLI 对账与召回圈定。两套建图逻辑同 wiring 列，--assert 证一致。
- **召回范围冻结而非实时**：召回单是合规证据，创建时刻的波及面必须不可变；实时追溯另走 DAG 页。
- **菜单全员可见、发起服务端卡口**：角色只有 admin/member 粒度，菜单绑角色做不了 quality 限定；召回发起的越权拒绝在引擎层显式断言。

## 教训

- PG 正则字符串双转义坑：ts 模板串里 `\\d` 到 PG（standard_conforming_strings=on）成字面反斜杠 d，`regexp_match` 失配 → max=NULL → 发号回退 001 撞唯一索引。数字字面正则一律用 `[0-9]` 字符类。
- 嵌入 JSBlock 里 checkbox 的浏览器派发 change 不可达（select 的手动 Event('change') 可达）——召回开关改 select 通道；另外 `dim(null)` 在 recall 模式触 null.key TypeError 中断渲染（select 切换正常掩盖了它），嵌入 JS 的分支要先跑全路径。
- apps/web 是独立 vite 包：packages/client/ui-mobile 改动后 build:lib:client 之外还须 `pnpm --filter @deepseek-ai/dsh-web-frontend build` + 重启 3080，否则 /mobile 仍服务旧 bundle（BUG-4 同族）。
- headless CDP 截图驱动（demos/acceptance-w6/w6-b3-shoot.mjs）：截图落盘走仓库通道（MCP 工具受 workspace-root 限制）；mobile 登录探测 localStorage key 是 `dsh-mobile-auth`。

## 证据

- demos/acceptance-w6/：w6-b3-01（live 三联）、02/02b（效期看板+钻取）、03（反向 DAG）、04（正向召回范围）、05/05b（混料双向+断链提示）、06（召回列表）、07（psql 对账）、08（打印 SPA）、09a/09b（mobile 批次条码）、10（综合断言 ALL PASS）、gates-b3.log（typecheck/vitest 11 绿/oxlint 0 错）。
- 对账 SQL 固化：research/2026-10-01-w6-rework/b3/recon.sql.txt（与 w6-b3-10-assert.log 同口径）。

## Alternatives considered

- **图数据库 vs 递归 CTE+PG 视图（C2 开放问题#6）**——选 CTE：小厂规模够用，谱系边 append-only 保留。
- **服务端渲染服务 vs HTML 模板+CDP PDF（ADR#5）**——选 CDP：不新增常驻服务。

## Consequences

成本：CTE 视图随谱系规模线性。买到：正反向追溯+召回冻结快照+条码 round-trip 断言链。
