# Agent Note：移动端 v3 视觉层——冷链票据台账 token 轨、相位戳、Markdown 富渲染与 `+` 弹层

Status: implemented

[English](2026-09-21-mobile-v3-visual-layer.md) | 中文

## Problem

3a 批建立了七型消息协议的产品逻辑骨架（类名结构、最简样式），但视觉仍是 v2 的微信式藏蓝轨：`#192b4d` 主色 + 渐变头像 + 通用蓝/橙/红语义、气泡 16px 圆角纯文本直出、通讯录独立路由占一个 tab 位、KG 证据常驻大卡吃聊天流纵向空间。03 视觉设计规格（plans/2026-09-21-mobile-v3-redesign/03-visual-design.md）把方向定为「冷链票据台账」：墨青/冷雾白/霜白品牌轴、44px 相位戳作为唯一签名元素、tabular 数字与等宽票号栈、亮暗双轨整轨替换、动效全局仅三处。

## Decision

**token 双轨整轨替换是唯一换肤点。** [tokens.css](../../../../packages/client/ui-mobile/src/client/tokens.css) 按 03 §2.2/§2.3 落全套 `--dshm-*`（品牌轴、语义三色、温层三色、气泡、结构、字体栈），`--adm-*` 全部改为 var() 引用——暗轨只需重定义 `--dshm-*`，antd-mobile 组件自动跟轨，v2 在暗轨重复硬编码 `--adm-*` 的做法退役。暗色 selected 前景按 §2.5 对比度裁决走 `--dshm-on-primary`（亮白/暗青黑）。v2 的 `--dshm-info`/`--dshm-teal` 删除，引用迁移：badge.info 并入 primary 视觉（KG 溯源 lakehouse 徽标同轨）、task-cards 标题图标改 primary。

**Markdown 管线是新增依赖的正当边界。** PC 端（packages/client/*）无 markdown 渲染依赖（仅 platform/nocobase 隔离子树有），故 ui-mobile 引入 markdown-it + DOMPurify（03 §4.5 指定选型），管线纯函数落在 [rich.ts](../../../../packages/client/ui-mobile/src/client/messages/rich.ts)：md 实例 html:false/breaks:true（中文单换行不并段），DOMPurify 消毒后经 dangerouslySetInnerHTML 注入。数字结论行升格（≤16 字符、数字开头或去空白后密度 >60%、非 markdown 结构行、可拆出非空 label+数字 value，单位词并入 value）聚成半宽指标卡对；关键信息高亮不做词法识别——直接给 `strong` 加 600 字重 + 2px primary-10 下划线（文档的加粗语法即信号，不猜专名）。密度分母用去空白字符：03 例句「本月采购额 ¥182,400」含空格时是 57%、去掉是 61.5%，规则与例句以去空白口径自洽。

**相位戳（signature）承载四态与唯一动效。** [PhaseStamp](../../../../packages/client/ui-mobile/src/client/forms/v3/PhaseStamp.tsx) 44px 圆戳：draft 空心青灰环、pending 主色环内嵌 DotLoading、submitted 检验绿实心（行号两行 №/数字，等宽栈）、rejected 砖红环 + 45° 斜杠。盖章动效 200ms cubic-bezier(0.2,1.4,0.4,1) 落在 stamp 上，卡片边框闪绿 300ms 用 `.card:has(.stamp[data-phase='submitted'])` 联动；三处动效（新消息入场 180ms、点选 120ms、盖章）各自显式 `prefers-reduced-motion: reduce` 退化。新消息入场用 `.flow > *` 的 CSS animation——React 稳定 key 重渲染不重播，仅新插入 DOM 节点动画。

**derived 只读展开是「可改但不问」的交互面。** DraftCard 的 derived 字段默认渲染只读行（值 + 「·依据」角标），点击行内切换为输入框（推翻推导）；required 保持常规控件；edited:true 字段带 3px 墨青竖条 + primary-10 值底（重编辑 diff）。回执卡自绘三步票据轨迹（12px 点 + 2px 冷缘线，antd-mobile Steps 的数字圈与规格不符），新增「查看这条记录」次按钮（onView 发「查这条记录」问数指令，与 receipt 相位 chips 同语义）。

**IA 收口：`+` 弹层与 KG 单行。** [NewChatSheet](../../../../packages/client/ui-mobile/src/client/messages/NewChatSheet.tsx)（antd-mobile Popup）替代通讯录路由：填表助手置顶 + 可办表单 chips≤3 + 最近三条直达；ContactsView 与其路由删除，`#/contacts` 进入 LEGACY_HEADS 重定向到 chats（旧深链不断）；入口在会话列表与聊天壳头部各一枚。KG 证据收为单行入口（「依据 · 知识图谱 N 条」），原卡片流整体搬进底部弹层，弹层头加显式关闭钮（jsdom 中 Popup mask 的 onMaskClick 需 pointer 序列才触发，关闭钮同时补齐可达性）。

**头像体系退役渐变。** ColleagueVisual 的 from/to 渐变对换为单一 stamp color（墨青/青灰/青墨），`colleagueGradient` 更名 `colleagueColor`；Avatar 的 prop 更名 background；AI 侧头像右下加 10px 描边圆章「AI」（戳记语言，替代 sparkles）。登录页改冷雾白 + 96px 戳形 logo（「表」章 + 虚线 AI 外环），并修掉登录态渲染在 `.dshm-root` 外拿不到 token 的 v2 遗留（App.tsx 登录分支包主题容器）。Profile 重做为身份卡 + 本月台账两列指标（本月登记 = 本月填表助手会话的 receipt 围栏计数，读 durable log 派生；待审核 = 本地标记）+ 48px 设置行。

## Alternatives considered

- **antd-mobile Steps vs 自绘票据轨迹**：Steps 的数字圆圈与 03 §4.4 的 12px 步点规格不符，回执卡的「●─●─●」自绘（约 20 行 CSS），保 signature 一致性。
- **词法专名高亮 vs strong 语义高亮**：识别「单据名/供应商/金额」需要专名词典或 NER，移动端不可靠；03 §4.5 本就把加粗作为信号，CSS-only 的 strong 处理是同一语义的零误报实现。
- **逐会话读 history 投影摘要 vs roster 职责摘要**：会话列表摘要按 03 §4.7 应取末条消息投影，但每个会话一次 history RPC 在列表轮询下不可接受；保留 roster 摘要，投影列为遗留（见偏差④条）。
- **保留 v2 渐变头像 vs 单色戳记底**：渐变是 03 §8.2 自评明确判退的「AI 默认感放大器」；单色化保留 Avatar 组件与全部调用点，只换 `background` 值与 prop 名。
- **暗轨重复 `--adm-*` vs var() 引用**：v2 在暗轨重复硬编码全套 `--adm-*`；var() 引用让暗轨只维护 `--dshm-*` 一张表，antd-mobile 自动跟轨，删约 15 行且不会两轨漂移。

## Consequences

- antd-mobile Popup 在 jsdom 无动画环境：`destroyOnClose` 的移除依赖动画完成，单测不能断言关闭后 DOM 消失（真浏览器 e2e 断言 detached 正常）；CSS module 的 `class ?? ''` 会留不可达分支，传给 Popup 的 className 用 `as string` 断言消掉。
- TS 5.5 起普通布尔谓词自动推断 type predicate：`segments.find(s => s.kind === 'text')` 的结果已收窄，后续 `line.kind === 'text'` 比较 oxlint 判恒真——3a 的该处比较删掉；usePoll 的 discriminated union 用 `status === 'ready'` 判别比 `value !== undefined && error === undefined` 更符合 oxlint 口径。
- e2e golden 重录（DSH_SNAPSHOT=refresh）后自然携带 v3 面：strong 拆出、选中卡 ✓ 章、№ 戳、「查看这条记录」、KG 单行按钮；mobile-shell e2e 同步到 v3 文案与弹层交互（弹层须显式关闭再点 TabBar——mask 挡 pointer）。
- 覆盖注记：Popup mask 点击经 `.adm-mask-aria-button`（antd-mobile Mask 渲染的 aria 钮）；metric 升格的标点密度边界（`,,,,,,,` 过密度门但无数字 token）单独成测。
- 已知偏差（按 03 文档值实现并在此登记）：① `--dshm-muted-foreground` on `--dshm-muted`（#5c716d/#e8efed）对比度 4.46:1，略低于 4.5，出现在 systemFold 折叠区摘要等 muted 底次要文字位；② 会话列表摘要仍取 roster 描述/duty，03 §4.7 的「末条消息友好投影（回执→已登记 №N）」需要逐会话读 history，留待后续；③ 03 §4.7 的左滑置顶/删除无后端 RPC（session.pin/delete 不存在），SwipeAction 未落；④ Profile「待审核」取本地 pendingReview 标记，跨设备一致性仅「本月登记」满足。
- 门禁：ui-mobile vitest 314/314 绿 + src/client 覆盖 100%；oxlint 0 错；typecheck 过；build:lib:client 重跑；mobile-shell + mobile-preview-iframe + mobile-assistant e2e 11/11 绿（golden 已 refresh 重录）；README 双语同步为 v3 叙述。
