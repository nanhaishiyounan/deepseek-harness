# Agent Note: W8-B1 — 移动端可达性基座（焦点/链接/触控/输入 token 与 Tab 常驻）

Status: implemented

[English](2026-10-04-w8-b1-mobile-a11y-foundation.md) | 中文

W8 审计 B1 批次（blueprint §4-B1）：移动端 token 体系补上 WCAG 技能扫描发现的四件可达性增量（键盘焦点、双轨存活的链接档、40px 次级触控、16px 输入地板），暗轨输入井与卡面拉开，四个 Tab 页以 `[hidden]` 常驻使互切保留滚动/筛选/半稿，light 轨探针与 W7 暗轨矩阵并列成为常设验收门。仅 token 与壳层——不搬任何页面业务逻辑。

## 问题

审计的 WCAG 通过项钉住了 v6/v7 token 基座无法表达的四个缺口：全库零 `:focus-visible` 规则（键盘与读屏用户得不到任何焦点指示）；暗轨品牌蓝 `#2a5fa6` 对卡仅 2.38:1 却仍承载 33 处纯文字可点用法（聊天正文链接、todos/docs/alerts 链接与 retry、二级审批 chip）；暗轨表单输入以卡值本身填充（零对比井，仅靠 1px 边框立边）；13px 输入控件触发 iOS Safari 聚焦自动缩放。另一面，每次 Tab 互切都 remount `<main>`——滚动位置、CapsuleTabs 筛选、半打的输入草稿在走访邻页再回来时全部损毁（审计 #⑧），任何退场动画都救不了。

## 决策

- **token 四件增量**：`--dshm-focus-ring`（light `rgba(30,78,140,.35)` / dark `rgba(83,131,199,.5)`）、`--dshm-link`（light `#1e4e8c`——品牌值在白底本已达标；dark `#7b9dd1` 对卡 ≥4.5:1）、`--dshm-touch-sm` 升至 40px、`--dshm-fs-input: 16px`。`tokens.css` 全局规则：`.dshm-root :focus-visible` 以 box-shadow 画光环（贴合每控件自身圆角；pointer 交互永不触发；自带 focus 边框的输入把边框留在光环之下）；`.dshm-root { touch-action: manipulation }` 去除 300ms 双击缩放延迟；一切 `input`/`textarea` 持有 `font-size: max(var(--dshm-fs-input), 1em)`——简写后的 longhand 覆盖继承的显示档，组件拨更大字号时保住该字号，而任何打字面不落到 iOS 缩放地板之下。
- **暗轨输入井分化**：`--dshm-input-bg` 阶进 `#141b26`（muted 阶；原值即卡本身）。v3 fieldInput/fieldPicker、field-widget 面、composer 输入、login、search 统一走 token；light 轨维持白底 + 边框，仅补 `--dshm-link` focus 边框。
- **链接档纪律**：七个 module 文件中的纯文字可点项统一 `var(--dshm-link)`；soft/10 底上的文字走 `var(--dshm-on-soft)`；实底钮、描边钮、图标装饰保持 `--dshm-primary`——底材决定档位。唯一硬编码 hex（代码板复制字）成为 `--dshm-code-action`（双轨同值；代码板恒深），module CSS 裸 hex 清零（tokens.css 白名单）。
- **触控梯**：次级目标随 token 上 40px（chips、收藏星、关闭钮）；已在 `--dshm-touch` 44 的主路径补上 composer 停止钮与搜索条（均定 44）。密码框补 eye 切换（44 命中，`aria-label` 显示密码/隐藏密码）；composer TextArea 挂 `aria-label="消息输入"`——仅 placeholder 是审计的弱可访问名发现。
- **Tab 常驻**：四个 Tab 页（home/agents/work/me）首访懒挂载后保持挂载；`[hidden]` 切换可见页，滚动位置、列表筛选、半打的输入状态在互切中存活；层页与二级页维持逐路由 remount + slide 过渡（fade 留在 Tab 之间）。`main` 持 `tabIndex={-1}`，路由切换以 `preventScroll` 接管焦点。每个常驻页接 `active` 门——隐藏页挂起数据读取、复见复读，keep-alive 不至沦为四路并行轮询；W8-B3 又把 `document.visibilityState` 接进同一道门（`tabAwake`）。
- **`useAsync`/`usePoll` active 门**：`useAsync` 增 `active` 参（默认 `true`——既有调用面不变）。`false` 挂起请求并保留上一读数；false→true 原地复读（ready 态上的复读让旧值留在屏上，不再闪骨架）。`usePoll` 本就有同门；壳层传入选中 × 可见的合取。
- **light 探针**：`demos/acceptance-w8/w8-b1-light-probe.mjs`——W7 暗轨探针的 light 孪生（同一 computed-style 事实链）加只以 DOM 存在的事实：十一门槛——theme-light、textVsCard ≥4.5、mutedVsCard ≥4.5、linkVsCard ≥4.5、inputVsCard 阶差 ≥8、tabActiveVsTabbar ≥3、focus-ring 已声明、chips 相邻间距 ≥8px、touchSm ≥40、searchBar ≥44、inputFloor ≥16。原始 JSON 落脚本旁；任一门槛失败以非零码退出。
- **README v6→v7**：移动端 README 对携带 v7 普鲁士蓝 `#1E4E8C` 叙述、12 路由 IA、keep-alive 描述、真实登录的 Known Limitations（六位任意码时代文字退役）与 deferred 裁决（dynamic type、skip-link、横屏）。两语言同进。

## 证据

- `demos/acceptance-w8/w8-b1-light-probe.json`——11/11 门槛；B2、B3 两批次后复跑均通过，`w7-b6` 暗轨矩阵零回退。
- `hooks.client.spec.tsx` 增 `suspends while gated off and re-reads in place when a keep-alive page becomes visible`（关门保留值；每次 false→true 复读）。
- `demos/acceptance-w8/w8-b1-01..08-*.png`（375×812，qc_inspector 真实登录）：登录 eye 切换、light home/work、Tab 往返后的 home 复位（滚动保留）、四张暗面（home/agents/chats/chat——暗轨 chat 张携带 v3 输入井与正文内链接）。
- `src/client/**/*.module.css` 裸 hex 扫描零命中（tokens.css 白名单除外）。

## 已知残留

- skip-to-content 维持 deferred（审计裁决）：430px 壳 + 底部 Tab 形态键盘路径短；焦点环 + Tab 顺序覆盖大半。px 字阶不随系统 Dynamic Type（430px 壳决策——键盘可读性走焦点环），横屏不调（竖屏手机壳是产品形态）。README Known Limitations 三项全记。
- 探针仅在 home 面量 chips 间距；其他 chip 行（同事 roster、工作台工具格）走同一间距 token，但未单设门槛。

## 备选方案

- **全量 44px vs 40/44 梯**——WCAG 2.5.8 AA 底线 24px，Apple 44pt 约束主路径；40px 同时过两条基线且 chip/星/关闭行保住密度，真正的主路径（发送、返回、新建会话、停止、搜索）全在 44。
- **`outline` vs box-shadow 光环**——outline 画无视控件圆角的矩形；box-shadow 贴合。`:focus-visible`（非 `:focus`）使 pointer 点击永不点亮光环。
- **Tab 切换退场动画 vs keep-alive**——审计 #⑧ 要的是状态存活，不是动画；常驻 Tab 没有 unmount 可动画，层页保持单向入场 stance。
- **硬 16px 输入 vs `max(16px, 1em)`**——缩放守卫只需下限；硬 16px 会拖低显示档更大的面。
- **新输入井 token vs 把 `--dshm-input-bg` 阶进 muted 阶**——`#141b26` 一阶在色阶中已存在；token 保持独立，未来输入专属填充不会拖动 muted 阶。
- **专用链接组件 vs CSS 档位切分**——档位是底材（纯文字 vs soft 底 vs 实底钮）的属性，不是组件的属性；module CSS 直接表达，无新导入面。

## 后果

- 新 module CSS 不携带裸 hex；颜色决策落 `tokens.css`，面读 token（零命中扫描即评审可复跑的基线）。
- 纯文字可点项读 `--dshm-link`，soft 底文字读 `--dshm-on-soft`，实底/描边钮保持 `--dshm-primary`——底材决定档位，探针 linkVsCard/inputVsCard 门槛兜住忘改的面。
- 常驻 Tab 页新增数据读取必须接 `active`/`tabAwake` 门；不接则四 Tab 并行轮询（keep-alive 撤销了旧 remount 模型免费送出的单可见页假设）。
- `useAsync`/`usePoll` 的门是合取的：调用点传一个 `active` 值；选中与可见在壳层合取，不在 N 个调用点各自组合。
- light 探针与 w7-b6 暗轨矩阵是移动端的两道常设 computed-style 验收门；任何 token 或壳层改动后两道都复跑。
