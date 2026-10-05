# Agent Note: W11-B1 — Composer 胶囊的 46px 契约移入 wrapper 盒

Status: implemented

[English](2026-10-05-w11-b1-composer-capsule-contract.md) | 中文

## 问题

chat 输入槽实测渲染为零 padding、24px 引擎默认行盒、单行文字贴顶（上余量 1px / 下余量 25px）——即用户可见的「文字 padding 有问题」。输入槽同时完全零 focus 反馈：移动端 tap 走 `:focus` 不触发 `:focus-visible`，全局 `.dshm-root :focus-visible` 焦点环从不点亮。

3080 网关活体量测把根因从「疑似值错」改判：`chat.module.css` 的 `.input` 确实声明了 `--padding: 10px 18px`、`--adm-text-area-min-height/-max-height`、`--line-height`、`--background`、`--box-sizing`——但 antd-mobile 5.43 的 `.adm-text-area` 只消费 `--font-size`、`--color`、`--placeholder-color`、`--text-align`。其余 dial 全是死声明：元素保持自己的 `padding: 0; line-height: 1.5; min-height: 1.5em; background: transparent`。另有两个叠加因素：antd 默认 `rows: 2` 把 autoSize 测量器的 `hidden.scrollHeight` 托底到两行（单行高 48px、胶囊 50px，脱离 46px 契约）；测量器把高度 clamp 在 `[minRows, maxRows] × 计算行高` 且 padding 在 clamp 之外——padding 若放在元素上会把第四行裁掉。

## 决策

胶囊的盒算术归 wrapper，行度量归元素：

- `.input`（`.adm-text-area` wrapper）持有 `padding: 10.5px 18px`、`background: var(--dshm-card)`、1.5px 焙线、胶囊圆角。单行 = 1.5 + 10.5 + 22 + 10.5 + 1.5 = 46px；每多一行一个 22px 步进（68 / 90 / 112px），之后滚动。
- `.input :global(.adm-text-area-element)` 只持 `line-height: 22px; min-height: 22px`——恰是 autoSize 测量器读的输入，clamp 落在整行上；TextArea 新增 `rows={1}` 消掉两行托底。
- focus 态为 `.input:focus-within` 持 fill-flash 0% 帧值对（`border-color: var(--dshm-brand)` + `0 0 0 3px var(--dshm-brand-soft)`）——同一设计语言，聚焦期间常驻；双轨 token 自动跟随。
- `input-fill` keyframes 只钉 0% 帧（补上 `brand-soft` 底 wash）。所有属性插值回级联值，聚焦时的闪烁在常驻品牌边上方淡出 wash 而不打架；reduced-motion 分支（本就关闭动画）无需改。

随批落地的两条审计同源修复：chats `filterTabs` idle 分段补 1px 焙线（暗轨 idle 底对画布仅 ~6 RGB 差，VLM 审计读作死区）；`PageNav` 的 `.pageTitle` 补单行省略三件套（work-detail 的供应商+批次+ISO 长串原本裸截断无省略号）。

## 影响

- 胶囊 padding/行度量回归现在会挂 `composer-skin.client.spec.ts`——它钉级联源（wrapper 算术、元素度量、focus 值对、仅 0% 帧 keyframes、reduced-motion 块）并拒绝死 dial 复活；`views.client.spec.tsx` 钉 `rows=1`。
- 未来 antd-mobile 升级必须复查 text-area 的 dial 消费面——死集合已记在 `.input` 注释块，探针（`demos/acceptance-w11/.probe-w11b1.mjs`）一次跑读取活体几何。
- 46px / 999px / 1.5px 值未动：W10 台账裁决它们是规格本身。
- 探针的 DOM 序陷阱：任何二级页上 `document.querySelector('h1')` 会返回 home 常驻（display:none）的 heroTitle——可达性锚点必须指向页面自己的标题类。

## 备选方案

- padding 放元素而非 wrapper——autoSize 测量器把高度 clamp 在整行、padding 在 clamp 之外，第四行会被裁（活体实测，非推测）。
- 保留 `rows: 2` 再补 min-height——测量器把 `hidden.scrollHeight` 托底到两行，胶囊钉死 50px 违背 46px 契约；`rows={1}` 直接拆托底。
- 骑全局 `:focus-visible` 焦点环——移动端 tap 只派发 `:focus`，触屏上环从不点亮；wrapper 的 `:focus-within` 才是真正会亮的脸。
- chats 工作 Tab 末胶囊加 `padding-right` 拉出渐隐区——该行真溢出 16.3px（可滚场景），padding 无效且渐隐是 W10 可发现性规格；已回滚，F2 复拍留痕。
