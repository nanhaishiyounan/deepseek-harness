# Agent Note: W22-R1 — widget 与必答字段决策面收敛到服务端（确定性 resolver + 表单契约）

Status: implemented

[English](2026-10-08-w22-r1-deterministic-widget-form-contract.md) | 中文

## Problem

W22 验证 70/100，B1/B2 已达成；所有失败维度都在模型输出侧。真实网关上的 ×10 同 prompt 复读显示：`widget` 命中率 50%（run 2 把 `quantity`/`unit_price`/`amount` 声明成 `text`，而 schema 与 few-shot 教学齐备）、pur_orders 必答集 3/10 次整缺（品名/数量/单价字段完全不上卡——用户无法在卡上改一个不存在的值）、run 1 把 collection 漂移到 `hub_inv_products` 并自造 `sku`、wms_receipts 场景同字段在 `select`+options 与裸 `text` 间漂移。教学补不齐：模型持续在机械可判定事实上掷骰子。

## Decision

- **字段名 → widget 判定器**（[widget.ts](../../../../packages/interaction/tool-present-card/src/widget.ts)）：结构校验通过后，`resolvePresentCardPayload` 改写 `form_draft.fields[]` 与 `ask_field.field` 的 widget——数量/金额类字段名与 label（`quantity`/`qty`/`unit_price`/`price`/`amount`/`total_est`/`forecast_qty`/`lot_qty`/`sample_qty`/`qty_scrap`/`defect_*`，`_qty`/`_price`/`_amount`/`_cost` 后缀，label 片段 数量/单价/价格/金额/总额/合计/成本/费用）→ `number`；日期类字段名（`need_date`/`received_at`/`inspected_at`/…，`_date`/`_at` 后缀，label 片段 日期/到期/交期/截止）→ `date`；非空 `options` 数组 → `select`。字段名证据优先于 label，二者优先于 options 启发式，无法判定的字段保持模型声明（fail-open 是有意的：机械可判定的事实不进模型决策面；枚举词表仍归模型）。改写后的载荷继续走完整校验。W22-R1 当时宣称「客户端零镜像改动」——这是错的：改写后的载荷从不离开服务端（session log 与模型上下文保持声明，execute 结果只有 `{presented: true}`），渲染跟随声明 widget，判定器对验证是死码。W22-R2 接通了渲染：客户端在两条载荷通道上折叠同一条分类规则（见 Follow-up 的 R2 修正节）。
- **表单契约**（[form-contract.ts](../../../../packages/interaction/tool-present-card/src/form-contract.ts)）：新增 `formCollections` 配置（schemastery 校验），键即集合白名单——未注册的 `form.collection` 整卡拒绝并列出合法候选；每集合的 `requiredFields` 声明字段下限：每组列同义列名加业务名，缺组拒绝并带路径错误（`payload.fields缺少必答字段 quantity/qty（数量）——必答字段必须出现在卡片上，值可预填`）。值可预填可 null，只约束字段在场。配置为空或不配置则不做任何约束，通用部署保持无契约行为；execute 在既有条数校验之后拼接契约错误并抛 `ToolArgsError`（模型一轮补齐）。
- **单一来源注册表配置**（[cordis.patch.yml](../../../../examples/kb-agent/cordis.patch.yml)）：kb-agent overlay 把 persona 注册表全部 17 个集合钉成白名单，5 张高频表（pur_orders、srm_suppliers、qm_inspections、wms_receipts、hub_wms_inbound）带必答下限；其余 12 张仅白名单，未建模的表不误伤。配置注释指向 persona 注册表，钉死同步义务。
- **教学随机制更新**：persona 第 4 步写明「值可缺、字段必须上卡」；widget 句说明数量/日期类由系统按字段名设定（照常声明、不一致自动纠正）；重试纪律补白名单与必答字段自查。`.dsh` preset 投影字节一致（`cmp`）。

## Consequences

- 三个已验证的失败族与模型方差解耦：`text` 声明的 `quantity` 渲染为数字键盘；缺 品名/数量 的 pur_orders 卡带一轮补齐错误回炉；`hub_inv_products` 草稿整卡拒绝。
- `select`↔`text` 漂移收窄但不消失：`receipt_type` 类字段仅在模型已带 options 时被强制 `select`；无 options 的状态字段保持降级为 text（延续 W22 note 的诚实降级立场）。persona 教学在词表存在处推动带 options。
- widget 改写是静默的（工具结果无提示）：模型只看到成功回执。这是刻意的——改写是机械纠正而非违约，提示会诱导模型重翻已定事实。

## Alternatives considered

- 把 17 表注册表硬编码进包内——拒绝：deployment-varying 数据属于被校验的 config（仓库惯例），且包须对非 kb-agent 消费者保持无契约。
- 解析 persona 自然语言注册表派生白名单——拒绝：那段散文是模型教学不是机读源；config 就是机器视图，其注释钉死同步义务。
- 对状态类字段名在无 options 时强制 `select`——拒绝：服务端无法发明选项词表（每集合枚举在 NocoBase），强制要么引入新的误拒面，要么留无候选的 `select`（客户端照样降级）。

## Follow-up

- 12 张仅白名单的表暂无必答下限；某表的验证出现同类缺字段失败族时再补组。
- W22 note 的 follow-up 继续有效（页面级 CTA 档位、legacy e2e 登录漂移）。

## W22-R2 修正：判定器一直缺的渲染侧接线

W22-R1 验证（FAIL 80）用活体探针证实了旁路：被要求声明 `quantity widget:"text"` 的模型产出的卡，session log 载荷带 `text`、渲染控件是普通文本输入——服务端改写校验不到任何用户可见的东西。R2 批次封口：

- **客户端镜像**（`dsh-client-ui-mobile` 的 `src/client/widget.ts`）：`inferWidgetKind`/`applyDeterministicWidgets` 从本包 `widget.ts` 镜像（client bundle purity 门禁拒绝跨插件值导入——interaction 包不是 inline-safe wire layer），在折叠层的共享映射 `appendPayloadItem` 应用，`present_card` 工具通道与 legacy ```dsh 围栏通道分类口径一致。session log 与模型上下文保持声明；只有渲染控件跟随分类。同一变更内 shipped 规则精化：note 族字段名（`note`/`remark`/`comment`/`description`/`memo` 及后缀）与 备注/说明/描述/摘要 label token 先于金额/日期片段钉住声明；片段匹配改为 label token 的词尾头词（入库数量/合计金额 这类复合词尾），连接词粘连的 token（含单价）不命中——`customer_note` label「客户备注（含单价上限说明）」的误伤反例在两端镜像都有测试钉死。
- **被拒卡折叠**（FAIL 80 第二根因）：折叠层预扫描 `tool/result` 事件，结果带 `isError` 的 `present_card` 调用折叠为 degraded 通知而非可交互卡——被退回的草稿不能再对着修正版确认。
- **Config fail-loud**：入口值导出 `Config`（cordis 校验并落默认值），`apply` 对顶层未知配置键启动即报错——schemastery 的 object resolver 对未知键静默 merge，`formCollections` 拼错会被读成「未配置」而无声跳过白名单与必答下限。
- R1 的十连 10/10 读数因此归因于 persona 教学 + 渲染层分类对模型声明的双保险——不归功于服务端改写，它自身从未触及任何渲染控件。
