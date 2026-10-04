# Agent Note：W7-B6+M3 终验（114 页全量收口、禁色终局、W6 零回退复跑、mobile 暗轨收官）

Status: implemented

[English](2026-10-04-w7-b6-m3-final-verification.md) | 中文

B6+M3 是 W7 全站美学重设计的收官批：mobile 暗轨全量精修与对比度修复，加上 PC 终验——后者的职责是在同一个时点重新挣得此前各批做过的每一项声明。

## Problem

W7 的声明散落在不同时点的各批证据里；收官需要在一个时点重新挣得全部声明，且 mobile 暗轨还有三条未了腿（全量走查、work-detail 补拍、触屏亮变体令牌）。

## Decision

- **终验 after 集是全新一次成拍，不是拼贴。** 114 页面单元（111 flowPage + 3 v1）单次走查重拍（`.w7b6-shot.mjs after all`，114/114）落入 `research/2026-10-03-w7-rework/b6/after/`；各批验收 PNG 原地保留，索引（`after-index.md`，`.w7b6-index.mjs` 生成）逐单元标注三方来源——B6 终验图、B0 before、改造批次图——逐行带链接，零缺口容忍（任何 MISSING 以粗体渲染）。
- **禁色终查扫 computed style，而非只扫内联属性。** B5 probe 读的是 `style=""` 属性；B6 probe（`.w7b6-probe.mjs`）在全部 114 页遍历每个元素 computed 的 `color`/`backgroundColor`/`borderTopColor`/`borderLeftColor` 比对七色禁色表，23 个 B5 域结构断言原样复用 B5 的 `probePage` 函数体（从 `.w7b5-shoot.mjs` 提取、页内经 `new Function` 执行），三个引擎侧 iframe 目标以顶层访问探测——13110 对 13000 跨源，父页读不到内嵌 DOM，同 URL 顶层加载即等价可见面。
- **antd Badge preset 色与 Tag preset 是两类独立泄漏。** 层 2 的 `.ant-tag-*` 覆写从未触及 `.ant-badge-color-*`（状态点走 `--ant-badge-color`）；全站走查抓到任务看板 cyan 点，修复是 globalStyle 再加一段把全部 badge preset 映射到同一组语义配对，经 `w7b0-theme.mts --apply` 生效（层 2 保持唯一入口）。
- **建页脚本只建不更，已部署的 JSBlock code 会比源码修正活得更久。** 库位平面图色板仍渲染 pre-W7 值，因为 `ensureBinMap` 对已存在块跳过；`w7b6-binmap.mts` 导出（已 token 引用化的）`BIN_MAP_CODE`，经 `BLOCK_UPDATE_CHANNEL`（=destroy+addBlock——存量 code 在服务端塑形的 stepParams.jsSettings 里，直接 updateSettings 写不进）销毁重建部署进 grid，B6 probe 再回读存量 code 断言零禁色。
- **暗轨 Tab 选中态获得独立 token。** 实测品牌色 `#2a5fa6` 对 `#131926` 底 2.75:1，低于 WCAG 1.4.11 的 3:1；整体提亮品牌色会破坏实底按钮白字，`--dshm-tab-active`（暗轨 #5783bc，4.5:1）拆出状态指示职责，仅 TabBar 覆写消费。
- **一个矩阵脚本、六条腿、诚实退出码。** `w7-b6-matrix.sh` 把主题断言 + 三条 heal 断言 + 114 页 probe + mobile 暗轨门槛汇总为 `w7-b6-matrix.log`；W6 零回退腿保持自有脚本（`w6-b10-matrix.sh`、`w6-b10-gates.sh`），归档为 `w7-b6-w6matrix.log` / `w7-b6-w6gates.log`。

## Verification

- `w7-b0-theme --assert` OK；`w7b1/w7b23/w7b4-heal --assert` OK（批次断言在终验时点重新挣得）。
- B6 probe 第二轮：114 页 computed 禁色全清、B5 结构断言绿、引擎页 `--w7-primary` = #1E4E8C（cards 终端 #5783BC）——首轮四行 "Too many arguments" 是 probe 脚本自身的 evaluate 参数数 bug，修复后跑出干净轮。
- `w6-b10-matrix.sh` 复跑：44 门 0 失败 MATRIX ALL PASS（归档 `w7-b6-w6matrix.log`）；`w6-b10-gates.sh` 复跑 B0~B9 断言腿（归档 `w7-b6-w6gates.log`）。
- mobile：暗轨 probe `theme=dark`、海拔差 23、正文 12.81:1、次文 5.74:1、边框差 14、Tab 12px、选中态 4.5:1（`w7-m3-14-dark-probe.json`）；vitest 复跑 668/668（首轮 1 例 draft→review 流转 flaky，复跑两连绿；两次输出尾部均留 `w7-b6-mo-vitest.log`，如实注明）。
- tab-active 构建后重拍暗轨 13 面 + light 13 面（`w7-m3-01..13`、`w7-b6-mo-01..13`）；work-detail 经真实路由 `#/work/:id`（从设备级工作存储读 id）成拍（`w7-b6-mo-08`、`w7-m3-08`）——最初几拍静默落在 agents 引导卡（工作列表第一个 button），图像复核抓出。

## Pitfalls pinned

- **已登录 SPA 在硬重载前无视 localStorage 变更**——`goto(同hash)` 保留内存会话，登录面永不挂载；变更后 `reload()` 才是可靠切换。
- **「点第一个按钮」不是路由。** 工作列表首个按钮是 AI 同事引导卡；详情拍摄脚本必须断言 URL 形态并逐个尝试，或直接从存储读目标 id 导航。
- **`page.evaluate` 只收一个参数。** 传 (fn, a, b) 会在页内抛 Playwright 自己的 "Too many arguments"——打包成单对象；踩中的四页是 probe bug 而非产品回归。
- **只建不更的供给脚本会冻结其部署产物。** 后续源码修正需要显式更新通道（此处 `BLOCK_UPDATE_CHANNEL` = destroy + `flowSurfaces:addBlock`，再回读）；只断言源文件会让禁色表保持绿灯而页面上仍是旧色。
- **computed 扫描能看到属性扫描看不到的东西。** 库位图与 badge 泄漏对 B5 内联 probe 不可见；终查就该用更严的仪器。

## Alternatives considered

- **拼贴各批 PNG vs 重新全量走拍** —— 一次 114 张成拍只费一个脚本且反映终验时点状态（含全部修复后渲染）；拼贴会把修复前的渲染冻结进「终验」记录。
- **暗轨品牌色全局提亮 vs tab-active 独立 token** —— 全局提亮破坏实底按钮白字对比；拆分 token 只花一个变量，让每个面各自满足其所需对比度。

## Consequences

- B6 索引、probe、矩阵三件成为 W7 验收基线，未来任何美学变更复跑即可；`w7b6-binmap.mts` 与 badge globalStyle 段扩充了层 2/3b 词汇表，供下一次 JSBlock 或 preset 色清理使用。
