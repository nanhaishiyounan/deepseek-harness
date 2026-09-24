# Mobile v6 · UI 设计稿落地（AI 同事 · 你的工作搭子）实施计划

> **Loop 执行说明**：本计划分 3 个批次（B1/B2/B3），每批一个 code 子任务 + 独立验证回路。实施子任务必须先加载全局技能 `high-end-visual-design` 与 `frontend-design`（反模板化守则）；涉及 antd-mobile 组件改造的批次另加 `ui-ux-pro-max`。设计稿源文件：`/Users/mac/Downloads/index (5).html`（1066 行，单文件 H5，标题「AI 同事 · 你的工作搭子」，已全文核验）。

**目标**：把设计稿的视觉与交互形态（设计令牌、4 Tab IA、列表页形态、聊天页气泡体系、富消息组件视觉、快捷面板）忠实实现到 [`packages/client/ui-mobile/`](../../packages/client/ui-mobile/package.json)，同时**不动任何真实后端链路与产品逻辑**（RPC 白名单、durable session log、围栏协议 v:3、工作四态、runMode 双态、M1-M4 动作消息）。

**架构**：只换视觉层——[tokens.css](../../packages/client/ui-mobile/src/client/tokens.css) 双轨整轨替换 + 各视图 `*.module.css` 重写 + 少量视图层 JSX 结构调整（Tab 重排、工具网格、快捷面板）。数据层（rpc/sessionsService/fold/protocol/cardState/actions/workStore/runMode/colleagues 真源）零改动。

**技术栈**：React 18 + antd-mobile ^5.43 + CSS Modules + 自研 hash router（十路由）+ lucide-react 图标 + markdown-it/DOMPurify。宿主 [apps/web/mobile.html](../../apps/web/mobile.html)，经 `dsh web` 于 :3080 预览 `/mobile`。

---

## 1. 调研结论（已核实）

- **ui-mobile 定位**：[`packages/client/ui-mobile/`](../../packages/client/ui-mobile/package.json)（`@deepseek-ai/dsh-client-ui-mobile` v0.1.1-rc.2，自述「Mobile v5 AI Workmate…ten-route workbench」）。卫星包 [`packages/client/ui-mobile-preview/`](../../packages/client/ui-mobile-preview/package.json) 是 PC 侧手机壳 iframe 预览，零逻辑改动自动跟随。vite 双入口（PC `index` + 移动 `mobile`），`/mobile` 由 web-app bundle 静态托管。
- **现状十路由**（[`router.ts`](../../packages/client/ui-mobile/src/client/router.ts)）：`#/`(home 默认落地)、`#/chats`、`#/chat/:id`、`#/work`、`#/work/:id`、`#/me`、`#/tasks`、`#/files`、`#/agents`、`#/login`；`LEGACY_HEADS` 折叠 `messages/data/kg→chats`、`workbench→work`、`contacts→agents`、`profile→me`。现 TabBar 四项 key=`home/chats/work/me`、标题「AI同事/对话/工作/我的」（[`MobileShell.tsx:29,81-84`](../../packages/client/ui-mobile/src/client/shell/MobileShell.tsx)）。
- **聊天链路（真实，保留）**：composer 发送 → `promptSession` RPC → 网关 agent loop → durable session log → `usePoll` 轮询 history → `foldHistory` 投影 → [`ChatItem`](../../packages/client/ui-mobile/src/client/fold.ts) 9 成员 union（text/tool/task-card/ask/field-ask/action/receipt/report/degraded）。围栏协议 ```` ```dsh ```` v:3 七种载荷，逐字段校验失败整围栏降级（[`protocol.ts`](../../packages/client/ui-mobile/src/client/protocol.ts)）。无 token 流式（已知限制）。
- **主题系统（直接复用的骨架）**：`.dshm-root` 亮轨 + `.dshm-root[data-theme='dark']` 暗轨整轨替换；antd-mobile 全量经 `var(--dshm-*)` 挂接（`--adm-*`）；localStorage key `dsh-mobile-theme`（[`App.tsx:13`](../../packages/client/ui-mobile/src/client/App.tsx)）。现令牌是墨青冷链色系（`--dshm-primary:#0b5d56`），将整轨替换为设计稿蓝色系。
- **AI 同事数据**：真源 = 后端 `agentPreset.list`（4 个 preset：mobile-form-assistant / business-advisor / enterprise-data-assistant / food-compliance-officer）；本地视觉增强表 [`colleagues.ts:65-120`](../../packages/client/ui-mobile/src/client/colleagues.ts)，未知 preset 走 FALLBACK「AI」。
- **验证三件套**（每批复用）：`pnpm vitest run packages/client/ui-mobile`（32 spec，per-file 100% 覆盖门禁无豁免）→ `pnpm run test:web -- mobile-shell|mobile-assistant|mobile-preview-iframe`（golden 重录 `pnpm run test:web:refresh -- <name>`）→ 复用 [`research/2026-09-22-mobile-v5-aiworkmate/.shoot.mjs`](../../research/2026-09-22-mobile-v5-aiworkmate/.shoot.mjs) 截图模式对 `http://localhost:3080/mobile`（`DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml --no-open`，headless Chrome 390×844 亮暗双轨）。截图工件落 `research/2026-09-23-mobile-v6-uidesign/`，命名 `b1-*.png` / `b2-*.png` / `b3-*.png`。

## 2. 设计稿 IA ↔ 现有应用 差异映射表（核心决策）

| 设计稿（page） | ui-mobile 现状 | v6 落地决策 |
|---|---|---|
| Tab① 消息 `page-home`（hero 问候渐变卡 + 搜索 + 最近会话列表） | `#/` HomeView（问候 + 台账统计 + 快捷 chips + 同事横滑 + 最近对话 3 条）；`#/chats` 完整会话列表 | **Tab①「消息」= `#/`**：HomeView 重排为设计稿形态（hero 渐变问候卡 + 搜索框 + 最近会话列表，现有台账统计/快捷任务压缩为 hero 下 chip 行，功能不删）。`#/chats` 保留为「全部会话」全屏层（从搜索框/列表尾入口进入），视觉同款 |
| Tab② 同事 `page-roster`（搜索 + 三组能力分组 + 卡片：头像/角色/技能 pill/状态 chip） | `#/agents`（4 preset 平铺目录 + 本地视觉表） | **Tab②「同事」= `#/agents`**：roster 视觉全面对齐；分组标题数据来自 `colleagues.ts` 本地视觉表扩展（组名按现有 4 个 preset 实际职能归类到设计稿三组语义），preset 真源不动 |
| Tab③ 工作台 `page-tools`（2 列 8 工具卡「去聊聊」→ 直达同事聊天 + 预置消息） | `#/work`（四态 capsule + 工作卡列表） | **Tab③「工作台」= `#/work`**：页头新增工具网格区（tool-card：图标色块/名称/描述/「去聊聊」），点击走真实链路（createSession + promptSession 预置消息，等价设计稿 `TOOL_SEND` 模式）；下方保留四态工作台账 |
| Tab④ 我的 `page-me`（个人卡 + 设置组 + 开关 + 免责 note） | `#/me` ProfileView（身份卡 + 工作空间 + AI 偏好 + 清除演示 + 暗色） | **Tab④「我的」= `#/me`**：set-group 分组卡 + switch 样式 + 虚线免责 note 视觉对齐；runMode/通知/清除演示/登出功能全保留 |
| 聊天 `page-chat` | `#/chat/:id` ChatView（832 行） | 气泡双态 / 头部 / 输入栏 / 快捷面板视觉全面对齐；promptSession→poll→fold 真实链路不动 |
| （设计稿无） | `#/work/:id`、`#/tasks`、`#/files`、`#/login` | 全保留：令牌替换后自动跟随 + B2 局部对齐 |
| TabBar 顺序「消息/同事/工作台/我的」 | 「AI同事/对话/工作/我的」，`TAB_ROUTES=['home','chats','work','me']` | `TAB_ROUTES` 改为 `['home','agents','work','me']`；Tab 标签/图标/顺序按设计稿；`chats` 降为全屏层路由（路由名保留，LEGACY 兼容不动）。e2e aria/golden 同步更新 |
| 主题切换 localStorage `ac-theme` | `dsh-mobile-theme` | **保留现有 key**，视觉换新 |

### Tab 重排的路由语义细则

- `TAB_ROUTES: ['home','agents','work','me']`（[`MobileShell.tsx:29`](../../packages/client/ui-mobile/src/client/shell/MobileShell.tsx)）；TabBar 四项：home=消息(MessageSquare) / agents=同事(Users) / work=工作台(LayoutGrid) / me=我的(User)，icon 20px 线性。
- `chats` 不在白名单 → 渲染为全屏层（带返回头，PageNav 复用），从 home 搜索框聚焦或「全部会话」行进入；`#/chats` 直链与 `LEGACY_HEADS`（messages→chats）仍落活页。
- 转场规则不变：Tab 间 fade、层 slide（[`transitions.css`](../../packages/client/ui-mobile/src/client/shell/transitions.css)），时长对齐设计稿 `pageIn .22s`。

## 3. 富消息组件视觉映射（B3 落地范围）

| 设计稿组件（CSS 类） | 落到现有真实组件 | 说明 |
|---|---|---|
| `rich-card`（card2 底 + 虚线字段行 + 56px 标签列） | [`forms/v3/DraftCard.tsx`](../../packages/client/ui-mobile/src/client/forms/v3/DraftCard.tsx) / [`ReceiptCard.tsx`](../../packages/client/ui-mobile/src/client/forms/v3/ReceiptCard.tsx) / [`ReportCard.tsx`](../../packages/client/ui-mobile/src/client/messages/ReportCard.tsx) 卡片基底 | 字段行 `rc-field` 虚线分隔、`rc-label` 56px 标签列 |
| `notice`（brand-soft 底 + info 图标） | `degraded` 降级行 + 卡内提示条 | 语义色对齐 |
| `progress`（渐变填充 + 动画） | WorkDetailView 执行进度 + report 完整度行 | `width .8s cubic-bezier(.22,.9,.35,1)` |
| `todo`（可勾选 + 计数同步） | task-card 视觉（勾选态仍走现有 cardState 相位） | 计数同步样式 |
| `timeline`（56px 时间列 + 轴点/轴线网格） | [`WorkDetailView.tsx`](../../packages/client/ui-mobile/src/client/work/WorkDetailView.tsx) 执行时间线 | tl-dot 10px + brand-soft 光环 |
| `table`（fixed 列宽 + 上/下行染色） | ReportCard 指标网格/表格区 | `tnum` 数字等宽 |
| `code`（深底 + 复制钮） | [`RichContent.tsx`](../../packages/client/ui-mobile/src/client/messages/RichContent.tsx) 代码块 | clipboard API + execCommand 兜底 + toast |
| `chart`（bars-fallback 纯 CSS 柱状） | ReportCard 可选柱状视觉 | **不引 echarts**（依赖政策 + 离线可用；设计稿自带 fallback 形态即基准） |
| `buttons`（pri/ghost/gray） | [`ActionBadge.tsx`](../../packages/client/ui-mobile/src/client/messages/ActionBadge.tsx) + 确认动作行 | 三态按钮 |
| `quick` chips（44px 高胶囊） | [`WelcomeCard.tsx`](../../packages/client/ui-mobile/src/client/messages/WelcomeCard.tsx) starter chips + [`ChoiceBubble.tsx`](../../packages/client/ui-mobile/src/client/messages/ChoiceBubble.tsx) | 点选即以用户消息发出（现机制保留） |
| `rating`（五星） | **不落地** | 无真实反馈链路，YAGNI；设计稿属演示组件 |

**明确不进代码的设计稿内容**：`FLOWS` 剧本对话数据、8 位虚构同事（小创/阿数等）、intents 关键词引擎、busy 排队模拟、echarts CDN、SVG use symbol 库（用 lucide-react 现有依赖替代，风格同为 1.8 线性描边；lucide 缺失的图形用内联 SVG 复刻设计稿 path）、`ac-theme` key、hash 路由 `#chat-c1`（router 已有）。同事人数与身份以后端 `agentPreset.list` 为准。

## 4. 批次总览

| 批次 | 范围 | 详见 |
|---|---|---|
| B1 | 设计令牌双轨整轨替换 + 全局壳/TabBar 重排 + 转场 + PC 预览壳 430px | [01-b1-tokens-shell.md](01-b1-tokens-shell.md) |
| B2 | 列表页四件（home/chats/agents/work）+ me + tasks/files/login 跟随 + colleagues 视觉表扩展 | [02-b2-pages.md](02-b2-pages.md) |
| B3 | 聊天页（头/气泡/输入栏/快捷面板）+ 富消息组件视觉映射 + WorkDetail 时间线 + golden 重录 | [03-b3-chat-rich.md](03-b3-chat-rich.md) |

依赖顺序：B1 → B2 → B3（B2/B3 依赖 B1 的令牌；B2 与 B3 内部无相互依赖，但建议串行以便截图对账互不干扰）。

## 5. 验收总则（每批必须全绿才算完成）

1. `pnpm vitest run packages/client/ui-mobile`（全过，per-file 100% 覆盖不被破坏）。
2. `npx tsc -b packages/client/ui-mobile/tsconfig.json`（或包内既有 typecheck 口径）+ `tsx scripts/run-oxlint.ts packages/client/ui-mobile`。
3. `pnpm run build`（apps/web 双入口产物正常）后 `pnpm run test:web -- mobile-shell` / `mobile-assistant` / `mobile-preview-iframe`（golden 需重录时用 `test:web:refresh`，只重录受影响项）。
4. **截图对账**：起 `dsh web`（:3080），复用 v5 `.shoot.mjs` 的 CDP 模式对 `/mobile` 截 390×844 亮暗双轨，工件落 `research/2026-09-23-mobile-v6-uidesign/<批次>-*.png`；与设计稿逐组件对照（色值/圆角/间距/字号/暗轨）。
5. 仓库义务：每批 PR 附 Agent Note（非平凡改动）；[`packages/client/ui-mobile/README.zh.md`](../../packages/client/ui-mobile/README.zh.md) 与 README.md 双语同步视觉代际说明；commit 前 lefthook 门禁全过（140 字符行宽、trailing newline 等，见 [AGENTS.md](../../AGENTS.md)）。

## 6. 风险与回滚总表

| 风险 | 缓解 | 回滚 |
|---|---|---|
| tokens 整轨替换是全局单点，影响全部 14 个 module.css 引用的语义 | B1 一次替换 + 全页面截图回归 + vitest 全量 | revert tokens.css 单文件即恢复 v5 冷链色系 |
| Tab 重排破坏 e2e aria/golden（mobile-shell 断言 4 Tab） | B1 同批更新 spec 与 golden；aria label 语义不变（仍「底部导航」） | revert MobileShell.tsx + 对应 spec |
| per-file 100% 覆盖门禁：改组件必须同步改 32 个 spec 中的触面 | 每批先跑 vitest 定位红名单，测试描述行为而非像素 | 测试与实现同 commit 回滚 |
| 设计稿 430px 手机壳 vs e2e 390×844 视口 | 令牌与布局用流式（max-width 430 居中，390 时全宽），两视口各截一组 | 布局参数集中在 tokens/shell.module.css |
| antd-mobile 组件视觉不完全跟轨 | 沿用 `--adm-*` var 挂接；个别组件（TabBar/SafeArea）在 module.css 覆写 | 覆写按文件隔离 |
| 剧本数据误入真实产品 | 计划 §3 明确排除清单；评审时 grep `小创|阿数|FLOWS` 必须零命中 | — |
