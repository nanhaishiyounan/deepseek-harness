# 批次 C1：图谱画布 UX 治理（滚动链 + 屏幕适配 + 交互补齐）

> 隶属 [PLAN.md](PLAN.md)。前置：无。本批全部前端改动（packages/client/ui-kg + 可能一处 packages/client/ui-conversation）。回滚 = revert 本批提交；CSS/组件改动无数据面影响。

**目标**：用户的三句投诉逐条落地修复——"滚动错乱"（滚动链治理）、"屏幕适配不行"（resize 跟随 + 响应式断点）、"交互根本不行"（缩放界限/节点拖拽/控件/选中高亮/相机保留）。

## 根因（实施前必读）

三层根因的完整机理与证据链见 [PLAN.md §1.1](PLAN.md)。要点：

1. kg 视图走默认 viewArea 模式（[ConversationRoot.module.css:251-254](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css:251)），框架提供的自管滚动通道（overlay 模式，[ConversationRoot.module.css:277-297](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css:277)，先例 [TrajectoryView.tsx:447](../../packages/client/ui-trajectory/src/client/TrajectoryView.tsx)）未被使用 → `.page` 永不溢出（死滚动容器）、flex 链断、画布恒 ≈300px、整页滚动发生在 scrollBody（含 sticky composer）。
2. sigma 只听 window resize → 侧栏 grid 拖宽（[AppFrame.tsx:40-84](../../packages/client/ui-layout/src/client/AppFrame.tsx)）不触发画布重绘。
3. sigma 构造（[KgGraphCanvas.tsx:86-91](../../packages/client/ui-kg/src/client/KgGraphCanvas.tsx)）未设缩放/平移界限；无节点拖拽（sigma v3 不内置，需 `downNode` + 坐标换算手写）；无控件；`selected` prop 只作用于降级列表（WebGL 路径选中无视觉反馈）；useEffect 依赖数据数组导致过滤/游走切换整实例重建（[KgGraphCanvas.tsx:103](../../packages/client/ui-kg/src/client/KgGraphCanvas.tsx)）。

## 改动面

### 第 0 层：滚动链治理（CSS + 一处属性）

1. [`KgView.tsx`](../../packages/client/ui-kg/src/client/KgView.tsx) 视图根节点（:129 附近）加 `data-conversation-composer-overlay=""`，复用 [ConversationRoot.module.css:293-297](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css:293) 既有通道：`.viewArea { flex:1 1 0; min-height:0; overflow:hidden }`。**先实测**该形态下 composer 行为（对照 trajectory 页：composer 变 overlay 悬浮）；若副作用超预期（composer 遮挡不可用），fallback：在 [`ConversationRoot.module.css`](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css) 新增 `.viewArea[data-view-scrolls]` 同款规则 + KgView 改用该标记（跨包改动在 Agent Note 登记裁决理由）。
2. [`kg.module.css`](../../packages/client/ui-kg/src/client/kg.module.css)：
   - `.canvasViewport` 补 `max-height`（如 `min(62vh, 100%)`）防竖屏画布占满全屏；
   - `.mainSplit` 加窄屏断点（≤900px 纵向堆叠，与 [entry.module.css:83-87](../../packages/client/ui-kg/src/client/entry.module.css:83) 的 900px 断点对齐）；
   - 清理 `.page` 的 `overflow-y:auto` 注释语义（overlay 模式下它是真正的滚动容器，确认降级列表 `canvasList` 也在其内可滚）。

### 第 1 层：resize 跟随

3. [`KgGraphCanvas.tsx`](../../packages/client/ui-kg/src/client/KgGraphCanvas.tsx) useEffect 内：`new ResizeObserver(() => sigma.resize())` 监听 `container`，cleanup 时 `disconnect()`（参照仓库 ResizeObserver 先例 [ConversationRoot.tsx:47-57](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx:47)、[AppFrame.tsx:111-120](../../packages/client/ui-layout/src/client/AppFrame.tsx:111)；`sigma.resize()` 是 sigma 公开方法）。

### 第 2 层：交互补齐

4. sigma settings 扩展（[KgGraphCanvas.tsx:86-91](../../packages/client/ui-kg/src/client/KgGraphCanvas.tsx) 构造处）：`minCameraRatio: 0.05`、`maxCameraRatio: 15`（实测可再调）、`cameraPanBoundaries` 设为图包围盒 + 边距。
5. 节点拖拽：`downNode` 记录节点与位置 → `getBBox`/`viewportToGraph` 坐标换算 → mousemove 更新 `node.x/y` + `refresh()` → mouseup 结束；对齐 [AppFrame.tsx:48-71](../../packages/client/ui-layout/src/client/AppFrame.tsx) 的 setPointerCapture 模式。
6. 缩放控件：canvasFrame 角落加 zoom in / zoom out / reset 三按钮（复用 ui-primitives Button ghost 风格；reset 用 `sigma.viewportToGraph(graph)` 回全景）。
7. 选中高亮：构造 settings 加 `nodeReducer`，按 `selected` prop 置 `highlighted`/加边框色（当前 WebGL 路径选中零反馈）。
8. 相机保留：重建 Sigma 前保存 `camera.getState()`，新实例 `camera.setState` 恢复（消除"展开节点后视图跳回初始"）。

### 测试

- 单测 [`kgcanvas.client.spec.tsx`](../../packages/client/ui-kg/tests/kgcanvas.client.spec.tsx)：settings 断言扩到 min/maxCameraRatio；ResizeObserver 建立与 dispose；nodeReducer 选中高亮；相机保留（重建前后 camera state 传递）。
- e2e [`kg-graph-page.e2e.ts`](../../apps/web/tests/kg-graph-page.e2e.ts) 扩展：①多视口几何断言（375×812 / 1280×800 / 1680×1000：`.canvasViewport` 高度 ≈ 容器剩余空间、窄屏 mainSplit 堆叠）；②侧栏拖拽后画布尺寸跟随（触发容器 resize 不触发 window resize 的关键回归用例）；③wheel 契约（画布上滚轮：页面 scrollTop 不变；画布外：`.page` 滚动、scrollBody 不滚）；④控件可用（点 reset 后 camera ratio 回 1）。
- 滚动契约（可选，仿 [chat-scroll-contract.e2e.ts](../../apps/web/tests/chat-scroll-contract.e2e.ts)）：kg 页以 `.page` 为滚动容器、scrollBody 不滚。
- 受影响 golden 同 PR 重录（布局变化必影响既有快照）。

## 验收断言

1. 真实起服（`DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml --no-open`，验收前先重启网关消除旧 inode）浏览器实测：
   - 宽屏（≥1600px）图谱 tab：画布高度 ≥500px（不再恒 300px）；PageHero/工具条固定、不随内容滚走；
   - 拖拽侧栏宽度：画布跟随重绘（无拉伸模糊/留白）；
   - 画布内 wheel = 缩放且页面不动；画布外 wheel = `.page` 滚动；
   - zoom in/out/reset 可用；节点可拖拽；选中节点有高亮；游走/过滤切换后相机状态保留；
   - 375px 窄屏：mainSplit 纵向堆叠、画布不被挤到极窄；
   - 全程零 console error；明暗两套截图 + 交互 GIF（record-browser-gif）落 `examples/kb-agent/demos/acceptance-c1/`。
2. `DSH_BUILD_CLIENT_PROFILE=official pnpm run build && pnpm run test:web` 全绿（受影响 golden 已重录）；`pnpm run lint && pnpm run typecheck` EXIT=0。
3. ui-kg 分区单测全绿（含新增断言）。

## 风险与回滚

| 风险 | 预案 |
|---|---|
| overlay 通道副作用（composer 悬浮遮挡 kg 内容） | fallback `data-view-scrolls` 新通道（第 0 层步骤 1 已写判定） |
| golden 重录面大 | 重录后逐文件复核内容语义（非盲目接受） |
| sigma cameraPanBoundaries 与 FA2 布局坐标尺度不匹配（图拖不动/过度限制） | 以实测包围盒计算边界；不可用则退化为仅 min/maxCameraRatio |
| 节点拖拽与 clickNode/doubleClickNode 事件冲突（拖动误触选择/展开） | 拖拽距离阈值（>4px 才算拖拽）+ pointerup 时区分 |

回滚：revert 本批提交即可（纯前端，无数据面/种子面影响）；golden 回滚随提交回退。
