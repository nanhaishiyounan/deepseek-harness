# Agent Note: W11-R4 终验登记项清偿——记账归因、披露三族、sweep 留痕 spec、收紧的聚合探针、发送失败 Toast 锚、横屏锚

Status: implemented

[English](2026-10-06-w11r4-advisory-clearance.md) | 中文

## 问题

W11-R3 终验收口 PASS_WITH_DEBT 87.3（Go-live 放行）；报告登记 4 条 ADVISORY + 2 条顺手 OBSERVATION，六项全部骑在 R3 自己的面上：

- **R3 记账归因了一笔从未发生的新增**：INDEX R3 与 R3 note（中英）声称 754/754「新增 views 登出披露 1、composer maskClassName 1」——R3 commit 的 it/test 增量为 0（断言并入既有用例）；静态计数 673（R1）→ 684（R2，+11）→ 684（R3，+0）。R2 记账 745 与 754 之间的差 9 是计数口径而非低报（R5 对本行自己早先读法的勘正）：754 惯例口径 = ui-mobile 加 ui-mobile-preview 包恒定的 9 个测试（mobile-v3 首现、v6 重写后仍 9），745 则是 R2 期 tests/ 窄口径命令跑出的纯 ui-mobile 数字。R2 期真实新增 11（743→754）。
- **登出披露只点名三族中的两族**：弹窗说「本地草稿与待发消息将被清除」，而清扫同样清附件条；同页数据行说「本机仅保留主题与输入中的草稿」——一页两说法。
- **`session-keys.swept` 没有 jsdom 断言**：留痕此前只由活体探针断言。
- **R3-1a 的二选一 OR 让聚合从未被证明**：活体探针在单文件 doc input 上选两次——两次 pick 按构造就是两批，wire 层 stub 又让两个响应各成网络事件，第二个 toast 顶替第一个；OR 把幸存者读成了批次。
- **发送失败瞬时 Toast 无 lift**（OBSERVATION）：`ErrorToast` 裸锚底部，而批失败 Toast 挂 lift。
- **150px 竖屏锚在横屏失效**（OBSERVATION）：844×390 实测 +11/−10px。

## 决策

- **记账按静态计数收口**：INDEX R2/R3 与两份 note 的记账行统一为 754/754 + R2 期归因（+11）；R3 行写明断言并入既有用例；R5 后续分离了两口径（差 9 是 preview 包的恒定 9，非低报——见 W11-R5 note）；`verify-translation-pairing --write` 重录两对 note。
- **披露点名三族**——「本地草稿、待发消息与附件将被清除」——数据行读新的 `DATA_NOTE` 常量（行与弹窗单源）：「本机仅保留主题等偏好，草稿、待发消息与附件为登出即清的暂存」；views spec 双钉。
- **sweep 留痕有 jsdom 断言**：local-keys spec 的登出用例 spy `console.info`，恰一条 `session-keys.swept`，钉 type/count/keys（count === keys.length、两个种子键在场）。
- **R3-1a 收紧为 && 且探针真证聚合**：multiple 相册 input 一次双选（相册 input 带 `multiple`；doc input 单文件）在一个 change 事件里发出两个 pick，探针在页面内应答 `data.describeImage`——两个失败同一渲染趟落定（wire 层 stub 排不出这种时序：每个响应各成网络事件）。/api wire 本就是部署的 stub 面；无产品 seam 被 stub。收紧后的 R3 脚本复跑 6/6，弹窗文案同步三族。
- **`ErrorToast` 挂与批失败同一个 `toastLift` mask**（锚对齐，composer spec 断言 maskClassName）。
- **横屏锚是 orientation 媒体查询 175px**：横屏视口把附件条顶轨挤得离底更远，底缘再抬 25px；844×390 实测 clearance 36px。

## 后果

ui-mobile 755/755（惯例口径；纯 ui-mobile 包为 746，preview 包恒定 9 构成差——两口径定义为 R5 所补），R4 期新增：composer 发送失败锚 1；views 披露/数据行与 local-keys 留痕断言并入既有用例。`tsc -b tsconfig.client.json` 绿、改动文件 oxlint 0 errors。活体验证 `w11-r4-live-verify.log` 8/8，跑在重建的 :3080 dist 上（identity 种入、nocobase 弹回照旧隔离）：横屏聚合 Toast 点名两个失败附件且 clearance 36.0px、computed bottom=175px；拒绝发送的 Toast 挂 lift 类且 computed bottom=150px（rect 实测离底 150.0px——发送终态的 `finalizeSend`/`lane.clear` 在 toast 出现前清空附件条，共享面是锚而非条 clearance）；数据行与弹窗三族逐字一致。收紧后的 `.verify-w11r3.mjs` 复跑 6/6（log 覆盖重写）。截图 `w11-r4-{01-landscape-toast-clearance-844, 02-sendfail-toast-anchored-375, 03-logout-disclosure-three-families-375}.png`。

## 备选方案

- **calc() 比例锚（视口高换算）**——附件条带几何随朝向不同（横屏 composer 带更高），比例换算不保证 clearance；朝向查询按实测值钉住每个面。
- **聚合留在 jsdom spec（它本来就喂真批次）**——活体探针就永远不证聚合路径；收紧的 && 断言加同 tick 探针才让「点名全部失败附件」有意义。
- **`ErrorToast` 维持裸底锚**——发送清条后 toast 确实无条可压，但两个失败 toast 共一个锚才是惯例；对齐只花一个既有 maskClassName 的展开。
