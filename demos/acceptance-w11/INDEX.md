# W11 验收证据索引

W11 = B1（输入框精修 + 细节自发现）+ B2（加号真功能：语音/拍照/相册/文件）+ B3（收尾：视觉复审收敛 + 全量回归 + 文档）。计划 `plans/w11-mobile-composer-plus.md`。

## B1 — padding 量测修复 + focus 态

- `w11-b1-padding-probe.json` / `.probe-w11b1.mjs`：修前/修后活体几何（3080 dist 实测）。修前：padT=0、lh=24（引擎默认）、单行 topGap=1/bottomGap=25（文字贴顶）、胶囊 50px；修后：wrapper padding 10.5/18、lh=22、单行 textVsWrap=**0px**（topGap=bottomGap=11.5）、胶囊 45px、多行 22px 步进（67/89/111）、>4 行内部滚动；focus 双轨 brand 边 + soft halo 实测值在 JSON
- `w11-b1-shoot.log`：交互态八矩阵 DOM 断言（聚焦/fill 闪帧/running/键盘钳制全 PASS）
- `w11-b1-regression.log`：W9 fillDraft 语义 + W8 可达性 11 路由。B1/B3 两次运行的 A1–A4、A6–A9 与 B 11 路由全过；A5 报 FAIL 是探针量错元素——读的是 textarea 外层 inputShell，而 data-fill 挂在 inputRow（产品 fill 闪烁实际在挂载，无回归）。W11-R1 修正探针选择器（`.closest('div[class*="inputRow"]')`）后复跑 A0~A9 + B 全绿
- 交互态八矩阵 10 张 `w11-b1-ix-*.png`；路由矩阵 21 张 `w11-b1-*.png`（`.shoot-w11b1-routes.mjs`）；修复面复拍 4 张 `w11-b1-fix-*.png`

## B1 — 视觉管线自发现

- `w11-b1-vision-audit.md`：审查报告（P0=0 / P1 台账 6 ≤7 / 微调池 13 条对账：销账 9 · 留池延批 4）
- `.w11-b1-audit-issues.json`：334 条 raw × 四态机读台账；`w11-b1-audit-run.log`（31/31）；`.audit-raw/`
- `w11-b1-dom-verify.log` / `w11-b1-fix-reshoot.log`：P0/P1 候选 DOM 取证与 F1/F2/F3 复拍断言

## B2 — 加号真功能（语音/拍照/相册/文件）

- `w11-b2-evidence.log`：活体证据链——面板车道（headless 四格）、聆听卡 + 引擎错误退场、图片经 `data.describeImage`（VLM live，回答回读四统计数）、pdf 经 `data.extractText`（回答回读 128）、空 txt failed chip + 移除 ×、暗轨面板 + 附件条、X20 真回合工具行
- 面 12 张：`w11-b2-{panel-375-light, panel-attach-dark-375, attach-uploading/ready-image/ready-pdf/failed-375-light, voice-listening/voice-error-375-light, image-send-draft/image-turn-answered/pdf-turn-answered-375-light, x20-tool-tag-375-light}.png`
- 脚本：`.shoot-w11b2.mjs` / `.shoot-w11b2b.mjs`（分段防搁浅）
- 调研卡：`research/2026-10-05-w11-composer-plus-research.md`（R1 语音三态矩阵 / R2 云 ASR 与 VLM 端点实测 / R3 面板形态盘点 / R5 seam 接线图与 T1/T2 裁决）
- 测试：attachments 9 + voice-input 6 + quick-panel 10 + data-attach 9（新 spec 合计 34）+ composer-skin X20 钉（`packages/client/ui-mobile/tests/` + `packages/host/apiproxy/tests/data-attach.spec.ts`）

## B3 — 视觉复审收敛 + 全量回归

- `w11-b3-vision-reaudit.md`：B2 新面 12 张 + 关键路由快扫 6 张过 VLM（18/18），P0 raw 22 全驳回 → **0 开放**；新引入 P1 **0**；B1 台账 6 条规格复报延续（9 raw 归 ledger，无恶化）；P2 池 62。机读四态：`.w11-b3-reaudit-verdicts.json`（`.verdicts-w11b3.mjs`）
- `w11-b3-dom-verify.log`：placeholder 6.42:1 / 聆听卡 13.43:1 / 暗轨面板卡 rgb(42,34,28) / attachChip 自绘证据 / 三件套中心 781/781/779
- `w11-b3-baseline-diff.log`：W10/B1 基线像素对比——home 双轨 <0.9%（动态数字区单带）、chats 顶栏零 diff（列表位移为 B2 活体会话的数据性差异，非视觉回归）
- 快扫脚本：`.shoot-w11b3-routes.mjs`（6 张 `w11-b3-*.png`）；审计 `.audit-w11b3.mjs`；diff `.diff-w11b3-baseline.mjs`
- 回归：ui-mobile **728/728** · apiproxy **488/488** · connection+runtime **461/461** · typecheck 绿 · W9-B4 light probe **19/19**（复跑更新 `demos/acceptance-w9/w9-b4-light-probe.json`）· W9 fillDraft 语义探针 A1–A4/A6–A9 + B 路由 11 过（A5 FAIL 为探针选择器量错元素，非产品回归——措辞在此更正，选择器 W11-R1 修正后复跑全绿）· oxlint 新增/改动文件 0/0（B2 批已过，B3 未新增源码改动）

## 真机语音验证清单（OQ-2 · 用户回填）

**[w11-b3-voice-realdevice.md](w11-b3-voice-realdevice.md)** — 5 分钟清单：A 微信内（预期**三格无语音**——这是契约在工作，非 bug）/ B Safari 直开 / C Chrome 直开 / D 局域网 HTTP 降级（预期三格）。headless/桌面 green 不等于真机 green，结论以本清单回填为准。

## Deferral 记录（→ W12 池）

| 项 | 判定依据 |
|---|---|
| Office 文件（docx/xlsx）解析 | mammoth/sheetjs 解析面重（调研卡 F-2，OQ-4）；服务端 `extractDocxText` 已存在但移动端 wire 面未开 |
| 微信 JS-SDK 录音车道 | 准入成本（公众号认证+签名服务+域名备案），锚点对照（调研卡 R2） |
| sherpa-onnx 端侧 ASR | 云 ASR 型号未确证前不并轨端侧（调研卡 R2） |
| 多模态 T2（图片 part 直发） | wire + `admitEncodedImages` 管线 100% 现成；启用条件 = 组合内出现吃图的 provider/model（MiniMax VL 接入或 vision provider 挂载），届时纯增量 |

## 遗留（如实记录，不属本批）

- **views me-tab 跨包 flake**：并行全仓跑时偶发 `no stub for agentPreset.list`（stubGateway teardown 竞态，B2 记录；ui-mobile 单包全量 728/728 稳绿，跨包并行下偶发）——pre-existing，非 B2/B3 逻辑。
- **w8-b1 遗留光探针**：`demos/acceptance-w8/w8-b1-light-probe.json` 对 W9 Sauce-Amber token 的 2 项对比门失败（被 w9-b4 探针取代，B2/B3 未触碰）。

## R1 — 终验修复批（1 Critical + 5 Important）

- 修复面（终验 FAIL 80.5 的六项窄修复）：F1 outbox 附件双发——`finalizeSend()`（清 draft + lane.clear）统一挂在三个发送终态（在线成功/入队/拒绝），离线入队后 chip 不再残留、恢复补发文字不再二次带 📎；F2 新增 `uid()`（randomUUID 缺失时 16 字节 hex 兜底）替换 attachments 两处 + rpc rpcId 三处裸调用；F3 failed chip 错误行并入 chip 内第二行（flex-basis 100% + caption token）+ Composer 对新 failed 行一次性点名 Toast；F4 `canSend`（非空 draft 或 ready 附件，且非 sending）单源同绑发送钮与 Enter；F5 ready 附件按会话域持久化（`dsh-mobile-attachments-<sid>`：visibilitychange→hidden 与 pagehide 写入、挂载回填、clear/remove 同步清）；F6 即本节上方两处措辞更正与探针 A5 选择器修正。
- `w11-r1-live-verify.log`（`.verify-w11r1.mjs`，3080 活体 dist）：**16/16** —— T1 离线发→恢复：附件 chip 不残留（attachRow=0）+ wire 幂等（3 次尝试同一 clientMsgId）+ history 恰 1 条带 quote + 补发纯文字 wire/history 均无附件；F2a 错误行几何在 chip 内（errTop=725 ≤ chipBottom=748，轨道内不剪裁，字号 12px）；F4 空 draft+ready 附件激活发送钮；F10 randomUUID stub undefined 下登录与附件链路均 ready；F5 reload 后 ready 附件回填。
- 截图 5 张：`w11-r1-{t1-offline-parked-no-lingering, t1-recovered-history-single-quote, f2-attach-error-visible-in-chip, f4-send-armed-attach-only, f10-uid-fallback-attach-ready}-375.png`
- 测试：ui-mobile **743/743**（新增 composer.client 7 + uid 2 + attachments 4 + composer-skin CSS 契约 1 + views outbox 双发 1）· apiproxy **488/488** · typecheck 绿 · oxlint 新增/改动 0/0。
- **business-advisor 存量 YAML 损坏（B3 顺手修复）**：`agent-presets/business-advisor/agent.cordis.yml` 32~34 行缩进 6→7 空格（`bad indentation 32:6`，mount 失败，非 W11 引入）；源与 `.dsh/` 运行时副本均已修复并 parse 验证。
