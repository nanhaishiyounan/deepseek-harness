# @deepseek-ai/dsh-client-ui-mobile

[English](README.md) | 中文

移动端 v3 客户端壳：冷链票据台账方向的 NocoBase 业务系统 AI 员工入口——两 Tab（消息/我的）、单色戳记头像+类型徽标的会话列表、票据气泡（AI/用户各带 6px 说话角）+ Markdown 富渲染的聊天流，以及 PC 端刻意不做的「填表+盖章」闭环（三分层草稿卡+相位戳 → 确认写入/驳回 → agent `nb_create` 落库 → 指标回执卡 → 重编辑 diff）。基础控件用 antd-mobile v5，品牌面全自绘，走与 PC 壳相同的 `/api` 网关；会话、知识图谱、业务表与 PC 端完全同库。

- **组装**：`apps/web` 的 `mobile.html` 入口启动 [`AppMobileEntry`](src/client/entry.tsx)。页面不读 boot manifest：约 65 行的 unary RPC 客户端（[rpc.ts](src/client/rpc.ts)）说与 PC fetch 载波相同的 `/api/<method>` wire。antd-mobile 的全局基座在入口加载；`--adm-*` 主题在 `.dshm-root` 上同名映射到 `--dshm-*`（[tokens.css](src/client/tokens.css)）：墨青/冷雾白/霜白品牌轴、检验绿/临期琥珀/驳回砖红语义、温层三色，亮暗双轨整轨替换（暗色 selected 前景切 `--dshm-on-primary`），数字全局 tabular、票号走等宽栈。
- **两 Tab 信息架构（v3）**：消息（默认落地）与我的；v1 的 tab hash 与退役的通讯录路由都重定向到 Tab，旧深链——包括 PC 预览 iframe——继续可用。新建会话走会话列表/聊天壳头部的 `+` 底部弹层（[NewChatSheet.tsx](src/client/messages/NewChatSheet.tsx)：填表助手置顶+可办表单 chips+最近三条），弹层只建会话不冒名发消息。
- **AI 同事（v3）**：花名册来自 `agentPreset.list`（含 preset.yml 的 `welcome` 块），叠加本地视觉表（[colleagues.ts](src/client/colleagues.ts)：单色戳记底/缩写/职责/欢迎元数据，v2 渐变头像体系已退役）；「智能填表助手」是唯一持表同事，welcome 能力清单与起点 chips 由六表注册表（[formRegistry.ts](src/client/formRegistry.ts)）投影。通讯录「发消息」只建会话——不再以用户身份发任何消息，空会话由客户端渲染本地欢迎卡（WelcomeCard）。
- **聊天**：`session.history` 折叠（[fold.ts](src/client/fold.ts)）为气泡（AI 左/用户右，18px 圆角+6px 说话角、AI 侧带描边圆章徽标）、日期分隔、running/done/error 工具行与 KG 证据单行入口（点开底部弹层）；叙述段经 markdown-it+DOMPurify 富渲染（[rich.ts](src/client/messages/rich.ts)：strong 关键信息下划线、方点列表、两列票据表格、数字结论行升格半宽指标卡）；动效三处（新消息入场/点选反馈/盖章）全部尊重 prefers-reduced-motion；新鲜度靠轮询（运行 1.2s/空闲 5s），`session.cancel` 提供停止生成。
- **七型消息协议（v3）**：结构化载荷一律走 ` ```dsh ` 围栏（[protocol.ts](src/client/protocol.ts)：ask_choice/ask_field/form_draft/form_confirm/reject_flow/submit_receipt，信封 `v:3`；坏围栏降级为普通文本不炸流）；welcome 刻意不上 wire。fold（[fold.ts](src/client/fold.ts)）把 assistant 消息切成「叙述段 + 结构化 item」，围栏永不进气泡；点选作答 = 发一条普通 user 文本，已答态（置灰/高亮/选择胶囊）由重放派生；确认/驳回是围栏化 user 动作（ActionBadge），不再有 `确认推送：` 协议文本。
- **填表+人审+提交**：v3 草稿（[forms/v3/DraftCard.tsx](src/client/forms/v3/DraftCard.tsx)）按三分层渲染（需要你定/请确认·AI 推导带依据/系统生成折叠）+ 相位戳，卡上直接「确认写入/驳回」，重编辑走 revision+1；回执是指标卡（[forms/v3/ReceiptCard.tsx](src/client/forms/v3/ReceiptCard.tsx)：金额大数/两列摘要/三步流程/行号戳）。卡片相位按 draftId+revision 从日志重放（[cardState.ts](src/client/cardState.ts)），被取代 revision 隐藏；v2 历史会话保留旧围栏/前缀/文本回执重放与两步审核卡（[form-draft.ts](src/client/form-draft.ts)、[task-cards.tsx](src/client/forms/task-cards.tsx)）。未提交编辑仍按草稿内容哈希存 localStorage（[draftStore.ts](src/client/draftStore.ts)）。

路由：由 web-app bundle 的 `mobileEnabled` 配置托管在 `/mobile`（原生 `dist/mobile.html`）；PC 侧手机壳预览在 `@deepseek-ai/dsh-client-ui-mobile-preview`。

## 模型体验

无：本包是浏览器端页面，渲染网关数据、不注册任何模型可见面；会话背后的 agent 看到的输入与 PC 工作台渲染的相同（预览视图的 view-context 投影按设计只到标题级）。移动端流程只改变用户消息的形态——点选作答（选项 send 文案）与围栏化的 确认写入/驳回 动作写入 durable log——不改变本包拥有的模型可见面；欢迎语不上 wire、模型不可见。

#### KV 缓存效应

无；本包既不组装也不发送 provider 请求。

## 已知限制与遗留

- 仅演示级鉴权：任意 6 位验证码可登录（`verifyCode` 是真实通道的接缝）；部署仍靠宿主的磁盘级访问控制保护。
- 聊天新鲜度是 history 轮询（运行 1.2s/空闲 5s），不是 mux/host 流；本批移动端不 token 流式显示进行中文本。
- 未读点与「待审核」筛选是本地派生（localStorage 的已读水位/pending 标记）；wire 既无未读计数也无按会话的审核态——重载保留日志重放的卡片相位，但本地标记重置。
- 字段控件映射覆盖 input/number/date/bool/enum/relation，枚举词表为本地实测；wire 的 `nocobase.listMeta` 不投影 select 选项，interface 长尾回退纯文本。
- 关联 Picker 按目标表 `name`/`nickname` 列显示选项、提交目标行 id；草稿因此携带关联 id（同事 persona 在出草稿前把名称解析成 id）。
