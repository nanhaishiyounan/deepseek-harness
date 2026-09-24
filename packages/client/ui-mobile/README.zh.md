# @deepseek-ai/dsh-client-ui-mobile

[English](README.md) | 中文

移动端 v6「AI 同事」客户端壳：食品企业移动端工作台——四 Tab（消息/同事/工作台/我的）十路由的工作界面、AI 同事聊天流（票据气泡 + Markdown 富渲染 + v3 填表闭环 + v5 报告卡），以及「报告卡 → 创建任务 → 隔离执行 → 回源确认」的工作闭环。视觉代际是 v6 蓝色系设计稿（plans/2026-09-23-mobile-v6-uidesign：品牌蓝 + 渐变副色、430px 手机壳），页面版式分批换装中。基础控件用 antd-mobile v5，品牌面全自绘，走与 PC 壳相同的 `/api` 网关；会话、知识图谱、业务表与 PC 端完全同库。

- **组装**：`apps/web` 的 `mobile.html` 入口启动 [`AppMobileEntry`](src/client/entry.tsx)。页面不读 boot manifest：约 65 行的 unary RPC 客户端（[rpc.ts](src/client/rpc.ts)）说与 PC fetch 载波相同的 `/api/<method>` wire。antd-mobile 的全局基座在入口加载；`--adm-*` 主题在 `.dshm-root` 上同名映射到 `--dshm-*`（[tokens.css](src/client/tokens.css)）：v6 品牌蓝 `#2E7CF6` + 渐变副色（`--dshm-brand2`/`--dshm-user-grad`）、雾蓝白底/白卡/蓝灰次文字、通过/琥珀/危险红语义，亮暗双轨整轨替换，数字全局 tabular、票号走等宽栈。根容器画 430px 手机壳：窄视口全宽流式，≥720px 桌面居中 24px 圆角 + 外阴影，body 衬底随主题镜像（App.tsx）。
- **信息架构（v6）**：十路由——`#/`（home，默认落地）、`#/chats`、`#/chat/:id`、`#/work`、`#/work/:id`、`#/me`、`#/tasks`、`#/files`、`#/agents`、`#/login`；TabBar 四项为 消息/同事/工作台/我的（home/agents/work/me，58px 高、22px 线性图标），`#/chats` 全部会话降为带 PageNav 返回头的全屏层，chat 与工作详情也是全屏层，任务/文件为二级页（[router.ts](src/client/router.ts) / [MobileShell.tsx](src/client/shell/MobileShell.tsx)）。v1/v2 旧 hash 折叠：workbench→工作、contacts→AI 同事目录、messages/data/kg→全部会话层、profile→我的——旧深链（含 PC 预览 iframe）落到活页。页面按路由 key 重挂载转场（Tab 间淡入、层 14px 推入，均为设计稿 pageIn 的 .22s ease，尊重 prefers-reduced-motion）。
- **首页（v6 消息形态）**：渐变 hero 问候卡、搜索框入口（落到持有真实过滤的全部会话层）、紧凑今日台账 chip 行、快捷任务 chips、同事头像横滑（右缘渐隐）、最近会话 conv-item 行——在场状态点、单行投影预览、相对时间、基于 draftStore 已读水位的未读红点（[HomeView.tsx](src/client/home/HomeView.tsx)）。
- **AI 同事（v6 roster 形态）**：花名册来自 `agentPreset.list`（含 preset.yml 的 `welcome` 块），叠加本地视觉表（[colleagues.ts](src/client/colleagues.ts)：单色戳记底/缩写/职责/欢迎元数据 + v6 分组/技能/状态字段）；同事 Tab 渲染能力分组（内容与创意/数据与技术/职能与效率，未归类 preset 收进「更多 AI 同事」，空组不渲染组题）带技能 pill 与在场 chip——AI 在场按产品语义恒为「在线」。工作台页的 2 列工具网格按 preset 派生一卡，其「去聊聊」走真实 `createSession` + `promptSession` 链路并以该同事首条 starter 作为开场消息（[WorkView.tsx](src/client/work/WorkView.tsx)）；首页横滑与 roster 行都走 `createSession`，只建会话、绝不以用户身份发消息；空会话由客户端渲染本地欢迎卡（WelcomeCard）。「智能填表助手」仍是唯一持表同事，welcome 能力清单与起点 chips 由六表注册表（[formRegistry.ts](src/client/formRegistry.ts)）投影。
- **聊天（v6 形态）**：`session.history` 折叠（[fold.ts](src/client/fold.ts)）为双态气泡（bot：白底描边托盘带左上 6px 角；user：渐变带右上角，均 78% 宽、.28s 入场）、呼吸三点打字板、日期分隔、running/done/error 工具行与 KG 证据单行入口；叙述段经 markdown-it+DOMPurify 富渲染（[rich.ts](src/client/messages/rich.ts)），围栏代码先于显示词映射整体拆出、渲染为带语言标签与复制入口的深色代码板（clipboard → execCommand 兜底 → toast）。输入栏承载 + 入口与底部上滑快捷面板（该同事自己的 starters 作指令 + 语音/文件/表情占位 toast）、22px 圆角输入框、渐变发送钮。首页「最近对话」过滤工作会话（隔离集合登记在本地）。新鲜度靠轮询（运行 1.2s/空闲 5s），`session.cancel` 提供停止生成。
- **消息协议（v3 + v5 report 围栏）**：结构化载荷一律走 ` ```dsh ` 围栏（[protocol.ts](src/client/protocol.ts)：ask_choice/ask_field/form_draft/form_confirm/reject_flow/submit_receipt/report，信封 `v:3`；坏围栏降级为折叠原文不炸流）；welcome 刻意不上 wire。report 卡（[ReportCard.tsx](src/client/messages/ReportCard.tsx)）渲染指标网格/条目行/表格/动作按钮，条数上限是契约一部分（metrics 1-6、rows ≤8、table 列 ≤5 行 ≤10、actions ≤4），超限整卡降级；动作四类：view 产品内路由、create-task 打开任务表单、send 以用户身份发送完整指令、link 外链。
- **工作闭环（v5 语义、v6 轴形态）**：[workStore.ts](src/client/workStore.ts)（localStorage `dsh-mobile-work`）持有四态工作项（待处理→进行中→待确认→已完成，状态机守卫非法转移）；报告卡「创建处理任务」打开表单弹层（[actions.ts](src/client/actions.ts)），创建即向源会话发 M1 通知；执行在隔离执行会话进行——live 模式真实建会话并发 M2 指令，完成后回源会话发 M3、驳回返工发 M4；工作详情（[work/workTimeline.ts](src/client/work/workTimeline.ts)）两态时间线：真实态轮询执行会话日志折叠为步骤与结果，演示态脚本推进，doing 态提供「重新执行/手动完成」逃生门（挂起自救，手动完成同走 M3 通道）。v6 轴形态渲染 56px 右对齐时间列（live 取工具行时钟/demo 取 01 式序号）、光环轴点压 2px 轴线，并派生 done/total 渐变进度条。文件页（`#/files`）三分区互补视图——最近文件 = 近 7 天全部产物（行带 AI 来源徽标）、AI 生成 = 其 AI 来源过滤子集、收藏 = 本地星标（含报告预览）；我的任务页（`#/tasks`）分我的/团队两栏。
- **两态（真实/演示）**：[runMode.ts](src/client/runMode.ts) 由 ProfileView 的 AI 偏好显式开关与 `llm.models` 自动探测共同判定（无模型目录时演示态：不建执行会话、时间线模拟推进，宁可演示不冒充真实）；首启演示 seed（[demoSeed.ts](src/client/demoSeed.ts)：团队任务与收藏报告，全部带 demo 标记），「清除演示数据」只删演示项。
- **填表+人审+提交**：v3 草稿（[forms/v3/DraftCard.tsx](src/client/forms/v3/DraftCard.tsx)）按三分层渲染（需要你定/请确认·AI 推导带依据/系统生成折叠）+ 相位戳，卡上直接「确认写入/驳回」，重编辑走 revision+1；回执是指标卡（[forms/v3/ReceiptCard.tsx](src/client/forms/v3/ReceiptCard.tsx)）。卡片相位按 draftId+revision 从日志重放（[cardState.ts](src/client/cardState.ts)）；v2 历史会话保留旧围栏/前缀/文本回执重放。未提交编辑仍按草稿内容哈希存 localStorage（[draftStore.ts](src/client/draftStore.ts)）。

路由：由 web-app bundle 的 `mobileEnabled` 配置托管在 `/mobile`（原生 `dist/mobile.html`）；PC 侧手机壳预览在 `@deepseek-ai/dsh-client-ui-mobile-preview`。

## 模型体验

本包是浏览器端页面，不注册任何模型可见面；会话背后的 agent 看到的输入与 PC 工作台渲染的相同。移动端流程只改变用户消息的形态——点选作答（选项 send 文案）、围栏化的 确认写入/驳回 动作，以及 v5 工作闭环的动作消息（M1 创建通知、M2 执行指令、M3 完成通知、M4 返工指令与报告卡 send 动作）都以真实 user 消息写入 durable log，模型可见⟺日志可重建；欢迎语不上 wire、模型不可见，工作数据本体（workStore）也不上 wire。

#### KV 缓存效应

无；本包既不组装也不发送 provider 请求。

## 已知限制与遗留

- 仅演示级鉴权：任意 6 位验证码可登录（`verifyCode` 是真实通道的接缝）；部署仍靠宿主的磁盘级访问控制保护。
- 聊天新鲜度是 history 轮询（运行 1.2s/空闲 5s），不是 mux/host 流；本批移动端不 token 流式显示进行中文本。
- 工作数据是本地态：workStore 存 localStorage，不与服务端同步——换设备或清浏览器数据后工作项与演示 seed 丢失；日志回放只覆盖会话内事实（M1-M4 消息），工作项状态本身不可跨设备重建。
- 工作会话隔离是本地登记：执行会话的隔离集合只存本机，其他设备与 PC 端仍会在会话列表看到执行会话。
- 未读点与「待审核」筛选是本地派生（localStorage 的已读水位/pending 标记）；wire 既无未读计数也无按会话的审核态——重载保留日志重放的卡片相位，但本地标记重置。
- 字段控件映射覆盖 input/number/date/bool/enum/relation，枚举词表为本地实测；wire 的 `nocobase.listMeta` 不投影 select 选项，interface 长尾回退纯文本。
- 关联 Picker 按目标表 `name`/`nickname` 列显示选项、提交目标行 id；草稿因此携带关联 id（同事 persona 在出草稿前把名称解析成 id）。
