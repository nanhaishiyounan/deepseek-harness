# Agent Note: 移动端 v4 —— 票据四联材质与 antd-mobile 组件全覆盖

Status: implemented

[English](2026-09-22-mobile-v4-visual-batch.md) | 中文

## Problem

D 轮（15ca104ab8）交付了 v3 的色彩 token 轨、暗色双轨、动效与回执骨架，但 `ChoiceBubble` 源码仍自述 "Minimal v3 scaffolding; the visual batch owns the final look"——视觉批次从未发生，用户否定的就是这个骨架版。E1 审计（research/2026-09-22-mobile-v4-audit/report.md）列出 30 条缺陷；本批次落地其中的视觉执行层，产品逻辑与信息架构不动。

## Decision

**票据四联材质（打破白卡套白卡，E1 T5）。** 四类卡片各对应票据流转的一联，用底色 + 边框 + 分区线编码语义，token 驱动（暗色双轨自动跟随）：叙述气泡（话）霜白 + 冷缘 + 轻影；询问卡（问）`--dshm-primary-soft` 淡墨青底 + 左缘 3px 墨青条 + 无阴影；草稿卡（票）霜白 + 冷缘 + 阴影，derived 层嵌 `--dshm-muted` 洗底面板、rationale 移到值下方右对齐、system 层换 antd Collapse；回执卡（讫）`--dshm-success-10` 淡检验绿底 + `--dshm-success-rim` 边 + 白底 metric 单元 + ticketStrip 单号虚线行 + 头行检验绿对勾章。一句话：**话是白、问是青、票是纸、讫是绿**。设计决策全文见 plans/2026-09-22-mobile-v4-redesign/01-visual-batch.md。

**结构与列表治理。** 聊天详情页是全屏层：`#/chat/<id>` 路由下 shell 不渲染 TabBar（56px 还给内容），antd NavBar + 自控返回钮。会话列表副标题从 roster description 全文换成**末条消息投影**（messages/projection.ts）：receipt → 「已登记 №1042 · 采购单」、未答 ask → 「等你选择：…」、末条气泡截 24 字；投影按 updatedAt 缓存，仅列表可见窗口懒读（30 条事件窗口，15 行），roster duty 降为 fallback。列表治理：SwipeAction 右滑置顶/标记已读（draftStore 新增 pin 集），置顶行左缘墨青条；未读改 Badge 砖红点贴时间戳；SearchBar/CapsuleTabs/Tag/ErrorBlock/PullToRefresh/InfiniteScroll 全部换 antd-mobile。我的页重排为 antd List 设置组 + 最近回执条 + 常用操作 chips + 退出登录独立破坏性块（Dialog.confirm）；空会话从列表内嵌卡改为垂直居中欢迎屏（72px 戳形 logo + 28px 显示标题 + 能力清单 + 起点 chips）。

**图标去 Unicode。** ‹/➤/✓/◌/✕/▾/› 全部换 lucide 或 antd 自带 chevron；composer 用 TextArea autoSize 1–4 行；错误提示走 Toast.show（`.adm-toast-main`）；展示层清洗裸 FK 引用（rich.ts ID_REF：`id 7`、`（id 7）` 模式在 sanitizeBizText 中移除）。登录页：戳形 logo 外环 2px 实线可见化、内章 76px、双 footer 合一。

**relation 字段名称解析归一（E1 D3）。** 新 forms/RelationSelect.tsx 共享选择器：options 读目标表首页、trigger 显示目标行 name，options 未命中回退 relation-label 读、再退裸 id，每次 confirm 提交 id。v2 FieldWidget 的 relation 分支与 v3 DraftCard 都消费它，删除原 RelationWidget 的复制。v3 草稿卡的 derived relation 静态行经 useRelationLabel 显示名称；ChatView 把 collection meta 传入 v3 卡。

**组件库净增（E1 §3 映射表落地）。** antd-mobile 新用 16 个组件面：NavBar、SwipeAction、SearchBar、CapsuleTabs、Badge、Tag、ErrorBlock（Empty 标记 deprecated——空/错态统一走它）、Toast、List、Collapse、InfiniteScroll、PullToRefresh、TextArea（autoSize）、ImageViewer（RichContent 图片兜底）、SpinLoading（工具行 running）、Dialog.confirm（退出）。`--adm-*` 主题映射沿用 tokens.css 轨道。

## Consequences

- usePoll 增加 refresh（PullToRefresh 用），PollRead 联合每支多一个 refresh 字段。
- readHistory 增加可选 maxMessages（投影窗口 30 条）。
- antd-mobile Empty 已 deprecated——不要再新增使用；空态用 ErrorBlock status="empty"、服务错误 status="disconnected"（没有 serverError 枚举）。
- CapsuleTabs 的 tab DOM 无 role="tab"（与 Tabs 不同）：测试用 getByText 点击。
- antd-mobile Toast 的 DOM 类名是 adm-toast-mask/wrap/main，没有裸 `.adm-toast`；jsdom 断言用 `.adm-toast-main`。
- v8-ignore 预算与测试快照：355 测试全绿（原 350 + projection 5），行为变更随测更新（Collapse 折叠先点开再断言系统值、logout 两步 confirm、headerHint 用 duty 名、错误断言 Toast 文本）。

## Alternatives considered

- **保留 v3 骨架只调 token。** 拒绝——用户否定的是骨架观感本身，不是色板。
- **relation 选择器两份复制（v2 FieldWidget 与 v3 DraftCard 各自一份）。** 由共享 RelationSelect 消除；复制本身就是缺陷（E1 D3）。
- **空态继续用 Empty。** 上游已 deprecated；ErrorBlock 统一空态与错误态，保持一套词汇。
