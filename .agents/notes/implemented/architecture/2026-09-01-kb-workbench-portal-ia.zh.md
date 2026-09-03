# Agent Note：kb-agent 网页工作台的门户信息架构

Status: implemented

[English](2026-09-01-kb-workbench-portal-ia.md) | 中文

## 问题

第一版 kb 工作台是侧栏底部动作开关的 360px 固定弹层，装着三段互不连通的能力——用量统计、带引用检索、入库。弹层里的检索喂不进对话，对话里的 `kb_search` 结果也只是原始工具文本，没有编号来源卡。空白会话首屏仍是 harness 通用 hero（"探索未至之境"）——那是 ui-conversation 的 locale 词条，没有部署级覆盖通道；`examples/kb-agent/scenarios` 下的 11 个场景对网页 UI 完全不可见，因为预设 roster 不含该目录。产品走查（[plans/kb-workbench-redesign/01-product.md](../../../../plans/kb-workbench-redesign/01-product.md)）把检索定为中心，并要求"采集到带引用回答"一条动线。

## 决策

### KB 概览 = 空白会话的 hero 门户，而非独立 pane 或重定向

门户（headline、用量 chip、示例问题、场景栏）注册进 `conversation.input.dock`——hero 阶段在 composer 上方照常渲染的唯一 additive slot——并按 owner 传入的 blank 会话状态决定只在门户显示。两个结构事实决定了这个落点：

- 布局 root 只有 `sidebar` / `conversation` / `details` / `shell.overlay` 四个 slot，没有第三个主区 pane；`shell.overlay` 是点击穿透浮层，承载不了主工作区。
- 空白会话既是首次打开态，也是每次点"新会话"回到的默认态——门户不重定向就拿到最高曝光。重定向还会对抗空白会话语义：view ring 与 header 在该态根本不渲染。

headline 替换走 ui-conversation 新声明的单席 `conversation.hero.headline` slot，原词条作 fallback。locale namespace 是单占者（重复注册抛错），部署级覆盖词条不是通路；additive slot 让未注册的组合像素级不变。

### 固定弹层移除；三段能力重组进会话内 view tab

`conversation.view` 新增 `kb` tab（与 ui-trajectory 同机制），承载检索区（大搜索框、带编号徽标与业务化来源行的结果卡、命中高亮、带入对话动作）、文档区（入库向导 + 本次会话入库记录）与用量卡。侧栏入口升级为带文档数徽标的 KB 一级图标，`kb` 设置页展示用量明细。重组的核心是"带入对话追问"：把命中来源写进 composer 草稿并切回对话 tab，面板检索与会话提问从此是一条动线。跨包切 tab 骑一个 additive owner prop——ui-conversation 向 `conversation.session.header.actions` 透传可选 `setView`——无 `setView` 时降级为 KB header 按钮不显示。

### 场景卡复用 agent-preset roster + 包内静态清单

`cordis.patch.yml` 把 `examples/kb-agent/scenarios` 挂为 agent-presets root；场景目录本就是预设形态（`preset.yml` + `agent.cordis.yml`），`agentPresets.list`/`select` 零新 API 即可服务。但 roster 行只有 name/description/order，而门户栏要按 8 类别分组、每场景给 probe 示例问题——展示元数据来自 ui-kb 的静态清单常量（[scenarios.ts](../../../../packages/client/ui-kb/src/client/hero/scenarios.ts)）：选用语义永远走 roster，常量只驱动分组与展示。

### 入库向导文件页签骑 `host.listDirectory`，默认 picker 下降级

`host.listDirectory` 只列目录，所以向导服务器文件页签是"浏览到目录 + 手填文件名"两步。它还要求 browse capability：桌面默认 `-auto` picker 解析为 native capability，向导随即显示"暂无法浏览服务器文件"引导。这是本示例接受的姿态——URL 页签与 agent 的 `kb_ingest` 工具不受影响，引导文案也写明了由谁放置文件。

## 备选方案

- **独立 KB pane 或 `shell.overlay` 工作区** —— 四 slot 布局拓扑没有第三主区，浮层按契约点击穿透；两者都要改壳，重设计的硬约束禁止。
- **空白会话重定向到 KB 路由** —— 破坏新会话默认态；且 view ring 与 header 在空白会话不渲染，重定向目标本身就得先造新面。
- **部署级 locale 覆盖换 hero headline** —— locale namespace 单占、重复注册抛错；只有 additive slot 声明能换文案而不动 ui-conversation 行为。
- **保留固定弹层、在弹层里加带入按钮** —— 弹层与对话是互斥面，带入仍要跨越模态边界，360px 弹层本身在 375px 视口溢出。
- **扩展 `agentPresets.list` 返回 category/probe（单源）** —— 要动 gateway schema、预设 loader 与全部消费方的 API 面，推迟到第二个部署需要同一元数据时；双源当下够用。
- **入库向导用 `host.pickDirectory`** —— 同样被 capability 门控，且只能选目录、不能指名文件；浏览加文件名输入框才是现有 API 的诚实形态。

## 后果

- ui-conversation 获得 2 个带 fallback 的 additive 扩展：`conversation.hero.headline` slot 声明与 `conversation.session.header.actions` 的可选 `setView` owner prop；未注册的组合渲染与之前完全一致。
- 面板检索与会话提问合为一条动线：工作台结果卡把来源带入 composer 草稿并落回对话 tab，由 web e2e 钉住。
- 静态场景清单与 `examples/kb-agent/scenarios/` 是同一事实的两个来源，手工同步（name/description/probe 镜像 `preset.yml`；category 与英文镜像只在常量里）。加场景要同时改两处；漂移不会机械失败——这是已知缺口，长期修法是 roster 自身返回展示元数据。
- 桌面默认部署下向导服务器文件页签显示降级引导；浏览需要挂 browse picker 的组合。取证截图在 `screenshots/kb-redesign/`（含降级页签）。
- hero、工作台与设置页共享同一 stats 缓存与同一 `kb` locale namespace（68 条 zh 词条 + 工作台新增 7 条，及英文镜像）。

## 验证

- [kb-workbench.e2e.ts](../../../../apps/web/tests/kb-workbench.e2e.ts) 以中文驱动真实组合：门户 hero（headline、用量 chip、示例问题填入、场景栏）、种子 `kb_search` toolview 编号来源卡、工作台检索-带入对话动线、入库向导浏览文件路径、侧栏徽标计数。
- ui-kb 包内 specs 覆盖 hero dock 的 chip 矩阵（加载/错误/空/就绪）、工作台状态矩阵（空闲/忙/结果/空/失败）、toolrow 引用解析与设置页。
- 2026-09-01 在 `pnpm dsh web --patch examples/kb-agent/cordis.patch.yml`（Node 22.19.0）真实组合上取证：`screenshots/kb-redesign/` 十张截图，覆盖亮暗双 hero、双主题工作台检索、入库向导（URL 页签与降级文件页签）、侧栏徽标、真实 MiniMax-M3 轮次的 `kb_search` toolview、无命中查询的低相关结果与 375px hero（实测无横向溢出）。
