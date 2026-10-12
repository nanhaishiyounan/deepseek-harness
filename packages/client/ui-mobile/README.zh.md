# @deepseek-ai/dsh-client-ui-mobile

[English](README.md) | 中文

移动端 v8「AI 同事」客户端壳：食品企业移动工作台——四 Tab（消息/同事/工作台/我的）九路由界面、AI 同事聊天流（票据气泡 + markdown 富叙述 + v3 填表环 + v5 报告卡）与工作环（报告卡 → 建任务 → 隔离执行 → 回源会话确认）。身份为本地免登录（NocoBase 退役后免身份直进）：页面在 localStorage 只存昵称身份，缺省「移动访客」，无 token、无登录门，我的页可一键重置。退役的 NocoBase 业务面（待办/预警/单据台账、移动工作项云同步、关系字段选取、回落实查）已移除；回执卡保留静态历史渲染，kg 走查 / 湖仓总览 / 图片描述 / 文本提取读取保持在线。视觉语言沿用 W9「酱园琥珀」体系（暖纸画布 `#fbf5eb`、柿子橙 `#b4530a` 心跳、焙墨文本与印章语法——纸标签气泡、胶囊 chip、圆章、台账纸回执卡；token 唯一来源 `demos/acceptance-w9/design-language-w9.md`）及 W8 无障碍增量。控件层用 antd-mobile v5 部件，走 PC 壳同一条 `/api` 网关；会话与知识图谱原样共享。

- **组合**：`apps/web` 的 `mobile.html` 入口引导 [`AppMobileEntry`](src/client/entry.tsx)。约 70 行的一元 RPC 客户端（[rpc.ts](src/client/rpc.ts)）说与 PC fetch carrier 相同的 `/api/<method>` 协议，收敛到 session/agentPreset/llm/kg/lakehouse/data 方法集。antd-mobile 全局基样式在入口装载；`--adm-*` 主题映射到 `.dshm-root` 与 `html[data-theme]` 双轨声明的 `--dshm-*`（[tokens.css](src/client/tokens.css)）；弹层挂进壳持有的 portal host（[portal.ts](src/client/portal.ts)）；根节点画 430px 手机壳，≥720px 桌面加边框（App.tsx）。
- **信息架构（v6 四 Tab，九路由）**：`#/`（首页，默认落点）、`#/chats`、`#/chat/:id`、`#/work`、`#/work/:id`、`#/me`、`#/tasks`、`#/files`、`#/agents`；Tab 栏四项为 消息/同事/工作台/我的，chats/chat/工作详情为全屏层，tasks/files 为次级页（[router.ts](src/client/router.ts) / [MobileShell.tsx](src/client/shell/MobileShell.tsx)）。v1/v2 旧哈希按含义折叠（workbench→work、contacts→agents、messages/data/kg→chats、profile→me）；退役头（`#/login`、`#/todos`、`#/alerts`、`#/docs`）回落首页。四个 Tab 页保持挂载（keep-alive，W8 B1）：首次访问懒挂载，`[hidden]` 切换可见页，隐藏页暂停数据读取。
- **聊天流**：每个同事 preset 拥有会话族（[ChatView.tsx](src/client/messages/ChatView.tsx)）；流把持久日志折叠为气泡/工具行/卡片（[fold.ts](src/client/fold.ts)），快捷 chip 填充输入框而非直接发送（[QuickPanel.tsx](src/client/messages/chat/QuickPanel.tsx)），围栏动作即时发出，离线 outbox 暂存待发并可恢复。新鲜度靠轮询（运行中 1.2s / 空闲 5s），`session.cancel` 提供停止按钮。
- **消息协议（v3 + v5 报告围栏）**：结构化载荷全部走 ```dsh``` 围栏（[protocol.ts](src/client/protocol.ts)：ask_choice/ask_field/form_draft/form_confirm/reject_flow/submit_receipt/report，`v:3` 信封；坏围栏折叠为原文提示）。报告卡（[ReportCard.tsx](src/client/messages/ReportCard.tsx)）渲染指标网格/条目行/表格/动作按钮，数量边界是协议的一部分；四种动作：view、create-task、send、link。确定性 widget 判定与 `@deepseek-ai/dsh-tool-present-card` 的 `src/widget.ts` 镜像（[widget.ts](src/client/widget.ts)）。
- **工作环（v6 轴形式上的 v5 语义）**：[workStore.ts](src/client/workStore.ts)（localStorage `dsh-mobile-work`）持有四态工作项（待处理→进行中→待确认→已完成，带迁移守卫的状态机）——移动工作项 wire 退役后纯本地；报告卡的 创建处理任务 打开表单（[actions.ts](src/client/actions.ts)）；执行跑在隔离 exec 会话上，双模式时间线见 [work/workTimeline.ts](src/client/work/workTimeline.ts)；文件页渲染 最近文件/AI 生成/收藏，任务页分 我的/团队。
- **双模式（live/demo）**：[runMode.ts](src/client/runMode.ts) 由我的页显式偏好开关加 `llm.models` 探测决定；首演示种子（[demoSeed.ts](src/client/demoSeed.ts)）与 清除演示数据 只动演示项。
- **填表 + 人审 + 提交**：v3 草稿（[forms/v3/DraftCard.tsx](src/client/forms/v3/DraftCard.tsx)）渲染三层（需要你定 / 请确认·AI 推导 / 系统生成折叠）带阶段章、卡上 确认写入/驳回、重编辑走 revision+1；关系字段落在不透明的 `引用 #N` 面（关系读取随 wire 退役）；回执是点名业务系统已退役的静态指标卡。卡片阶段按 draftId+revision 从日志回放（[cardState.ts](src/client/cardState.ts)）；今天 派生日期保持客户端日历保证（[systemFields.ts](src/client/systemFields.ts)）。

路由：由 web-app bundle 的 `mobileEnabled` 配置以 `/mobile` 提供（raw `dist/mobile.html`）；PC 侧手机边框预览在 `@deepseek-ai/dsh-client-ui-mobile-preview`。

## 模型体验

无：浏览器侧静态页，外壳渲染网关的 session/kg/lakehouse/data 读取，不注册任何模型可见内容。

#### KV Cache 影响

无：外壳在浏览器渲染，不参与任何模型请求；提示词与工具流量走 PC 工作台同样打开的共享会话。

## 已知限制与遗留工作

- NocoBase 时代的身份与业务面随源系统退役：登录门、待办/预警/文档台账、移动工作同步、关系选择、回执行回读均已消失（空态文案点名退役）；身份是无 token 的本地昵称。
- 工作项纯本地（localStorage `dsh-mobile-work`）无 wire 同步；恢复同步等 carbon 账号体系落地。
- 关系字段渲染不透明的 `引用 #N` 面；carbon 背书的关系读取随账号体系落地替换。
- 回执卡保持静态历史渲染；它点名已退役的业务系统，不做行回读。
