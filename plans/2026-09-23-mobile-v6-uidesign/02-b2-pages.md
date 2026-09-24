# B2 · 列表页四件 + 我的 + 次级页跟随

> **子任务必载技能**：`high-end-visual-design`、`frontend-design`、`ui-ux-pro-max`（antd-mobile SearchBar/SwipeAction/CapsuleTabs/Toast 大量触面）。
> **前置**：B1 已合并（令牌已换血）。设计稿参照：hero/搜索/会话行 62-80 行、roster 90-102 行、tools 104-112 行、me 114-133 行；交互参照 903-945 行（renderHome/renderRoster/renderTools）。

## 范围

home 重排为「消息」形态、chats 全屏层化、agents roster 分组、work 工具网格 + 台账、me 设置组视觉、tasks/files/login 令牌跟随。**所有真实数据链路不动**：home/chats 的会话来自 `session.list` + draftStore 已读/置顶；agents 来自 `agentPreset.list` + colleagues 视觉表；work 来自 workStore 四态。

## 改动文件清单

| 文件 | 改动 |
|---|---|
| `packages/client/ui-mobile/src/client/home/HomeView.tsx` + `home.module.css` | 重排为设计稿 page-home：①hero 渐变问候卡（`--dshm-user-grad` 底 + 白字，时段问候逻辑保留，desc 用产品真实文案）②搜索框（卡片底 14px 圆角 + 搜索图标，聚焦跳 `#/chats`）③「最近会话」列表（conv-item：42px 头像 + 状态点 11px、名称 15/650、预览 14 单行省略、时间 12、未读红点角标 18px 胶囊 `--dshm-destructive` 底）④现有「今日台账统计/快捷任务 chips/同事横滑」压缩为 hero 下单行 chips 区或列表尾入口（功能保留，视觉降噪） |
| `packages/client/ui-mobile/src/client/messages/MessagesView.tsx` + `messages.module.css` | 全屏层化后的返回头（PageNav 复用）+ 列表行对齐 conv-item 形态；**保留** SearchBar、筛选 chips（全部/AI同事/待审核）、SwipeAction 置顶已读、PullToRefresh、InfiniteScroll、NewChatSheet（视觉随令牌） |
| `packages/client/ui-mobile/src/client/agents/AgentsView.tsx` + `agents.module.css` | roster 形态：搜索框 + 分组标题（13/sub/600）+ roster-item（42px 头像色块 + 姓名·角色 15.5/650 + tag 13 单行省略 + 技能 pill 11px 品牌底胶囊 + 状态 chip 11px：在线=ok/忙碌=warn/会议中=brand2）。「发消息」仍走 createSession 真实链路 |
| `packages/client/ui-mobile/src/client/colleagues.ts` | 本地视觉表扩展字段：`avatarColor`（头像底色，取设计稿 8 色系语义映射到 4 preset）、`skills: string[]`、`status: 'online'|'busy'|'meeting'`、`group: '内容与创意'|'数据与技术'|'职能与效率'`（4 preset 归类：mobile-form-assistant→职能与效率、business-advisor→数据与技术、enterprise-data-assistant→数据与技术、food-compliance-officer→职能与效率；FALLBACK 条目归「更多」组）。**preset 真源与 agentPreset.list 合并逻辑不动** |
| `packages/client/ui-mobile/src/client/work/WorkView.tsx` + `work.module.css` | 页头新增 tools-grid（2 列 gap12）：工具卡 = 42px 彩色图标块（圆角 13）+ 名称 15/650 + 描述 12.5 两行 + 「去聊聊」12px 品牌色。工具清单（≤8 项）从 colleagues/preset 派生：每 preset 1 卡（图标色=avatarColor，预置消息=该同事 starter 首条）。点击 → 现有 createSession + promptSession 预置消息（复用 WelcomeCard starter 机制的真实链路）。下方四态 capsule + 工作卡列表**全保留**（视觉随令牌） |
| `packages/client/ui-mobile/src/client/profile/ProfileView.tsx` + `profile.module.css` | me-card（54px 渐变头像 + 姓名 17/700 + sub）+ set-group 分组卡（card 底 + 16px 圆角 + 组标题 12.5/sub + set-item 分隔线行）+ switch 样式（46×27 胶囊，checked=brand）+ 免责 note（虚线边框卡）。**runMode 开关/通知/清除演示数据/登出全保留** |
| `packages/client/ui-mobile/src/client/tasks/TasksView.tsx` + `tasks.module.css` | 令牌跟随 + 卡片圆角/行距对齐（不重排） |
| `packages/client/ui-mobile/src/client/files/FilesView.tsx` + `files.module.css` | 同上 |
| `packages/client/ui-mobile/src/client/login/LoginView.tsx` + `login.module.css` | 品牌主色随令牌 + 按钮/输入圆角对齐（不重排） |
| `packages/client/ui-mobile/src/client/PageNav.tsx` + `page-nav.module.css` | 全屏层返回头视觉对齐设计稿 chat-header 风格（44px 触达、图标 21px、底边线）——chats/work-detail/tasks/files 共用 |
| `packages/client/ui-mobile/tests/`（对应 spec） | HomeView 布局断言、colleagues 新字段、WorkView 工具网格行为（点击→createSession+prompt 调用断言）、ProfileView 结构 |
| `apps/web/tests/mobile-shell.e2e.ts` 等 | 受影响 golden 重录 |

## 关键实现要点

1. **hero 问候文案**用真实产品语境（不是设计稿演示文案「写文案、看数据…」；描述 ui-mobile 真实能力：票据登记/经营参谋/数据问答/合规检查）。问候时段逻辑（`h<6/12/14/18` 分段）照搬设计稿 init() 模式落到 HomeView。
2. **未读角标**沿用 draftStore 已读水位（`dsh-mobile-read`），不新造状态源。
3. **工具卡与预置消息**：定义在本模块常量 `TOOLS`（≤8 项，从 preset 派生），点击 handler 复用 [`sessionsService.ts`](../../packages/client/ui-mobile/src/client/sessionsService.ts) 的 createSession + promptSession。**禁止**把设计稿 8 个虚构工具名/文案直接抄入——名称描述按真实 preset 职能撰写。
4. **搜索框**：home 的搜索框为视觉件（聚焦即 `navigate('#/chats')` 并聚焦其 SearchBar）；chats 内保留真实过滤。
5. agents 分组渲染：`GROUPS` 常量三组 + 「更多」（FALLBACK）；空组不渲染组标题（设计稿 renderRoster 模式）。

## 验收标准

- [ ] `pnpm vitest run packages/client/ui-mobile` 全绿；typecheck + oxlint 过；`pnpm run build` 过。
- [ ] `pnpm run test:web -- mobile-shell|mobile-assistant|mobile-preview-iframe` 过（golden 重录）。
- [ ] 截图对账（`research/2026-09-23-mobile-v6-uidesign/b2-*.png`，亮暗双轨）：①`b2-01-home-light/dark`（hero 渐变卡 + 搜索 + 最近会话行含未读角标/状态点）②`b2-02-chats`（全屏层 + 筛选 chips + 滑动操作可用）③`b2-03-agents-light/dark`（分组标题 + 技能 pill + 状态 chip）④`b2-04-work`（工具网格 2 列 + 四态台账共存）⑤`b2-05-me-light/dark`（set-group + switch + 免责 note）⑥`b2-06-tasks/files/login` 跟随抽查。逐项对照设计稿第 62-133 行组件形态。
- [ ] 行为回归：home 点会话进 `#/chat/:id`；工具卡点击后新会话出现且预置消息以用户消息发出（截图或 e2e 断言）；置顶/已读滑动操作仍生效。
- [ ] `grep -rn "小创\|阿数\|老周\|码哥\|美美\|优优\|晓雯\|周报助手" packages/client/ui-mobile/src` 零命中（虚构同事不进代码）。
- [ ] Agent Note 已附；README 双语已更新（工具网格/分组说明）。

## 风险与回滚

- HomeView 重排动布局断言最多：先跑 vitest 红名单逐个改；回滚按文件 revert（home/agents/work/profile 四组独立）。
- colleagues.ts 扩字段若破坏 `agentPreset.list` 合并纯函数测试：新字段全部 optional，FALLBACK 路径补默认值，合并逻辑不动。
- 工具网格误把预置消息做成假对话：必须走 createSession+prompt 真链路，e2e 断言 sessionsService 调用；不实现本地剧本回放。
