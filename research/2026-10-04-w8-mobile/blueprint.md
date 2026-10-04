# W8 移动端重构蓝图 — ui-ux-pro-max 差距审计 × 分批执行计划

> 日期 2026-10-04。范围：`packages/client/ui-mobile/`（@deepseek-ai/dsh-client-ui-mobile，React 18 + antd-mobile v5.43 Web H5，入口 `apps/web/src/mobile.ts`，经 examples/kb-agent/cordis.patch.yml `web-runtime.mobileEnabled: true` 服务于 :3080 /mobile）。
> 本文档是 W8 实施批次的唯一执行依据：B1/B2/B3 子任务照此执行；审计证据以文中文件:行号为准。
> 前置事实：W7 轮（commit 474ff25fe6）已完成 M0~M3 全量美学改造，当前为 v7「W7 铸造」语言。**本审计不重复 W7 已修复项**，聚焦剩余差距；W7 审计底稿对照：`../../research/2026-10-03-w7-audit/03-mobile-inventory.md`、`04-mobile-aesthetic-findings.md`。

## 1. 设计系统定稿

**W7「铸造」语言全部保留，W8 叠加四件增量**。完整裁决（18 项 V1~V18，逐条含理由）见 [design-system/w8-merge-verdict.md](design-system/w8-merge-verdict.md)；技能 `--persist` 产物（MASTER.md，209 行）见 [design-system/dsh-mobile-workbench/MASTER.md](design-system/dsh-mobile-workbench/MASTER.md)，其推荐摘要：Trust & Authority 风格 / 青色系 #0891B2 / Lexend + Source Sans 3 / 四档阴影 / 反 playful·AI 紫粉渐变·emoji 图标。

定稿表（保留｜补强｜拒绝，色值即唯一基准）：

| 维度 | 裁决 | 内容 |
|---|---|---|
| 品牌主色 | 保留 W7 | `#1E4E8C`/hover `#2A5FA6`/active `#173D70`/soft `#E8F0F9`；暗轨提亮 `#2A5FA6`。拒绝 CLI 青 `#0891B2`（与 PC `--w7-primary` 同源是合同） |
| 语义五态 | 保留 W7 | Fiori 配对（Positive `#256F3A`/`#F5FAE5`、Critical `#E76500`/`#FFF8D6`、Negative `#AA0808`/`#FFEAF4`、Neutral、Informational、执行完成 `#0E7490`），暗轨去饱和提亮 |
| 中性阶 | 保留 W7 | 暖灰画布 + 三档海拔 + 弥散影（card/raised/shell） |
| 字体/字阶 | 保留 W7，补强一项 | 系统栈（拒绝外链字体）；五档 12/13/15/17/24-26 + tnum；**新增：表单输入类控件字号 ≥16px**（防 iOS 聚焦自动缩放） |
| 焦点态 | **新增（技能发现的最大遗漏）** | token `--dshm-focus-ring` 双轨 + 全局 `:focus-visible` + fieldInput/composer `:focus` |
| 链接色 | **新增** | token `--dshm-link`（light `#1E4E8C` / dark `#7B9DD1`，暗轨对卡 ≥4.5:1）；soft 底文字走 `--dshm-on-soft` |
| 触控 | 补强 | `--dshm-touch-sm` 36→40px；主操作路径 44px；相邻 ≥8px probe 复核 |
| 输入底 | **新增** | 暗轨表单输入底改 `--dshm-muted` 一阶（现状=卡同色零对比） |
| 间距 token | 拒绝新增 | 4/8 节奏已内联手写稳定，token 化高扰动低收益 |
| 模态 blur / hover 上浮 / 青色背景 | 拒绝 | 与铸造语言不符；触屏无 hover |
| 图表序列色 | 备用 | 六阶蓝递进 + 灰（W7 §1.4）；移动端无图表面，B3 若加 KPI 迷你图启用 |

## 2. 差距矩阵（技能 Quick Reference §1–§10 × 移动端现状）

判定口径：✅ 已达标（证据）/ ⚠️ 部分达标（差距）/ ❌ 未达标 / — N/A（产品形态外）。**「批次」列即修复归属**；侦察编号 #①~#⑬ 为任务给定痛点，全部并入。W7 已修复项（蓝过载/字阶/海拔/骨架/空态五件套等）不列差行，仅在 ✅ 证据中带出。

### §1 Accessibility（14 条）— ✅5 ⚠️7 ❌2

| 准则 | 判定 | 证据 / 差距 | 修复 | 批次 |
|---|---|---|---|---|
| color-contrast | ⚠️ | 主/次文双轨已门槛化（w7-b6 暗轨七门槛）；**剩暗轨 v3 表单输入底=卡同色**（`forms/v3/v3.module.css:249` background `--dshm-card`，暗轨仅 1px 边框 step8）；light 轨输入=白卡+边框可见 | 暗轨输入底改 `--dshm-muted`；`#④` | B1 |
| focus-states | ❌ | 全库无 `:focus-visible` 样式；v3 fieldInput 无 `:focus` 定义；键盘/读屏用户焦点不可见 | 新增 `--dshm-focus-ring` + 全局规则 + 输入件 focus 边框 | B1 |
| alt-text | ⚠️ | 装饰图标 aria-hidden 全覆盖（ChatView.tsx:18 等）；markdown 内容图 alt 依赖模型产出不可控 | RichContent 图片 alt 缺省时补 aria-label；复核 ImageViewer | B2 |
| aria-labels | ✅ | 图标按钮全带（新建会话 ChatView.tsx:465、发送 :630、停止 :621、快捷面板 :599 aria-expanded） | — | — |
| keyboard-nav | ⚠️ | Enter 发送 + Shift 换行 + isComposing 防误发（ChatView.tsx:613）；无 skip-link、无 Tab 焦点复核 | 焦点环（B1）先行；skip-link 裁决 deferred（见 skip-links 行） | B1 |
| form-labels | ⚠️ | LoginView/DraftCard label 包裹可见标签✓；composer TextArea 仅 placeholder（可作可访问名但弱） | TextArea 加 aria-label="消息输入" | B1 |
| skip-links | ❌ | 无 skip-to-content | **裁决 deferred**：430px 手机壳 + 底部 Tab 形态下键盘长表单非主路径，焦点环 + Tab 顺序自然已覆盖大半；README Known Limitations 记录 | — |
| heading-hierarchy | ⚠️ | HomeView h1→h2 顺✓；ChatView/二级页 PageNav 标题为 span 无 h1；DraftCard 卡内 h4 跳级 | PageNav 标题 h1 化（视觉不变）；DraftCard tierHead 改 div+样式（h4→非标题元素） | B2 |
| color-not-only | ✅ | 严重度带文字（紧急/关注 AlertsView.tsx:44）；未读点 aria-label="有新消息"（HomeView.tsx:337） | — | — |
| dynamic-type | ⚠️ | 字阶 px 固定不随系统缩放 | **裁决 deferred**：430px 壳形态决策，rem 化破壳风险大于收益；README 记录 | — |
| reduced-motion | ✅ | transitions.css:39 全量降级 0.01ms | — | — |
| voiceover-sr | ⚠️ | role=status/alert 使用广✓；antd-mobile Toast 的 aria-live 行为未复核 | B1 probe 顺带复核（读屏手测一次，不改件则记录） | B1 |
| escape-routes | ✅ | 全二级页 PageNav back + goBackOr 域回退（router.ts:114） | — | — |
| keyboard-shortcuts | ✅ | Enter/Shift+Enter；无自定义快捷键冲突 | — | — |

### §2 Touch & Interaction（17 条）— ✅9 ⚠️4 ❌1 — 3

| 准则 | 判定 | 证据 / 差距 | 修复 | 批次 |
|---|---|---|---|---|
| touch-target-size | ⚠️ | 主触控 44（--dshm-touch）✓；**次级 36px×15 处**（grep `--dshm-touch-sm`：SearchBar/chips/收藏星/关闭钮/报告次按钮/stop 等）；`#⑥` | token 36→40 + 主路径（stop、SearchBar）44；命中区外扩 padding | B1 |
| touch-spacing | ⚠️ | quickRow/chipRow 间距未实测复核 | light probe 顺带量 chips 相邻命中区间距 ≥8px | B1 |
| hover-vs-tap | ✅ | 全触控语义，无 hover 依赖 | — | — |
| loading-buttons | ✅ | 登录 loading+disabled（LoginView.tsx:94）；send sending 门（ChatView.tsx:631）；认领/关闭 busy 文案（AlertsView.tsx:205） | — | — |
| error-feedback | ✅ | LoginView:88 role=alert 就近；chat 发送失败分类处理（ChatView.tsx:217-239，网络入 outbox） | — | — |
| cursor-pointer | ✅ | tokens.css:250 button reset | — | — |
| gesture-conflicts | ✅ | 主滚动纵向；roster 横滑为独立轨道 | — | — |
| tap-delay | ❌ | 未设 `touch-action: manipulation` | tokens.css 全局补一行 | B1 |
| standard-gestures | ✅ | PullToRefresh（todos/alerts）；返回用系统历史 | — | — |
| system-gestures | ✅ | `padding-top: env(safe-area-inset-top)`（tokens.css:207）+ SafeArea bottom（MobileShell.tsx:94） | — | — |
| press-feedback | ⚠️ | chips active transform 120ms✓（messages.module.css:477）；recentRow/rosterCard 行卡片无 :active 反馈 | 行卡片统一 `:active` 压反馈（scale 0.98 或底色） | B2 |
| haptic-feedback | — | Web H5 无振动惯例 | — | — |
| gesture-alternative | ✅ | 关键动作全显式按钮 | — | — |
| safe-area-awareness | ✅ | 同 system-gestures | — | — |
| no-precision-required | ⚠️ | 并入 touch-target-size（36px 小图标命中） | 同 #⑥ | B1 |
| swipe-clarity / drag-threshold | — | 无 swipe-action 依赖主流程；无拖拽交互（antd SwipeAction 使用点 B2 复核一轮） | — | B2 |

### §3 Performance（19 条）— ✅8 ⚠️6 ❌2 — 3

| 准则 | 判定 | 证据 / 差距 | 修复 | 批次 |
|---|---|---|---|---|
| progressive-loading | ⚠️ | 骨架全家（SkelThread/SkelRow/SkelCard）超标准；**但新鲜度=轮询 1.2s/5s，token 不流式**（README.md:31）；`#①` | B3-1：afterSeq 增量拉取 + running 窗口提速 + fold 增量化（最小可行方案见 §4-B3） | B3 |
| offline-support | ⚠️ | 发送侧 outbox 离线队列超标准（ChatView.tsx:228）；**工作项数据设备级**（workStore localStorage，换设备/清缓存丢失，README.md:32）；`#②` | B3-2：服务端投影沿 W6-B1 台账先例（ledgerService.ts nocobase.list 模式） | B3 |
| lazy-loading / bundle-splitting | ❌ | 12 路由全静态 import（MobileShell.tsx:18-29）；tsdown 静态链接单包 | **评估项**：构建链（tsdown 静态链接）下路由分割成本高，记 B3 可选评估，不默认做 | B3 |
| virtualize-lists | ⚠️ | 会话列表/聊天流无虚拟化（history 窗口 200 条上限） | **评估项**：实测滚动性能再裁决（技能 rn-stack 笔记为 RN FlatList 语境，Web 下 200 条 DOM 通常可承受） | B2 |
| main-thread-budget | ⚠️ | 每次 poll 全量 foldHistory 重折叠（ChatView.tsx:149） | B3-1 随增量化一并优化（新事件 append fold） | B3 |
| image-optimization / image-dimension | ⚠️ | RichContent markdown 图片无 loading=lazy、无尺寸预留（CLS） | img 加 loading=lazy + max-width:100%（尺寸预留由模型产出不可控，记录） | B2 |
| critical-css / font-loading / font-preload | ✅/— | 系统栈无外部字体（W7 决策）；antd-mobile 全量 CSS 单包记录为已知取舍 | — | — |
| reduce-reflows / content-jumping / input-latency / tap-feedback-speed / debounce-throttle | ✅ | stickToBottom 直写 scrollTop；骨架匹配行结构；本地 state 即时；轮询 setTimeout 链式节流（hooks.ts:110） | — | — |
| third-party-scripts / network-fallback | ✅ | 无第三方；网络失败中文文案 + outbox + 重试按钮 | — | — |

### §4 Style Selection（13 条）— ✅11 ⚠️2 — 0

| 准则 | 判定 | 证据 / 差距 | 修复 | 批次 |
|---|---|---|---|---|
| style-match / consistency | ✅ | 全站单语言（M0~M3）；CLI 独立推导出同人格 Trust & Authority（V18 交叉验证） | — | — |
| no-emoji-icons | ✅ | lucide-react 全线 stroke 1.8 统一 | — | — |
| color-palette-from-product / effects-match-style / elevation-consistent / dark-mode-pairing / icon-style-consistent / system-controls / blur-purpose | ✅ | W7 体系闭环（裁决 V1~V3/V7/V11） | — | — |
| state-clarity | ⚠️ | press token 已有（--dshm-primary-press）；focus 态缺失并入 V8 | B1 焦点环 | B1 |
| platform-adaptive | ⚠️ | Web H5 + antd-mobile 跨平台混合语言，产品形态已定型 | 记录（无行动） | — |
| primary-action | ✅ | 每屏 ≤2 品牌处纪律（quick chips 单 primary；DraftCard 单确认写入） | — | — |

### §5 Layout & Responsive（16 条）— ✅9 ⚠️5 ❌1 — 1

| 准则 | 判定 | 证据 / 差距 | 修复 | 批次 |
|---|---|---|---|---|
| readable-font-size | ❌ | **输入控件 13px（`--dshm-fs-sm`）触发 iOS Safari 聚焦自动缩放**（v3.module.css:239 --font-size、composer textarea） | 输入类控件字号 ≥16px（展示字阶不变）；`#④` 关联 | B1 |
| viewport-units | ⚠️ | height:100% 链（html/body/#mobile-root）；iOS 动态工具栏下 dvh 更稳 | 复核实机；必要时 `min-height:100dvh` 渐进增强 | B1 |
| orientation-support | ⚠️ | 430px 壳横屏挤压 | 裁决 deferred（手机壳产品形态），README 记录 | — |
| z-index-management | ⚠️ | 弹层走 antd-mobile/portal host；自定义 z-index 散点复核 | B2 清点 kg sheet/ImageViewer 层级 | B2 |
| spacing-scale | ⚠️ | 4/8 节奏实际遵守但无 token（裁决 V6：不 token 化） | review 把关 | — |
| content-priority | ⚠️ | home quick chips 7 个与 4 Tab 入口重叠（查看工作=work Tab、找 AI 同事=agents Tab）；`#⑦` 关联面 | 收敛为 4：登记一条单据(primary)/我的预警/我的待办/看单据 | B2 |
| viewport-meta / mobile-first / breakpoint / line-length / horizontal-scroll / touch-density / fixed-element-offset / scroll-behavior / visual-hierarchy | ✅ | viewport-fit=cover；720px 单断点手机壳；气泡 78% 宽；tabbar flex 非 fixed 无遮挡；W7 字阶色阶 | — | — |

### §6 Typography & Color（15 条）— ✅11 ⚠️3 ❌1

| 准则 | 判定 | 证据 / 差距 | 修复 | 批次 |
|---|---|---|---|---|
| color-accessible-pairs | ❌ | **暗轨品牌蓝作纯文字 33 处，`#2A5FA6` 对卡 `#1E2634`=2.38:1**（tokens.css:157 自注）；含聊天正文链接（messages.module.css:666）、todos/docs/alerts 链接与 retry、二级审批 chip（:1091）；`#⑤` | 新 token `--dshm-link`（dark `#7B9DD1` ≥4.5:1）；裸文字点全量替换；soft 底文字换 `--dshm-on-soft` | B1 |
| color-semantic | ⚠️ | **messages.module.css:699 唯一硬编码 hex `#c7d3e6`**（代码块复制钮）；`#⑩` | 新 token `--dshm-code-action`（双轨同值，代码板恒深） | B1 |
| truncation-strategy | ⚠️ | 标题 ellipsis 点位未系统复核 | B2 复核长标题/长单号行 | B2 |
| text-styles-system | ⚠️ | 五档自有体系非 Dynamic Type roles（裁决 deferred 同 dynamic-type） | — | — |
| line-height / font-scale / weight-hierarchy / contrast-readability / color-dark-mode / color-not-decorative-only / number-tabular / whitespace-balance / letter-spacing / font-pairing / line-length / contrast-feedback | ✅ | root 1.5；五档+tnum 全站；400/600 两档；暗轨全量去饱和；语义色门槛化 | — | — |

### §7 Animation（25 条）— ✅18 ⚠️2 ❌1 — 4

| 准则 | 判定 | 证据 / 差距 | 修复 | 批次 |
|---|---|---|---|---|
| exit-faster-than-enter | ❌ | remount 模型只有 enter 动画无 exit（transitions.css 单向入场是已声明 stance）；`#⑧` 关联 | B1 remount 缓解后重估（Tab 常驻切换天然无 exit 需求） | B1 |
| state-transition | ⚠️ | quickPanel 条件渲染直接出现无过渡 | 面板开合补 slide/fade 220ms（reduced-motion 降级） | B2 |
| continuity | —（stance） | 单方向入场（transitions.css:11-15 deliberate stance 已记录） | 保持 stance，不视为缺陷 | — |
| stagger / shared-element / parallax / spring / interruptible | — | 列表数据驱动逐条出现；无共享元素/视差需求 | — | — |
| duration-timing / transform-performance / loading-states / excessive-motion / easing / motion-meaning / fade-crossfade / scale-feedback / gesture-feedback / hierarchy-motion / motion-consistency / opacity-threshold / modal-motion / navigation-direction / layout-shift-avoid / no-blocking-animation | ✅ | 220ms token；transform/opacity only；SkelThread；每视图 1-2 动效；ease-slide/ease-stamp 双曲线；chips 按压 transform；antd Popup 自带动效 | — | — |

### §8 Forms & Feedback（31 条）— ✅19 ⚠️8 ❌3 — 1

| 准则 | 判定 | 证据 / 差距 | 修复 | 批次 |
|---|---|---|---|---|
| inline-validation | ❌ | **DraftCard 必填（需要你定）空值可直接「确认写入」**（ChatView.tsx:377 onConfirmV3 无校验直达 send） | required 空值拦截：确认钮禁用或就近红字提示 + 补齐后解锁 | B2 |
| password-toggle | ❌ | 密码无显示切换（LoginView.tsx:79） | 输入右侧 eye 图标钮（44 命中） | B1 |
| focus-management | ❌ | 提交错误不聚焦首错字段 | LoginView error 时 focus 账号框；DraftCard 拦截时 focus 首个空必填 | B2 |
| error-placement | ⚠️ | LoginView 错误在卡底（两字段可接受）；DraftCard 无字段级错误位 | 随 inline-validation 就近补 | B2 |
| input-type-keyboard | ⚠️ | 数值字段 Input 无 inputMode="decimal"（Stepper 有）；无 tel 场景 | fieldControls 数值面加 inputMode | B2 |
| sheet-dismiss-confirm | ⚠️ | TaskFormModal 直接关闭；未保存草稿依赖 form-draft.ts 持久化范围复核 | 复核 TaskFormModal 草稿持久化覆盖面，缺则补 | B2 |
| toast-accessibility / aria-live-errors | ⚠️ | antd Toast aria-live 行为未复核；chat 错误仅 toast 无 aria-live 区 | B1 复核记录（不改件则记 known gap） | B1 |
| timeout-feedback | ⚠️ | rpc 无显式超时（fetch 默认）；网络失败文案已中文化（hooks.ts:19） | 记录；如 B3 动 rpc 层顺带加 AbortSignal.timeout | B3 |
| required-indicators | ⚠️ | 无 * 标记（三档分组「需要你定」即语义，设计取舍） | **裁决保留分组语义**，以空值拦截兜底（上行） | B2 |
| confirmation-dialogs | ⚠️ | 驳回/重新执行无二次确认（低风险语义可接受）；清除演示数据复核 | 复核 destructive 动作清单，仅高危加确认 | B2 |
| autofill-support / input-labels / submit-feedback / helper-text / disabled-states / progressive-disclosure / empty-states / toast-dismiss / undo-support / success-feedback / error-recovery / error-clarity / field-grouping / read-only-distinction / touch-friendly-input / destructive-emphasis / form-autosave / multi-step-progress | ✅ | autoComplete 双字段；v3 三档标签全可见 + rationale 即 helper；EmptyState 全站；驳回→重新编辑闭环；phase stamp；fieldRow min-height 44；draftStore hash 持久化（M2 组件质量高） | — | — |
| 枚举词汇 | ⚠️ | `#⑫` FieldWidget 枚举词汇本地测量退化纯文本（wire 不投影 options） | **超移动端范围**（需 apiproxy `nocobase.listMeta` 扩展）；记录为独立后续项，不入 W8 批次 | — |

### §9 Navigation（26 条）— ✅16 ⚠️2 ❌2 — 6

| 准则 | 判定 | 证据 / 差距 | 修复 | 批次 |
|---|---|---|---|---|
| state-preservation | ❌ | **`<main key={routeKey}>` 每次 hash 变更 remount 整页**（MobileShell.tsx:61-64）：Tab 互切丢滚动位置、丢列表筛选态、丢输入半稿（draftStore 只保 v3 草稿）；`#⑧` | B1：Tab 四页常驻（display 切换）保滚动/状态；层页（chat/work-detail/docs…）保持 remount 语义 | B1 |
| focus-on-route-change | ❌ | 路由切换不移焦 main（读屏用户失位） | main tabIndex=-1 + 切换后 focus()（不滚动） | B1 |
| tab-badge | ⚠️ | TabBar 无未读/待办徽标（home chip 有预警计数）；`#⑪` 未读点本地派生 reload 重置 | B3 随服务端投影评估 Tab 徽标（wire 无未读数，先记录） | B3 |
| back-stack-integrity | ⚠️ | hash history 依赖浏览器栈；goBackOr fallback 域 Tab 已兜底 | Tab 常驻后复核返回链 | B1 |
| bottom-nav-limit / back-behavior / deep-linking / nav-label-icon / nav-state-active / nav-hierarchy / modal-escape / search-accessible / navigation-consistency / avoid-mixed-patterns / modal-vs-navigation / persistent-nav / destructive-nav-separation / empty-nav-state 等 | ✅ | 4 Tab ≤5；docs 深链守卫（W6-B1 S2G）；tab-active 提亮门槛化；PageNav 全覆盖；搜索入口→chats 层 | — | — |
| breadcrumb-web / adaptive-navigation / top-app-bar-android / tab-bar-ios 等 | — | 桌面/原生控件类准则，Web H5 手机壳形态外 | — | — |

### §10 Charts & Data（31 条）— ✅3 ⚠️2 — 26

| 准则 | 判定 | 证据 / 差距 | 修复 | 批次 |
|---|---|---|---|---|
| data-density / content-priority | ⚠️ | **alerts 相同 CCP 预警逐条平铺不聚合**（AlertsView.tsx:180 rows.map 无分组）；`#⑦` | 同 ruleType+title 相邻聚合为组卡（计数徽标 + 展开明细） | B2 |
| number-formatting | ⚠️ | ReportCard 指标值为模型字符串直出，无千分位强制 | ReportCard value 渲染加数字格式化兜底（数字串才格式化） | B2 |
| empty-data-state / direct-labeling / trend-emphasis | ✅ | EmptyState 组件；指标数字直出 | — | — |
| 其余 26 条（legend/tooltip/axis/pattern/pie/interactive…） | — | **移动端无图表面**；ReportCard 为指标格非图表。B3 若加 KPI 迷你趋势，按 chart.md 笔记 + W7 §1.4 序列色启用 | — | — |

### 矩阵总计与侦察十三项落位

**技能 Quick Reference §1–§10 全部 207 条准则逐组判定，总计：✅ 109 ｜ ⚠️ 41 ｜ ❌ 13 ｜ —（N/A/deferred/stance）44。** 组内合并行（如 §3「reduce-reflows 等 5 条」一行）按其覆盖条目折算入小计。侦察 P0-P2 十三项落位：

| 侦察项 | 判定修正 | 矩阵落位 | 批次 |
|---|---|---|---|
| #① 聊天轮询不流式（P0） | 维持 P0（产品级差距） | §3 progressive-loading | B3-1 |
| #② workStore 设备级（P0） | 维持 P0 | §3 offline-support | B3-2 |
| #③ 演示级鉴权（P0） | **改判：代码已修复**（LoginView 走 nocobase.signIn 真实通道，verifyCode 全库零残留，auth.ts:8 注明 retired）——剩 README.md:30 过时文字 + token 过期处理未做 | §8（登录表单本身 ✅）+ 文档债 | B1（README）+ B3（过期处理） |
| #④ 暗轨表单输入底 | 维持 | §1 color-contrast | B1 |
| #⑤ 暗轨链接 2.38:1 | 维持 | §6 color-accessible-pairs | B1 |
| #⑥ 次级触控 36px | 维持 | §2 touch-target-size | B1 |
| #⑦ alerts CCP 不聚合 | 维持 | §10 data-density | B2 |
| #⑧ 路由 remount | 维持 | §9 state-preservation | B1 |
| #⑨ README v6 蓝 | 维持（README.md:7 `#2E7CF6` + :8 十路由 v6 叙述均过时） | 文档债 | B1 |
| #⑩ 硬编码 hex | 维持（messages.module.css:699） | §6 color-semantic | B1 |
| #⑪ 未读点本地派生 | 维持（wire 无未读数，非移动端单方可解） | §9 tab-badge | B3 评估 |
| #⑫ 枚举词汇本地测量 | 维持但**出 W8 范围**（需 apiproxy 扩展） | §8 末行 | 后续独立项 |
| #⑬ light 轨无自动 probe | 维持（W7 只建了暗轨 .w7m3-probe.mjs） | 验收门禁 | B1 产出 |

另：**预警卡无时间戳**（W7 审计 04 §11 残留，AlertsView footer 只有 entityCode+days）随 #⑦ 在 B2 一并补。

## 3. 每批不改动的红线（三批共用）

1. **业务逻辑层零改动**：`protocol.ts`（v3 协议）、`fold.ts`（折叠器，B3-1 仅增量化入口不动折叠语义）、`cardState.ts`（卡相位状态机）、`docsCatalog.ts`、`colleagues.ts`、`actions.ts` 的动作语义。
2. **换肤骨架不动**：App.tsx 主题 mirror（html/body dataset.theme）+ portal.ts 壳内弹层挂载 + tokens.css 双挂载点特异性格局（html 孪生压 antd `:root`）。
3. **antd-mobile v5.43 继续用**（28 组件在用；ConfigProvider 无 theme 通道，换肤唯一主通道=CSS 变量，W7 审计 03 §6 已固化结论）。
4. **八角色 scope 白名单契约不动**（W6-R5 服务端身份验证成果）。
5. **45 个 client spec 必须保持绿**（packages/client/ui-mobile/tests/ 42 + scripts/ 3 个 client 相关 spec）；`contextChipsOf` 等 ChatView 现有导出的签名兼容（拆分时 re-export）。
6. 构建契约：改样式/结构后必须 `pnpm run build:lib:client && cd apps/web && npx vite build` 才在 :3080 生效（clean 后重跑，44 bundle 缺失先例）。

## 4. 分批计划

### B1 — tokens/壳层/可达性基座（工作量 M）

**目标**：补齐设计系统四件增量 + remount 缓解 + 文档对齐，全部为壳层/令牌级改动，不碰页面业务。

**改动清单**（文件 → 内容）：

1. `packages/client/ui-mobile/src/client/tokens.css`
   - 新增：`--dshm-focus-ring`（light `0 0 0 3px rgba(30,78,140,.35)` / dark `0 0 0 3px rgba(83,131,199,.5)`）、`--dshm-link`（light `#1e4e8c` / dark `#7b9dd1`）、`--dshm-code-action: #c7d3e6`、`--dshm-touch-sm: 36px→40px`。
   - 全局规则：`.dshm-root :focus-visible { outline: none; box-shadow: var(--dshm-focus-ring); }`；`.dshm-root { touch-action: manipulation; }`；输入件 `font-size ≥16px` 基线注释。
2. 暗轨输入底分化：`forms/v3/v3.module.css` fieldInput/fieldPicker、`forms/field-widget.module.css` 输入面、composer（`chat.module.css` input）——暗轨 background 从卡同色改 `var(--dshm-muted)`（light 轨维持白底+边框，仅 focus 边框强化 `var(--dshm-link)`）。
3. 链接色替换（33 处裸文字点）：todos/docs/alerts/messages/messages(chat)/work 各 module.css 中 `color: var(--dshm-primary)` 的**纯文字**用法 → `var(--dshm-link)`；soft/10 底上的文字 → `var(--dshm-on-soft)`（暗轨已定义 #c9d8f0）；实底按钮/描边钮/图标装饰不动。
4. 主路径触控 44：`chat.module.css` `.stop`、`messages.module.css` `.searchBar`（--height）→ 44；其余 36px 面随 token升 40。
5. 密码显示切换：`login/LoginView.tsx` 密码框加 eye 钮（aria-label="显示密码"/"隐藏密码"，44 命中）。
6. remount 缓解：`shell/MobileShell.tsx` — 四 Tab 页（home/agents/work/me）常驻挂载（各自容器 + `[hidden]`/display 切换），Tab 互切不 remount（保滚动/筛选/输入半稿）；层页与二级页维持现状 remount+transition。配套：各 Tab 数据 hook 加可见性门（不可见挂起轮询——home 的 listSessions/alertCount、work 的 store 订阅保持纯本地，chats 层不在常驻集）。`main` 加 `tabIndex={-1}` + 路由切换 focus 管理（不滚动）。
7. `packages/client/ui-mobile/README.md` 刷新：v6 蓝 #2E7CF6 → v7 #1E4E8C 叙述（:7）、十路由 → 12 路由（:8）、Known Limitations 删「任意六位码可登录」改为「登录走 nocobase.signIn 真实账号」（:30）、新增 deferred 记录（dynamic-type/skip-link/横屏）。README.zh.md 同步。
8. `messages.module.css:699` → `var(--dshm-code-action)`；全库 hex 扫描清零复核（grep `#[0-9a-fA-F]{3,8}` 于 module.css，白名单：tokens.css）。
9. 新增 `demos/acceptance-w8/w8-b1-light-probe.mjs`（仿 `research/2026-10-03-w7-rework/m3/.w7m3-probe.mjs` 结构）：light 主题键 + 门槛 `textVsCard≥4.5 / mutedVsCard≥4.5 / linkVsCard≥4.5 / inputVsCardStep≥8 / tabActiveVsTabbar≥3 / focusRing 存在性 / chips 相邻间距≥8`；输出 JSON 供断言。

**验收门禁**：
- `pnpm run typecheck && pnpm run lint`
- `pnpm exec vitest run packages/client/ui-mobile`（45 spec 中 42 个包内全绿）+ `pnpm exec vitest run scripts/client-bundle-css.spec.ts scripts/client-bundle-purity.spec.ts scripts/client-build-environment.client.spec.ts`
- `pnpm run build:lib:client && cd apps/web && npx vite build`
- `bash demos/acceptance-w7/w7-b6-matrix.sh`（暗轨七门槛零回退；需 :13000/:13110/:3080 活着，当前终端已运行 dev-server 与 dsh web）
- `node demos/acceptance-w8/w8-b1-light-probe.mjs` 全门槛 PASS（新探针）
- 截图证据 `demos/acceptance-w8/w8-b1-*.png`：375px 视口 × {light home、dark chat v3 卡（验输入底）、暗轨聊天链接、Tab 互切回滚位置}（.shoot.mjs 仿 w7 先例）
- 行为断言：Tab home→work→home 滚动位置保持（探针内 evaluate 断言）

**风险与回滚**：Tab 常驻引入常驻轮询泄漏风险 → 以「不可见挂起」门控 + spec 覆盖（hooks.client.spec 增用例）；回滚=单 commit revert（无 schema/协议变更）。链接色批量替换的漏网点由 light probe linkVsCard 门槛兜底。

### B2 — 页面级重构（工作量 L）

**目标**：最大单体拆分 + 信息密度与表单反馈补强，纯展示层/组件层改动。

**改动清单**：

1. **ChatView 1000 行拆分**（`src/client/messages/`）：
   - `chat/FlowItem.tsx` ← ChatView 内 FlowItem + renderKeyOf + isUserOwned（约 300 行，卡片编排）
   - `chat/QuickPanel.tsx` ← QP_ICONS/QP_TOOLS + 面板 JSX；开合补 220ms 过渡（reduced-motion 降级）
   - `chat/Composer.tsx` ← chipRow + inputRow + send/stop + ErrorToast；TextArea aria-label
   - `chat/useApprovalReadback.ts` ← pendingApprovals/approvalStates 轮询 hook（W6-B1 G2 语义不动）
   - `chat/chips.ts` ← contextChipsOf 纯函数（ChatView.tsx re-export 保持 spec 兼容：tests/views.client.spec.ts 等引用）
   - ChatView.tsx 预期降至 ~350 行（编排+发送+草稿状态）。
2. **AlertsView CCP 聚合**（`alerts/AlertsView.tsx` + alerts.module.css）：同 ruleType+title 相邻行聚合组卡（头部计数徽标 + 展开明细行）；预警卡补时间戳列（relativeTimeOf 复用）；组卡展开态本地记忆。
3. **HomeView quick chips 收敛**：QUICK_CHIPS 7→4（去「查看工作」「找 AI 同事」「问经营」与 Tab/目录重叠项——问经营保留与否以「primary 唯一性」复核后定，倾向保留为中性 chip 因指向 business-advisor 会话而非 Tab）。
4. **表单反馈三补**（`forms/v3/DraftCard.tsx` + ChatView 确认链）：必填空值拦截（确认钮 disabled + 空字段就近红字「此项必填」+ 补齐解锁）；拦截时 focus 首个空字段；数值字段 inputMode="decimal"（fieldControls.ts 映射）。
5. **杂项小修**：PageNav 标题 h1 化（视觉不变）；DraftCard tierHead h4→div；RichContent img loading=lazy+max-width；recentRow/rosterCard `:active` 按压反馈；z-index 清点；TaskFormModal 草稿覆盖面复核；ReportCard 数字串千分位兜底。
6. 虚拟化评估结论落 `research/2026-10-04-w8-mobile/b2-notes.md`（实测 200 条会话滚动，不改件则记录）。

**验收门禁**：
- B1 全部门禁复跑（typecheck/lint/45 spec/build/双 probe/w7-b6-matrix）
- ChatView 拆分专项：`pnpm exec vitest run packages/client/ui-mobile -t 'chat|view|card'`；`pnpm run duplication`（防拆分产生克隆）
- 截图 `demos/acceptance-w8/w8-b2-*.png`：alerts 聚合前后对照、chat 面板过渡、必填拦截态、home chips 4 个
- 行为断言（探针）：必填空值点确认写入 → 未发出消息（DOM 无新增 user 气泡）；CCP 3 条同题预警 → 1 组卡可展开

**风险与回滚**：拆分引入回归面最大 → 以现有 spec（views/cards/v3-components）+ 新增拆分边界 spec 兜底；聚合改变 alerts DOM 结构 → data-testid="alert-row" 保留于明细行（w6 验收脚本兼容）；回滚按子项独立 commit 分粒度 revert。

### B3 — 体验纵深（P0 三项；**开工前需用户确认范围**，工作量 L）

**B3-1 聊天新鲜度与渐进显示（#①）**：
- 最小可行方案（推荐）：① `session.history` 请求面加 `afterSeq` 游标（网关 apiproxy 侧扩展——评估 `packages/api`/host-apiproxy 的 history 处理，若 wire 已有类似参数则零网关改动）；② ChatView 轮询改增量 append（fold 增量化：已折叠段缓存，只 fold 新事件）；③ running 窗口 1.2s→800ms；④ 已落日志的 assistant 文本按事件粒度渐进渲染（现状整段替换）。
- SSE 全双工流**不做**（评估记录：需网关 events 通道，收益/成本比低于增量轮询，且 hooks.ts:5 注释「轮询够用」是既定 stance 的渐进演化而非推翻）。
- 验收：running 期间新文本可见延迟 ≤1.5s（探针断言）；idle 轮询请求载荷下降（afterSeq 后 events≤新增数）；45 spec 绿。

**B3-2 workStore 服务端投影（#②）**：
- 沿 W6-B1 台账先例（ledgerService.ts `nocobase.list` + filter + 服务端投影模式）：nocobase 建 `wfl_mobile_work` 投影表（列对齐 WorkItem 面）；移动端写路径经 `nocobase.create/update`，读经 `nocobase.list filter user=当前账号`；localStorage 降级为缓存 + 离线 outbox（复用 outboxStore 模式）；状态机 TRANSITIONS 守卫（workStore.ts:68）语义原样保留、执行点前移。
- 迁移：首启动读服务端 + 本地合并（服务端赢、本地新增上传）；README Known Limitations 改写。
- 验收：换账号/清 localStorage 后工作项从服务端恢复（探针：写→清 storage→reload→行还在）；psql 对账（w6 先例 psql-recon 模式）。

**B3-3 会话生命周期收尾（#③ 残余 + #⑪）**：token 失效（网关 401/身份 shape 拒绝）→ 清身份回登录页（现会静默失败）；评估 wire 未读数可行性（不可行则在 README 记录 #⑪ 为长期项）。

**红线补充**：B3 涉及 wire 面（afterSeq）与 NocoBase schema（投影表）——两处均需先出独立小批验证（网关参数探测脚本 / 表结构 dry-run）再动 ui-mobile 消费端；fold 折叠语义与 v3 协议不动。

### 验收总门禁（每批出口必须全绿）

```
pnpm run typecheck
pnpm run lint
pnpm exec vitest run packages/client/ui-mobile        # 45 client spec 主体
pnpm run build:lib:client
cd apps/web && npx vite build
bash demos/acceptance-w7/w7-b6-matrix.sh              # 暗轨七门槛零回退（需 :13000/:13110/:3080）
node demos/acceptance-w8/w8-b1-light-probe.mjs        # light 轨新探针（B1 起常设）
# 截图：demos/acceptance-w8/ w8-b<N>-*.png，375px 视口，命名沿 w7 惯例
```

依赖环境：NocoBase :13000（终端 1 dev-server 已在跑）、引擎 :13110、网关 :3080（终端 3 dsh web 已在跑）——探针/截图前先 `curl -sf http://127.0.0.1:3080/mobile.html >/dev/null` 探活。

## 5. 工作量与依赖

| 批次 | 规模 | 依赖 | 可并行 |
|---|---|---|---|
| B1 | M（令牌/壳/文档/探针，~9 文件 + 新探针） | 无 | — |
| B2 | L（ChatView 拆 5 文件 + 4 页面改造 + 表单三补） | B1 的 link/touch token（避免二次返工） | B2-1 拆分与 B2-2/3 可两任务并行 |
| B3 | L（三项各 M；范围需用户确认后才开工） | B2 后基线稳定；B3-1 需先探测网关 history 参数面 | 三项相互独立可并行 |

建议执行序：B1 → B2 →（用户确认）→ B3。
