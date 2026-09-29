# 子任务 B：React Flow / @xyflow/react + 三个补充候选调研

> 调研日期：2026-09-29 | 来源：18 个 URL（全部实地访问取证） | 场景：制造业全链平台审批流可视化拖拽编排组件选型（React18 + antd5 + NocoBase 自托管 + 自研 wfl 五表状态机）

---

## React Flow / @xyflow/react 调研结果

### 1. 仓库元数据与活跃度（stars/最近release/日期/URL）

| 指标 | 数值 | 来源 |
|---|---|---|
| 仓库 | xyflow/xyflow（monorepo，含 React Flow + Svelte Flow） | https://api.github.com/repos/xyflow/xyflow |
| Stars | **38,532** | 同上 |
| Forks | 2,541 | 同上 |
| Open issues | 140 | 同上 |
| 最近 push | **2026-09-24**（调研前 5 天） | 同上 |
| Archived | false（未归档） | 同上 |
| 创建时间 | 2019-07-15 | 同上 |
| 维护方 | webkid GmbH（xyflow 团队，商业公司持续维护） | https://reactflow.dev/pro 页脚 |

最近 5 个 release（https://api.github.com/repos/xyflow/xyflow/releases?per_page=5）：

| Tag | 发布日期 |
|---|---|
| **@xyflow/react@12.12.0** | **2026-09-24** |
| @xyflow/svelte@1.7.0 | 2026-09-24 |
| @xyflow/system@0.0.83 | 2026-09-24 |
| @xyflow/system@0.0.82 | 2026-09-01 |
| @xyflow/svelte@1.6.6 | 2026-09-01 |

**v11 与 v12 的关系**：React Flow 12 的 npm 包名从 `reactflow`（11.x）改为 **`@xyflow/react`**（12.x），同一 monorepo 演进；官方文档站 reactflow.dev 提供 [Migrate to v12](https://reactflow.dev/learn/troubleshooting/migrate-to-v12)、[Migrate to v11](https://reactflow.dev/learn/troubleshooting/migrate-to-v11) 迁移指南。npm 当前主包即 `@xyflow/react`（12.12.0，https://www.npmjs.com/package/@xyflow/react）。

### 2. License

**MIT**（三处交叉确认）：

- GitHub API：`license.spdx_id: "MIT"`（https://api.github.com/repos/xyflow/xyflow）
- npm registry：`"license": "MIT"`（https://registry.npmjs.org/@xyflow/react/latest）
- 官网页脚 MIT License 链接指向 https://github.com/xyflow/xyflow/blob/main/LICENSE

注意区分：Pro 订阅只是「付费示例 + 支持」服务，库本体永久 MIT——官方原话 "React Flow is open-source MIT-licensed software, and it will be forever"（https://reactflow.dev/pro）。

### 3. 功能矩阵逐项

| 能力 | 结论 | 证据 |
|---|---|---|
| 拖拽添加节点（左侧面板拖入画布） | ✓（官方示例，画布外 DnD 行为本身不内置） | 官方示例页明确说 "The drag and drop behavior outside of the React Flow pane is **not built in** but can be implemented with the native HTML Drag and Drop API, Pointer Events, or a third party library like react-draggable"，并给出两套完整实现（HTML DnD API + Pointer Events 触屏方案）：https://reactflow.dev/examples/interaction/drag-and-drop |
| 连线 | ✓ 内置 | `<ReactFlow>` 的 `onConnect: OnConnect` 事件 + `addEdge` 工具函数（"When a connection line is completed and two nodes are connected by the user, this event fires with the new connection"）：https://reactflow.dev/api-reference/react-flow ；Handle 组件文档：https://reactflow.dev/api-reference/components/handle |
| MiniMap / Controls / Background | ✓ 三者均内置组件 | "React Flow comes with several built-in components"——`import { ReactFlow, MiniMap, Controls, Background, Panel } from '@xyflow/react'` 直接可用：https://reactflow.dev/learn/concepts/built-in-components ；各组件独立 API 页：/api-reference/components/minimap、/controls、/background |
| **撤销/重做** | **✗ 不内置（需自己维护历史栈）** | 官方示例索引中 Undo and Redo 明确标注 **Pro**（付费订阅专属）：https://reactflow.dev/examples 索引条目 "Undo and Redo **Pro** — Undo and redo functionality for moving, adding, and deleting nodes and edges" → /examples/interaction/undo-redo；开源版 API 全集中无 undo/redo 概念（https://reactflow.dev/api-reference） |
| 节点/边校验 | ✓ 内置回调 | `isValidConnection: IsValidConnection<Edge>`——"This callback can be used to validate a new connection. If you return false, the edge will not be added to your flow"：https://reactflow.dev/api-reference/react-flow ；配套官方示例 Validation（https://reactflow.dev/examples/interaction/validation）与 Preventing Cycles 防环示例 |
| 只读模式 | ✓ 通过 props 组合 | `nodesDraggable`（false 时节点不可拖）、`nodesConnectable`（false 时不可连线）、`panOnDrag`、`elementsSelectable` 均为 `<ReactFlow>` 顶层 props，且可被单个节点覆盖：https://reactflow.dev/api-reference/react-flow |
| 导出图片 | △ 官方示例 + 第三方库（非核心内置） | Download Image 示例用 html-to-image 导出 PNG；官方特别注明 "The version of the html-to-image package used in this example, has been locked to 1.11.11…The recent versions, after 1.11.11, are not exporting images properly"：https://reactflow.dev/examples/misc/download-image ；服务端出图（Puppeteer）为 Pro 示例 Server Side Image Creation |
| 自定义节点 | ✓ 核心能力 | Custom Nodes 官方示例 "Display any content inside of a node"：https://reactflow.dev/examples/nodes/custom-node ；文档 /learn/customization/custom-nodes；自定义节点即普通 React 组件 |
| 属性面板（右侧 inspector） | **✗ 开源库不提供** | 内置组件仅有 MiniMap/Controls/Background/Panel/NodeToolbar/NodeResizer 等（https://reactflow.dev/learn/concepts/built-in-components 与 /api-reference/components 全列表），无任何 inspector/properties 组件；带拖拽侧栏 + 属性编辑的完整 Workflow Editor 是 **Pro 付费模板**（Next.js + React Flow UI + shadcn/ui + Zustand + ELKjs，"This is a Pro example"）：https://reactflow.dev/ui/templates/workflow-editor |

### 4. React18/19 兼容与包体积

| 指标 | 数值 | 来源 |
|---|---|---|
| peerDependencies | `react >=17`、`react-dom >=17`、`@types/react >=17` | https://registry.npmjs.org/@xyflow/react/latest |
| 结论 | React 17/18/19 均在声明支持范围（peer 范围 `>=17` 不设上限，React18 与 React19 均无 peer 冲突） | 同上 |
| npm 版本 | 12.12.0（86 个版本，998 dependents） | https://www.npmjs.com/package/@xyflow/react |
| 周下载量 | **11,565,877** | 同上 |
| 依赖数 | 3（zustand ^4.4.0、classcat ^5.0.3、@xyflow/system 0.0.83） | https://registry.npmjs.org/@xyflow/react/latest |
| 打包体积 | min 187,883 B ≈ **183.5 KB**；gzip 59,980 B ≈ **58.6 KB**（含传递依赖 d3-zoom/d3-drag/d3-selection 等） | https://bundlephobia.com/api/size?package=@xyflow/react@12.12.0 |
| 最后发布 | 2026-09-24（"Published 5 days ago"） | https://www.npmjs.com/package/@xyflow/react |

### 5. 数据结构

- **序列化入口**：`ReactFlowInstance.toObject() => ReactFlowJsonObject<Node, Edge>`——"Returns the nodes, edges and the viewport as a JSON object"（https://reactflow.dev/api-reference/types/react-flow-instance）。即可整体落库/回放。
- **Node 结构**：id、type（自定义类型字符串）、`data: NodeData`（**Arbitrary data passed to a node**，任意业务负载）、position(x,y)、sourcePosition/targetPosition、style 等（https://reactflow.dev/api-reference/types/node）。
- **实际 JSON 示例**（官方 download-image 示例源码中的 initialNodes）：

```js
{ id: '1', type: 'input', data: { label: '▲' },
  position: { x: 0, y: 50 }, sourcePosition: 'right',
  style: { backgroundColor: '#BEE3F8' } }
```

（https://reactflow.dev/examples/misc/download-image）
- **配套官方示例**：Save and Restore（localStorage 持久化）：https://reactflow.dev/examples/interaction/save-and-restore
- 映射到本项目：wfl 五表状态机的节点/边语义可放 `node.data` 自由负载，画布 JSON（nodes/edges/viewport）可整体存 PG。

### 6. 审计语义（纯图形库判定）

**确认：React Flow 是纯图形/交互库，不含任何审批业务语义。**

- 官方定位："A highly customizable React component for building **interactive graphs and node-based editors**"（https://www.npmjs.com/package/@xyflow/react README；仓库描述同义）。
- 节点负载 `data` 明确为 Arbitrary data（https://reactflow.dev/api-reference/types/node）——库不感知「审批人/会签/或签/抄送/条件分支」等概念。
- 全部 68 个官方示例分类为 Nodes/Edges/Interaction/Layout/Styling/Whiteboard/Misc，无任何 workflow/approval 业务分类（https://reactflow.dev/examples）。
- 钉钉式审批设计器的四件套中，画布/节点/连线由 React Flow 提供；**左侧节点面板、右侧属性面板、审批语义（审批人规则、会签/或签、条件分支表达式）全部需自建**——官方完整参考实现为 Pro 付费模板 workflow-editor（https://reactflow.dev/ui/templates/workflow-editor）。

### 7. 优缺点清单

**优点：**

1. 生态与活跃度顶级：38,532 stars、周下载 1,156 万、2026-09 仍按月发版（https://api.github.com/repos/xyflow/xyflow 、https://www.npmjs.com/package/@xyflow/react）
2. MIT + 商业公司（webkid GmbH）全职维护，Pro 订阅模式保证持续投入而非弃维护（https://reactflow.dev/pro）
3. 需求核心能力齐备：连线校验（isValidConnection）、只读三 props（nodesDraggable/nodesConnectable/panOnDrag）、自定义节点=普通 React 组件、toObject() 整体 JSON 序列化（https://reactflow.dev/api-reference/react-flow 、https://reactflow.dev/api-reference/types/react-flow-instance）
4. MiniMap/Controls/Background 内置，antd5 项目可零成本获得小地图（https://reactflow.dev/learn/concepts/built-in-components）
5. TypeScript 原生（strict 类型完整，Node/Edge 泛型可携带自定义 data 类型）（https://reactflow.dev/api-reference/types/node）
6. 与 React18/antd5 技术栈零冲突（peer react >=17，仅 3 个运行时依赖）（https://registry.npmjs.org/@xyflow/react/latest）

**缺点/风险：**

1. **撤销/重做不内置**——官方实现是 Pro 付费示例；自建历史栈（基于 nodes/edges 快照 + zustand）有确定工作量（https://reactflow.dev/examples 索引 Pro 标注）
2. **属性面板不提供**——右侧审批人配置面板需完全自研（antd5 Form 自行组装；官方 workflow-editor 模板付费）（https://reactflow.dev/ui/templates/workflow-editor）
3. 画布外拖入（左侧面板 → 画布）需自行实现 DnD（官方给了两套示例代码可抄，但不在库内）（https://reactflow.dev/examples/interaction/drag-and-drop）
4. 导出图片依赖第三方 html-to-image 且官方锁旧版 1.11.11（新版有已知导出 bug）（https://reactflow.dev/examples/misc/download-image）
5. 体积中等：min 183.5KB / gzip 58.6KB（含 d3 系传递依赖），对 NocoBase 插件 bundle 有一定增量（https://bundlephobia.com/api/size?package=@xyflow/react@12.12.0）
6. 大版本迁移成本：11→12 包名与 API 均有破坏性变更（reactflow → @xyflow/react），跟进需按迁移指南（https://reactflow.dev/learn/troubleshooting/migrate-to-v12）

---

## 补充候选判定

### vue-flow

| 指标 | 数值 |
|---|---|
| 仓库 | bcakmakoglu/vue-flow |
| Stars | 6,882 |
| License | MIT |
| 最近 push | 2026-07-14（活跃） |
| 官网 | https://vueflow.dev |
| 语言 | TypeScript |
| 描述 | "A highly customizable Flowchart component for **Vue 3**" |

来源：https://api.github.com/repos/bcakmakoglu/vue-flow

**结论：不进决策矩阵。** 项目技术栈为 React18，vue-flow 是 Vue 3 专属组件库（自带 Minimap 等），跨框架使用需要 iframe/wrapper 隔离方案，得不偿失。排除依据：https://api.github.com/repos/bcakmakoglu/vue-flow（描述与语言字段）。

### flume

| 指标 | 数值 |
|---|---|
| 仓库 | chrisjpatty/flume（GitHub 搜索确认的正确仓库） |
| Stars | 1,628 |
| License | MIT |
| 最近 commits | 2026-04-12（README 更新）、2026-01-05（小修复）、2025-11-05（V1.2.0 release）、2025-07-17、2025-03-23 |
| npm | flume@1.2.0；peerDeps **react ^18.2.0**（不含 React19）；dependencies 含 lodash、d3-shape、react-portal、@reach/auto-id、rollup-plugin-typescript2（构建工具误入运行时依赖） |
| npm 周下载 | **282**（2026-09-21~09-27） |

来源：https://api.github.com/search/repositories?q=flume+node+editor 、https://api.github.com/repos/chrisjpatty/flume/commits?per_page=8 、https://registry.npmjs.org/flume/latest 、https://api.npmjs.org/downloads/point/last-week/flume

**结论：不建议进决策矩阵。** 与任务预期的「2022-2023 后完全停滞」略有出入——2025-11 有 V1.2.0、2026 年仍有零星 commit，**未死但近乎停滞**：年均 2-3 个 commit、周下载仅 282（React Flow 的 1/40000）、peer 锁死 react ^18.2 无 React19 路径、依赖卫生差。作为通用 node editor 能力上也远弱于 React Flow（无只读 props 文档化体系、无 toObject 序列化契约）。事实记录保留，矩阵价值极低。

### Drawflow

| 指标 | 数值 |
|---|---|
| 仓库 | jerosoler/Drawflow |
| Stars | 6,126 |
| License | MIT |
| 最近 push | **2024-10-19**（调研时点 2026-09，近 2 年无提交） |
| Open issues | 273（积压） |
| 语言 | 纯 JavaScript（无框架绑定，无官方 React 绑定） |
| npm 周下载 | 22,239（2026-09-21~09-27） |

来源：https://api.github.com/repos/jerosoler/Drawflow 、https://api.npmjs.org/downloads/point/last-week/drawflow

**结论：不建议进决策矩阵。** 优点是零依赖、极小体积、纯 JS 可嵌入任何框架；但三点硬伤：① 维护停滞近 2 年（最后 push 2024-10-19），273 个 open issues 无人处理；② 无 React 绑定，React18 项目中需命令式封装（与 React 数据流相悖，state 同步全靠手工）；③ 无 TypeScript 类型体系、无 isValidConnection 级别的连接校验文档化契约、小地图等组件需要自建。若项目只求「极简、自己包一层」可考虑，但与「钉钉/飞书级设计器」目标不匹配。

---

## 来源列表（访问日期均为 2026-09-29）

| # | URL | 用途 |
|---|---|---|
| 1 | https://api.github.com/repos/xyflow/xyflow | 仓库元数据/stars/license |
| 2 | https://api.github.com/repos/xyflow/xyflow/releases?per_page=5 | 最近 release |
| 3 | https://www.npmjs.com/package/@xyflow/react | 周下载/版本/发布时间/README 功能声明 |
| 4 | https://registry.npmjs.org/@xyflow/react/latest | peerDeps/依赖清单 |
| 5 | https://bundlephobia.com/api/size?package=@xyflow/react@12.12.0 | 打包体积 |
| 6 | https://reactflow.dev/examples | 官方示例索引（Pro 标注判定） |
| 7 | https://reactflow.dev/examples/interaction/drag-and-drop | 拖拽添加节点示例 |
| 8 | https://reactflow.dev/api-reference/react-flow | props（只读三件套/isValidConnection/onConnect） |
| 9 | https://reactflow.dev/learn/concepts/built-in-components | MiniMap/Controls/Background 内置 |
| 10 | https://reactflow.dev/examples/misc/download-image | 导出图片 + initialNodes JSON 结构 |
| 11 | https://reactflow.dev/api-reference/types/react-flow-instance | toObject() 序列化 |
| 12 | https://reactflow.dev/api-reference/types/node | Node.data 任意负载（语义自建佐证） |
| 13 | https://reactflow.dev/pro | Pro 订阅性质（库本体永久 MIT） |
| 14 | https://reactflow.dev/ui/templates/workflow-editor | Pro workflow editor 模板（属性面板归属） |
| 15 | https://reactflow.dev/learn/troubleshooting/migrate-to-v12 | v11(reactflow)→v12(@xyflow/react) 关系 |
| 16 | https://api.github.com/repos/bcakmakoglu/vue-flow | vue-flow 元数据 |
| 17 | https://api.github.com/search/repositories?q=flume+node+order 、https://api.github.com/repos/chrisjpatty/flume/commits?per_page=8 、https://registry.npmjs.org/flume/latest 、https://api.npmjs.org/downloads/point/last-week/flume | flume 仓库定位/commit 历史/npm 元数据/下载量 |
| 18 | https://api.github.com/repos/jerosoler/Drawflow 、https://api.npmjs.org/downloads/point/last-week/drawflow | Drawflow 元数据/下载量 |

## 方法论说明

- 全程 chrome-devtools 实地导航取证（GitHub REST API 原文解析 + 官方文档站正文提取 + npm registry/bundlephobia API），无搜索引擎摘要依赖；DuckDuckGo 仅在定位 flume 正确仓库时使用 GitHub Search API 替代（DDG 触发 CAPTCHA 后按纪律换用 API 端点，未影响结果）。
- 「撤销/重做不内置」的判定依据为官方示例索引的 Pro 标注（官方付费墙划分），而非社区转述。
- 未确认项：无（所有结论均有 2026-09-29 实测 URL）。
