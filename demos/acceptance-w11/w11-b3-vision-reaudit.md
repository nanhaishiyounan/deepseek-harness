# W11-B3 视觉复审收敛报告

- 管线：mmx vision describe（MiniMax VLM），W10 同款 8 视角提示词（与 B1 审计逐字一致，跨轮可比）；18/18 张成功，无降级
- 面覆盖：B2 新面 12 张（加号面板 2×2 亮/暗 + 附件条三态 uploading/ready-image/ready-pdf/failed + 聆听卡 listening/error + 图片/PDF 真回合 + 发送草稿 + X20 工具标签修复后）+ B3 关键路由快扫 6 张（chats/home/me × light+dark + chat fresh；`.shoot-w11b3-routes.mjs` 现拍）
- 生成：2026-10-06；机读台账：[`.w11-b3-reaudit-verdicts.json`](.w11-b3-reaudit-verdicts.json)（236 条 raw × 四态处置 + verdictWhy）
- 依据口径：§＝[design-language-w9.md](../acceptance-w9/design-language-w9.md)；B1 审计＝[w11-b1-vision-audit.md](w11-b1-vision-audit.md)；DOM＝[`w11-b3-dom-verify.log`](w11-b3-dom-verify.log)

## 验收锚点（P0 必须 0，新引入 P1 全修或带规格台账）

| 级 | raw | fixed | rejected（证据在案） | ledger（台账延续） | pooled | 终态 |
|---|---|---|---|---|---|---|
| P0 | 22 | 0 | 22 | 0 | 0 | **0 开放** ✅ |
| P1 | 95 | 0 | 86 | 9 | 0 | **0 新引入** ✅ |
| P2 | 119 | 0 | 45 | 12 | 62 | 池（下批态） |

> P1 ledger 9 条全部是 B1 台账六条规格的复报延续（home TabBar 线性图标风、welcome 卡标题层级在 B2 新面上以新措辞复报），规格未变、无恶化——台账本体维持 B1 六条，不另立新账。

## P0 裁决说明（22 条全驳回）

全部为 ua-default-style 类，骑 W10-B3 定性 + B1 P0 裁决表同题证据：顶栏/composer「＋」钮（B1 P0-09/13：brand-soft 底 + brand 图标）、发送钮（P0-11/14：lucide Send + dshm-stamp-solid）、输入框（P0-04/10/12：999px 胶囊 + focus halo 实测）、me Switch（P0-16 终裁）、emoji 图标（P0-06：lucide SVG）。本批新增一类：**附件 chip「原生文件控件残留」（4 条）**——DOM 实测 attachChip 为自绘 `DIV role=listitem` + 14px 圆角 + 自绘 remove `BUTTON`（rgb(31,25,19) 底），failed 态红缘 rgb(239,128,120)，`input[type=file]` 全部隐藏（[dom-verify 行 6](w11-b3-dom-verify.log)）。

## 本批 DOM 取证要点（w11-b3-dom-verify.log）

| 候选（VLM 估值） | 实测 | 判 |
|---|---|---|
| placeholder「1.8:1 严重不达」（chat-fresh） | `::placeholder` rgb(111,91,73) vs 胶囊底 = **6.42:1** | 误报 |
| 聆听卡文字「4.0:1 AA 边缘 / 暖纸色对比低」 | listeningCard 白底 + ink rgb(61,43,31) = **13.43:1** | 误报 |
| 暗轨面板「6 张纯白 #FFF 卡亮块硬切」 | 暗轨 qpItem bg=**rgb(42,34,28)** 暖暗卡 | 误报 |
| 面板/附件文字「#B5A89B 浅灰易糊」 | qpTitle ≈7.6:1、attachName ≈10:1 对各自底 | 误报 |
| 输入行三件套「基线不齐」 | 中心线 781/781/**779**（≤2px，边框计入） | 误报 |
| 附件 chip「iOS 原生 chip 残留」 | 自绘 DIV + 自绘 BUTTON + 原生 input 全隐藏 | 误报 |
| 圆角多套（胶囊/14px 卡/正圆） | 语境 chips（dshm-seal-chip）vs 面板指令格（qpItem/qpTool）= 两交互层既定组件面（W8-B2 拆分以来）；46px 邮票 vs 36px 头部钮 = 触控阶梯规格 | 规格驳回 |

## W10 视觉基线抽验（chats/home 无回归）

像素级 diff（`.diff-w11b3-baseline.mjs`，delta>8 阈值，B3 现拍 vs B1 修复后矩阵）：home 双轨 <0.9%（单带 6%@y640 = 预警数字动态区）；chats 顶栏 0~120px 零 diff，列表区 11~23% 均匀推移 = B2 活体证据新建会话行的**数据性位移**（非视觉回归）。结果见 [`w11-b3-baseline-diff.log`](w11-b3-baseline-diff.log)。

## B1 台账六条对照（复报情况）

| B1 台账项 | B3 复报 | 状态 |
|---|---|---|
| work statusTabs 末胶囊渐隐 ×2 | 未拍 work（快扫范围外） | 台账维持 |
| work TabBar 选中矩形 | 未拍 work | 台账维持 |
| home TabBar 线性图标风 | home-light/dark 复报（归 ledger 9 条内） | 规格延续 |
| ix welcome 标题层级/字重 | B2 新面复报（「标题系统粗体/副标题字轻」） | 规格延续 |
| me-dark 三纯文字入口 | 未拍 me-dark | 台账维持 |

## 证据索引

- 审计跑批：[`w11-b3-reaudit-run.log`](w11-b3-reaudit-run.log)（18/18 PASS）；原始响应 `.audit-raw-b3/`
- 机读四态台账：[`.w11-b3-reaudit-verdicts.json`](.w11-b3-reaudit-verdicts.json)（`.verdicts-w11b3.mjs` 产出）
- DOM 取证：[`w11-b3-dom-verify.log`](w11-b3-dom-verify.log)
- 快扫与基线：`.shoot-w11b3-routes.mjs`（6 张）/ `.diff-w11b3-baseline.mjs` / [`w11-b3-baseline-diff.log`](w11-b3-baseline-diff.log)
