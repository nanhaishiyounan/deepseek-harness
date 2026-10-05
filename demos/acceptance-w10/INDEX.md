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

## W11 deferral（R4 收尾显式决策记录）

- **W7 别名尾段 73 处 var() 迁移（token-consolidation 批）**：B6 已把核心语义名（primary/foreground/muted/border/fs-*）清零到 §3 基础名，别名尾段（on-soft ×22、stroke-soft ×15、work-*/stamp-* 等，css `var()` 读共 73 处，见 `2026-10-04-w9-identity-server-side-injection.zh.md` B6 节）显式推迟至 W11。理由：P2 级过渡残留——别名声明保留在 `tokens.css` 兼容层，实值与基础名一致，无视觉回归风险；而 73 处 css 读点逐一改写需要独立的 token-consolidation 批次回归面（tokens-integrity 断言 + 双轨全页复拍），不适合搭车守卫收尾批。承接方式：W11 token-consolidation 批以本条为批次输入。
- **W11 视觉微调池 13 条（P2）**：B3 非同题新报处置表中「下批」态 13 条（X08/X10/X11/X13/X14/X15/X16/X17/X20/X21/X24/X27/X28；骨架节奏 ×1、对齐 ×4、间距/留白 ×4、字阶/行高 ×4）显式推迟至 W11。理由：P2 级微调，且多条为亚像素级判断需 DOM 量测支撑，需要独立批次的量测脚本与复拍回归面，与本批守卫清偿（gate/收口/断言）性质不同。承接方式：[`w10-b3-vision-reaudit.md`](w10-b3-vision-reaudit.md) 的 X 编号台账「下批」处置态即机读追踪（13 条 X 编号可直接 grep），W11 微调批逐条销账。
- **nb_create 对 wfl_approval_todos 的直建入口**：R4 给 nb_update 补齐 acting-user gate（未绑定拒 + owner 断言，W9-R1 同构）后，nb_create 直建 todos 行仍无 owner 语义约束。裁决记录：todos 的生命周期归审批引擎——nb_approve 的 create/complete 经 client 直连写、不经过 nb_create，对话内模型直建 todo 无产品消费面；若 W11 需要开放模型直建，先裁决 user 列的 owner 语义（强制 acting 覆盖或整体拒绝直建）再动代码。
