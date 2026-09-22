# E1 移动端 v4 重设计前现状审计 · 丑点清单报告

> 日期：2026-09-22 | 审计对象：packages/client/ui-mobile（/mobile 路由，PC 端经 ui-mobile-preview iframe 嵌入）| 方法：chrome-devtools 真实渲染走查（375×812 视口）+ 真实 MiniMax API 全流程（采购单登记 → 追问 → 草稿 → 确认 → 回执；出库单二次流程补证）+ 源码统计 + D 轮设计规格（plans/2026-09-21-mobile-v3-redesign/03-visual-design.md）逐屏对照 | 前提：ui-mobile 自 D 轮合入（15ca104ab8）后零改动，当前渲染即 D 轮交付原样，用户否定的就是这个版本。

## 0. 一句话结论

v3 的色彩轨（墨青冷链票据）、token 纪律、暗色双轨落地合格；但承载「设计感」的三大件——**44px 圆形相位戳（signature）、三分层台账卡排版、会话列表票据化摘要——全部缩水成最简实现**。ChoiceBubble 源码注释自认 "Minimal v3 scaffolding; the visual batch owns the final look"：**视觉批次从未发生**。加上聊天页被 tabbar 压扁、整流「白卡套白卡」同质化，观感自然「没有设计感」。

## 1. 截图索引（research/2026-09-22-mobile-v4-audit/，全部真实渲染）

| 文件 | 内容 |
|---|---|
| 01-login.png | 登录页（浅色，登录前） |
| 02-chats-light.png | 会话列表（浅色，有会话态，注意超长副标题） |
| 03-chats-empty-filter.png | 会话列表搜索空态 |
| 04-newchat-sheet.png | 新建会话底部弹层 |
| 05-chat-top-light.png | 聊天流（回放态，回执段） |
| 06-chat-receipt-light.png | 回执卡特写（浅色） |
| 07-chat-full-light.png | 聊天流全页（浅色） |
| 08-chat-running.png | 真实 API 处理中态（RunningRow + 停止按钮） |
| 09-chat-answered-light.png | 追问回答后的气泡（含数字结论） |
| 10-me-light.png / 11-me-dark.png | 我的页（浅/深） |
| 12-chats-dark.png | 会话列表（深色） |
| 13-chat-dark.png | 聊天流 + 回执卡（深色） |
| 14-pc-mobile-preview.png | PC 端「移动端预览」tab（iframe 入口，深色同步验证通过） |
| （会话内观察截图，未落盘） | 出库单草稿卡高清：三分层折叠行、PhaseStamp 胶囊、展开态 FK 裸 id、ChoiceBubble 产品匹配询问 |

## 2. 丑点清单（按界面；每条标注 【方向】= v3 方向本身不对 /【落地】= 方向对但实现糙）

### 2.1 会话列表（02/03/12 号截图）

| # | 区域 | 问题 | 归类 |
|---|---|---|---|
| C1 | 行副标题 | 显示 roster description **全文 4-6 行**（"移动端唯一的持表 AI 同事：一句话登记六类业务单据（采购/供应商/质检/入库/出库/回款）。表单类型按注册表意图匹配……"），行高被撑到 100px+，信息密度灾难。设计规格 §4.7 承诺「摘要取末条消息的友好投影（回执卡投影为『已登记 №1042』）」；实现 `subtitleOf()` 直接返回 `AI 同事 · ${agentPreset}` 或整段 description，投影逻辑从未实现 | 【落地·重大】 |
| C2 | 未读点 | 12px 级**墨青（primary）大圆点**逐行出现：主色不读作「未读」，读作装饰；规格是砖红小角标。颜色语义错位 + 尺寸过大 | 【落地】 |
| C3 | 列表交互 | 无 SwipeAction 置顶/删除（§4.7 明确承诺），70+ 条测试残留会话无分组/置顶/归档全部平铺，大量重复「新会话」默认标题 | 【落地】+【方向】（列表治理策略缺位） |
| C4 | 行右侧 | 「表单」徽标、「处理中」、「待审」三个小胶囊与时间戳挤在右上角，主次不清；徽标全部自绘 span | 【落地】 |
| C5 | 搜索/筛选 | 搜索框自绘 input、筛选 chips 自绘 button；chips 无计数、无结果预览 | 【落地·次要】 |

### 2.2 聊天页 · 结构（05-09/13 号截图）

| # | 区域 | 问题 | 归类 |
|---|---|---|---|
| T1 | 底部 tabbar | 聊天详情页**不隐藏**「消息/我的」tabbar，吃掉 56px 高度，聊天流 + composer 被压扁；会话详情应是全屏层 | 【方向】 |
| T2 | header 副标题 | 直接暴露技术字符串「AI 同事 · **mobile-form-assistant**」——preset id 未映射中文名 | 【落地】 |
| T3 | header 返回钮 | 文字「‹」字符当按钮：线重细、触达面积小、按压态弱；整页无 NavBar | 【落地】 |
| T4 | AI 头像徽章 | 「AI」青色小方块贴在头像**左下角**覆盖头像（规格：头像右下角描边圆章），像渲染 bug | 【落地】 |
| T5 | 整流节奏 | **白卡套白卡同质化**：AI 气泡白底、询问卡白底、草稿卡白底、回执卡白底，全靠 1px 冷缘描边区分；无底色分区、无阴影层级，长对话扫读疲劳。「嵌平卡」策略在长流里失去层次；深色模式（13 号）放大此问题（暗卡套暗卡） | 【方向】 |
| T6 | 工具行 | 「✓ 读取业务表结构」纯文字行无容器：Unicode ✓/◌/✕ 字符当图标、灰小字直铺背景、与气泡混排像终端日志；running 行仅一行小字，无骨架感 | 【落地】 |
| T7 | 欢迎卡 | 空会话直接渲染聊天流顶部内嵌 WelcomeCard（标题 16px）；规格 §4.6 是「垂直居中欢迎屏：72px 戳形 logo + 28px 显示标题 + 能力清单 + 起点chips」——欢迎屏仪式感完全没做 | 【落地】 |

### 2.3 交互气泡（ChoiceBubble / 选择回执，05 号 + 出库单观察截图）

| # | 区域 | 问题 | 归类 |
|---|---|---|---|
| A1 | 询问卡整体 | 绿描边卡与叙述气泡区分度弱（同为白底圆角，只多一圈 success 描边）；问题标题、选项行、free-text 链接的排版规格（标题 14/500、hint 13/20、chips h28、按钮 h36）未执行——源码注释自认 scaffolding，**视觉批次从未发生** | 【落地·重大】 |
| A2 | 选项行 | 自绘 radio 行：圆圈 + 主文 + hint 挤一行，行距紧、按压反馈弱；「鲜丰（id 7） 联系人张经理，待审核」主次不分（id 直接进文案） | 【落地】 |
| A3 | 三形态 | cards/chips/buttons 三形态代码存在，但 AI 实际只发 cards 变体；chips/buttons 从未视觉验证 | 【落地】 |
| A4 | 选择回执胶囊 | 「✓ 用 id 7 这条鲜丰档案」胶囊 OK；✓ 后有空格渲染 + id 裸露，细节毛糙 | 【落地·次要】 |

### 2.4 草稿卡 DraftCard v3（出库单观察截图）

| # | 区域 | 问题 | 归类 |
|---|---|---|---|
| D1 | PhaseStamp | 「待确认」是**圆角矩形小胶囊**（右上角 tag），规格是 **44px 圆形戳记**（空心青灰 2px 描边圆章 + 盖章动效载体）。v3 的唯一 signature 元素被降格成普通标签；回执卡的「№21」倒是圆戳——戳记体系形态分裂（胶囊/圆戳并存） | 【落地·重大】 |
| D2 | 三分层排版 | 「需要你定 / 请确认·AI 推导 / 系统生成」三个分区头同质小灰字；「请确认」层 4 行折叠按钮罗列：标签·依据+值+「›」挤单行，无左右列对齐、无层间色彩/底色差异，扫读效率低——三分层信息架构渲染成了三段一样的灰字行 | 【落地·重大】+【方向】（分层本身复杂度偏高） |
| D3 | FK 展开态 | 展开供应商字段显示**裸 id「7」**（textbox value="7"）；Picker 只在 focus 弹出，静态态是技术值非「鲜丰食品」人类可读名 | 【落地·重大】 |
| D4 | 系统生成区 | 原生 details/summary 无动效、「▾」字符 chevron | 【落地·次要】 |
| D5 | 动作区 | 驳回（红描边）与确认写入（墨青实底）通栏各半，视觉重量接近，危险动作过重 | 【落地·次要】 |

### 2.5 回执卡（06/13 号截图）

| # | 区域 | 问题 | 归类 |
|---|---|---|---|
| R1 | 指标布局 | 整体最接近规格 ✅；但三列指标（¥4,500/日期/单号）平铺无层级、金额大数未按规格全幅居中（与 №21 并排头行）；「查看这条记录」是文字链接非 h40 次按钮 | 【落地·中】 |
| R2 | 状态轴 | 「对话→确认→已落库」步点过小、连线感知弱，挤在底部像面包屑 | 【落地】 |

### 2.6 Composer / 输入区（05-09 号截图）

| # | 区域 | 问题 | 归类 |
|---|---|---|---|
| P1 | 发送按钮 | 「➤」**Unicode 字符**圆钮：渲染大小/线重不可控，disabled 态接近灰白难辨认（对照图 08 附件观察）；项目里有 lucide-react 却用字符 | 【落地】 |
| P2 | 输入框 | textarea rows=1 固定高度；规格「自适应 1-4 行」未实现，长输入无扩展 | 【落地】 |
| P3 | 停止按钮 | 「停止」文字按钮与发送圆钮形态切换突兀，无 loading 方形图标 | 【落地·次要】 |

### 2.7 我的页 / 新建会话 / 登录页 / PC 预览（01/04/10/11/14 号截图）

| # | 界面 | 问题 | 归类 |
|---|---|---|---|
| M1 | 我的页 | 信息密度极低（身份卡+2 指标+3 设置行），「本月台账」两列松散；v3 票据方向在此页零表达（无戳记元素、无 tabular 强调） | 【方向】 |
| M2 | 我的页 | 设置行自绘 div（antd-mobile List 未用）：行高/按压态/箭头与系统组件不一致；「退出登录」红字行混在普通设置组，无破坏性区隔 | 【落地】 |
| N1 | 新建会话 sheet | 内容结构 OK；但表单 chips（采购单/供应商登记/质检记录）纯展示不可点，与「可直达」预期不符；「最近」行样式与会话列表行不一致 | 【落地】 |
| L1 | 登录页 | 戳形 logo 外环 1px 淡青灰几乎不可见，「表」戳存在感弱（规格 96px，实际约 64px）；输入框低于规格 h48；「获取」文字链接与「登录」大按钮层级混乱；双 footer（演示环境 + DeepSeek Harness·移动端 v3）信息冗余 | 【落地】 |
| V1 | PC 预览 | 手机边框是朴素圆角矩形（无刘海/听筒细节）；顶部 hint 长句占宽——这是用户看到移动端的主入口，包装即门面 | 【落地·次要】 |

### 2.8 达标项（重设计应保留的资产）

- **色彩 token 纪律**：业务 CSS 硬编码 hex 仅 3 处漏网（ui.module.css:75 / chat.module.css:334 color-mix / v3.module.css:89），40 个 hex 全部集中在 tokens.css 定义位；messages.module.css 用 var(--dshm-*) 92 次——重设计换轨成本极低 ✅
- **暗色双轨**：列表/聊天/卡片/我的全切换正常，antd-mobile `--adm-*` 映射生效；iframe 预览主题同步验证通过（14 号）✅
- **动效三处**：chat-enter 180ms / v3-card-land / v3-stamp-in 盖章曲线 + prefers-reduced-motion 降级全部实现（chat.module.css:90、v3.module.css:22/91）——只是 stamp-in 载体（胶囊）降格后感知弱 ✅
- **富渲染管线**：RichContent 的 markdown + DOMPurify + 指标卡化已实现（D 轮 07-rich-answer.png 有表格证据；日常叙述触发少）✅
- **回执卡骨架**：№ 戳 + 金额大数 + 指标 + 状态轴的指标卡结构成立 ✅

## 3. antd-mobile 覆盖率与组件化机会

**现状**：antd-mobile v5 实际使用 **13 个组件**——Button、Input、TextArea、Picker、DatePicker、Stepper、Switch、Popup、Dialog、Steps、TabBar、SafeArea、DotLoading（11 个文件 import），集中在表单控件、弹层和 shell；**聊天流、会话列表、设置页全部手写 div+CSS module**。设计规格 §7 规划的 Toast、SwipeAction、PullToRefresh、ImageViewer、Empty **一个都没用上**。

**手写 → 组件库映射表**（v4 重设计的直接组件化清单）：

| 现状手写 | 建议 antd-mobile 组件 | 位置 | 对应丑点 |
|---|---|---|---|
| 返回按钮「‹」文字 | NavBar（onBack） | ChatView header | T3 |
| 会话列表行 button | List.Item + SwipeAction（右侧动作：置顶/已读/删除） | MessagesView | C1/C3 |
| 搜索框 input | SearchBar | MessagesView | C5 |
| 筛选 chips（全部/AI 同事/待审核） | CapsuleTabs | MessagesView | C5 |
| 空态/错误 NoticeCard | Empty / ErrorBlock | ui.tsx | C5/T6 |
| 未读点 span | Badge（带 count，色彩改砖红/数字） | MessagesView | C2 |
| 「表单/参谋/待审」徽标 span | Tag | MessagesView | C4 |
| 错误提示 p.error | Toast.show（错误）/ Dialog.alert（阻断） | ChatView composer、NewChatSheet | — |
| 设置行 div 组 | List + List.Item（extra/arrow） | ProfileView | M2 |
| 退出登录行 | 独立区块 + Dialog.confirm | ProfileView | M2 |
| textarea rows=1 | TextArea（autoSize 1-4 行） | ChatView composer | P2 |
| 发送「➤」/停止按钮 | Button shape/circle + lucide Send/Square 图标 | ChatView composer | P1/P3 |
| 工具行 ✓/◌/✕ 字符 | SpinLoading（running）+ 统一图标行 | ChatView FlowItem | T6 |
| 系统生成 details/summary | Collapse | DraftCard v3 | D4 |
| 列表长滚动 | InfiniteScroll（+ PullToRefresh 历史加载） | MessagesView/ChatView | C3 |
| KG 证据入口行 | List.Item（或 NoticeBar 提示形态） | KgEvidence | — |
| 图片/大图查看 | ImageViewer（消息内图片兜底） | RichContent | — |

## 4. D 轮设计落地差距结论（03-visual-design.md 承诺 vs 实际渲染）

| 规格条款 | 承诺 | 实际 | 判定 |
|---|---|---|---|
| §4.7 会话列表摘要 | 末条消息友好投影（「已登记 №1042」） | roster description 全文 4-6 行 | ❌ 未实现（C1） |
| §4.7 未读角标 | 砖红小角标 | 墨青大圆点 | ❌ 走样（C2） |
| §4.7 SwipeAction | 左滑置顶/删除 | 无 | ❌ 未实现（C3） |
| §4.3 相位戳 | 44px 圆形戳记四相位 + 盖章 signature | 草稿卡=胶囊标签；回执卡=圆 № 戳，形态分裂 | ❌ 降格（D1） |
| §4.3 字段行 | 标签左/值右对齐、行高 44、分区头+软分区线 | 标签·依据+值+箭头挤单行、三分区同质灰字 | ❌ 走样（D2） |
| §4.2 ChoiceBubble 三形态 | 卡片/chips/按钮组三套排版规格 | scaffolding 原样，视觉批次未发生（源码注释自认） | ❌ 未发生（A1） |
| §4.6 欢迎屏 | 垂直居中 + 72px logo + 28px 显示标题 | 聊天流顶部内嵌卡（16px 标题） | ❌ 走样（T7） |
| §4.12 输入区 | TextArea 1-4 行自适应 + 发送圆钮 | rows=1 固定 + ➤ 字符钮 | ❌ 走样（P1/P2） |
| §4.9 登录页 | 96px 戳 logo、输入 h48 | ~64px logo、输入偏矮 | ❌ 缩水（L1） |
| §7 antd-mobile 边界 | Toast/SwipeAction/PullToRefresh/ImageViewer/Empty 入列 | 五者全未使用 | ❌ 未实现 |
| §2/§5 色彩 token + 暗色双轨 | 全 token 化、整轨替换 | 落地完整（漏网 hex 仅 3 处） | ✅ |
| §6 动效三处 | 入场/点选/盖章 + reduced-motion | 全实现（盖章载体降格） | ✅ |
| §4.4 回执卡 | 金额大数居中 + 两列指标 + 三步流程条 | 骨架成立，大数/列数/按钮细节偏差 | ⚠️ 基本达标 |
| §4.5 富渲染 | markdown + 表格 + 指标卡化 + 高亮 | 管线已实现，日常触发少 | ✅ |

**总判定**：v3 是一份完成度很高的设计文档配一次「骨架交付」——token/暗色/动效/回执骨架达标，但所有需要排版功力的面（列表摘要投影、相位戳形态、三分层布局、询问卡三形态、欢迎屏、输入区）全部停留在 scaffolding。「设计感垃圾」的体感 = signature 缺位 + 同质化白卡 + 组件库未用三因叠加。v4 重设计不需要推翻色彩轨与 token 底座，需要的是：**真做视觉批次 + 补组件库 + 修信息投影 + 聊天页全屏化**。

## 5. 证据与工具

- 截图 14 张：本目录（shoot.mjs 为本次审计的自控 CDP 截图脚本，非产品代码）
- 真实 API 会话：session-b1398077-3501-497e-a3c3-091ea5fcc8b4（采购单全流程 + 出库单草稿补证，MiniMax API 经 13100 代理）
- 关键源码坐标：sessionsService.ts:170（subtitleOf）、ChoiceBubble.tsx:5（scaffolding 注释）、DraftCard(v3).tsx:91（derivedRow 折叠按钮）、chat.module.css:289（➤ 发送钮）、tokens.css（token 底座）
