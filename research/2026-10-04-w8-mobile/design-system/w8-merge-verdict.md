# W8 移动端设计系统合并裁决 — W7「铸造」基座 × ui-ux-pro-max 推荐

> 日期 2026-10-04。本文是 [blueprint.md](../blueprint.md) §1 的展开依据。
> 输入一：W7 规范单一来源 `research/2026-10-03-w7-rework/b0/design-language.md`（plans/plan-w7.zh.md §3 摘要 + w7b0-theme.mts 落地令牌），移动端令牌唯一源 `packages/client/ui-mobile/src/client/tokens.css`（v7，329 行）。
> 输入二：ui-ux-pro-max 技能 CLI 产物 — 设计系统推荐 `design-system/dsh-mobile-workbench/MASTER.md`（209 行，`--design-system --persist` 生成）+ 领域笔记 `design-notes/`{ux,style,typography,color,chart,web,rn-stack}.md（7/7 非空，合计 841 行）。
> 预备裁决原则（任务给定，不可谈判）：**W7 语言是品牌基座不可推翻**；技能输出只用于校准、补强、发现遗漏；冲突处逐条裁决并记录理由。技能栈描述按 React Native 理解的建议，仅取与栈无关的通用移动原则。

## 1. MASTER.md 推荐摘要（CLI 原文要点）

- **风格名**：Trust & Authority（B2B Service；Pattern: Real-Time / Operations Landing；Light/Dark 双态 Full；WCAG AAA 目标）
- **调色板**：Primary `#0891B2`（calm cyan）/ Secondary `#22D3EE` / Accent-CTA `#059669`（health green）/ Background `#ECFEFF` / Foreground `#164E63` / Border `#A5F3FC` / Destructive `#DC2626`
- **字体**：Heading Lexend + Body Source Sans 3（mood: corporate, trustworthy, accessible, readable, professional, clean）
- **间距阶**：4/8/16/24/32/48/64 px 七档 CSS 变量
- **阴影四档**：sm 0 1px 2px 5% / md 0 4px 6px 10% / lg 0 10px 15px 10% / xl 0 20px 25px 15%
- **反模式**：playful、AI purple/pink 渐变、emoji 作图标、无 cursor:pointer、布局位移 hover、低对比文字、0ms 瞬变、不可见焦点态
- **组件规格**：主按钮 Accent 绿实底 + hover translateY(-1px)；卡片浅青底 12px 圆角 + hover 上浮；输入 focus 3px 品牌色光环 + `box-shadow ring`；Modal 遮罩 `rgba(0,0,0,.5)` + `backdrop-filter: blur(4px)`

## 2. 裁决总表

| # | 维度 | CLI 推荐 | W7 现状 | 裁决 | 理由 |
|---|---|---|---|---|---|
| V1 | 品牌主色 | `#0891B2` 青色系 | 普鲁士深蓝 `#1E4E8C`（light）/`#2A5FA6`（dark 提亮），与 PC `--w7-primary` 同源对齐 | **保留 W7，拒绝换色** | tokens.css:20 注释即合同：「Brand axis (same source as PC --w7-primary)」。跨端同源是 W7 轮已验收的单一来源纪律（research/2026-10-03-w7-audit/03 §4）；青色系属另一品牌人格，W8 无权推翻品牌基座 |
| V2 | 语义色 | 单一 Destructive `#DC2626` | Fiori Morning Horizon 五态配对（Positive/Critical/Negative/Neutral/Informational + 执行完成补充态），每态 fg/soft/边框三件套 | **保留 W7** | 五态语义系统完备度高于 CLI 单 destructive；且 PC/移动共享同一 STATUS_PALETTE 基准表（design-language.md §2），换语义色即破坏跨端一致性 |
| V3 | 中性阶 | 冷青灰（`#ECFEFF`/`#E8F1F6`） | 暖灰（画布 `#F6F6F4` 系，三档海拔） | **保留 W7** | 暖灰 + 弥散影是「铸造」语言的材质核心；CLI 冷青底与普鲁士蓝不同温 |
| V4 | 字体 | Lexend + Source Sans 3（Google Fonts 外链） | 系统栈（PingFang SC / HarmonyOS Sans SC / Noto Sans SC…），design-language.md §3「无外部字体」 | **保留 W7，拒绝外链字体** | ① 部署环境（食品企业内网/国内网络）Google Fonts 不可达，FOIT 风险；② 中文正文 Lexend/Source Sans 3 不覆盖 CJK，最终仍回落系统栈，外链只剩负收益；③ 与 PC 端一致 |
| V5 | 字阶 | 无明确字阶（组件示例 16px 单档） | 五档 12/13/15/17/24-26 + tnum，12px 下限已门槛化（w7-b6 tabTitle≥12 门槛） | **保留 W7；补强一项**：输入控件字号 ≥16px | W7 字阶完备。但发现真遗漏：v3 输入框 `--font-size: var(--dshm-fs-sm)`（13px）与 composer textarea 会触发 iOS Safari 聚焦自动缩放（准则 §5 readable-font-size 的机制性依据）。裁决：**表单输入类控件字体 ≥16px**（正文展示字阶不变）→ B1 |
| V6 | 间距 token | 七档 CSS 变量 `--space-*` | 4/8 网格实际遵守，但 module.css 内联数值，无 token | **不采纳新增间距 token** | 16 个 module.css 已按 4/8 节奏手写稳定；引入 `--dshm-space-*` 全量替换是高扰动低收益的机械改动，违反「最小变更面」批次纪律。裁决：间距合规由 review 把关，不做 token 化 |
| V7 | 阴影 | 四档通用阴影 | 三档弥散同调影（card/raised/shell-halo），同色系 RGB 递进 | **保留 W7** | CLI 四档是泛用规格；W7 三档是「同调弥散」材质语言且已有 elevation step 门槛（w7-b6 暗轨 cardVsBg≥20），体系已闭环 |
| V8 | 焦点态 | Focus ring 可见 + input focus 3px 光环（Anti-Pattern: Invisible focus states） | **移动端无任何 :focus-visible 样式；v3 fieldInput 无 :focus 定义** | **采纳，W8 真增量** | 技能发现的最实质遗漏。现状键盘/读屏用户焦点不可见（准则 §1 focus-states CRITICAL）。裁决：新增 token `--dshm-focus-ring`（light `0 0 0 3px rgba(30,78,140,.35)` / dark `0 0 0 3px rgba(83,131,199,.5)`）+ 全局 `:focus-visible` 规则 + fieldInput/composer `:focus` 边框强化 → B1 |
| V9 | 链接色可达性 | Low contrast text 列为反模式 | 品牌蓝作纯文字 33 处；暗轨 `#2A5FA6` 对卡 `#1E2634` = 2.38:1（tokens.css:157 自注） | **采纳，W8 真增量** | tab-active/stamp-doing 已有独立提亮 token 先例（tokens.css:151-158）。裁决：新增 `--dshm-link`（light `#1E4E8C` / dark `#7B9DD1`，对卡 ≥4.5:1）+ `--dshm-on-soft` 承接 soft 底文字；裸文字链接点全量换 `--dshm-link` → B1（侦察 #⑤） |
| V10 | 触控 | ≥44×44 + 相邻 ≥8px | 主触控 44 ✓；次级 `--dshm-touch-sm` 36px ×15 处 | **采纳补强，分级处理** | Apple 44pt / WCAG 2.5.8 AA 下限 24px。裁决：`--dshm-touch-sm` 36→40px（密集列表内可接受 AA），主操作路径（stop 停止生成、SearchBar 触发）升 44px；chips 行相邻间距 probe 复核 ≥8px → B1（侦察 #⑥） |
| V11 | 模态遮罩 blur | `backdrop-filter: blur(4px)` | mask 统一 0.5 黑（tokens.css:288） | **拒绝 blur** | W7 语言无玻璃拟态；blur 在低端安卓 WebView 有掉帧风险；0.5 遮罩已满足隔离前景的可用性目的 |
| V12 | hover 上浮动效 | 卡片 hover translateY(-2px) + 主按钮 hover 上浮 | 无 hover 态（触控产品语义），按压态 chip transform 120ms | **拒绝 hover 动效，保留按压反馈路线** | 触屏无 hover（准则 §2 hover-vs-tap：不依赖 hover）；按压 scale 反馈 W7 已有（chips active transform）。补强：行卡片（recentRow/rosterCard）统一 `:active` 按压反馈 → B2 |
| V13 | 反模式清单 | playful / AI purple-pink 渐变 / emoji 图标 / 0ms 瞬变 / 不可见焦点 | 全部已符合（lucide stroke 1.8 统一、220ms 动效、reduced-motion 全量降级） | **确认无冲突，作为 W8 验收清单条目沿用** | — |
| V14 | Loading 骨架 | skeleton/spinner >300ms | EmptyState/SkelRow/SkelCard/SkelThread 全家（W7-M2），骨架匹配真实行结构 | **保留 W7（超标准）** | CLI 仅原则级；W7 骨架已按行结构定制，且 role=status 播报完备 |
| V15 | 图表序列色 | chart 域笔记：可及色板、禁红绿对 | 六阶蓝系递进 + 灰（design-language.md §1.4），热力=语义三态 | **保留 W7** | 移动端暂无图表面（§10 N/A）；ReportCard 指标格走数字直出。B3 若加 KPI 迷你趋势再启用该域规则 |
| V16 | Safe area / 动态字号 | web 域笔记：safe-area、Dynamic Type、touch 扩展命中 | safe-area-inset-top + SafeArea bottom ✓；字阶 px 固定不随系统缩放 | **safe-area 保持；动态字号 deferred** | 430px 手机壳 + px 字阶是产品形态决策；rem 化会在系统大字号下破壳布局。裁决：deferred 并在 README Known Limitations 记录，键盘可用性由焦点环（V8）补偿 |
| V17 | RN 栈性能建议（list 虚拟化/导航性能） | virtualize 50+ 列表、FlatList 模式 | 会话列表/聊天流无虚拟化（history 窗口 200 条上限） | **采纳为评估项，不立即实施** | 通用原则成立，但 200 条窗口 + memo 化 fold 的实测性能未报警。裁决：B2 记录「实测滚动性能再裁决」评估项，不盲改 |
| V18 | 风格人格 | Trust & Authority（trust-first，B2B） | 「铸造」（trust-first 保守区间，DESIGN_VARIANCE 3-4，Fiori/Carbon 品质标准） | **确认同向** | CLI 独立推导出与 W7 相同的人格区间，交叉验证了 W7 方向；无行动项 |

## 3. 合并后的 W8 设计系统增量（本文档的产出物）

W7 语言不变，W8 在其上叠四件增量（全部落在 tokens.css + module.css，均归 B1）：

1. **焦点环**：`--dshm-focus-ring`（双轨）+ 全局 `:focus-visible` outline 规则（V8）。
2. **链接色 token**：`--dshm-link`（双轨，暗轨 `#7B9DD1`）+ `--dshm-on-soft` 暗轨承接 soft 底文字（V9）。
3. **触控分级**：`--dshm-touch-sm` 36→40；主操作路径 44（V10）。
4. **输入底分化**：暗轨表单输入底从卡同色改为 `--dshm-muted` 一阶（侦察 #④；v3.module.css:249 现状输入底=卡底零对比）+ 输入控件字号 ≥16px 防 iOS 聚焦缩放（V5）。

以及一个 token 命名补全：`--dshm-code-action: #c7d3e6`（代码块复制钮，双轨同值——代码板恒深色；替换 messages.module.css:699 唯一硬编码 hex，侦察 #⑩）。

## 4. 与技能 Quick Reference 的关系

blueprint.md §2 差距矩阵即按技能 Quick Reference §1–§10 分组逐条判定；本文档只负责「设计系统层」的合并裁决，不重复准则审计。领域笔记引用：[ux.md](../design-notes/ux.md)、[style.md](../design-notes/style.md)、[typography.md](../design-notes/typography.md)、[color.md](../design-notes/color.md)、[chart.md](../design-notes/chart.md)、[web.md](../design-notes/web.md)、[rn-stack.md](../design-notes/rn-stack.md)。
