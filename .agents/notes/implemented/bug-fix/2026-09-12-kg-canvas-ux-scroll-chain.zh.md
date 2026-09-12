# Agent Note: 知识图谱画布 UX —— composer-overlay 滚动链、容器尺寸跟随与交互面补齐

Status: implemented

[English](2026-09-12-kg-canvas-ux-scroll-chain.md) | 中文

## Problem

图谱页一次性招来用户三句投诉："滚动错乱"、"屏幕适配不行"、"交互根本不行"。三条相互独立的根因，均在运行中的产品上核实：

1. **滚动链断裂。** kg 视图停留在 ConversationRoot 默认 viewArea 模式（`flex: 1 0 auto; min-height: auto`），viewArea 被内容撑开，一切滚动上浮到会话级 scrollBody（它承载 sticky composer）。页内自己的 `.page { overflow-y: auto }` 沦为死滚动容器，`.mainSplit → .canvasFrame → .canvasViewport` 的 flex 链从未对照有界高度解析，画布在每个视口都跌回 `min-height: 300px` 兜底。滚轮语义在"缩放"（sigma 在画布上 preventDefault）与"带着 sticky 页脚滚整页"之间高频摇摆。
2. **尺寸不跟随。** sigma 只监听 window resize。产品侧栏是可拖拽宽度的 grid（AppFrame 的 pointer-capture DragHandle），拖侧栏不触发 window resize，画布保留陈旧的 WebGL 视口——拉伸或留白。样式表零媒体断点，窄屏只会把分栏挤窄而不堆叠。
3. **交互缺失。** Sigma 构造未设缩放界限（`minCameraRatio`/`maxCameraRatio` 均为默认 `null`）：图可以被缩到无形或平移出视野。sigma v3 不内置节点拖拽，WebGL 路径没有任何选中反馈（`selected` 只到达降级关系清单），没有缩放控件，过滤或游走切换整实例重建、丢弃用户的相机状态。

## Decision

### kg 视图接入 composer-overlay 布局通道

`KgView` 根节点携带 `data-conversation-composer-overlay`（trajectory 先例）：骨架把 viewArea 限界（`flex: 1 1 0; min-height: 0; overflow: hidden`），composer 悬浮于会话列之上，视图的 `.page` 成为页面唯一的滚动容器。页面底部 padding 用 `calc(var(--dsh-composer-height, 152px) + 24px)`——ConversationRoot 发布的座位实时高度——为悬浮 composer 让位，滚到底部的内容（图例、详情卡）不会被输入卡盖住。计划预留的 fallback（ui-conversation 新增 `data-view-scrolls` 标记）没有用上：实测 composer 悬浮在预留的 clearance 区上，不压画布。

### 画布几何对照真实视口解析，带地板与封顶

`.canvasViewport` 保持 `flex: 1` 于如今有界的链条，新增 `min-height: 380px`（矮视口——composer clearance 加 hero/toolbar 吃掉大部分 flex 填充——仍有可用画布；溢出部分滚动 `.page`）与 `max-height: min(62vh, 100%)`（高瘦视口不能把页面其余部分推到 composer 之下）。≤900px 时 `.mainSplit` 纵向堆叠（与会话头 kg 按钮同一断点），侧区取消 `min-width` 让画布保住可用宽度。

### 渲染器跟随容器而非窗口

画布容器上的 `ResizeObserver` 调用 `sigma.resize()`（teardown 时 disconnect）。拖侧栏改变 grid 单元格，observer 触发，sigma 重读盒子——全程不涉及 window 事件。

### 一台有界、可拖拽、可高亮、跨重建存活的相机

Sigma 构造现在设置 `minCameraRatio: 0.05`、`maxCameraRatio: 15`，以及由可变高亮 ref 供给的 `nodeReducer`：选中节点以 `highlighted` 加 `forceLabel` 渲染，直接邻居 `highlighted`，其余原样。选中变化经 `refresh({ skipIndexation: true })` 重绘而不重建渲染器。节点拖拽走 `downNode` → `moveBody` → `upStage`：4px 阈值区分点击与拖拽，一次拖拽抑制尾随的 `clickNode`，位置经 `viewportToGraph` + `setNodeAttribute` + refresh 落盘。每次 teardown 快照相机状态并在后继实例上回放，过滤与游走切换保留用户的缩放与平移。`visibleNodes`/`visibleEdges` 走 memo，无关重渲染（在搜索框打字）不再重建渲染器。

### 三按钮控件簇与新的减号字形

视口右上角承载放大/缩小/重置（`camera.animatedZoom` / `animatedUnzoom` / `animatedReset`——重置即回到适配初始态），均为图标 ghost 按钮，aria-label 与 title 来自 locale 键 `canvas.zoomIn` / `canvas.zoomOut` / `canvas.reset`。`IconMinusOutline16` 进入 ui-primitives（plus 字形的单横杠），图标集计数断言改到 71。

## Alternatives considered

**`cameraPanBoundaries`。** 暂缓：FA2 布局的坐标尺度随游走变化，错配的边界要么钉死图、要么过度限制平移。计划已预授权退化为仅 ratio 界限；复活它意味着按游走实际包围盒计算边界。

**独立的适配全图按钮。** 否：sigma 初始相机状态就是适配视图，`animatedReset` 同时覆盖重置与适配；第四个按钮会让同一行为挂两个名字。

**`data-view-scrolls` fallback 通道。** 未启用：计划在 overlay 属性错位 composer 时才启用；实测 trajectory 形态的几何对 kg 干净适用。

## Consequences

渲染栈不变（sigma/graphology/FA2，静态导入——单文件 bundle 裁决维持）。kg e2e 通道钉住几何契约：宽视口画布 ≥500px、1280×800 地板档 ≥360px、画布上滚轮让页面滚动器与会话 scrollBody 双双保持 0、侧栏拖拽缩小画布位图（容器 resize 不经 window resize）、375px 堆叠分栏无横向溢出、控件簇在 console-error tripwire 下干净可点。单测断言缩放界限 settings、高亮 reducer 矩阵、拖拽阈值与点击抑制、observer 生命周期、控件到相机的调用、跨重建的相机交接。无 golden 快照引用 kg 内容，故无需重录。降级（无 WebGL）环境保留关系清单；控件簇仅存在于 WebGL 路径。
