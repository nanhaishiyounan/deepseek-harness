# @deepseek-ai/dsh-client-ui-mobile

[English](README.md) | 中文

移动端 v7「AI 同事」客户端壳：食品企业移动端工作台——四 Tab（消息/同事/工作台/我的）十二路由的工作界面、AI 同事聊天流（票据气泡 + Markdown 富渲染 + v3 填表闭环 + v5 报告卡），以及「报告卡 → 创建任务 → 隔离执行 → 回源确认」的工作闭环。视觉语言是 W9「酱园琥珀 · Sauce Amber」体系（暖纸画布 `#fbf5eb`、柿橙 `#b4530a` 在 CTA/关键数字/选中态上的心跳、深焙墨文字，以及印章语汇——纸标签气泡的折角收口、带朱点的胶囊章、hero 批次酱印与发送钮的圆印章、台账纸回执卡右下外飘的「收讫」落款印；链接与表单助手章走柿橙深阶/提亮阶（W10 移除了 W7 普鲁士蓝锚与暗轨蓝灰链接）；token 单一来源是 [demos/acceptance-w9/design-language-w9.md](../../../demos/acceptance-w9/design-language-w9.md)），叠加 W8 可达性增量（`--dshm-focus-ring` 键盘焦点环、`--dshm-link` 文字链接档、40px 次级 / 44px 主路径触控阶梯、16px 输入字号下限、暗轨输入底与卡底分阶）。元素级控件全面用 antd-mobile v5（按钮、标签、徽标、进度、骨架、输入——面色经组件 CSS 变量 dial 挂在 `--dshm-*` 轨道上），布局容器保持自绘，走与 PC 壳相同的 `/api` 网关；会话、知识图谱、业务表与 PC 端完全同库。

- **组装**：`apps/web` 的 `mobile.html` 入口启动 [`AppMobileEntry`](src/client/entry.tsx)。页面不读 boot manifest：约 65 行的 unary RPC 客户端（[rpc.ts](src/client/rpc.ts)）说与 PC fetch 载波相同的 `/api/<method>` wire。antd-mobile 的全局基座在入口加载；`--adm-*` 主题同名映射到 `--dshm-*`，令牌同时声明在 `.dshm-root` 与 `html[data-theme]` 孪生挂载点上（[tokens.css](src/client/tokens.css)）——暗轨以自己的色盘整表重声明 `--adm-*`（W10：此前仅亮轨映射，暗轨组件曾落在 antd 默认色如胶囊 tab 的 #f5f5f5 上），且壳内所有原生 `button` 的 UA reset 走低优先级级联层（`@layer dshm-button-reset`），模块类与 antd 面色无需与裸选择器比特异性。antd-mobile 弹层（Popup/Picker/DatePicker/Dialog/Modal）经壳内 portal host 挂载（[portal.ts](src/client/portal.ts)），既继承令牌也留在 430px 壳内。根容器画 430px 手机壳：窄视口全宽流式，≥720px 桌面居中 24px 圆角 + 外阴影（根的 translateZ 在桌面把 fixed 弹层限位在壳内），body 衬底随主题镜像（App.tsx）。
- **视觉语言（W9 酱园琥珀）**：token 体系以 [design-language-w9.md](../../../demos/acceptance-w9/design-language-w9.md) §3 全表为单一来源，亮暗双轨整轨声明在 [tokens.css](src/client/tokens.css)——基名层（`canvas/card/card2/brand/brand-deep/brand-soft/on-brand/anchor/ink/ink-sub/line/line-strong` + 语义五态 + 印章槽）、字阶六档 + mono 数字轨（`fs-display 30/800 … fs-num-lg 32 mono tabular`）、间距/圆角/阴影/动效阶（`space-1..6`、`r-card 20`、`shadow-seal` 柿橙染影、`motion-stamp` 落章曲线）；组件形态走印章语汇的全局 hook 类（`.dshm-seal-chip` 胶囊章、`.dshm-seal-cta` 全屏唯一实底柿橙胶囊、`.dshm-bubble-paper-user/ai` 纸标签气泡、`.dshm-stamp-solid/faint` 圆印两态）；W9-B6 把核心语义名（primary/foreground/muted/border/fs-*）迁移到基名，别名尾段仍有过渡残留（on-soft ×22、stroke-soft ×15、work-*/stamp-* 等，css `var()` 读共 73 处）待下批迁移，tokens.css 内保留别名声明作兼容层。
- **信息架构（v6 四 Tab、十二路由）**：`#/`（home，默认落地）、`#/chats`、`#/chat/:id`、`#/work`、`#/work/:id`、`#/todos`、`#/alerts`、`#/docs`、`#/me`、`#/tasks`、`#/files`、`#/agents`、`#/login`；TabBar 四项为 消息/同事/工作台/我的（home/agents/work/me，58px 高、22px 线性图标），`#/chats` 全部会话降为带 PageNav 返回头的全屏层，chat 与工作详情也是全屏层，待办/预警/单据/任务/文件为二级页（[router.ts](src/client/router.ts) / [MobileShell.tsx](src/client/shell/MobileShell.tsx)）。v1/v2 旧 hash 折叠：workbench→工作、contacts→AI 同事目录、messages/data/kg→全部会话层、profile→我的——旧深链（含 PC 预览 iframe）落到活页。四个 Tab 页常驻保活（W8 B1）：首次访问才挂载，`[hidden]` 切换可见页，滚动位置、筛选态与半填状态在 Tab 互切间保留，隐藏页的数据读取挂起、重新可见时再读；层页仍按路由 key 重挂载转场（Tab 间淡入、层 14px 推入，均为设计稿 pageIn 的 .22s ease，尊重 prefers-reduced-motion），路由切换把焦点落到页面主体且不滚动。
- **首页（v6 消息形态）**：渐变 hero 问候卡、搜索框入口（落到持有真实过滤的全部会话层）、紧凑今日台账 chip 行、快捷任务 chips、同事头像横滑（右缘渐隐）、最近会话 conv-item 行——在场状态点、单行投影预览、相对时间、基于 draftStore 已读水位的未读红点（[HomeView.tsx](src/client/home/HomeView.tsx)）。
- **AI 同事（v6 roster 形态）**：花名册来自 `agentPreset.list`（含 preset.yml 的 `welcome` 块），叠加本地视觉表（[colleagues.ts](src/client/colleagues.ts)：单色戳记底/缩写/职责/欢迎元数据 + v6 分组/技能/状态字段）；同事 Tab 渲染能力分组（内容与创意/数据与技术/职能与效率，未归类 preset 收进「更多 AI 同事」，空组不渲染组题）带技能 pill 与在场 chip——AI 在场按产品语义恒为「在线」。工作台页的 2 列工具网格按 preset 派生一卡，其「去聊聊」走真实 `createSession` + `promptSession` 链路并以该同事首条 starter 作为开场消息（[WorkView.tsx](src/client/work/WorkView.tsx)）；首页横滑与 roster 行都走 `createSession`，只建会话、绝不以用户身份发消息；空会话由客户端渲染本地欢迎卡（WelcomeCard）。「智能填表助手」仍是唯一持表同事，welcome 能力清单与起点 chips 由六表注册表（[formRegistry.ts](src/client/formRegistry.ts)）投影。
- **聊天（v6 形态）**：`session.history` 折叠（[fold.ts](src/client/fold.ts)）为双态气泡（bot：白底描边托盘带左上 6px 角；user：渐变带右上角，均 78% 宽、.28s 入场）、呼吸三点打字板、日期分隔、running/done/error 工具行与 KG 证据单行入口；叙述段经 markdown-it+DOMPurify 富渲染（[rich.ts](src/client/messages/rich.ts)），围栏代码先于显示词映射整体拆出、渲染为带语言标签与复制入口的深色代码板（clipboard → execCommand 兜底 → toast）。输入栏承载 + 入口与底部上滑快捷面板（该同事自己的 starters 作指令 + 语音/文件/表情占位 toast）、22px 圆角输入框、渐变发送钮。预制 tag（欢迎卡 starters、快捷面板指令、上下文 chips、字段补问建议）是辅助输入（W9-B1）：点选整体替换草稿、聚焦输入框并置尾光标，由用户改写或直接点发送确认；围栏动作（选择气泡、审批/计划/报告卡）仍即时执行。首页「最近对话」过滤工作会话（隔离集合登记在本地）。新鲜度靠轮询（运行 1.2s/空闲 5s），`session.cancel` 提供停止生成。
- **消息协议（v3 + v5 report 围栏 + W1 审批围栏）**：结构化载荷一律走 ` ```dsh ` 围栏（[protocol.ts](src/client/protocol.ts)：ask_choice/ask_field/form_draft/form_confirm/reject_flow/submit_receipt/report/approval_pending/approval_result，信封 `v:3`；坏围栏降级为折叠原文不炸流）；welcome 刻意不上 wire。report 卡（[ReportCard.tsx](src/client/messages/ReportCard.tsx)）渲染指标网格/条目行/表格/动作按钮，条数上限是契约一部分（metrics 1-6、rows ≤8、table 列 ≤5 行 ≤10、actions ≤4），超限整卡降级；动作四类：view 产品内路由、create-task 打开任务表单、send 以用户身份发送完整指令、link 外链。
- **审批卡（W1）**：一张待审批待办渲染为可操作卡（[ApprovalCard.tsx](src/client/messages/ApprovalCard.tsx)）——单据摘要（类型/单号/金额/轮次）+ 状态章 + 可选意见输入 + 同意/驳回按钮对；点击发送围栏化的 `approval_confirm` 用户消息，AI 同事据此调用 `nb_approve`；操作后的 `approval_result` 卡回读落库状态（状态词中英双拼写皆可——解析器把闭合中文词表归一到 wire 的英文枚举）、操作人、意见与日期，只读渲染状态 chip（待审琥珀/二级紫/生效绿/驳回红）。
- **工作闭环（v5 语义、v6 轴形态）**：[workStore.ts](src/client/workStore.ts)（localStorage `dsh-mobile-work`）持有四态工作项（待处理→进行中→待确认→已完成，状态机守卫非法转移）；报告卡「创建处理任务」打开表单弹层（[actions.ts](src/client/actions.ts)），创建即向源会话发 M1 通知；执行在隔离执行会话进行——live 模式真实建会话并发 M2 指令，完成后回源会话发 M3、驳回返工发 M4；工作详情（[work/workTimeline.ts](src/client/work/workTimeline.ts)）两态时间线：真实态轮询执行会话日志折叠为步骤与结果，演示态脚本推进，doing 态提供「重新执行/手动完成」逃生门（挂起自救，手动完成同走 M3 通道）。v6 轴形态渲染 56px 右对齐时间列（live 取工具行时钟/demo 取 01 式序号）、光环轴点压 2px 轴线，并派生 done/total 渐变进度条。文件页（`#/files`）三分区互补视图——最近文件 = 近 7 天全部产物（行带 AI 来源徽标）、AI 生成 = 其 AI 来源过滤子集、收藏 = 本地星标（含报告预览）；我的任务页（`#/tasks`）分我的/团队两栏。
- **两态（真实/演示）**：[runMode.ts](src/client/runMode.ts) 由 ProfileView 的 AI 偏好显式开关与 `llm.models` 自动探测共同判定（无模型目录时演示态：不建执行会话、时间线模拟推进，宁可演示不冒充真实）；首启演示 seed（[demoSeed.ts](src/client/demoSeed.ts)：团队任务与收藏报告，全部带 demo 标记），「清除演示数据」只删演示项。
- **填表+人审+提交**：v3 草稿（[forms/v3/DraftCard.tsx](src/client/forms/v3/DraftCard.tsx)）按三分层渲染（需要你定/请确认·AI 推导带依据/系统生成折叠）+ 相位戳，卡上直接「确认写入/驳回」，重编辑走 revision+1；回执是指标卡（[forms/v3/ReceiptCard.tsx](src/client/forms/v3/ReceiptCard.tsx)）。卡片相位按 draftId+revision 从日志重放（[cardState.ts](src/client/cardState.ts)）；v2 历史会话保留旧围栏/前缀/文本回执重放。未提交编辑仍按草稿内容哈希存 localStorage（[draftStore.ts](src/client/draftStore.ts)）。

路由：由 web-app bundle 的 `mobileEnabled` 配置托管在 `/mobile`（原生 `dist/mobile.html`）；PC 侧手机壳预览在 `@deepseek-ai/dsh-client-ui-mobile-preview`。

## 模型体验

本包是浏览器端页面，不注册任何模型可见面；会话背后的 agent 看到的输入与 PC 工作台渲染的相同。移动端流程只改变用户消息的形态——点选作答（选项 send 文案）、围栏化的 确认写入/驳回 动作，以及 v5 工作闭环的动作消息（M1 创建通知、M2 执行指令、M3 完成通知、M4 返工指令与报告卡 send 动作）都以真实 user 消息写入 durable log，模型可见⟺日志可重建；欢迎语不上 wire、模型不可见，工作数据本体（workStore）也不上 wire。

#### KV 缓存效应

无；本包既不组装也不发送 provider 请求。

## 已知限制与遗留

- 登录走真实 `nocobase.signIn` 通道（账号 + 密码对 NocoBase basic authenticator 验证；错误凭据原样显示服务端拒绝）。会话中途 token 过期会清除 token、提示一次并落回登录门；工作项、草稿与两个 outbox 保留，重登后回灌补投（W8-B3）。
- 产品形态裁决 deferred（W8，[蓝图](../../../research/2026-10-04-w8-mobile/blueprint.md)）：px 字阶不随系统动态字号缩放（430px 壳形态决策，键盘可读性由焦点环补偿）；无 skip-to-content 链接（底部 Tab 形态下键盘路径短）；横屏布局未调优（竖屏手机壳是产品形态）。
- 聊天新鲜度是游标轮询（运行 800ms/空闲 5s，W8-B3）：首拉取尾部窗口，后续轮询只发 `afterSeq` 游标增量合并，可见性恢复或大页时全量重校准——仍非 mux/host 流，进行中文本不做 token 流式显示。
- 工作数据随账号漫游（W8-B3）：[workSync.ts](src/client/workSync.ts) 把每次写入镜像到服务端 `wfl_mobile_work` 投影（网关按账号行级隔离），登录时回灌；同步失败落入持久 outbox，重登后补投。未登录或离线时保持纯本地演示形态；折叠/回放语义不变。
- 工作会话隔离是本地登记：执行会话的隔离集合只存本机，其他设备与 PC 端仍会在会话列表看到执行会话。
- 未读点与「待审核」筛选是本地派生（localStorage 的已读水位/pending 标记）；wire 既无未读计数也无按会话的审核态——重载保留日志重放的卡片相位，但本地标记重置。
- 字段控件映射覆盖 input/number/date/bool/enum/relation，枚举词表为本地实测；wire 的 `nocobase.listMeta` 不投影 select 选项，interface 长尾回退纯文本。
- 关联 Picker 按目标表 `name`/`nickname` 列显示选项、提交目标行 id；草稿因此携带关联 id（同事 persona 在出草稿前把名称解析成 id）。
