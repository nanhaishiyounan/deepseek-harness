# Agent Note: 移动端 v6 审计修复——portal 令牌孪生挂载、button reset 收域、弹层入壳

Status: implemented

[English](2026-09-24-mobile-v6-audit-portal-tokens.md) | 中文

## 问题

v6 全量 UI 审计（[findings](../../../../research/2026-09-24-mobile-v6-audit/FINDINGS.md)）把多数视觉缺陷归因到两个系统性根因：

1. **antd-mobile 弹层逃出 `.dshm-root` 令牌域。** Popup/Picker/DatePicker/Dialog/Modal/Toast 渲染进 `document.body`，取不到 `.dshm-root` 上的全部 `--dshm-*` 与 `--adm-*` 映射。body 级弹层退回 antd-mobile 的 `:root` 默认（主色 `#1677ff`、白面板）：弹层背景因无效变量变透明、暗轨弹层全亮、Picker/Dialog 强调色泄漏 antd 蓝，≥720px 桌面上 fixed 弹层横跨 1280px 视口、压过 430px 手机壳。
2. **`.dshm-root button` reset 级联压制一切按钮类。** (0,1,1) 压过所有 CSS Modules 与 `.adm-button` 的 (0,1,0)，登录 CTA、首页快捷入口、工作/报告卡动作、弹层按钮全部被拍成无底透明文字。

审计同时记录了 P2 打磨项：Toast 皮肤偏离设计稿、Picker 面板圆角（映射用的 `--adm-border-radius-*` 在 antd-mobile 5 里不存在——真名是 `--adm-radius-s/m/l`）、遮罩 0.55 vs 设计 0.5、工作台默认落在 8 卡工具宫格折叠线下的空「待处理」tab、快捷面板遮挡末行聊天。

## 决策

**令牌声明在双挂载点：`.dshm-root` 与 `html[data-theme]` 孪生**（[tokens.css](../../../../packages/client/ui-mobile/src/client/tokens.css)）。`App` 在原 body 镜像之外同步镜像到 `document.documentElement`。孪生选择器 `html[data-theme='light'|'dark']` 特异性 (0,1,1)，无论样式表顺序都压过 antd-mobile 的 `:root` 默认 (0,1,0)；任何弹层——挂 body 还是挂壳内——继承同一轨道。一个声明块同时服务两个选择器，令牌清单保持单一来源。

**弹层经 portal host 挂进壳内**（[portal.ts](../../../../packages/client/ui-mobile/src/client/portal.ts)）。`MobileShell` 在 `.dshm-root` 内渲染一个 `display: contents` 的 div；全部 antd-mobile 弹层调用点（TaskFormModal 的 Popup/Picker/DatePicker、NewChatSheet、KgEvidence、工作详情 Modal、task-cards Dialog、我的页静态 Dialog.confirm/alert、FieldWidget、RelationSelect）传 `portalContainer` 作 `getContainer`，壳挂载前回退 `document.body`。桌面端 ≥720px 媒体查询给壳加 `transform: translateZ(0)`，令根成为 fixed 层的 containing block，弹层与遮罩都留在 430px 壳内；<720px 无 transform 全宽壳不变。`display: contents` 使 host 无盒无指针事件；它**不能带 `aria-hidden`**——那会把弹窗按钮藏出可访问树、打断 `getByRole` 查询。

**button reset 只匹配无 class 的原生按钮**（`button:not([class])`）。所有样式按钮——CSS Modules 类与 antd 的 `.adm-button`——重新拥有自己的背景、内边距、边框。这也是弹层入壳的另一半前提：弹层按钮如今位于 `.dshm-root` 内，旧的 (0,1,1) reset 会把它们拍平。

**P2 打磨随同一批落地：** `--adm-*` 映射改用真实的 `--adm-radius-s/m/l` 档位并新增 `--adm-center-popup-border-radius`（16px 面板）；Toast 换设计稿胶囊皮肤（bottom:110px、999px 圆角、`rgba(24,32,47,.92)`，暗轨反色瓷白；antd 位置 prop 的内联 `top` 用 `!important` 压制）；遮罩背景强制 `rgba(0,0,0,0.5)`（antd 的 0.55 走内联 `background`，而淡入动画的是另一个内联 `opacity`——只压颜色不动画）；工作台台账（状态 chips+列表）移到工具宫格上方、整页滚动（首页既有模式）；聊天消息流在快捷面板展开时加 216px 底部让位。

Toast 保持默认 body 挂载：令牌在 html 孪生上后颜色正确，胶囊皮肤是全局 CSS，20+ 调用点逐一配 `getContainer` 无可见收益（居中胶囊本就落在桌面居中壳内）。

## 影响与后果

每个 antd-mobile 弹层调用点现在都带 `getContainer={portalContainer}`——以后新增的弹层组件若漏配则回退 `document.body`：html 令牌孪生仍能正确配色配圆角，但桌面限位不再覆盖；壳内 portal host 是唯一需要接线的挂载点。html 元素在 body 镜像之外新增 `data-theme`，只按 `body[data-theme]` 键控的宿主样式照常工作，弹层主题则挂在 html 孪生上。CSS Modules 按钮处处呈现自己的外观；只有真正无 class 的 `<button>` 吃原生 reset——未来的无样式按钮要么挂 class、要么自己补背景与内边距。

## 备选与否决

**纯 CSS 桌面限位（用 `left/right/margin/max-width` 约束 body 级 `.adm-popup`/`.adm-mask`）。** 否决：antd 底部弹层是 `left:0; width:100%` 的 fixed 层、以 `transform: translateY(100%)` 做入场动画——居中要么叠 transform（打架动画）、要么对 `inset:0` 遮罩失效的过约束技巧。host 方案对现在与将来的每个弹层类统一限位，无几何覆盖。

**整块令牌只挂 `:root`。** 否决：与 antd-mobile 默认同特异性，胜负取决于 bundle CSS 顺序——脆弱的不变量。`html[data-theme]` 孪生凭特异性取胜。

**保留 reset、逐文件抬高模块按钮特异性。** 否决：N 个文件的打地鼠，下一个新按钮又复发；`:not([class])` 一处写明真实契约（仅未样式化的按钮吃原生 reset）。

**工作台默认选非空状态 tab。** 否决：把演示数据假设编码进状态；重排保住「待处理」语义且首屏可达每个状态列表。

## 证据

对活服务复拍（PID 51859，`dsh web` @ :3080）：`research/2026-09-24-mobile-v6-audit/fix-*.png`——双轨 TaskForm/Picker/DatePicker/Dialog/Toast/NewChat、桌面壳限位、登录 CTA 实底、报告/工作动作主次。CDP 复测：弹层背景 `#ffffff`/`#1a212d`、16px 面板圆角、按钮实底、portal 计算样式零 `#1677ff`。

## R2 清尾（同日）：逐类按钮面色、Picker 圆角、askChip 选中形态、图片查看器 portal

A2 复验（FAIL 79）把一处回归与一处漏项都归到收域后的 reset：从未声明过自身 `color`/`background` 的模块按钮回落 UA 默认面（黑字、`rgb(239,239,239)` 灰底）。class 收域保留不变，改为补齐模块面色——每个按钮类自带声明（十一个模块样式表约二十处：会话/同事/台账/工具/工作空间卡、工作卡头、最近对话与任务行、查看全部与重试链接、返回热区、+ 入口、快捷面板工具、弹层关闭、picker 行、复制按钮、ask 卡/胶囊、同事页 roster、文件行、新建会话行、派生行）。askChip 面色取 `--dshm-on-soft`（brand 在暗轨卡面上只有 4.1:1，沿 v3.module.css ghost-button 先例），选中态取设计稿 chip:active 材质——brand-soft 底 + brand 实描边，hint 保持 on-soft——胶囊级色阶变化，选中 askCard 仍保留墨面。

Picker/DatePicker 面板圆角在 tokens.css 加同特异性显式覆盖（antd-mobile 硬编码 `.adm-picker-popup .adm-popup-body` 8px，任何 `--adm-*` 变量都够不到），双轨实测 16px。`ImageViewer.Multi` 经 `getContainer={portalContainer}` 挂载——查看器 props 原生支持 `getContainer`，无需 RenderOnReady 等效方案；挂载契约由 `tests/rich-content.client.spec.tsx` 断言（演示回放数据不含 markdown 图片，桌面几何旁证用同一 portal host 的 TaskForm 限位：遮罩 ⊆ 430px 壳）。证据：`research/2026-09-24-mobile-v6-audit/r2-*.png` + `.r2-*.json`——双轨全部带类按钮 computed 零 UA 黑/灰、零 `#1677ff`，同一 PID 51859 服务上复测 TaskForm/Toast/面板圆角。
