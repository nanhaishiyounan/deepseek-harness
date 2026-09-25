# Agent Note: 移动端 v6 R1——统一验证的修复迭代

Status: implemented

[English](2026-09-23-mobile-v6-uidesign-r1-fixes.md) | 中文

## 问题

对已落地 B1–B3 批次的统一验证报 69/100：snapshot 车道上一份过期的 packed-session-fixture 布局红、18 个 ui-mobile 文件共 163 处 per-file 覆盖缺口（per-file 100% 门禁从未在该批次上跑过），以及五项行为发现——我的页回执条以最旧的回执打头、同帧双击可开出两个会话（状态守卫在 React 批处理下读到批前闭包）、同事页的 busy 标志禁用整个花名册、演示态打字指示在回合结束后不清退（基线按原始事件计数而清退检查按折叠条目比较）。

## 决策

- **Fixture 迁移（C2）。** 经 `pnpm run migrate:packed-session-fixtures` 重写被编辑的 `apps/web/tests/snapshots/mobile-assistant/seed.jsonl`（连同三份姊妹种子）；`session-fixture-layout` snapshot 转绿，其他 snapshot 未动。
- **覆盖（C1）。** 163 处缺口以行为测试收口（11 个 spec 文件新增 33 例——置顶/取消置顶滑动行、带 offsetParent 桩的无限滚动分页、同帧双击锁、键盘进入选择器、v3 卡上的关系选择器、带重试的错误条、打字折叠回归、live 失败工具步骤、键盘弹窗臂），外加 `ColleagueVisual` 类型收紧：表项与兜底都带 `skills`/`status`，两字段改为必填并删掉四个死 `?? []`/`?? 'online'` 臂而非豁免。十个 v8 ignore 标记覆盖 jsdom 驱不动的臂（滚轮重选、下拉刷新手势、图片查看器滑动引擎、纯类型 `??` 兜底）；清单锁定在 905（净增 19 = B1–B3 未重锁的 9 + 本批 10）。
- **行为修复。** 回执条取「新者在前」集合的头部（`slice(0, 3)`，不反转）。WorkView/AgentsView 在渲染态旁持同步 `useRef` 启动锁，同帧两击不可能都过守卫；同事页 busy 标记锚定被点行（`startingId`），花名册其余行保持可用。打字基线与清退检查都按原始事件计数（折叠把工具调用/结果对并成单行，按条目数比较几乎永不清退）；一条 fold<raw 回归测试以原始 5→10、条目 2→4 对基线 5 驱动。
- **并发清理。** v3 幽灵按钮改用 `--dshm-on-soft` 作面色（暗轨软底把品牌文字抬过 4.5:1 地板；令牌在亮轨已存在）。HomeView 用告警条加重试链接把花名册与会话列表的失败态从空态中分离。`usePoll` 状态项引用同一共享刷新闭包（切换反正会重绑），WorkDetailView 的动作闭包移入已解析条目臂下，`?? ''` 路由 id 无兜底收窄。

## 备选与否决

- 拒绝按 client GUI 债务模式豁免剩余 18 文件覆盖缺口：ui-mobile 车道自 B1 起就以 per-file 100% 设门，债务豁免会掩住该批次自设门槛的回归。
- 拒绝保留 `ColleagueVisual.skills`/`status` 可选加四个 v8 ignore，选择类型收紧——表与兜底都填这两个字段，可选臂是死代码，且 ignore 预算（每批 10）装不下它们加真正不可测的臂。
- 查看器索引兜底 `at < 0 ? 0 : at` 换成 `Math.max`：语义相同、无分支可覆盖。

## 影响与后果

- `pnpm vitest run packages/client/ui-mobile` 610 例全绿（原 577）；包覆盖输出无 uncovered-location 记录（163 → 0）。仓库 typecheck、lint（0 警告 0 错误）、build（220 client artifacts）与 web e2e 三件套（mobile-shell / mobile-assistant / mobile-preview-iframe，13 例，含协议不可见性负断言）保持绿。
- 真实链路（fold/围栏 v:3/九人花名册/四态/runMode/nb_create/RPC）零触碰；对 diff 的 grep 确认无协议侧改动。
- 递延（未变，重述验证报告的债务清单）：令牌族补全（`--dshm-primary-20/35`、阴影/圆角令牌）、`<think>` 过滤器、lib/ 里的过期 CSS 产物、MessagesView 搜索的过期窗口/PullToRefresh 等待、ProfileView 快捷入口 toast。新递延项：同帧双击锁按视图持有而非按行——跨行并发创建由单一启动槽阻止，与产品「一次一会话」的流程一致。
- 截图证据：`research/2026-09-23-mobile-v6-uidesign/r1-01-chat-receipt-light.png`（b3-04 亮轨复拍）与 `r1-02-typing-cleared.png`（回合落定、呼吸指示清退），由 `.shoot-r1.mjs` 对 `:3080` 驱动。
