# Agent Note: 移动端 v5 审计收口——PageNav 唯一返回权威、骨架加载态、触达 token、顶部安全区

Status: implemented

[English](2026-09-23-mobile-v5-audit-closure.md) | 中文

## Problem

v5 审计浮出一个用户可见缺陷与一族一致性缺口。会话页的 NavBar 没传 `back`/`backIcon`/`onBack`，却在 `left` slot 手绘返回箭头——antd-mobile 在 `back !== null` 时恒渲染默认返回区域，于是头部出现**两个**左箭头，其中一个是死图标。四周环绕的问题：各二级页各自背负 52px NavBar 样板；首载状态混用三种词汇（白屏、用空态 ErrorBlock 表达加载、纯文本错误）；触达目标散布 28–40px，还有一条"44px"注释压在 40px 规则上；宿主页声明 `viewport-fit=cover` 却只有底部安全 inset；两处界面把按钮嵌套在按钮里。

## Decision

**PageNav 拥有返回交互。** `PageNav`（title、onBack、right?）包装 antd-mobile NavBar，是每个二级页与全屏层唯一的头部——chat、work 详情（两个面）、agents、tasks、files。它显式传 `back=""`、`backIcon`、`onBack`，永不使用 `left` slot：antd 默认返回区域的渲染是显式契约，不是可依赖的巧合。返回图标本身是一个真 `<button aria-label="返回">`，承载 44px 主触达目标；点击冒泡到 antd 的 `.adm-nav-bar-back` 点击层，带标签按钮与 antd 命中区都可用。antd-mobile 在其左容器上硬编码无可用名的 `role='button'` 且不提供覆盖 prop；带标签的内层按钮承载语义，无名容器是已知的冗余。

**加载是骨架或转圈，绝不是空态卡。** 共享原子 `SkelRow`/`SkelCard` 在全局 `dshm-skel-pulse` 关键帧上呼吸（tokens.css；CSS Modules 保留外来动画名），以 aria-hidden 渲染在带 `role="status"` 的页面组内。Home 在读取进行中显示同事卡与最近对话剪影（空文案等待 ready 读数）；agents 目录显示骨架卡，空名册与名册失败都用 NoticeCard（废弃纯文本 `p.empty`），会话创建进行中显示 DotLoading 创建中标记；对话列表首载显示五行骨架而非标题为加载中的 ErrorBlock；会话流首读是居中 SpinLoading 行。空态与错误态保持既有 NoticeCard/ErrorBlock 词汇，有动作处带 CTA。

**触达目标是两个 token。** `--dshm-touch: 44px` 用于主操作（返回命中区、发送、两个新建会话加号），`--dshm-touch-sm: 36px` 用于次要操作（快捷 chip、shortcut、任务/文件入口、卡片动作、搜索框、sheet 关闭钮、收藏星标命中区）。所有硬编码 28–40px 的界面都引用 token；"44px 注释压 40px 规则"的返回按钮随手绘 JSX 一起消亡。对话与工作两个 tab 头对齐 PageNav 的 52px 高——NavBar 尺寸读 antd-mobile 自身的 `--height` 变量，由 `.pageNav` CSS Modules 作用域原地覆盖——全部页头共用一个尺度。

**根节点清理顶部安全区。** `.dshm-root` 携带 `padding-top: env(safe-area-inset-top)`；每个页面（tab 头、二级 NavBar、登录门）通过唯一根节点继承刘海避让，各界面继续自持底部 inset。box-sizing border-box 的根节点保持 100% 高度，下方布局下移而非钻入。

**控件内不再嵌套控件。** 新建会话 sheet 的表单 chip 渲染为纯 span——它们的启动动作就是名册行自身的动作，行按钮保留唯一交互角色。文件行的星标移出打开按钮：行头是容纳打开按钮与兄弟星标命中区（36px，键盘可操作如前）的 div。

## Consequences

- 移动端 golden 快照（`apps/web/tests/snapshots/mobile-assistant/chat.expected.md`）记录唯一的 `button "返回"`；随修复刷新。
- jsdom 中 `getByRole('button', { name: '返回' })` 解析到 PageNav 的带标签按钮——修复前测试通过只因 antd 左容器没有可用名，并非死箭头对真实用户不可见。
- 加载优先绘制意味着 home 的空文案断言需要 `waitFor`；钉住同步空绘制的测试随行为变更更新。
- 会话头标题/副题失去 200px 钳制，以 `min-width: 0` 弹性收缩——长标题对 NavBar 自身的标题盒省略，而非虚构的像素预算。
- 方向感知的页面过渡被考虑并否决：hash 路由不拥有历史栈就无法区分链接驱动的前进与 `history.back()`，而猜错方向的滑动比一致的单侧入场更糟；决策记录在 transitions.css，不是 TODO。
- KG 证据入口的放大镜 emoji 换成 lucide Search 图标（图标不用 emoji 规则）；sheet 关闭统一为 18px 的 lucide X。

## Alternatives considered

- **传 `back={null}` 保住 `left` 手绘按钮来修双返回。** 否决：它保留了审计要退役的手绘箭头，还留下五个页面五份 NavBar 样板；PageNav 把样板与修复收进同一个所有者。
- **用包装器或分叉 NavBar 覆盖 antd 左容器角色。** 否决：没有 prop 触达它，分叉的存续价值为负，无名角色在带标签按钮后面无害。
- **骨架只做每页 CSS。** 否决：行与卡剪影在四个界面重复；共享原子保住同一种脉动与同一个 aria 契约。
- **带历史栈所有权的方向感知过渡。** 按上述风险/收益否决；在 transitions.css 记为明确立场。
- **把星标所在外层行当唯一按钮，把收藏动作挪进长按。** 否决：隐藏手势替代可见交互；兄弟命中区保住两个动作的可发现性与合法 HTML。

## Testing

包测试经既有 `getByRole('button', { name: '返回' })` 断言（shell 层测试、会话流测试）覆盖唯一返回交互，经 `.adm-nav-bar-back` 选择器（agents、files）覆盖 antd 返回区点击；home 空文案测试为加载优先绘制改为 `waitFor` 后断言；golden `pnpm run test:web -- mobile-assistant` 钉住刷新后的 a11y 树。
