# W11-B1 视觉管线自发现审查报告

- 管线：mmx vision describe（MiniMax VLM），W10 同款 8 视角提示词（无降级，31/31 张成功）
- 截图：修复重建后（build:lib:client + apps/web build ×2 轮）现拍——交互态八矩阵 10 张（聚焦/多行 2-4-6/超长尾标/键盘钳制/fill 闪帧/加号面板/running/暗轨×2）+ W10 同款路由矩阵 21 张（375 亮十路由 + chat + work-detail + 暗轨四点 + login 双轨 + 390×2 + docs 中页滚动）
- 生成：2026-10-05；机读台账：[`.w11-b1-audit-issues.json`](.w11-b1-audit-issues.json)（334 条 raw × 四态处置）
- 依据口径：§＝[design-language-w9.md](../acceptance-w9/design-language-w9.md)；tokens＝tokens.css 实值；DOM＝[`w11-b1-dom-verify.log`](w11-b1-dom-verify.log) / [`w11-b1-fix-reshoot.log`](w11-b1-fix-reshoot.log)

## 验收锚点（A4，对齐 W10 收敛基线）

| 级 | raw | fixed | rejected（证据在案） | ledger（台账） | pooled | 终态 |
|---|---|---|---|---|---|---|
| P0 | 16 | 1（→F1） | 15 | 0 | 0 | **0 开放** ✅ |
| P1 | 104 | 1（→F3） | 73 | **6** | 24（降 P2 池） | **≤7** ✅ |
| P2 | 214 | 0 | 83 | 10 | 121 | 池（下批态） |

## 本批修复（P0/P1 全修闭环）

| # | 面 | 修复 | 证据 |
|---|---|---|---|
| F1 | chats 分段控件暗轨死区（P0-05 + chats-dark contrast×2 同因） | `.filterTabs :global(.adm-capsule-tabs-tab)` 补 1px 焙线描边：暗轨 idle 底 card2 #1f1913 对画布 #191310 仅 ~6 RGB 差，描边承担分离（双轨统一） | DOM：idle border=1px solid rgb(69,55,40)；复拍 `w11-b1-fix-chats-375-dark.png` |
| F3 | work-detail 长标题硬截断无省略（P1） | `.pageTitle` 三件套 overflow:hidden + text-overflow:ellipsis + white-space:nowrap（跨全部 PageNav 页） | DOM：scrollW 588 > clientW 285 且 ellipsis 生效；复拍 `w11-b1-fix-work-detail-375-light.png` |

## P0 裁决表（15 条驳回，证据逐条在案）

| P0 | 判 | 证据 |
|---|---|---|
| 01 alerts 分段原生 radio | 误报 | DOM：radios=0，自绘 12 seg 按钮 |
| 02 认领按钮默认 button | 误报 | dshm-button-reset 全量 UA reset：uaOutsetButtons=0/18 |
| 03 chat 顶栏系统蓝 | 误报 | DOM：back/subtitle=rgb(61,43,31) 暖焙墨 |
| 04 composer 默认 input | 误报 | 本批 T1/T2 实测：胶囊 999px + 焙线 + focus brand halo |
| 06 home 搜索 emoji | 误报 | DOM：svgIcon=true（lucide），emojiChar=false |
| 07 「表单」徽章默认红 | 误报 | DOM：bg=rgb(147,56,42) 印章红 token |
| 08 「表」印章观感 | 驳回 | W10 X25 同题：40px 虚线环淡印是规格 |
| 09/13 顶栏「+」默认观感 | 误报 | DOM：headerPlus bg=brand-soft rgb(248,228,210)、色=brand |
| 10 ix-kbd 输入框方角 | 误报 | 实拍：胶囊 + 3px soft halo 在位 |
| 11/14 发送钮 emoji 纸飞机 | 误报 | lucide Send + .dshm-stamp-solid 柿橙印章 |
| 12 multiline textarea 直角 | 误报 | 实拍 4 行 111px 胶囊在位 |
| 15 右下 FAB 被裁 | 误报 | chat 页无 FAB；构图误读 |
| 16 me Switch 原生 | 驳回 | W10-B3 同题终裁：antd Switch 定制（焙线轨/柿橙选中） |

## P1 台账（6 条，全部规格在案）

| 项 | 理由 |
|---|---|
| work statusTabs 末胶囊渐隐（light+dark 两条） | 溢出 16px 属可滚场景；渐隐尾缘 = W10 T6 滚动可发现性规格 |
| work TabBar 选中矩形 vs 顶栏胶囊 | W8 TabBar 规格本身 |
| home TabBar 线性图标风 | lucide 单色系 = W8 图标系统 |
| ix welcome 主标题层级/字重 | welcome 卡 W9-B5 规格 |
| me-dark 三纯文字入口 | W8 demo 数据区小操作规格 |

> 本轮尝试过 work 末胶囊 padding-right:18px 让末项脱离渐隐区，实测胶囊总宽确实溢出视口 16.3px（真可滚场景），padding 无效也无必要——已回滚，按规格裁决（[`w11-b1-fix-reshoot.log`](w11-b1-fix-reshoot.log) F2 行留痕）。

## W10 微调池 13 条对账（销账 9 / 留池延批 4，无静默丢弃）

| # | 项 | 处置 | 依据 |
|---|---|---|---|
| X08 | alerts 骨架节奏 | **销账** | 本轮矩阵同视角无复报 |
| X10 | chats 顶栏「消息/＋」未对齐 | **销账** | DOM 实测：`.adm-nav-bar-title h1` 中心 vs ＋钮中心 delta=0（首轮量测误抓了 home 常驻 heroTitle，已修正选择器复测） |
| X11 | docs 卡内左右间距窄 | **销账** | 无复报（本轮 docs 新报为网格行间不对称，归 X13） |
| X13 | docs 网格横纵间距 | 留池（改写） | 复报 P2：首行三列与次行单列留白不对称 |
| X14 | files 操作区重心 | **销账** | DOM 实测：stamp/texts/action 三行中心 delta=0 |
| X15 | files 分组标题层级 | 留池 | 复报 P1「AI 生成段顶距 16 vs 24」——VLM 估值，需 DOM 量测后修 |
| X16 | home 问候行「·」垂直 | **销账** | 原维度无复报（本轮 home 新报为预警数颜色/问候字号层级，非中点对位） |
| X17 | home roster 标签行高 | **销账** | 无复报 |
| X20 | ix 工具标签组间距 | 延批 B2 | 报告卡矩阵需真实模型回合现拍量测（fresh 会话无报告流） |
| X21 | ix 报告卡行高 | **销账** | `.reportRow` min-height:44px = 触控行下限规格 |
| X24 | todos 页眉/空态字号 | **销账** | DOM 实测 h1=30px vs 空态 17px，阶差充足 |
| X27 | work capsule 首标签左距 | **销账** | 无复报（本轮 work 新报为渐隐/TabBar 形态，另归台账） |
| X28 | work「去聊聊」底距漂移 | 留池 | 复报 P2（单路由） |

## ua-default-style 大群误报说明

本轮 raw 中 ua-default-style 类占 189 条（P0 16/P1 ~70/P2 ~103），为 W10-B3 已定性的同款模式：8 视角提示词第①项（用户亲述痛点）引导 VLM 把 antd-mobile 定制控件、lucide SVG、自绘分段、印章元素过度归因为浏览器原生。处置全部骑 W10 已建立的证据口径（reset 层、token 实值、DOM 取样、实拍复核），不作二次仲裁。

## 证据索引

- 审计跑批：[`w11-b1-audit-run.log`](w11-b1-audit-run.log)（31/31 PASS）；原始 VLM 响应 `.audit-raw/`
- DOM 取证：[`w11-b1-dom-verify.log`](w11-b1-dom-verify.log) / [`w11-b1-fix-reshoot.log`](w11-b1-fix-reshoot.log)
- 交互态矩阵：`w11-b1-ix-*.png` ×10；路由矩阵 `w11-b1-*.png` ×21；修复复拍 `w11-b1-fix-*.png` ×4
- 脚本：`.shoot-w11b1.mjs`（八矩阵）/ `.shoot-w11b1-routes.mjs`（路由）/ `.audit-w11b1.mjs`（VLM）/ `.dom-verify-w11b1.mjs` / `.reshoot-w11b1.mjs` / `.verdicts-w11b1.mjs`
