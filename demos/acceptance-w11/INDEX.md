# W11 验收证据索引

W11 = B1（输入框精修 + 细节自发现）+ B2（加号真功能：语音/拍照/相册/文件）+ B3（收尾：视觉复审收敛 + 全量回归 + 文档）。计划 `plans/w11-mobile-composer-plus.md`。

## 测试计数口径（R5 定义，全篇适用）

「ui-mobile N/N」有两口径：**纯包口径** = 只跑 `packages/client/ui-mobile`（R4 时 746）；**惯例口径** = 连同 `packages/client/ui-mobile-preview` 一起跑（R4 时 755）。差恒为 preview 包的 9 个测试——首现于 mobile-v3（`15ca104ab8`），v6 重写（`1654107d68`）后仍 9，非 W11 任何一期新增。W11 各期记账均用惯例口径；两口径数字由 `scripts/count-ui-mobile-tests.mjs` 机器复现（产物 `w11-r5-test-count.json`）。

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

## R2 — LAN HTTP 交付障碍清偿（1 Critical 存量 + 3 卫生项）

- 修复面（R1 终验 PASS_WITH_DEBT 87.8 的 Go-live 前置）：① `newClientMsgId` 裸调 `crypto.randomUUID()`（w7 存量）改骑 `uid()`（去连字符取 8 位 hex nonce），`ChatView.send()` 的键构造移入 try 块——LAN HTTP 点发送不再 TypeError 死锁 composer；② attachments 持久化卫生对齐 outboxStore——try/catch + 结构化 warn（含 key 名）、quota 超限按 `savedAt` 驱逐最旧其他会话 strip 重试一次（version 1→2）、损坏/不合 schema 的 key 即删；③ Composer 批失败 Toast 聚合（一次 Toast 报全部 fresh failed：`N项附件上传失败：「a」原因A；「b」原因B`）；④ 新 `localKeys.ts` 单源 `MOBILE_SESSION_KEY_PREFIXES` + 登出 `sweepSessionKeys()`（draft/outbox/attachments 三族全清，theme/水位/置顶按设计保留）。
- `w11-r2-live-verify.log`（`.verify-w11r2.mjs`）：**9/9**，跑在真非 secure 上下文——`http://w11lan.test:3080` 经 Chromium `--host-resolver-rules` 映射 127.0.0.1（CLI 按设计拒绝非 loopback 绑定；/api 围栏 `--trusted-host` 加白），环境面实测 `isSecureContext=false` 且 `randomUUID=undefined` 零 stub；发送到达终态六断言（wire `m_` 前缀 clientMsgId / draft 清空 / turn 后 sending 复位 / 第二条异键再发 / history 落账）+ 非 secure 下附件 strip reload 回填 + 登出三类键全清且 theme 保留。
- 截图 3 张：`w11-r2-{01-lan-http-send-terminal, 02-attach-rehydrate-insecure, 03-logout-swept}-375.png`
- 测试：ui-mobile **754/754**（惯例口径 = 纯包 745 + preview 9；R2 期实增 11：743→754，新增 views LAN HTTP 终态 2 + attachments 卫生 4 + composer 批 Toast 1 + local-keys 4。原记 745/745 即纯包口径——R2 期 tests/ 窄口径命令的产物，数字真实、口径混用；R4 曾把口径差读成漏报，R5 勘正）· typecheck 绿 · oxlint 改动文件 0 errors。
- 构建链教训（复确认 build:lib:client 契约）：apps/web bare-import ui-mobile（main→`lib/`），源码修复必须 `pnpm run build:lib:client` 后再 vite build——首跑活体在新 dist 上服务旧 lib，忠实复现修复前崩溃。
- Agent Note：`.agents/notes/implemented/bug-fix/2026-10-06-w11r2-mobile-lan-http-blockers.md`（三件套）。

## R3 — Go-live 收尾微批（R2 终验 4 条小时级顺手项）

- 修复面（R2 终验 PASS 87.7 的 Go-live 建议）：① 计数勘误——三处「11/11」按 log 实测改「9/9」（本 INDEX R2 节 + R2 note 中英文同行；`w11-r2-live-verify.log` 实为 R2-0/1a~1f/2/3 九条）；② 登出披露——确认弹窗补「本地草稿与待发消息将被清除」（W11-R2 扩大清除面后的披露义务，views spec 加断言）；③ sweep 留痕——`App.onLogout` 消费 `sweepSessionKeys()` 返回值，`console.info` 单行 JSON（`session-keys.swept` + count/keys/at，对齐 outboxStore 观测口径）；④ 失败聚合 Toast 重锚——实测发现 antd-mobile bottom toast 打开态 `position:absolute` 且底缘钉死视口底部（inline `top:80%` 被覆盖只拉伸高度、rect.bottom 纹丝不动），故改 `bottom:150px !important` 重锚（`top:auto`），clearance=25px 且与 toast 高度无关（1~3 行皆稳）。
- `w11-r3-live-verify.log`（`.verify-w11r3.mjs`）：**6/6**（3080 重建 dist；页面 identity 以合法 shape 直种 localStorage——本批全部为纯前端行为，无产品 seam 被 stub；种 token 引发的 `nocobase-unauthorized` 弹回以 `not-composed` 拒答隔离）：R3-1 失败 Toast 在场点名附件 + 底缘清空附件条顶缘 ≥15px（clearance=25.0px）+ mask 带 lift 类且 computed bottom=150px；R3-2 弹窗披露逐字；R3-3 登出留痕 count=3 且 keys 含全部三类会话键；R3-4 auth 清除 theme 保留。
- 截图 2 张：`w11-r3-{toast-lift-clearance, logout-disclosure}-375.png`
- 测试：ui-mobile **754/754**（惯例口径；断言并入既有用例，本批 0 新增——R3 commit 的 it/test 增量为 0；「差 9」为 preview 口径差，见篇首口径定义）· `tsc -b tsconfig.client.json` 绿（随 build:lib:client）· oxlint 改动文件 0 errors。
- Agent Note：`.agents/notes/implemented/bug-fix/2026-10-06-w11r3-go-live-tail-items.md`（三件套）。
## R4 — 终验登记项清偿（4 ADVISORY + 2 顺手 OBSERVATION）

- 修复面（R3 终验 PASS_WITH_DEBT 87.3 的登记项）：① 计数归因勘正——R3「新增 views 登出披露 1 + composer maskClassName 1」失实（本 commit it/test 增量 0，断言并入既有用例；静态计数 R2 673→684 为 +11、R3 684→684 为 +0），INDEX R2/R3 行与 w11r2/r3 note 中英文同行统一按 754 收口（R4 当期把差 9 读成漏报，R5 勘正为口径差——见篇首口径定义），pairing 重录；② 登出披露补第三族——弹窗点名草稿/待发/附件三族，me 页「数据」行与披露同口径（新 `DATA_NOTE` 常量单源，行与弹窗读同一份），views spec 同步；③ sweep 留痕补 jsdom 断言——local-keys spec 的登出用例以 `vi.spyOn(console,'info')` 断言 `session-keys.swept` 的 type/count/keys 单行 JSON；④ R3-1a OR 改 &&——收紧后首跑即抓到真缺口：原探针两次单文件 pick 天然两批（doc input 无 multiple；wire 层两响应各成网络事件分 tick 落定），R3 的「聚合」实为第二个 toast 顶替第一个；探针改为 multiple album input 一次双选 + 页内 mock fetch 同 tick settle，聚合路径真实可证（「2项附件上传失败」点名两个），复跑 R3 6/6；⑤ 发送失败瞬时 Toast 挂同一 `toastLift` mask（与批失败 Toast 同锚，composer spec 加断言）；⑥ 横屏锚——844×390 实测 150px 锚仅 +11/−10px，`orientation: landscape` 媒体查询抬到 175px（实测 clearance=36px ≥15px）。
- `w11-r4-live-verify.log`（`.verify-w11r4.mjs`）：**8/8**（3080 重建 dist）：R4-1 横屏聚合 Toast 点名全部失败附件 + 底缘清空附件条 ≥15px（clearance=36.0px）+ computed bottom=175px；R4-2 发送失败 Toast（refused 路径）与批失败同锚（lift 类 + bottom=150px，rect 实测离底 150.0px）；R4-3 数据行与披露同口径 + 弹窗三族逐字。
- 收紧后的 `.verify-w11r3.mjs` 复跑：**6/6**（R3-1a 聚合断言、R3-2 三族新文案下全过；log 已覆盖重写）。
- 截图 3 张：`w11-r4-{01-landscape-toast-clearance-844, 02-sendfail-toast-anchored-375, 03-logout-disclosure-three-families-375}.png`
- 测试：ui-mobile **755/755**（惯例口径 = 纯包 746 + preview 9；新增 composer 发送失败 Toast 锚 1；views 披露/数据行与 local-keys sweep 留痕断言并入既有用例）· `tsc -b tsconfig.client.json` 绿 · oxlint 改动文件 0 errors。
- Agent Note：`.agents/notes/implemented/bug-fix/2026-10-06-w11r4-advisory-clearance.md`（三件套）。
## R5 — 终批清偿（R4 终验 D-1 债 + 3 建议顺手项）

- 修复面（R4 终验 PASS_WITH_DEBT 88.3 的全部登记项，lessons 6~9 配方）：① D-1 计数口径勘误——篇首新增口径定义段，R2/R3/R4 记账行与 w11r4 note 中英归因改为口径事实（差 9 = preview 包测试常量：mobile-v3 首现 `15ca104ab8`、v6 重写 `1654107d68` 后仍 9，非任何 W11 期新增；R2 期实增 11：743→754；R2 原记 745 即纯包口径）；机制侧发现 vitest 路径参数为子串过滤——`packages/client/ui-mobile` 连带命中 `ui-mobile-preview`，这正是惯例口径含 preview 的成因；`scripts/count-ui-mobile-tests.mjs` 以显式 tests/ 路径机器复现两口径（`w11-r5-test-count.json`：纯 748 / 惯例 757 / 差 9，与全量实测 757 互证）；pairing 重录。② sweep 快照式遍历——`sweepSessionKeys()` 倒序遍历改 `Object.keys(localStorage).filter()` 快照式（消除边删边走活集合的再索引面），local-keys spec 用例扩为 12 键（三族）全删 + 5 无关键 byte-identical 存活。③ Toast 锚统一 hoistToast——新 `chat/toast.ts` 单源 `hoistToast()`（bottom + toastLift mask），ChatView 两处（上传中拦截/语音错误）+ QuickPanel（环境不支持语音）+ attachments 两处（格式/张数护栏）+ Composer 两处（批失败/ErrorToast 手写展开收编）全部经它；新 `toast-anchor.client.spec.tsx` 双断言（运行时锚选项 + 静态扫描 chat 输入面无旁路 `Toast.show`）。④ 验收叙述闸——`scripts/verify-acceptance-narrative.mjs` 接受 {claim, file-glob, must-contain|absent} 三元组 + commit 事实断言（`git show --name-status`），本批 6/6 自验（`w11-r5-narrative-check.log`）；首跑即抓到两处真问题——INDEX 引述旧词「低报 9」自触禁词、裸 `--stat` 截断长路径（改 name-status）。
- 测试：ui-mobile **757/757**（惯例口径 = 纯包 748 + preview 9；新增 toast-anchor 2；12+5 清扫 fixture 替换原 3 键用例、计数不变）· `tsc -b tsconfig.client.json` 绿 · oxlint 改动文件 0 errors。
- 满载 flake 记录（与改动面无关）：`views.client.spec.tsx > rejects from the review card…` 在两次并行全量里以 5017ms 擦过 5s 超时线；单文件 106/106 三连绿；count 脚本按复现工具定位内置每口径一次重试。
- Agent Note：`.agents/notes/implemented/bug-fix/2026-10-06-w11r5-final-clearance.md`（三件套）。
