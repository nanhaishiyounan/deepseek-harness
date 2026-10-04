# W7 审计 03 · mobile v6 源码盘点（antd-mobile 栈）

> 审计日期 2026-10-03。只读考古，未改任何 mobile 代码。截图与运行时实测见同目录 `shots-mobile/` 与 `.m-shot.mjs`。

## 1. 定位与依赖

- 包：`@deepseek-ai/dsh-client-ui-mobile` v0.1.1-rc.2，源码 `packages/client/ui-mobile/`。
- 技术栈：React 18 + antd-mobile **5.43.0** + lucide-react 1.47（图标）+ markdown-it 14.3 + dompurify 3.4。`package.json` 依赖见 `packages/client/ui-mobile/package.json:50`。
- 入口链：`apps/web/src/mobile.ts` 挂 `#mobile-root` → Vite 多入口（`apps/web/vite.config.ts:120-122`，`index.html` + `mobile.html`）→ 产物 `dist/mobile.html` 由 web-app bundle 的 `mobileEnabled` 托管在 `/mobile`（`packages/bundle/web-app/src/index.ts:258`）。3080 端口 `/mobile.html` 即此产物。
- 构建链：ui-mobile 是 tsdown 静态链接包（`packages/client/ui-mobile/tsdown.config.ts`）；改样式后需 `build:lib:client` 再 vite build（clean 后必须重跑，44 bundle 缺失先例见 QUICKSTART）。

## 2. 目录结构与关键文件

```
packages/client/ui-mobile/src/client/
├── App.tsx                 根组件：登录门禁 + 主题 mirror（html/body dataset.theme）
├── router.ts               hash 路由解析（12 个路由名 + 6 个 legacy 折叠）
├── tokens.css              ★ v6 全部设计 token（265 行，双挂载点）
├── portal.ts               antd-mobile 弹层 portal host（壳内挂载）
├── ui.tsx                  共享原子：Avatar/Badge/RunningRow/NoticeCard/SkelRow/SkelCard
├── PageNav.tsx             二级页头（antd NavBar 包装）
├── shell/MobileShell.tsx   四 Tab 壳 + 路由分发 + TabBar(lucide 图标)
├── login/LoginView.tsx     登录页（nocobase.signIn 真实登录）
├── home/HomeView.tsx       「消息」Tab（hero/台账/快捷/同事栏/最近会话）
├── agents/AgentsView.tsx   AI 同事目录
├── messages/               MessagesView(会话列表) ChatView(聊天) + 卡片家族
│   ├── ReportCard / ApprovalCard / PlanCard / WelcomeCard
│   ├── ChoiceBubble / FieldAskBubble / RichContent / ActionBadge
│   └── NewChatSheet（新建会话 Popup）
├── work/                   WorkView / WorkDetailView / TaskFormModal / WorkStamp
├── forms/                  FieldWidget（6 控件）/ RelationSelect / task-cards
│   └── v3/                 DraftCard / ReceiptCard / PhaseStamp（票据三卡）
├── todos/ docs/ alerts/    W6 新增：审批待办 / 单据目录→列表→详情 / 预警中心
├── tasks/ files/ profile/  任务页 / 文件页 / 我的页（主题开关在这）
└── kg/KgEvidence.tsx       KG 证据 Popup
```

视图样式为 CSS Modules（16 个 `*.module.css`），token 全部在 `tokens.css`。

## 3. 路由全集（实测 12 个路由名 / 4 Tab）

`parseRoute`（`packages/client/ui-mobile/src/client/router.ts:51`）产出 12 个路由名：

| 路由 | hash | 页面 | 形态 |
|---|---|---|---|
| home | `#/` | 消息（首页） | Tab 白名单：hero 渐变卡+台账四格+快捷 chips+同事横滑+最近会话 |
| agents | `#/agents` | AI 同事 | Tab：SearchBar + 分组卡片目录 |
| work | `#/work` | 工作台 | Tab：CapsuleTabs 四态 + 台账 + 工具宫格 |
| me | `#/me` | 我的 | Tab：身份卡 + 指标 + 开关清单 |
| chats | `#/chats` | 全部会话 | 全屏层：SearchBar + CapsuleTabs + 会话行 |
| chat | `#/chat/:id` | 聊天会话 | 全屏层：气泡流 + composer |
| work (param) | `#/work/:id` | 工作详情 | 全屏层：印章 + 时间线 |
| todos | `#/todos` | 我的待办 | W6-B1：审批待办（PullToRefresh） |
| docs | `#/docs[/:collection[/:id]]` | 单据 | W6-B1：目录→列表→详情三级 |
| alerts | `#/alerts` | 我的预警 | W6-B2：预警中心（认领） |
| tasks | `#/tasks` | 任务 | CapsuleTabs 我的/团队 |
| files | `#/files` | 文件 | AI 生成清单 |
| login | `#/login` | 登录门禁 | 无身份时的 gate，登录后折叠到 home |

- Tab 白名单 `TAB_ROUTES = ['home','agents','work','me']`（`shell/MobileShell.tsx:33`），其余路由隐藏 TabBar。
- legacy 折叠表 6 项（`router.ts:37`）：messages→chats、workbench→work、data/kg→chats、contacts→agents、profile→me。
- `package.json` description 自述 "ten-route workbench (four tabs)" + W6 增补 3 面 = 现为 12 路由名。

## 4. 设计 token 现状

**唯一来源：`packages/client/ui-mobile/src/client/tokens.css`（265 行）。形式 = CSS 自定义属性，非 TS 常量，非 ConfigProvider。**

- 双挂载点：`.dshm-root, html[data-theme='light']`（:15）与 `.dshm-root[data-theme='dark'], html[data-theme='dark']`（:111）。html 孪生特异性 (0,1,1) 压过 antd-mobile `:root` 默认 (0,1,0)，使 body 上的弹层（Popup/Dialog/Toast）跟轨。
- light 轨 ~70 个 `--dshm-*` 变量分七族：品牌（primary #2e7cf6 / brand2 #22b8e8 / user-grad 135°）、语义（success #18a058 / warning #f59e0b / destructive #e5484d + 各 *-10 底色）、气泡、结构（radius 10/16/6、tabbar 58px、touch 44/36px、shadow-card）、印章尺寸、动效（220ms ×2 曲线）、代码块。
- dark 轨只覆写 ~34 个面值（背景 #0e131b / 卡 #1a212d / 边 #252e3e 等），品牌与语义色不变量引用型继承。
- `--adm-*` 映射 16 个（:93-108）：`--adm-color-primary/success/warning/danger/text/text-secondary/weak/border/box/background/background-body`、`--adm-font-family`、`--adm-radius-s/m/l`、`--adm-center-popup-border-radius` 全部指向 `--dshm-*`。
- 主题切换：`App.tsx:28-31` 把 dark mirror 到 `documentElement.dataset.theme` + `body.dataset.theme`；持久化键 `dsh-mobile-theme`（我的页开关）。
- 字号/间距现状（grep 实测 16 个 module.css）：字号散布 **10.5 / 11 / 11.5 / 12 / 13 / 13.5 / 14 / 14.5 / 15 / 16 / 16.5 / 22 px 共 12 档**，无 token 化字阶；圆角散布 6 / 10 / 14 / 16 px，其中 **14px 硬编码多处**（home 三处、chat 等）绕过了 `--dshm-radius-lg: 16px`。

运行时 probe（3080 实测，390×844）：rootBg `rgb(242,245,249)`=#f2f5f9、hero 16.5px/700、statValue 22px SF Mono、statLabel 11px #758199、tabTitle 10.5px/600、tabActive #2e7cf6、card radius 14px + shadow `0 6px 24px rgba(23,43,77,.07)`、composer 白底 padding 9px 12px。**即 antd-mobile 默认蓝 #1677ff 不会直出**（--adm-color-primary 已映射 #2e7cf6），但产品观感仍是"另一款蓝"。

## 5. 组件复用面

- 原子（`ui.tsx`）：`Avatar`（印章式缩写头像，antd Avatar 不支持文字故自研）、`Badge`（antd Tag + 5 tone 内联变量）、`RunningRow`、`NoticeCard`（antd ErrorBlock empty/disconnected）、`SkelRow/SkelCard`（antd Skeleton）。
- 页头：`PageNav`（antd NavBar + lucide ChevronLeft），全部二级页共用。
- 卡片家族（messages/ + forms/v3/）：ReportCard、ApprovalCard、PlanCard、DraftCard、ReceiptCard（回执绿洗+绿框 token）、WelcomeCard、ChoiceBubble、FieldAskBubble、RichContent（markdown+代码块+图片查看）、ActionBadge。
- 表单：`FieldWidget`（antd Input/TextArea/Picker/DatePicker/Stepper/Switch 六控件）、`RelationSelect`（m2o Picker）、`TaskFormModal`（Popup+Picker+DatePicker）、`PhaseStamp`/`WorkStamp`（印章态）。
- antd-mobile 组件用量实测 28 种（grep import 33 文件）：Badge/Button/CapsuleTabs/DatePicker/Dialog/DotLoading/ErrorBlock/ImageViewer/InfiniteScroll/Input/List/Modal/NavBar/Popup/Picker/ProgressBar/PullToRefresh/SafeArea/SearchBar/Skeleton/SpinLoading/Steps/SwipeAction/Switch/TabBar/Tag/TextArea/Toast。

## 6. v7 换肤机制结论（末节）

**(a) antd-mobile ConfigProvider theme 能力边界：没有 theme。** antd-mobile 5.43 的 `ConfigProvider` 只有 `locale` + 9 组图标槽位（`node_modules/.../antd-mobile/es/components/config-provider/config-provider.d.ts:3-43`），与 antd v5 的 theme token 通道完全不同。**换肤唯一主通道 = CSS 变量**：全局 `--adm-*`（`es/global/theme-default.css` :root 共 39 个：8 语义色 / 5 文字色 / 3 圆角 / 10 字号 / 字体 / 边框）+ 组件级内联变量（如 Tag 的 `--background-color/--text-color/--border-color`，v6 Badge tone 已在用）。
- 默认蓝 #1677ff 在 `--adm-color-primary`；暗色出厂轨道挂在 `html[data-prefers-color-scheme='dark']`（`theme-dark.css:1`，特异性与 v6 的 `html[data-theme]` 平级，v6 靠加载顺序在后胜出——v7 保留此格局即可）。

**(b) CSS 变量覆盖面（可配 / 不可配）。**
- 可配（声明即生效）：全部 39 个 `--adm-*` 全局变量 + 组件内联变量。v6 已映射 16 个全局项；v7 需补映射 `--adm-font-size-1..10`（字阶统一的关键杠杆）、`--adm-border-color` 等。
- 不可配（需选择器覆盖，先例已固化在 `tokens.css:232-264`）：
  1. Picker/DatePicker 弹层 8px 硬编码圆角 → 同特异性覆盖 `.adm-picker-popup .adm-popup-body` 为 16px（:240-243）；
  2. 遮罩透明度走 inline 0.55 → `!important` 压 0.5（:232-234）；
  3. Toast 定位/胶囊 → absolute 重锚 + 双轨配色（:245-264）；
  4. TabBar item 字号 → `.adm-tab-bar-item-title` 类覆盖 10.5px（`shell.module.css:40-45`）。
- 结论：v7 新增任何 antd-mobile 组件（如 Seged/SideBar）前先查它的 CSS 变量面，无变量的样式点按上述三先例模式补丁。

**(c) tokens 重写的具体文件与改动面。**
1. `packages/client/ui-mobile/src/client/tokens.css` —— 核心战场：重写 light/dark 两轨的 ~70 个 `--dshm-*` 值 + 扩充 `--adm-*` 映射（含字阶）。新增 token 族建议：三档海拔（背景/卡/浮起）、中性色阶（暗轨明度差当前 <8%，需 ≥3 档）、语义色去饱和（暗轨高饱和绿/黄刺眼）。
2. 16 个 `*.module.css` —— 消灭散落的 14px 圆角与 12 档字号硬编码，收拢到 token（不收拢则换肤只换一半）。
3. `shell/shell.module.css:40-45` —— TabBar 字号 10.5px <12px 可读下限，v7 必改。
4. 机制保留：`App.tsx` 主题 mirror + html 孪生特异性压 `:root` + `portal.ts` 壳内挂弹层，这套骨架健壮，v7 无需动。
5. 构建契约：改完必须 `build:lib:client`（tsdown 重打包 lib CSS）+ `apps/web` vite build，否则 3080 看到旧样式（clean 后 44 bundle 缺失先例）。
