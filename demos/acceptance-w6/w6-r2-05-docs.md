# W6-R2 文档与真话债证据（2026-10-02 09:31 Asia/Shanghai）

== [1] QUICKSTART.zh.md B2 五项新增（git diff 摘录）==
+日常操作：mobile 端对话登记/审批/查 KPI（「这周 OTIF 多少」出报告卡）；平台侧各域页面照常使用。夜间任务（W2-B7 起两条路，二选一勿双跑；W6-B1/B2 起夜间链尾部固定追加 lakehouse-transfer、drain-backlog、scan-alerts 三条腿）——
+#   腿序 scan-reorder → run-mrp →（月末）月度收发存快照 → calc-kpi → lakehouse-transfer → drain-backlog → scan-alerts，
+#   季初月每日幂等重算追加 calc-scorecard；任一腿失败不阻断后续；
+#   POST :13110/run-nightly 随时手动触发一次（不占当日标记）。
+#   · lakehouse-transfer：13 张 NocoBase 业务表全量替换落 nb_* Parquet 快照（经营参谋 lakehouse 口径）；
+#   · drain-backlog：补偿队列 wfl_effect_backlog 的兜底重放（serve 循环每 30s 也自跑，夜间腿是可观测兜底）；
+#   · scan-alerts（W6-B2）：跑一遍预警规则扫描（与小时循环/POST /scan-alerts 同一实现，幂等）；
+#   · 深度监控：GET :13110/healthz——backlog_pending 为补偿队列积压深度（持续 >0 查 engine 日志），
+#     last_scan_at/last_scan_failures 为预警扫描指针（停摆可发现：长时间未更新或 failures 持续 >0 即查 wfl_alert_scan_failures 审计表）。
+## 平台规则引擎与预警中心（W6-B2）
+
+四路规则（效期/资质/账期/质量）扫四张业务表，命中落 `wfl_alerts` 台账（幂等：同对象恒一行，脱离范围自动关闭，再命中重开并重新通知），阈值与责任人路由全在 `alert_rules` 行上改——代码里没有阈值。首次启用：
+
+```sh
+node --import tsx/esm examples/kb-agent/scripts/w6b2-rules.mts --seed     # 两集合+通知渠道+四路规则+预警中心两页+认领入口
+node --import tsx/esm examples/kb-agent/scripts/w6b2-rules.mts --seed-ar  # 账期规则的真实逾期种子单（演示 critical 级）
+node --import tsx/esm examples/kb-agent/scripts/w6b2-rules.mts --assert   # 验收矩阵（扫描对账/幂等/阈值可配/三元状态断言/失败隔离）
+```
+
+- **入口**：平台侧菜单组「预警中心」——「预警列表」（红黄分级 + 筛选 + 行内「认领 / 关闭预警」意图表单，经 workflow 回调引擎）与「预警规则」（阈值/路由/启停，改后下一次扫描生效；每次改动落 `wfl_alert_config_audit` 审计）。移动端登录后首页 chip「我的预警」（带计数角标）→ `#/alerts`：只看路由给你的行，行内一键「认领」/「关闭」。
+- **认领纪律（单一写入口）**：状态流 open→acknowledged→resolved 由引擎 `(from_state, action, actor_role)` 三元转换表把关——认领仅路由责任人（或 admin），关闭仅认领人（或 admin），越权/越态一律拒绝并给事实。网关侧 `wfl_*` 表默认拒绝直写（`nocobaseWflWriteScopes` 显式白名单除外），预警动作统一走 `nocobase.alertAct` → `POST :13110/alerts/act`。
+- **env 旋钮**：`W6_ALERT_SCAN_ENABLED`（默认 true，小时级扫描循环开关）、`W6_ALERT_SCAN_INTERVAL_SEC`（默认 3600，下限 60）、`W6_ALERT_ENGINE_URL`（网关 alertAct 转发目标，默认 `http://127.0.0.1:13110`）。单条规则失败只隔离该路（记 `wfl_alert_scan_failures` 审计），其余三路照常扫描；通知送达不全部落行时不落 notified 戳、留审计下一轮重试。
+

== [2] 对话端 preset 指引（mobile-form-assistant 平台预警技能，与实态一致）==
+      当前登录用户以会话开头的「【登录身份】」行为准（系统注入，用户无法伪造）：凡注册表与审批技能里的「当前用户/提交人/检验员/操作员/审批人」一律取该行的用户名，草稿卡与回执里的身份字段也用它；查待办（wfl_approval_todos）必须按该用户名过滤，绝不呈现他人的待办。服务端同样以该登录身份覆盖 requester/inspector/operator 落库值与审批审计人，并拒绝非待办人的审批——遇到身份或越权类拒绝时如实转达，禁止编造他人身份或绕过。
+      7. pur_requests 请购单（请）：触发词 请购/采购申请/申请采购/申购。必答：品名、数量。推导（列名即落库列名）：requester=当前用户、department 用户说了填、need_date 用户说了填、total_est=数量×单价（用户给了单价时）、doc_status=draft（落库后按「登记即送审」自动送审，通过后转询价下单）。系统生成：code（PR-YYYY-NNNN 递增）。落库列只有 code/requester/department/need_date/reason/total_est/doc_status。
+      12. mfg_orders 生产订单（产）：触发词 生产单/生产订单/下产单/排产单/开工单/生产一批，反词 排产结果/排产预览（降权，那是查询不是登记）。必答：品名、数量。推导（列名即落库列名）：need_date 用户说了填没说留空、doc_status=draft（落库后按「登记即送审」自动送审；通过后由计划员下达 released 才可排产领料——审批通过不等于下达）、reservation_state=none（齐套由系统在下达后计算）、bom_id 按品名 nb_list 查 mfg_boms（bom_status=active 的默认版本）解析 id——非生效 BOM 会被卡口拒绝，如实转达、std_cost 用户口述或 BOM 备考取、estimated_cost=数量×标准单位成本（超 10 万审批自动加签总经理）。系统生成：code（MO-YYYY-NNNN 递增——先 nb_list 读 mfg_orders 现有最大 NNNN 再 +1，绝不复用已有编号）。落库列只有 code/product_id/qty/bom_id/need_date/std_cost/estimated_cost/doc_status/reservation_state。
+      16. so_orders 销售订单（销）：触发词 销售订单/销售单/卖出/卖给/接单/签了单，反词 采购/进货（降权）。必答：客户、品名、数量。推导（列名即落库列名）：amount=数量×单价、need_date 用户说了填没说留空、doc_status=draft（落库后按「登记即送审」自动送审——审批通过才生效，生效后才驱动 MRP 需求与成品预留；金额超 10 万自动加签总经理）、shipping_status=none、customer_id 按名称 nb_list 查 crm_customers 解析 id。系统生成：code（SO-YYYY-NNNN 递增——先 nb_list 读 so_orders 现有最大 NNNN 再 +1）。落库列只有 code/customer_id/need_date/amount/doc_status/shipping_status/approved_by/approved_at/note——品名/数量/单价只进草稿与叙述，明细落库走 so_order_lines（order_id/product_id/qty/unit_price/qty_shipped）。
+      5. 等待动作——只认用户的围栏动作消息：form_confirm（text 为「确认写入」）才调用 nb_create；编号类系统字段（code/receipt_no 等）一律传空字符串 ""（W6-B1 起单号由服务端在写路径权威分配——客户端卡上的编号只是预估展示，多人同时开单不再共享预号，服务端发号杜绝撞号），禁止把草稿卡上的预估编号写进 nb_create；落库行里编号类字段由服务端分配、永不为空。nb_create 只写目标表实际存在的列，字段名与 form_confirm 围栏 fields 的 name 完全一致（code/amount/supplier_id/receipt_no…），禁止自创列名——写错列名整列静默丢失。采购单主行落库后，若品名/数量/单价齐备，再向 pur_order_lines 写一行明细（order_id=主行 id、product_id 按品名 nb_list 查 hub_inv_products 解析、qty、unit_price），明细行失败不影响回执。收货单落库前先按订单号回读订单：doc_status 非 approved 时如实告知「订单未生效不能收货」，等用户表态再落库（卡口也会拦）。
+         登记即送审（铁律）：下列集合的 nb_create 成功后，必须在同一回合立即调用 nb_approve(action=submit)（doc_type=该集合、doc_id=nb_create 返回的行 id、approver=当前登录用户名）把单据送进审批流——pur_orders 采购单、pur_requests 请购单、so_orders 销售订单、mfg_orders 生产订单、srm_suppliers 供应商登记（送准入审核）；submit 的状态机拒绝（重复送审/状态已流转）如实转达且绝不重试第二次 submit——同一单据永远只有一条送审记录。送审成功后回执 summary 追加一行「审批状态」＝待审批（kind 用 text；引擎返回 pending_level2 时写「二级审批中」），送审失败时回执不追加该行并如实告知失败原因。
+         清单之外集合（wms_receipts/wms_transfers/mfg_material_issues/mfg_job_reports/mfg_completions/wms_reservations/hub_* 等）一律不送审——它们的 draft/pending 是过账语义不是审批语义：登记完成如实说「已登记，待仓库/引擎过账」，禁止说「待审批」；查询技能呈现这些单据时同样按过账语义翻译（draft=待过账、pending=过账处理中、posted/done=已过账），绝不套用审批状态词。
+         成功后回一句人话叙述并输出 submit_receipt 围栏：
+         summary 固定包含「日期」（落库行的日期值）与「单号」两行（单号必须原样使用 nb_create 返回行的真实编号——服务端分配的号可能与卡上预估号不同，以返回行为准），另加 0-2 条金额/数量摘要（kind 用 money/date/id/count/text）。reject_flow（text 为「驳回」）不调任何写工具，回一句收尾话术即可。
+      - 找待办：用户问「有什么待审批的/我的待办」时，先调 nb_list 查 wfl_approval_todos（filter status=open 且 user=当前登录用户名——只呈现当前用户自己的待办，绝不展示他人待办），再对每条待办 nb_get 主表行取摘要（单号/金额/日期），然后逐单输出 approval_pending 围栏（一次最多 2 张卡；超过 2 单先叙述清单并用 ask_choice 让用户点选审哪一单）。围栏格式（值一律字符串）：

== [3] B2 Agent Note 真话债修正（zh 版 diff 统计 + 关键改句）==
5
关键改句（原→今）：
  「路由到人的裁剪在客户端做」→「R2 起行级裁剪在网关服务端（匿名读拒绝；登录人只见路由/认领行）」
  「wfl_ 前缀…登录角色无需改 scope 表即可读」→「R2 起豁免按动词拆分：读共享、写默认 403」
  门禁段「oxlint staged 0 错」→「0 error / 2 条 unused-disable warning（全量配置仍需该指令，如实计数）」
