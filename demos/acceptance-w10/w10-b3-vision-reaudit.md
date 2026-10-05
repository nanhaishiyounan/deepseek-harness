# W10-B3 视觉模型复审报告（修复后复拍）

- 视觉管线：mmx vision describe（MiniMax VLM），与 B1 完全相同的 8 视角提示词，**无降级**（22/22 张成功）
- 截图：修复重建后（build:lib:client + apps/web build）复拍 B1 同矩阵（同路由 / 同账号 qc_inspector / 同视口 375·390）
- 基线：[`w10-b1-vision-audit.md`](w10-b1-vision-audit.md)（156 条）
- 生成：2026-10-05

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

## 证据索引

- DOM 断言：[`w10-b3-dom-verify.log`](w10-b3-dom-verify.log)（12/12 PASS：button outset=0 / roster 88px / 工业蓝零命中 / 暗轨胶囊 / 章字纸白 / 徽标深字 / composer 999px / 胶囊可滑）
- 复拍矩阵：`w10-b3-*.png` ×22（+work-375-light 于 entryLink 修复后重拍）
- before/after 并排：[`w10-b3-before-after-home.png`](w10-b3-before-after-home.png) / [`w10-b3-before-after-files.png`](w10-b3-before-after-files.png) / [`w10-b3-before-after-work-dark.png`](w10-b3-before-after-work-dark.png)
- 原始 VLM 响应：`.audit-raw-b3/`；聚合：`.w10-b3-audit-issues.json`；机读版：[`w10-b3-vision-reaudit.json`](w10-b3-vision-reaudit.json)
- 复拍脚本：`.shoot-w10b3.mjs`；断言脚本：`.dom-verify-w10b3.mjs`；管线脚本：`.audit-w10b3.mjs`
