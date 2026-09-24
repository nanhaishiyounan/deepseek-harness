# Agent Note：移动端 v6 B1——「AI 同事」令牌双轨换血、430px 手机壳与四 Tab 重排

Status: implemented

[English](2026-09-23-mobile-v6-b1-tokens-shell.md) | 中文

## Problem

v5 的墨青冷链色系（`--dshm-primary:#0b5d56` 一族）与新设计稿「AI 同事 · 你的工作搭子」（/Users/mac/Downloads/index (5).html，plans/2026-09-23-mobile-v6-uidesign）的蓝色系全面冲突；设计稿同时带来四项壳层结构变更：TabBar 四项改为 消息/同事/工作台/我的（`chats` 让出 tab 位）、430px 手机壳（桌面居中 + 圆角 + 外阴影 + 衬底色）、页面转场统一 pageIn `.22s ease`（14px 推入）、PC 预览壳视口 390→430。B1 批只做令牌与壳层，不动各视图内部版式（B2/B3 负责），结束时页面换新色但仍 v5 版式是预期中间态。

## Decision

**令牌双轨整轨替换，令牌名不变、值换血。** [tokens.css](../../../../packages/client/ui-mobile/src/client/tokens.css) 亮轨按设计稿 `:root` 逐值落（bg `#F2F5F9`/card `#FFFFFF`/card2 `#F7F9FD`/line `#E8EDF4`/text `#18202F`/sub `#758199`/brand `#2E7CF6`/brand-soft `#EAF2FF`/ok `#18A058`/warn `#F59E0B`/danger `#E5484D`/radius16/shadow `0 6px 24px rgba(23,43,77,.07)`），暗轨按 `[data-theme=dark]`（bg `#0E131B`/card `#1A212D`/card2 `#151B26`/line `#252E3E`/soft `#1B2C4A`/tabbar与header `#131924`）。新增六个令牌：`--dshm-brand2`(#22B8E8)、`--dshm-user-grad`(135° 品牌渐变，气泡/发送/hero 用，B3 消费)、`--dshm-header-bg`/`--dshm-tabbar-bg`/`--dshm-input-bg`（设计稿三面底色，tabbar 由壳立即消费，header/input 供 B2/B3）、`--dshm-shell-shadow`（桌面壳外晕，双轨两值）。语义色暗轨实测裁决：danger 抬至 `#ef5f64`（原值 on card 4.1:1），success `#18A058` 与 warn `#F59E0B` on card 分别 4.8:1/7.5:1 无需抬升（注释记录实测值）。`--dshm-on-soft` 亮轨取 `#1d5fd6`（brand on soft 实测 3.5:1 不够字用）。14 个 module.css 的 var 引用零改动自动跟轨；`--adm-*` var 挂接块原样保留。

**430px 手机壳落在 tokens.css，一处覆盖登录门与壳。** 计划给了 App.tsx/shell.module.css 二选一，但两者都只覆盖登录后（或登录前）的一侧；tokens.css 本就持有 `.dshm-root` 基座属性，是唯一同时覆盖 LoginView 与 MobileShell 的单点。根容器 `max-width:430px; margin:0 auto; height:100%`（App.tsx 的内联高度随之退役），`@media ≥720px` 加 `margin:14px auto; height:calc(100% - 28px); border-radius:24px; overflow:hidden`；body 衬底亮 `#E9EDF4`/暗 `#0A0E15`，由 App.tsx 的 effect 把主题镜像到 `document.body.dataset.theme`（移动端独占文档，与 PC 页不共 body）。窄视口（e2e 的 390×844）max-width 不生效，全宽流式——计划的两视口策略成立。

**转场对齐 pageIn。** [transitions.css](../../../../packages/client/ui-mobile/src/client/shell/transitions.css) 的 fade（Tab 间，仅透明度）与 slide（层推入，`translateX(24px)`→`14px`）统一到设计稿 pageIn 的 `.22s ease`；`--dshm-motion-fast`/`--dshm-motion-page` 同值 220ms，`prefers-reduced-motion` 降级保留。`--dshm-ease-slide`/`--dshm-ease-stamp` 按计划保留为 motion 词表（B3 的 progress 曲线另用设计稿 cubic-bezier(.22,.9,.35,1)）。

**TabBar 重排与 chats 降层。** [MobileShell.tsx](../../../../packages/client/ui-mobile/src/client/shell/MobileShell.tsx) `TAB_ROUTES` 改 `['home','agents','work','me']`，四项 消息(MessageSquare)/同事(Users)/工作台(LayoutGrid)/我的(User)，lucide `size={20} strokeWidth={1.8}`（图标按计划走 22px CSS 视觉档：`.adm-tab-bar-item-icon svg { width/height:22px }`）；标签 10.5px/600、active 走 `--adm-color-primary`。`chats` 离开白名单自动变全屏层：[MessagesView.tsx](../../../../packages/client/ui-mobile/src/client/messages/MessagesView.tsx) 自绘 header 换 PageNav（title 传 h1 保 heading 语义，plus 钮进 right 槽），`goBackOr('#/')` 返回 home；`LEGACY_HEADS`（messages→chats）与 `#/chats` 直链仍落活页。

**antd-mobile TabBar 的真实类名是 `.adm-tab-bar-wrap`。** v5 遗留的 `.tabbar :global(.adm-tab-bar) { --height: ... }` 从未生效——5.43 的 TabBar 渲染 `.adm-tab-bar-wrap`（`min-height:48px`），不存在 `.adm-tab-bar` 类与 `--height` 变量；tabbar 高度实为 48px 挂了五代。B1 修正为 wrap 的 `min-height: var(--dshm-tabbar-height)`（58px，CDP 探针双轨实测 58px），删除死变量块。颜色本就走容器级 `--adm-*`，不受影响。

**预览壳 430 跟随。** [MobilePreviewView.tsx](../../../../packages/client/ui-mobile-preview/src/client/MobilePreviewView.tsx) `DEVICE_WIDTH` 390→430（高度 844 不变，ResizeObserver 缩放自适应不变），bezel 圆角 36→24 对齐设计稿桌面形态；iframe 内 `/mobile` 自动获得 430 壳，零逻辑改动。

## Alternatives considered

- **壳形放 App.tsx 或 shell.module.css（计划二选一）vs tokens.css**：两者各漏一半（登录门/登录后）；tokens.css 的 `.dshm-root` 基座是唯一单点，且 revert 单文件即回滚。
- **body 衬底不镜像主题 vs 镜像**：不镜像则暗轨桌面壳外是白衬底；设计稿显式给双轨衬底（#E9EDF4/#0A0E15），镜像只花 App.tsx 一个 effect + tokens.css 两条规则。
- **暗轨语义色全抬升 vs 实测裁决**：计划允许「适度抬升」；实测 success/warn 已 ≥4.5:1，全抬会偏离设计稿色值，只抬不达标的 danger。
- **chats 层保留旧自绘 header vs 换 PageNav**：计划细则点名「PageNav 复用」；h1 作 title 节点保住 e2e 的 heading 断言，plus 迁 right 槽零功能损失。
- **e2e golden 重录 vs 不动**：三个移动端 golden 全是 aria 快照，不含样式与尺寸；实测全部仍绿，不重录（计划「只重录受影响项」的受影响集为空）。

## Consequences

- `pnpm vitest run packages/client/ui-mobile` 568/568 绿；typecheck/oxlint/build 全绿；mobile-shell/mobile-assistant/mobile-preview-iframe e2e 6+5+2 全绿，golden 零重录。
- 截图与探针证据落 research/2026-09-23-mobile-v6-uidesign/：b1-01..08（四 Tab 亮暗）、b1-09（chats 全屏层：返回头在、tabbar 无）、b1-10（桌面壳）；CDP 计算样式探针双轨记录 labels/58px/active `rgb(46,124,246)`/10.5px w600/22px stroke1.8/navBg `#fff`|`#131924`，桌面壳 430px/24px 圆角/居中。
- `grep -rn "0b5d56\|e3eeec" packages/client/ui-mobile/{src,lib}` 零命中（colleagues 视觉表两处旧青色同步换血：表单→品牌蓝、参谋→蓝灰 #4f6076；三处测试色值跟随）。
- 中间态已知项：agents 升 tab 后仍带 PageNav 返回头、各视图版式仍 v5（B2/B3 范围）；MessagesView 行内视觉（红点/时间贴边）同样待 B2。
- dev server（`dsh web`）静态托管 `dist/`：改 CSS module 后必须 `pnpm run build` 才在 :3080 可见——探针曾因此读到旧 48px。
- v5 遗留修复顺带落地：无效 `.adm-tab-bar` 选择器清除；tabbar 背景从 `--dshm-background` 改为专用 `--dshm-tabbar-bg`（设计稿 tabbar 与 bg 本就异值）。
