# W24 全页视觉走查清单（audit2）

- 日期：2026-10-09
- 网关：http://127.0.0.1:3080/mobile（W24 修复构建重启后）
- 账号：buyer/Buyer#2026（375px，light + dark）
- 方法：11 路由 × light/dark 全页截图 + DOM probe（`w24-pages-probe.json`：headings/cards/空态文本/横向溢出/行高分布）；VLM 初筛 5 张关键页（home/chats/tasks-dark/alerts/docs），**VLM 候选一律 DOM 几何复核为仲裁**（本轮 VLM 噪声率高，见驳回区）
- 统计：**P1 ×1（已修）、P2 ×1（已修）、驳回 ×4（DOM 核别不成立）、超范围如实记录 ×4**
- 证据：`w24-pg-*-light/dark.png`（22 张）、`w24-audit-verify.json`（DOM 复核）、`w24-before-probe.json` / `w24-after-probe.json`（用户三点主修项前后探针）

## 用户三点主修项状态（详见 w24-report.md 汇报）

| # | 反馈 | 状态 | before/after 证据 |
|---|---|---|---|
| 1 | 文案代号人话化（supplier 4/product 1/d≥Re） | 已修（渲染全字段兜底 + persona 三 preset 纪律） | `before-1a/1b` → `after-1a/1b`；`w24-after-probe.json` jargonProbe 六项全 false |
| 2 | 会话 md 表格横向挤压 | 已修（reportTable auto+max-content；md 表格 wrap 滚动容器） | 列宽 56px 均分 → ≥68px 且可滚动；md 5 列 thMin=76px scrollable |
| 3 | 消息 tab 列表错位换行 | 已修（预览两行 clamp、未读点重锚、底栏 wrap） | `before-2` → `after-2`；长预览 38px 两行截断、时间右缘对齐 |

## 新发现（成立）

### A1【P1·已修】首页 CTA「登记一条单据」折行出现单字孤行
- 现象：四列网格（~82px/轨）末轨的 6 字 CTA 折行不均，出现「一」类单字孤行（DOM lines:3、h:63）。
- 证据：`w24-audit-verify.json` homeProbe.registerLabel `{w:78, h:63, lines:3}`；VLM home 指控与 DOM 一致。
- 修复：`home.module.css` `.quickChipCta { text-wrap: balance }`（先修 lib 构建时序：该 CSS 经 `build:lib:client` 打包进 ui-mobile 产物，改动后必须重跑 lib 构建再 `apps/web` build——首拍 textWrap 仍 wrap 即此因）。
- 复核：`after-4-home-cta-balance-375.png` + ctaProbe `{textWrap:"balance", lines:3}`——折为 3 行 × 2 字的**均匀**分布（登记/一条/单据，与同排 chips 的 2 字/行节奏一致），单字孤行消除。轨道内容宽（~66px）下 3 行是物理下限，如需 2 行需缩字号或文案改 4 字（文案与字阶均超出本视觉批次，如实记录）。

### A2【P2·已修】chats 底栏 identityCard 挤压断行
- 现象：「NocoBase 业务系统 · AI 员工入」「与 PC 工作台共享会话 / 业务表」两段 12px 文案 space-between 挤压，首段尾字被推出。
- 证据：VLM chats 第 13 条 + 源码 `.identityCard` 无 wrap。
- 修复：`flex-wrap: wrap`（`after-2-chats-list-375.png` 底栏两行自然换行）。

## 驳回（VLM 候选，DOM 核别不成立）

| 候选 | VLM 指控 | DOM 事实 | 判定 |
|---|---|---|---|
| B1 | tasks 暗色副标题对比度 ~3.0:1 不达标 | `--dshm-ink-sub: #c3ab93` on `--dshm-canvas: #191310` ≈ 8:1（WCAG AA 4.5:1 通过）；实测元素色 rgb(242,227,211) 更亮 | 驳回 |
| B2 | 首页「我的预警」badge「3」压住「警」字 | badge 盒 x≈233-249 vs 文本行盒右缘 225——不相交（`w24-audit-verify.json` badgeOverlap 为 badge-vs-按钮盒的粗相交，精确 textRange 复核不交） | 驳回 |
| B3 | home「AI 食安合规官」标签拆三行割裂 | icon 标签实测 2 行（68px/12px，`lines:2`）——roster 两行标签是既定形态 | 驳回 |
| B4 | TabBar 四 tab 图标-文字间距/居中 2-3px 偏移 | 无 DOM 证据（全局 antd tab 结构一致），VLM 无定位细节 | 不采纳（观察噪声） |

## 超范围如实记录（不动代码）

| # | 观察 | 记录理由 |
|---|---|---|
| O1 | alerts 页同证照（如 00IFSMS4401）多行不相邻时拆多张组卡 | W8-B2 折叠语义按「相邻同 title run」；改为全局聚合动预警数据面，超出视觉批次 |
| O2 | alert 行底部 entity_code（`00IFSMS4401 (iso22000)`）是证照编号 | 真实业务编号，用户对单需要；非泄漏代号 |
| O3 | docs 目录卡无数量角标/右箭头 | 产品信息密度取舍，非排版缺陷 |
| O4 | tasks 空态页下部留白大 | 空态极简设计取舍 |
| O5 | 首排 chip「看单据」折「看单/据」出现「据」孤字行 | seal-chip 有朱点装饰 + 内容宽 ~38px，3 字一行放不下；缩 padding/字号动 W9 设计语言刻度，超出视觉批次（A1 的 CTA 均匀化已覆盖用户点名的孤行观感来源） |

## 回归口径

11 路由 overflowX 全 false（修复后横向滚动只发生在表格 wrap 容器内部，页面级无横向溢出）。
