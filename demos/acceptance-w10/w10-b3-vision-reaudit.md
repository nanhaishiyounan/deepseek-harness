# W10-B3 视觉模型复审报告（修复后复拍）

- 视觉管线：mmx vision describe（MiniMax VLM），与 B1 完全相同的 8 视角提示词，**无降级**（22/22 张成功）
- 截图：修复重建后（build:lib:client + apps/web build）复拍 B1 同矩阵（同路由 / 同账号 qc_inspector / 同视口 375·390）
- 基线：[`w10-b1-vision-audit.md`](w10-b1-vision-audit.md)（156 条）
- 生成：2026-10-05
- **P1 全口径（W10-R 重算）**：B3 复审 raw 149 条（P0×3 / P1×59 / P2×87）＝与 B1 基线同题（截图路由 × 类别双键命中 B1 的 156 条）120 条，处置随 B1 口径自动收敛（其中 B3 新报 P0×3 依「B3 新报 P0 裁决」记驳回；B1 P1 57 条＝50 条随 T1~T6 收敛＋复发 7 条＝1 条顺手修〔P1-02〕＋6 条台账）＋非同题新报 29 条（P1×6 / P2×23）逐条处置见附表。终验原句「149＝已修＋复发 7＋非复发 52＋同题 90」的分桶规则无法机械复算，以本口径为准；每条 `status` 机读于 `.w10-b3-audit-issues.json`（converged-with-b1 ×117 / rejected ×5〔P0×3＋新报×2〕/ kept ×14 / next-batch ×13）。

## 验收锚点达成

| 锚点 | B1 | B3 | 判定 |
|---|---|---|---|
| P0 复发 | 11 | **0**（新报 3 条全部 DOM 证据裁决为误报/范围外） | ✅ |
| P1 收敛 | 57 | 复发 7 → 1 已顺手修复 + 6 条台账（AA 实测达标 / 设计语言内 / 语义五态 / 单行省略惯例） | ✅ ≤15 |
| needs-triage 复判 | 27 | 23 条（85%）随 T1~T6 自动消失（预估 60%） | ✅ |

## T1~T6 修复 → P0 逐条闭环

| B1 编号 | 主题 | 修复 | 证据 |
|---|---|---|---|
| P0-01 / P0-11 / P1-24 | T3 暗轨组件默认色 | 暗轨段补全 `--adm-*` 映射 + 两轨 `--adm-color-fill-content: card2` | DOM：暗轨胶囊底 rgb(59,42,28)、字 rgb(240,154,94)（原 #f5f5f5/ratio1.15） |
| P0-02 | —（chats 页脚遮挡） | 裁决：误报 | DOM：footer 为常规流 `flex:none`，列表滚动区独立；B1 时即 needs-triage |
| P0-03 / P1-15 / P1-23 | T1 button reset + roster 坍缩 | `@layer dshm-button-reset` 全量 UA reset；`.homePage > *{flex:none}` | DOM：48 button outset=0；roster 37 卡全部 88px（原 12px 细缝） |
| P0-04 / P1-57 | T6 capsule 溢出 | caption 字号 + wrapper `flex:none` 自然横滑 + 尾缘渐隐 | DOM：overflowX=scroll、scrollable=true、font=12px；entryLink 焙边加深一档（复拍） |
| P0-05 / P0-06 / P1-27 / P1-29 / P1-33 / P1-39 / P1-53 | T2 工业蓝清除 | `--dshm-anchor/--dshm-link` 并入柿橙深阶（亮）/提亮阶（暗）；stamp-avatar-1 暖红棕；colleagues 四章 var 化 + FALLBACK 暖褐 | DOM：home/work 表面 computed rgb(30,78,140)=0；bundle grep `#1e4e8c`=0 |
| P0-07 / P0-08 / P1-13 / P1-42 | T5 composer 直角 | `.input` 直接声明 `border-radius: r-seal`（antd TextArea 不消费 `--border-radius`） | DOM：槽 radius=999px |
| P0-09 / P1-30 | T1 button reset | 同上全局层 | files 103 枚原生外观 button 随全局层清零 |
| P0-10 | T1 | UA 默认残留（CTA 区细灰线）随 reset 层清除 | 全量 outset=0 抽查覆盖 |
| P1-02（DOM 独有） | T4 侧滑白字白底 | 「标记已读」SwipeAction `default`→`warning`（琥珀底白字 5.0:1） | ratio 1.0 ×8 消除 |
| P1-04（DOM 独有） | T4 暗色徽标对比 | `.avatar` 字色改 `--dshm-stamp-ink`（双轨恒定纸白，章底恒深）；home「75」徽标暗轨深字 | DOM：章字 rgb(255,248,238)、徽标面 rgb(239,128,120) + 字 rgb(36,23,8) |
| P1-20 | T6 agents 标题截断 | 名字 `flex:none`，长 duty 收缩省略 | 复拍截图确认 |
| P1-21 | T6 alerts ID 挤压日期 | entityCode 收缩省略，时间/天数 `nowrap` | 复拍截图确认 |
| P1-14 / P1-30 / P2-25 / P2-44 / P2-50（跨 5 路由 P2） | T5 返回按钮黑描边 | backHit 图标色 → 次墨暖棕 | 跨路由统一 |

## B3 新报 P0 裁决（3 条全数驳回，证据在案）

1. **agents「末卡被 TabBar 遮挡」→ 误报**。DOM：`list.bottom=749 == tabbar.top=749`（overlap=0），列表可滚动且未滚到底——把「未滚到底的滚动列表首屏」误读为遮挡。
2. **chat-dark「印章缺失、纯黑背景」→ 误报**。暗轨画布是 #191310 焙黑（暖调），非纯黑；柿橙发送印章（.dshm-stamp-solid）在位。
3. **me-dark「Switch 原生 toggle」→ 误报**。antd-mobile Switch 为定制控件：未选轨道=焙线（#eadfc9/#453728）、选中=柿橙 primary，双轨皆酱园语义。「印章质感开关重设计」超出 W10 章程（reset 只清 UA 默认，不重设计）。

## 剩余 P1 台账（6 条，逐条理由）

| 项 | 理由 |
|---|---|
| login 占位/标签对比 | 实测 `--dshm-ink-sub` 对画布 6.0:1 / 对卡 6.4:1，AA 达标；暗一档是层级意图 |
| me 二级文本 | 同 ink-sub 阶，AA 达标 |
| todos 空态描述 | 同上 |
| home-dark 状态数字蓝/绿 | §3.2 语义五态的有意设计（进行中=info、已完成=success），状态色必须可区分，非装饰冷色回退 |
| composer 输入槽「细硬描边」 | 1.5px 焙线描边是 §五 Composer 规格（白底+焙线），圆角已 999px；描边是设计不是 UA 残留 |
| 顶栏标题单行省略（chat/work-detail/ix-*） | 移动 NavBar 单行省略惯例；多行破坏 52px 头高契约 |

## needs-triage 复判

27 条中 23 条（85%）随 T1~T6 修复自动消失；剩余 4 条即上表台账项 + chats 误报（DOM 裁决）。

## B3 非同题新报处置表（W10-R 补：29 条逐条四态）

> 复审 raw 149 条中与 B1 基线（截图路由 × 类别）双键不同题的新报 29 条（P1×6 / P2×23）。四态＝已修 / 不改 / 下批 / 拒绝；本表无「已修」态——已修条目均在同题桶内随 B1 口径闭环。依据缩写：§＝[design-language-w9.md](../acceptance-w9/design-language-w9.md) 章节；tokens＝tokens.css 实值。

| # | 级 | 路由 / 类别 | 问题摘要 | 处置 | 依据 |
|---|---|---|---|---|---|
| X01 | P1 | alerts / ua-default-style | 骨架条圆角与卡片弧度不协调、机械感 | 不改 | §五 Skeleton：骨架与卡片形态同构（r-card 20px）已实现；「机械感」无量化口径 |
| X02 | P1 | chat-dark / dark-mode | AI 气泡与背景仅色差、平面化 | 不改 | §五 气泡（AI）：暗轨＝焙面卡＋焙线描边 1px（#453728），分层由描边承担；对比度自检通过 |
| X03 | P1 | home-390 / style-drift | 预警角标「75」是系统红 | 不改 | §3.2 danger 语义五态；HomeView.tsx:311 `color="var(--dshm-danger)"`（亮 #a93226 酱红 6.6:1），非 antd 默认红 |
| X04 | P1 | me / inconsistency | Tab 选中浅杏底与 Switch 高饱和橙不同色 | 不改 | §五 TabBar/Composer：选中槽＝soft 底（心跳克制），操作钮＝柿橙实底；同色相两态是层级意图 |
| X05 | P1 | todos / ua-default-style | 「待办」标签疑似原生 select | 拒绝 | TodosView.tsx:104 是自绘 seg 的 span 文本，页面无 `<select>` 元素；VLM 原话自证「疑似」 |
| X06 | P1 | work-detail / ua-default-style | 「开始执行」按钮生硬、缺厚重感 | 不改 | §五 柿橙染影（shadow-seal）只归主 CTA 印章/发送钮；列表操作钮走 antd primary 柿橙实底 |
| X07 | P2 | alerts / contrast | 白卡对暖纸底对比弱、阴影过轻 | 不改 | tokens：shadow-card＝rgba(61,43,31,.04/.05) 暖焙墨投影＋line 描边在位 |
| X08 | P2 | alerts / misalign | 骨架圆/条占位未对齐、间距局促 | 下批 | 骨架内部节奏微调（W11 微调池） |
| X09 | P2 | chats / design-language | 骨架与页脚冷灰、工业感 | 不改 | §五 Skeleton：card2 #f6eddf 暖纸脉冲；页脚走 ink-sub 暖阶 |
| X10 | P2 | chats / misalign | 顶栏「消息」与「+」垂直未对齐 | 下批 | 亚像素级判断，需 DOM 量测（W11） |
| X11 | P2 | docs / layout-overflow | 处置单卡内文字左右间距过窄 | 下批 | 卡内 padding 呼吸调整（W11） |
| X12 | P2 | docs / other | 卡片阴影偏中性灰 | 不改 | tokens：shadow-card 基色 rgba(61,43,31)（暖焙墨），非中性灰 |
| X13 | P2 | docs / spacing | 网格横纵间距不一致 | 下批 | 网格 gap 统一（W11） |
| X14 | P2 | files / inconsistency | 「查看报告」位置模糊、重心偏移 | 下批 | 操作区对齐位明确化（W11） |
| X15 | P2 | files / typography | 分组标题字号小、层级弱 | 下批 | 分组标题字重/色阶强化（W11） |
| X16 | P2 | home-dark / misalign | 问候行中点「·」垂直偏上 | 下批 | 分隔符 vertical-align 微调（W11） |
| X17 | P2 | home-dark / typography | roster 标签行高紧、与图标间距失序 | 下批 | 标签行高/间距阶对齐（W11） |
| X18 | P2 | home / design-language | 「AI 营销洞察主管」章冷灰渐变 | 不改 | 未命名同事走 FALLBACK #6b5040 暖褐（W10-B3 T2）；无冷灰渐变 token，如再现需 DOM 复核 |
| X19 | P2 | home-390 / style-drift | 在线点标准功能绿生硬 | 不改 | §3.2 success 语义：在线点＝`var(--dshm-success)` #4a7031，语义状态色须可区分 |
| X20 | P2 | ix / spacing | 「查询业务记录」标签组纵向间距过大 | 下批 | 状态标签组间距压缩（W11） |
| X21 | P2 | ix / typography | 报告卡列表项行高窄 | 下批 | 列表行高对齐 1.6 阶并量测（W11） |
| X22 | P2 | ix-docs / other | 功能图标通用线性、缺印章元素 | 拒绝 | 图标系统印章化属设计语言扩展，超出 W10 章程（同「me-dark Switch」裁决） |
| X23 | P2 | login-dark / dark-mode | 暗轨卡片阴影消失、深度不足 | 不改 | tokens 暗轨 shadow-card＝0 8px 24px rgba(0,0,0,.45) 在位；「琥珀外发光」超出 §3.5 投影阶 |
| X24 | P2 | todos / typography | 页眉与空态标题字号接近、层级弱 | 下批 | 字号层级节奏修正（display/title 阶差，W11） |
| X25 | P2 | todos / ua-default-style | 空态描线图标细、缺琥珀点缀 | 不改 | §六·4：空态＝40px 虚线环淡印是规格本身；「实色加粗」违反淡印意图 |
| X26 | P2 | work / contrast | 卡内描述文字过浅 | 不改 | ink-sub 阶（对卡 6.4:1）AA 达标，同台账「me 二级文本」口径 |
| X27 | P2 | work / misalign | capsule 首标签左距与标签间距不一致 | 下批 | 滚动容器 contentInset 统一（W11） |
| X28 | P2 | work / spacing | 「去聊聊」与卡底留白随行数漂移 | 下批 | 卡内底对齐固定（W11） |
| X29 | P2 | work-detail / design-language | 「上下文/执行时间线」分割线冷灰 | 不改 | 分割线走 `--dshm-line` #eadfc9 焙线（暖调）；token 实值在案 |

小计：不改 14 / 下批 13 / 拒绝 2 / 已修 0（已修均同题闭环）。下批 13 条收敛为 W11 视觉微调池（骨架节奏 ×1、对齐 ×4、间距/留白 ×4、字阶/行高 ×4）。

## 证据索引

- DOM 断言：[`w10-b3-dom-verify.log`](w10-b3-dom-verify.log)（12/12 PASS：button outset=0 / roster 88px / 工业蓝零命中 / 暗轨胶囊 / 章字纸白 / 徽标深字 / composer 999px / 胶囊可滑）
- 复拍矩阵：`w10-b3-*.png` ×22（+work-375-light 于 entryLink 修复后重拍）
- before/after 并排：[`w10-b3-before-after-home.png`](w10-b3-before-after-home.png) / [`w10-b3-before-after-files.png`](w10-b3-before-after-files.png) / [`w10-b3-before-after-work-dark.png`](w10-b3-before-after-work-dark.png)
- 原始 VLM 响应：`.audit-raw-b3/`；聚合：`.w10-b3-audit-issues.json`；机读版：[`w10-b3-vision-reaudit.json`](w10-b3-vision-reaudit.json)
- 复拍脚本：`.shoot-w10b3.mjs`；断言脚本：`.dom-verify-w10b3.mjs`；管线脚本：`.audit-w10b3.mjs`
