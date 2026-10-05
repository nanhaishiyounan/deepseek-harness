# W10 移动端视觉债清偿——证据索引（B1 审查 / B2 修复 / B3 复审 / B4 回归）

W10 承接用户两次「界面难看」点名：B1 用 MiniMax VLM 图像识别证实根因（P0 的 8/11 属「元素未按设计语言重置」），B2 按 T1~T6 主题修复，B3 复拍同矩阵重跑管线收敛，B4 回归收尾。视觉模型当验收器，用户不再当第一验收人。

## 验收结论

| 锚点 | B1 基线 | B3 复审 | 判定 |
|---|---|---|---|
| P0 | 11 | **0**（新报 3 条全数 DOM 证据驳回） | ✅ |
| P1 | 57 | 复发 7 → 1 修复 + 6 台账理由 | ✅ ≤15 |
| needs-triage | 27 | 4（85% 随主题自动消失） | ✅ |
| DOM 断言 | — | 12/12 ALL PASS | ✅ |
| ui-mobile 全量 spec | — | 692/692 | ✅ |
| W9 B4 gate | — | 19/19 ALL PASS | ✅ |

## B1 视觉审查（基线）

- 报告：[`w10-b1-vision-audit.md`](w10-b1-vision-audit.md) / [`w10-b1-vision-audit.json`](w10-b1-vision-audit.json)（156 条 = P0×11 / P1×57 / P2×88；DOM 复核 confirmed×29 / visual-only×12 / needs-triage×27）
- 原始截图：`w10-b1-*.png` ×22（3080 重建后现拍；chat 真实模型回合、work-detail 真实路由）
- 脚本：`.shoot-w10b1.mjs`（拍摄）/ `.audit-w10b1.mjs`（VLM 8 视角）/ `.dom-probe-w10b1.mjs`（交叉验证）/ `.aggregate-w10b1.mjs`（聚合）

## B2 修复（T1~T6 主题）

| 主题 | 修复面 |
|---|---|
| T1 button 全局 reset + roster 坍缩 | tokens.css `@layer dshm-button-reset`；home `.homePage > *{flex:none}`；`stampAcronymOf` 去 AIAI 重复 |
| T2 工业蓝全仓清除 | `--dshm-anchor/--dshm-link` 亮轨并入柿橙深阶 / 暗轨提亮阶；stamp-avatar-1 暖红棕；colleagues 四章 var 化 + FALLBACK 暖褐 |
| T3 antd-mobile 暗色覆盖缺口 | 暗轨整表补 `--adm-*` 映射；两轨 `--adm-color-fill-content`；「标记已读」swipe default→warning |
| T4 暗色字阶/对比度 | `.avatar` 字色改 `--dshm-stamp-ink`（双轨恒定纸白）；home「75」徽标暗轨深字；用户头像 on-brand 例外 |
| T5 圆角统一 | composer 槽直接 `border-radius: r-seal`（TextArea 不消费 `--border-radius`）；返回按钮次墨暖化；work entryLink 焙边加深 |
| T6 溢出与截断 | work capsule caption 字号 + wrapper `flex:none` 自然横滑 + 尾缘渐隐；agents 名行让位；alerts ID 收缩省略 |

## B3 复拍复审（验收锚点）

- 报告：[`w10-b3-vision-reaudit.md`](w10-b3-vision-reaudit.md) / [`w10-b3-vision-reaudit.json`](w10-b3-vision-reaudit.json)（含新 P0 裁决 ×3、P1 台账 ×6、P0 逐条闭环表）
- 复拍矩阵：`w10-b3-*.png` ×22（+work-375-light 于 entryLink 修复后重拍）
- before/after 并排：[`w10-b3-before-after-home.png`](w10-b3-before-after-home.png) / [`w10-b3-before-after-files.png`](w10-b3-before-after-files.png) / [`w10-b3-before-after-work-dark.png`](w10-b3-before-after-work-dark.png)
- DOM 断言：[`w10-b3-dom-verify.log`](w10-b3-dom-verify.log)（12/12：button outset=0 / roster 37 卡 88px / 工业蓝零命中 / 暗轨胶囊 / 章字纸白 / 徽标深字 / composer 999px / 胶囊可滑）
- 原始 VLM 响应：`.audit-raw-b3/`；聚合：`.w10-b3-audit-issues.json`
- 脚本：`.shoot-w10b3.mjs` / `.audit-w10b3.mjs` / `.dom-verify-w10b3.mjs`

## B4 回归收尾

- ui-mobile 全量 spec：692/692（含 tokens-integrity、断言随色值 var 化连动更新）
- W9 B4 gate 19 项复跑：ALL PASS（阈值型断言对柿橙链接阶仍成立）；log：`w10-b4-gate-rerun.log`
- W8 可达性语义：focus-ring/触控/对比度未回退（gate 1–11 项全绿，暗轨只升不降）
- 文档：ui-mobile README 双语（W10 锚点档退役 + button reset 全局策略 + 暗轨 adm 映射）；Agent Note：`implemented/process/2026-10-05-w10-vision-audit-pipeline.md`（视觉模型审查管线方法论）
