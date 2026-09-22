# Agent Note：移动端 v3 —— dsh 围栏协议、表单注册表与"欢迎语不冒名"契约

Status: implemented

[English](2026-09-21-mobile-v3-message-protocol.md) | 中文

## 问题

移动端 v2 的填表闭环以用户身份自动发开场消息、用 `key=value` 散文向用户索要全部字段、没有可点选的询问、每个 AI 同事绑死一张表族，且确认/驳回靠自然语言前缀（`确认推送：…`）加正则反解。v3 重设计（[01](../../../../plans/2026-09-21-mobile-v3-redesign/01-product-problem.md)、[02](../../../../plans/2026-09-21-mobile-v3-redesign/02-information-architecture.md)）以十一态会话机与结构化消息协议取而代之。

## 决策

**七型消息、一种围栏。** `protocol.ts` 拥有 wire 词表：结构化载荷一律走 ` ```dsh ` 围栏，携带 `v:3` + `type`（ask_choice / ask_field / form_draft / form_confirm / reject_flow / submit_receipt）；第七型 `welcome` 刻意不上 wire——它是 preset 元数据，空会话时客户端本地渲染（静态文案、不耗模型回合、标题生成不消费）。模型输出容忍：坏围栏或未知 type 降级为普通叙述文本并计入 `FoldedTurn.degradedFences`，可选展示提示（mode/variant/allowFreeText、hint、单位、理由、建议）缺失时取默认值而非拒收；只有必填成员的结构性违规才拒收。

**围栏永不进气泡。** `fold.ts` 按原文顺序把 assistant 消息切成叙述段与结构化 item（`ChatItem` 新增 `ask`/`field-ask`/`action`/`receipt`）；v2 的 ` ```json ` 草稿围栏为历史会话保留解析、已识别围栏从气泡剥离。点选作答 = 发一条普通 user 文本（`option.send ?? option.label`）；fold 纯重放派生已答态（选项组置灰、所选项高亮、选择回执胶囊）——自由打字同样作答，只是无高亮。用户动作用 `确认写入`/`驳回` + 围栏上 wire；v2 前缀消息折进同一 `action` item，旧协议文本不再污染气泡。

**相位重放锚定 draftId+revision。** `cardState.ts` 按围栏载荷判别：form_confirm 认领其 draftId 的最新 revision 卡（旧 revision confirm 不改变任何东西）、reject_flow 在未落库时驳回、submit_receipt 把 pending 结为 submitted 并携带回执载荷；被取代的 revision 从流中隐藏。v2 会话保留按 collection 前缀的重放。pending 态只由日志派生。

**六表注册表。** `formRegistry.ts` 是唯一数据源，助手的意图匹配、字段分层推导规则与欢迎能力清单都从它投影（采购/供应商/质检/入库/出库/回款）。`matchIntent` 按 intentTerms 打分（泛登记动词给每表 +1，反词降自己表族），裁决 unique（≥3 且领先 2，或非疑问句唯一强动词 ≥2 且领先）/ ambiguous（前 3 名分叉）/ none（低于强命中线的疑问句交给只读分支）。改注册表必须同步改 `mobile-form-assistant` 的 persona 文本（计划的 `{{formRegistry}}` 模板变量以字面内联实现——persona 插件拥有变量表，本批不扩槽位）。

**唯一持表同事。** `mobile-form-assistant` 是唯一挂表 preset（六步契约按注册表匹配、推导先行、带 tier 注记的 `form_draft` 字段、围栏化询问与回执摘要重写）；`purchase-assistant`/`quality-assistant` 退役。preset 通过 preset.yml → `readPresetMetadata` → `agentPreset.list`（zod 校验）发布 `welcome` 块；客户端优先 wire 块、回退本地 `colleagues.ts` 表。会话以本地欢迎语开场——`ContactsView.start` 不再发任何消息，空会话 golden 断言 user 消息为零。

## 影响

- durable log 仍是唯一审计：点选、确认、驳回、回执都是普通消息；重载与 PC 预览重放出一致的卡片相位与已答态，不依赖 localStorage。
- v3 脚手架组件（`WelcomeCard`、`ChoiceBubble`、`FieldAskBubble`、`ActionBadge`、`RichContent`、`forms/v3/{PhaseStamp,DraftCard,ReceiptCard}`）带着视觉批（03 §4）要重做的类名/testid 结构；tokens 与 Markdown 渲染刻意不在本批。
- e2e 种子集覆盖分叉全生命周期：模糊句 → 双卡 ask_choice → 点选文案进日志 → 三分层草稿 → 围栏确认 → 回执指标卡，另有空会话断言欢迎语与 A1 的零 user 消息不变量。
- v2 历史会话重放不变（围栏解析回退、前缀动作、文本回执）；其草稿保留两步审核卡。

## 备选方案

- **welcome 作为落日志的 assistant 消息。** 否决（02 §2.2）：静态文案上 wire 会诱惑未来实现把它当回合触发器，复刻冒名 bug。
- **为提交加 `nocobase.create` wire 方法。** 维持 v2 否决：agent 的围栏确认 → `nb_create` 流程审计人确认过的确切字段。
- **按表族多个同事 preset。** 退役：一个注册表驱动的助手加分叉询问取代入口绑表（用户原话"并不是只有采购单"）。
