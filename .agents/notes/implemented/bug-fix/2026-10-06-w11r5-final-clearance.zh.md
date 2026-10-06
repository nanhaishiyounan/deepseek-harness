# Agent Note: W11-R5 终批清偿——计数口径勘误与机器复现、快照式键清扫、chat Toast 锚统一、验收叙述闸

Status: implemented

[English](2026-10-06-w11r5-final-clearance.md) | 中文

## 问题

W11-R4 终验收口 PASS_WITH_DEBT 88.3（Go-live 放行），登记 1 条债 + 3 条顺手项；R5 全部清偿：

- **D-1：记账把差 9 归因错了**。INDEX 与 R4 note 把 R2 的 745 读成 754 的低报；差实为计数口径。机制在造复现脚本时浮出：vitest CLI 的路径参数是子串过滤——`packages/client/ui-mobile` 连带命中 `packages/client/ui-mobile-preview/…`，惯例命令从 W11 之前就一直包含 preview 包恒定的 9 个测试（mobile-v3 commit 15ca104ab8 首现、v6 重写 1654107d68 后仍 9）。R2 自己的 745 是其 tests/ 窄口径命令跑出的纯包数字；R2 期真实新增 11（743→754）。
- **登出清扫边删边走活集合**：`sweepSessionKeys()` 倒序迭代 `localStorage.key(index)` 并在循环内 remove——纸面正确，但遍历读的是被自己再索引的集合；快照式先定死名单再删。
- **chat 输入面的 Toast 骑两个锚**：批失败与发送失败 Toast 经 `css.toastLift` 抬升（W11-R3/R4），而上传中拦截（ChatView）、语音车道错误（ChatView）、环境不支持语音提示（QuickPanel）、两个 pick 护栏（attachments）是裸 `Toast.show`。
- **验收叙述没有机器闸**：「R2 期实增 11」这类措辞活在 INDEX 里，没有任何机制把它对照到它描述的文件与 git 历史。

## 决策

- **INDEX 篇首定义计数口径**（一段，两个数字、恒 9 出处、复现脚本路径），R2/R3/R4 记账行重述勘正归因；w11r4 note（中英）同行勘正；`verify-translation-pairing --write` 重录该对。`demos/acceptance-w11/scripts/count-ui-mobile-tests.mjs` 以显式 tests/ 路径跑 vitest 复现两口径（纯口径必须钉 `packages/client/ui-mobile/tests`——子串行为正是惯例口径的成因），产物 `w11-r5-test-count.json`；每口径一次重试吸收满载 jsdom 超时，不掩盖第二次失败。
- **清扫先快照**：`Object.keys(localStorage)` 先定死名单，删除针对冻结名单执行。local-keys spec 的清扫用例扩为 12 个会话键（三族）+ 5 个无关键：12 全删、5 个 byte-identical 存活。
- **`chat/toast.ts` 是 chat 输入面的唯一锚**：`hoistToast({ content })` 以 bottom 位置 + `toastLift` mask 展示；ChatView（两处）、QuickPanel（一处）、attachments（两处）、Composer（批失败 + ErrorToast，两处手写展开收编）全部经它。`toast-anchor.client.spec.tsx` 钉运行时锚选项，并静态扫描 chat 输入面源码断言 helper 之外无 `Toast.show` 调用。
- **`verify-acceptance-narrative.mjs` 机械化闸叙述**：每条 claim 是 `{claim, file-glob, must-contain|absent}` 三元组，加可选 commit 事实断言（对照 `git show --name-status`——裸 `--stat` 截断长路径，闸自己的首跑就抓到了这一点）。R5 批 6/6 通过（`w11-r5-narrative-check.log`），含两条 commit 事实：R2 commit 动了 ui-mobile 的 tests 而未动 preview 包；preview spec 首落于 mobile-v3 里程碑。

## 后果

ui-mobile 757/757（惯例口径；纯包 748 + preview 9；新增 toast-anchor 2；12+5 清扫 fixture 替换原 3 键用例、计数不变）、`tsc -b tsconfig.client.json` 绿、改动文件 oxlint 0 errors。复现脚本数字与全量实测（757）互证并钉住 delta=9。一处满载 flake 与改动面无关：`views.client.spec.tsx > rejects from the review card…` 在两次并行全量里以 5017ms 擦过 5s 超时线；单文件 106/106 三连绿。

## 备选方案

- **保留倒序遍历**——按文档化的再索引行为它是正确的，但快照把同一契约直说，不要求每个读者重新推导「倒序边删为何安全」；spec 的 byte-identical 存活断言钉住更强的性质。
- **全应用 40 处 Toast 全抬升**——chat 屏之外的 toast（home、alerts、work）不与 composer 带竞争；锚的域是 chat 输入面，静态扫描钉住正是这条边界。
- **把 R5 claims 写死进闸脚本**——JSON claim 文件让闸保持通用，claims 本身作为证据可审。
