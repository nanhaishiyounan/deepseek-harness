# 批次 D5：图谱「真实鼠标单击」证据闭环 —— playwright headed + video + 实例 API 反算坐标

> 隶属 [PLAN.md](PLAN.md)。前置：无（独立脚本，零产品代码改动）。技术债④收口批。

## 背景与考古结论

- C6 闭环2 已用 `sigma.emit('clickNode')`（fiber 定位 rendererRef）打通**下游渲染链**（select→详情卡→高亮环，证据 [c1-graph-click-select-details.png](../../examples/kb-agent/demos/acceptance-c1/c1-graph-click-select-details.png)），但未证明**真实输入链**；
- C1 更早的 headless playwright trusted 点击 55px 网格全画布扫描**零命中**（[capture.mjs:109-137](../../examples/kb-agent/demos/acceptance-c1/capture.mjs:109)）；
- **归因修正（R4 源码级）**：sigma@3.0.3 `MouseCaptor` 不检查 `isTrusted`（handoff「sigma 只认可信输入」表述不准确，本批顺带修正 [handoff-2026-09-10.zh.md:23](../handoff-2026-09-10.zh.md:23)）。真实失败机制双层：
  1. **命中层**：命中判定 = WebGL picking framebuffer 读像素（`getNodeAtPosition`→`getPixelColor`），headless/软渲染下常读零色 → 永远判为 clickStage；
  2. **元素层**：C6 会话的「周期性 remount」源 = **HMR 链**（[cordis.patch.yml:154-157](../../packages/bundle/web-app/cordis.patch.yml:154) 常驻 client-hmr；host 侧 500ms stat-poll [hmr/src/index.ts:32](../../packages/client/hmr/src/index.ts:32) → SSE `rebuilt` → ui-kg 条目热重载重建画布）——验证与构建并行时必然竞态。产品代码本身无定时 remount（walk/expand/typeFilter 是仅有的三条用户触发路径）。
- 推论：**真实 GPU headed + 静态 dist（无构建并行）下，trusted 点击 + 正确坐标应能命中**——两个历史失败条件均可消除。

## 方案（自动化，思路 B + 思路 A 前提）

新脚本 `examples/kb-agent/demos/acceptance-d5/kg-real-click.mjs`（放本轮 demos 目录；60-80 行，复用 [capture.mjs](../../examples/kb-agent/demos/acceptance-c1/capture.mjs) 起页骨架 + createRequire playwright 模式）：

1. **前置**：`DSH_BUILD_CLIENT_PROFILE=official pnpm run build`（含 `build:lib:client`/`build:web`）完成且**无任何 watch/构建进程并行**（hmr 链 idle）；长驻 :3080 网关重启后探活；
2. `chromium.launch({ headless: false })`（真实合成器，picking 有效）+ `browser.newContext({ recordVideo: { dir } })`；
3. **坐标不走网格扫描**：evaluate 内经 React fiber 定位 rendererRef 取 sigma 实例（C6 已验证路径）→ `graph.getNodeAttributes(id)` 取目标节点 x/y → `sigma.graphToViewport({x,y})` → 加 canvas `boundingBox` 偏移 = 节点中心视口像素坐标；
4. 点击前截图 + 读 `detailsName` 基线 → `page.mouse.click(x, y)`（CDP Input 域 trusted）→ 轮询断言 `detailsName` 变为目标节点名 → 点击后截图（详情卡 + 邻域高亮环可见）；
5. **稳定性窗口**（思路 A 兜底）：点击前等待 canvas 元素集与 `boundingBox` 连续两帧（双 rAF）不变，消除用户触发 remount 后的坐标漂移；
6. **证据四件套**落 `examples/kb-agent/demos/acceptance-d5/`：点击前截图、`video/*.webm`、点击后截图、PASS/FAIL 退出码 + detailsName 前后文本记录；
7. **不进 `test:web` 门禁**（CI 无头无 GPU，picking 不可靠；保持 demos 人工触发定位——与 C1/C6 证据形态一致）。

目标节点选取：任一有邻域的实体节点（如「周慕云」同款，与既有证据可比对）。

## 验收断言

1. 脚本 EXIT=0：真实 trusted 单击后 `detailsName` 变为目标节点、详情卡与高亮环可见（截图比对）；
2. 四件套证据文件存在（ls 可查）；
3. 首轮 1 小时内若失败（picking 仍不命中）：降级思路 C 人工 SOP——headed 手动单击 + ⇧⌘5 屏录 + 前后截图 + 详情卡文本抄录，归档同目录，handoff 注明证据形态为人工（技术债④仍算闭环，标注自动化受环境限制）；
4. [handoff-2026-09-10.zh.md](../handoff-2026-09-10.zh.md) 0.b「剩余人工复核项」更新：引用新证据关闭技术债④，并修正「sigma 只认可信输入」归因表述为「命中判定依赖 WebGL picking + remount 竞态」（源码依据写进备注）。

## 风险

| 风险 | 等级 | 预案 |
|---|---|---|
| headed 下 picking 仍不命中（环境 GPU 差异） | 中 | 思路 C 人工 SOP 兜底（1 小时时限） |
| fiber→rendererRef 路径因 C1 后组件重构失效 | 低 | C6 路径未依赖已删代码；失效则按 data-testid 定位容器后取子 canvas 坐标 + 邻近节点逐个尝试 |
| video 编码体积 | 低 | recordVideo 默认 webm vp8，可接受；不转 GIF（[record-browser-gif](../../.agents/skills/record-browser-gif/SKILL.md) 技能仅在需要 PR 附件时用） |

回滚：纯新增脚本 + 文档更新，删除文件即回。
