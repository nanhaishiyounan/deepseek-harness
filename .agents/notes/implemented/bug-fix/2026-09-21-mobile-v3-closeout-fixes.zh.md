# Agent Note: 移动端 v3 收尾修复——围栏降级折叠、`{{today}}` 提示词变量、persona 表名纪律

[English](2026-09-21-mobile-v3-closeout-fixes.md) | 中文

Status: implemented

## Problem

移动端 v3 重设计的真实 API 实跑验证（[证据](../../../../plans/2026-09-21-mobile-v3-redesign/04-verification-evidence.md) §4）暴露三个已交付缺陷：

1. 校验失败的 `dsh` 围栏降级为**围栏原文 JSON 直接渲染进用户气泡**——单个字段类型瑕疵（裸数字 `rowId`、未知 `widget`、`null` 系统值）就让整份负载消失并把裸协议文本倾倒给用户，违背「协议负载在视觉层隐形」的 v3 原则。
2. 模型**没有当前日期输入**，「日期=今天」的推导随即失真（依据写"今天=2026-09-21"，PG 却落库 `order_date=2026-05-14`）。
3. 工具间叙述泄漏内部 `hub_` 表名（"我看到有 hub_po_purchase_orders 采购单 collection"）——persona 此前虽禁出现在正文，但禁令范围未明确覆盖工具调用之间的叙述。

## Decision

**降级围栏折叠，绝不倾倒。** [`splitMessage`](../../../../packages/client/ui-mobile/src/client/protocol.ts) 对校验失败的围栏输出独立的 `degraded` 段类型（携带围栏原文），不再折入叙述；[`foldHistory`](../../../../packages/client/ui-mobile/src/client/fold.ts) 将其投影为 `degraded` 聊天项，由 ChatView 渲染为折叠的 `<details>` 摘要行（「结构化消息（格式异常，已折叠）」），展开可见原文。凡含 `dsh` 围栏（无论合法或降级）的消息一律走 v3 路径，全部畸形的围栏不再落入 v2 叙述拆分；v2 的 ```` ```json ```` 草稿路径不受影响。`degradedCards` 计数与已答态语义（降级通知与任何 assistant 项一样使挂起提问失效）保留；降级通知同样推进 `contextChipsOf`，与文本/卡片/回执一致。

**主循环注册 `{{today}}` 提示词变量。** `dsh-agent-loop` 在 `provider`/`model`/`cwd` 旁注册 `today`，每次组装求值为宿主进程本地日历日期（`YYYY-MM-DD`）——跨午夜的会话在下一步渲染新日期。移动端智能填表助手 persona 开篇声明「今天的日期是 {{today}}」，并要求一切「日期=今天」推导取该值。[README.md](../../../../packages/core/system-prompt/README.zh.md) 与其中文版在随附变量清单中加入 `{{today}}`。

**persona 纪律把表名禁令覆盖到一切面向用户的文本。** 移动端 persona 的正文纪律现覆盖工具调用之间的过渡说明、草稿与回执，`hub_` 集合名只允许出现在工具调用参数与协议围栏 JSON 内部，并保留业务名词汇规则。

## Alternatives considered

**解析时对无损负载变体做 coerce**（数字 `rowId` → 字符串、未知 `widget` → `text`、`null` 系统值 → `""`）。暂缓：它以静默修正对抗模型契约，且救不了结构性残缺的围栏；折叠摘要一次消除所有失败类别的用户危害。之后仍可针对证据记录的具体变体补充 coerce。

**经 apiproxy 或移动端组合链上的插件注入日期。** 否决：persona 模板已经通过主循环注册的变量插值 `{{model}}`/`{{cwd}}`，而"今天是几号"是每个组合共享的会话固有事实——按链注入会复制机制，且其他 preset 拿不到该变量。

**persona 静态声明（"不确定日期必须询问或用服务器默认"）+ 草稿卡日期字段默认展开可改。** 否决作为主修法：它放弃推导承诺而非兑现承诺；仅作为变量不可用时的 persona 兜底措辞保留。

**在客户端 fold 过滤叙述中的 `hub_` 名。** 否决：客户端无法可靠区分表名与业务短语，客户端洗文本会掩盖模型行为问题而非在提示词层修复。

## D2 验收跟进（2026-09-22 批次）

真实模型 D2 验收 5 项 Important + 1 项 Minor 失败，逐项修复并随附测试：

1. **新会话首屏身份（N1）。** `session.create` 之后的首次 `session.list` 读取与创建竞速，会话头部与欢迎卡在刷新前回落到本地会话视觉。[`createSession`](../../../../packages/client/ui-mobile/src/client/sessionsService.ts) 现在把 create 应答的 `agentPreset` 回显记入 pending 表，ChatView 在列表行到位前读它——create 回显的用途正是免刷新标注身份。
2. **系统编号落库永不空（N2）。** persona 让模型在写入时自行生成 `po_number`，模型方差有时漏掉（批次 id=16 空值落库）。新增 [`systemFields.ts`](../../../../packages/client/ui-mobile/src/client/systemFields.ts) 在客户端生成注册表声明的编号——按集合现有行取同年最大后缀 +1，读取失败回退时钟后缀——按 draftId 缓存使修订版复用同一号；`mergeCardValues` 把编号与客户端日历日期折进草稿卡显示与 `form_confirm` 字段，persona 改为强制透传非空确认值。
3. **展示侧泄漏脱敏（N3）。** persona 禁令保持主位但在模型方差下不充分（单会话泄漏 `hub_po_items（product_name/qty/unit_price）`、`supplier_id=7`、选项 hint 带表名）。[`sanitizeBizText`](../../../../packages/client/ui-mobile/src/client/messages/rich.ts) 按注册表的有界业务词表映射标识符，不可映射的 `hub_` 名降级为 业务记录，仍带标识符的括号组整组移除；叙述与 ask 的问题/选项/hint 渲染均过它。本项取代本注早前对客户端过滤的否决：映射是注册表词表上的闭字典而非开放式文本猜测，早前"无法可靠区分"的反对不再成立——用户不见标识符的保证现在由界面层兜底。
4. **协议围栏名不以工具行渲染（N4）。** 模型把 `ask_field_pricing` 当（不存在的）工具调用时界面出现 `✕ ask_field_pricing`。fold 把协议名调用（`ask_*`、`form_draft`、`form_confirm`、`reject_flow`、`submit_receipt`）标记为 protocol 行，渲染为一条固定状态行（补充信息… / 正在登记…），不展示名字与失败标记。
5. **回合级头像（N5）。** 一个 AI 回合被 fold 拆出的每段都重复头像+徽标（单屏 7+ 次）。用户消息之后的首个助手项渲染头像列，后续段渲染 32px 等宽占位列保持对齐——裁决行已补入 [03-visual-design.md](../../../../plans/2026-09-21-mobile-v3-redesign/03-visual-design.md) §4.1。
6. **`order_date` 取客户端当日（Minor）。** `{{today}}` 链路端到端核查通过（loop 解析宿主本地日期，dev 宿主与浏览器同区）；id=16 的差一天是深夜验收的日期翻转叠加模型漂移。`mergeCardValues` 把未编辑的 derived `今天` 日期字段钉在客户端日历日期上，落库值不再依赖模型。首次复测 `order_date` 仍落空：模型自创了表里不存在的列名（`po_date`、`total_amount`）——注册表只显式点名了 `po_number`，而那恰是唯一落住的一列。persona 现在写明两张在表集合的确切可写列（`hub_po_purchase_orders`：supplier_id/order_date/status/total/po_number，主行后补一行 `hub_po_items` 明细；`hub_po_suppliers`：name/contact_name/email/rating/status，`supplier_code` 仅草稿展示不写库），禁止自创列名，并固定回执 summary 必含日期与单号。终轮实跑 `order_date`/`total`/`po_number` 全部非空落库（PG 行 id=18/19）。

## Consequences

畸形围栏的代价从协议倾倒降为一行折叠摘要；原文保留在 details 展开态便于诊断。严格变量契约意味着引用 `{{today}}` 的 persona 在脱离随附主循环的组合里会让该轮次响亮失败——与 `{{cwd}}` 既有的 fail-loud 规则一致。落库保证（系统编号非空、今天日期取客户端日历）由界面层承担：确认围栏携带显式值且 persona 透传，写路径不再依赖模型发明它们。单测覆盖 pending preset、协议行折叠、脱敏器、编号/日期合并与渲染分支（每回合一头像、中性协议行）；触面文件覆盖率保持按文件 100%。终轮活浏览器验收（新建会话→模糊输入→分叉询问→三层草稿→确认→回执，390×844）十一项程序化断言全过，整轮 innerText 零 `hub_`/协议名，十张 PNG 存于 [research/2026-09-21-mobile-v3](../../../../research/2026-09-21-mobile-v3)。早前遗留项——harness 侧回执/nb_create 一致性校验——仍开放，另记终轮两处模型方差残迹：第二次草稿修订可能取了落库行未使用的号新，可选的 `hub_po_items` 明细行有一轮 `purchase_order_id` 为空；四张尚无物理表的注册表单（`hub_qc_inspections`、`hub_wms_inbound`、`hub_wms_outbound`、`hub_fin_payments`）在建表前仍沿用注册表字段名。
