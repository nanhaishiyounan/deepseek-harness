# 子任务C：LogicFlow 与 AntV X6 审批流编排组件调研（事实报告）

> 研究日期：2026-09-29 | 调研方式：chrome-devtools 直查 DuckDuckGo + GitHub API + npm registry/downloads API + 官方文档站/仓库文档源码全文 | 范围：仅事实，不含选型决策

---

## LogicFlow 调研结果

### 1. 仓库元数据与活跃度（数字+URL）

| 指标 | 数值 | 来源 |
|---|---|---|
| Stars | 11,731 | [api.github.com/repos/didi/LogicFlow](https://api.github.com/repos/didi/LogicFlow) |
| Forks | 1,386 | 同上 |
| Open Issues | 120 | 同上 |
| pushed_at | 2026-09-28（最近推送为自动 contributors 更新） | 同上 |
| archived | false | 同上 |
| 创建时间 | 2020-12-24 | 同上 |
| 语言 | TypeScript | 同上 |

**最近 5 个 GitHub Release**（[releases API](https://api.github.com/repos/didi/LogicFlow/releases?per_page=5)）：
- `@logicflow/vue-node-registry@1.2.0-alpha.7`（2026-03-03）
- `@logicflow/extension@2.2.0-alpha.7`（2026-03-03）
- `@logicflow/extension@2.1.14`（2026-03-03，最新 2.x 稳定 tag）
- `@logicflow/core@2.2.0-alpha.7`（2026-03-03）
- `@logicflow/extension@2.2.0-alpha.6`（2026-01-23）

注意：npm 上 `@logicflow/core` latest 实际为 **2.2.5（2026-07-30）**（见 §4），比 GitHub Releases 页更新——GitHub release 页滞后于 npm 发布。

**最近 6 个月 commit 分布**（[commits API since=2026-03-29, per_page=100](https://api.github.com/repos/didi/LogicFlow/commits?per_page=100&since=2026-03-29T00:00:00Z)，共 89 个）：
- 2026-04: 18 | 2026-05: 22 | 2026-06: 2 | 2026-07: 46 | 2026-08: **0** | 2026-09: 1（自动 chore）
- 最近实质性 commit：2026-07-30（changesets 发版流水线）与 2026-07-21（fix(extension) 曲线边退化路径、动态分组粘贴行为）
- 结论（事实性描述）：维护**间歇性活跃**，4-7 月有密集修复，8 月零 commit、9 月仅自动更新。

### 2. License

**Apache-2.0** ✓（双证据：[GitHub repo API `license.spdx_id: "Apache-2.0"`](https://api.github.com/repos/didi/LogicFlow)；[npm registry `license: "Apache-2.0"`](https://registry.npmjs.org/@logicflow/core)）

### 3. 功能矩阵逐项（✓/✗ + URL）

文档站（2.x 新站）：https://site.logic-flow.cn （GitHub repo homepage 为旧站 http://logicflow.cn，npm homepage 为 https://site.logic-flow.cn）。文档源码目录已逐文件核实：[sites/docs/docs/tutorial](https://api.github.com/repos/didi/LogicFlow/contents/sites/docs/docs/tutorial/extension)（中英双语 .zh.md/.en.md）。

| 功能 | 状态 | 说明与证据 |
|---|---|---|
| 工具栏/控制面板（Control，含缩放/适应/撤销重做按钮） | ✓ | 插件文档 [tutorial/extension/control.zh.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/extension/control.zh.md) 存在；插件总览页列「控制面板」https://site.logic-flow.cn/tutorial/extension/intro |
| 左侧拖拽面板（DndPanel） | ✓ | [tutorial/extension/dnd-panel](https://site.logic-flow.cn/tutorial/extension/dnd-panel)：`lf.extension.dndPanel.setPatternItems(patternItems)`，PatternItem 含 type/text/label/icon/properties/callback（1.1.0 新增 setPatternItems） |
| 对齐线（Snapline，core 内置非插件） | ✓ | 构造选项 `snapline: boolean, 默认 true`（[API 构造文档 index.zh.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/api/logicflow-constructor/index.zh.md)）；进阶文档仅英文版 [snapline.en.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/advanced/snapline.en.md)（目录中无 snapline.zh.md，中文版缺页）；silent 模式下自动关闭 |
| 网格（Grid） | ✓ | 同构造文档：`grid: number/boolean/GridOptions`（默认 false，点状网格可自定义）+ `snapGrid`（网格吸附，默认 false） |
| 小地图（MiniMap） | ✓ | 插件文档 [minimap.zh.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/extension/minimap.zh.md) 存在（注意：`/tutorial/extension/mini-map` URL 会 404 重定向回 about，正确 slug 为 minimap） |
| 右键菜单（Menu） | ✓ | [menu.zh.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/extension/menu.zh.md) |
| 撤销重做（History，core 内置） | ✓ | 构造选项 `history: boolean, 默认 true`（同构造文档）；实例 API `lf.undo()` / `lf.redo()`（[history.zh.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/api/logicflow-instance/history.zh.md)） |
| 导出图片（Snapshot） | ✓ | 插件 [snapshot.zh.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/extension/snapshot.zh.md) |
| 框选/多选（SelectionSelect） | ✓ | [selection.zh.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/extension/selection.zh.md) |
| 自动布局（@logicflow/layout） | ✓ | [layout.zh.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/extension/layout.zh.md) |
| 动态分组/泳道（DynamicGroup/Pool） | ✓ | dynamic-group.zh.md、pool.zh.md 均存在（同 extension 目录） |
| **BPMN 支持** | ✓（基础级，官方明示仅演示用） | 见下方专述 |
| 自定义 React 节点 | ✓（2.x 官方新特性） | 见下方专述 |
| 数据结构（nodes/edges + getGraphData） | ✓ | 见下方专述 |
| 只读模式 | ✓ | [silent-mode.zh.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/advanced/silent-mode.zh.md)（静默模式下节点不可移动、对齐线强制关闭） |

**BPMN 专述**（[bpmn-element.zh.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/extension/bpmn-element.zh.md)）：
- 两版插件：基础版 `bpmnElement`（注册 startEvent/endEvent 等 6 种基础 BPMN 元素）+ `bpmnAdapter`（LogicFlow 数据 ↔ BPMN XML 基本映射转换）；扩充版 `BPMNElements`（多 6 种节点）+ `bpmnElementsAdapter`（细粒度自定义适配参数）。
- 官方原话（重要免责声明）：内置 BPMN 插件「主要用于**基础能力演示与快速上手**，仅覆盖少量常用的 BPMN 元素，不支持复杂的 BPMN 扩展元素及自定义属性配置」，并推荐实际项目「自行定义项目所需的节点类型与数据结构……而非直接、完整地套用内置提供的 bpmnElement 与 bpmnAdapter 插件」。
- 支持导出 BPMN 2.0 XML，可在 Activiti、Flowable、Camunda 引擎中执行（同文档）。
- Adapter 通用机制：`adapterIn/adapterOut` 钩子（[render-and-data.zh.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/api/logicflow-instance/render-and-data.zh.md)）。

**自定义 React 节点专述**（[react.zh.md，标记「新特性」](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/advanced/react.zh.md)）：
- 2.x 官方推荐独立包 `@logicflow/react-node-registry`：`register({ type, component }, lf)` 用 React 组件注册节点；`setProperties` 更新自动重渲染。
- 文档明确指出旧的 `HTMLNode` 继承方式「不够直观且有可能因为销毁时机不对而出现性能问题」。
- 提供 **Portal 模式** 解决组件不在 React 渲染树中无法获取外部 Context 的问题（antd ConfigProvider 等全局 Context 可用）。
- 对应 Vue 方案 `@logicflow/vue-node-registry` 同步存在（release 1.2.0-alpha.7）。

**数据结构专述**（[render-and-data.zh.md](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/api/logicflow-instance/render-and-data.zh.md)）：
- 图数据 = `{ nodes: [{id,type,x,y,properties,...}], edges: [...] }`（GraphData/GraphConfigData 类型）。
- `lf.render(data)`（可经 adapterIn）/ `lf.renderRawData(data)`；`lf.getGraphData()`（可经 adapterOut）/ `lf.getGraphRawData()`（原生）；`lf.clearData()`。

### 4. npm 与文档质量（中文）

| 包 | latest | 发布时间 | 周下载（2026-09-21~27） | 来源 |
|---|---|---|---|---|
| @logicflow/core | 2.2.5 | 2026-07-30 | **12,699** | [registry](https://registry.npmjs.org/@logicflow/core) / [downloads](https://api.npmjs.org/downloads/point/last-week/@logicflow/core) |
| @logicflow/extension | 2.3.1 | 2026-07-30 | **12,810** | [registry](https://registry.npmjs.org/@logicflow/extension) / [downloads](https://api.npmjs.org/downloads/point/last-week/@logicflow/extension) |
| @logicflow/react-node-registry | 1.2.5 | 2026-07-30 | （未单独查询） | [registry](https://registry.npmjs.org/@logicflow/react-node-registry) |

- @logicflow/core 共 261 个版本；dist-tags：`stable: 1.1.31`（1.x 仍标 stable）、`next: 1.2.5`、`latest: 2.2.5`（2.x 已是 latest 主线）。
- 2.x 近期版本轨迹：2.2.1（2026-04-15）→ 2.2.2（2026-05-12）→ 2.2.4（2026-07-06）→ 2.2.5（2026-07-30）。
- **中文文档质量**：文档站（site.logic-flow.cn）以中文为主语言，覆盖快速上手/基础/进阶/插件/API/示例/更新日志；插件与 API 页面全部有 .zh.md 中文版且为中文优先。**缺口**：进阶教程中 snapline 仅有英文版（snapline.en.md，无 .zh.md）——对齐线这一具体页面的中文版缺失（其余抽查页面均双语齐全）。

### 5. React18/antd5 集成成本

- **框架无关内核**：LogicFlow core 为纯 TS + SVG/MVVM 实现（repo 描述与 [tutorial/about](https://site.logic-flow.cn/tutorial/about)），不依赖任何 UI 框架；React/Vue 均通过独立 registry 包接入。
- **React18 官方支持**：[@logicflow/react-node-registry@1.2.5](https://registry.npmjs.org/@logicflow/react-node-registry) peerDependencies 为 `react: ">= 18.0.0"`、`react-dom: ">= 18.0.0"`、`@logicflow/core: "^2.2.5"`——peer 范围与 React18 项目直接兼容。
- **antd5 集成路径**：节点内容用 React 组件渲染（react-node-registry 的 register），antd5 组件理论上可直接用于节点内部；官方 Portal 模式解决 Context 传递（antd 的 ConfigProvider/主题 Context 可达节点内部）。官方文档示例未直接使用 antd 组件（用的是自定义 div/图片），「antd 组件做节点内容」属于社区常见做法而非官方演示范围——**此点未在官方文档中逐字确认**。
- 集成方式：`new LogicFlow({ container: divRef })` + `useEffect` 中初始化/销毁（文档示例为 class 组件风格，React Hooks 写法需自行包一层，官方文档未给 Hooks 专用示例——**未确认**官方是否提供 Hooks 封装）。

### 6. 优缺点清单（事实向）

**优点（每条附证据）**
1. 2.x 提供 React/Vue 双官方节点 registry，React peerDeps 明确 >=18（[npm react-node-registry](https://registry.npmjs.org/@logicflow/react-node-registry)）。
2. 对齐线、历史记录（undo/redo）、网格吸附为 core 内置且默认开启（[构造 API 文档](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/api/logicflow-constructor/index.zh.md)）。
3. 插件体系覆盖钉钉式设计器所需全家桶：DndPanel 左侧拖拽面板 + Control 工具栏 + MiniMap + Menu 右键菜单 + Snapshot 导出 + Selection 框选（[插件目录清单](https://api.github.com/repos/didi/LogicFlow/contents/sites/docs/docs/tutorial/extension)）。
4. 中文文档为主语言，教程-插件-API-示例四层结构完整（https://site.logic-flow.cn）。
5. BPMN XML 导入导出（bpmnAdapter/bpmnElementsAdapter），可对接 Activiti/Flowable/Camunda（[BPMN 文档](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/extension/bpmn-element.zh.md)）。
6. Apache-2.0 宽松许可，商用无附加义务。

**缺点/风险（每条附证据）**
1. 维护节奏间歇：2026-08 全月 0 commit、2026-09 仅 1 个自动 chore（[commits API](https://api.github.com/repos/didi/LogicFlow/commits?per_page=100&since=2026-03-29T00:00:00Z)）；open issues 120 个。
2. 官方自认内置 BPMN 插件仅「基础能力演示与快速上手」，复杂审批语义需自行重写节点体系与数据转换（[BPMN 文档原话](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/extension/bpmn-element.zh.md)）。
3. 文档存在小缺口：snapline 进阶页缺中文版（[tutorial/advanced 目录](https://api.github.com/repos/didi/LogicFlow/contents/sites/docs/docs/tutorial/advanced) 仅 snapline.en.md）；`/tutorial/extension/mini-map` URL 404（正确 slug 为 minimap）。
4. npm 周下载量级 ~1.27 万，社区规模显著小于 X6（13.9 万）与主流海外库（[downloads API](https://api.npmjs.org/downloads/point/last-week/@logicflow/core)）。
5. dist-tags 仍把 1.1.31 标为 `stable` 而 latest 为 2.2.5，1.x→2.x 升级路径文档以「2.0版本前的引入方式」注释形式存在（[dnd-panel 文档](https://site.logic-flow.cn/tutorial/extension/dnd-panel)），暗示 1.x/2.x 并存增加版本心智负担。

---

## AntV X6 调研结果

### 1. 仓库元数据（数字+URL）

| 指标 | 数值 | 来源 |
|---|---|---|
| Stars | 6,713 | [api.github.com/repos/antvis/X6](https://api.github.com/repos/antvis/X6) |
| Forks | 1,894 | 同上 |
| Open Issues | 150 | 同上 |
| pushed_at | 2026-08-11 | 同上 |
| archived | **false**（未归档） | 同上 |
| 创建时间 | 2019-11-14 | 同上 |
| 语言 | TypeScript | 同上 |
| homepage | https://x6.antv.antgroup.com | 同上 |

**最近 5 个 GitHub Release**（[releases API](https://api.github.com/repos/antvis/X6/releases?per_page=5)）：
- v3.1.7（2026-03-18）| 3.1.6（2026-02-04）| v3.1.5（2026-01-27）| v3.1.4（2025-12-31）| 3.1.3（2025-12-19）

注意：npm 上 `@antv/x6` latest 为 **3.1.8（2026-08-11）**（见 §5），比 GitHub Releases 页新一个版本。

### 2. 维护状态核查（重点）

**结论：2024-2025 年「维护放缓」传闻属实（有 22 个月稳定版空窗 + 社区质疑帖）；但项目未死，2025-11 起重启 3.x 线恢复小步发布，当前为低强度维护状态（近 6 个月 8 个 commit，以修复/文档/CI 为主）。**

证据链（按时间线）：
1. **2.x 停更点**：`@antv/x6` 2.x 最后版本 **2.18.1 = 2024-01-24**（[npm registry time 字段](https://registry.npmjs.org/@antv/x6)）。
2. **社区质疑（传闻源头）**：GitHub Discussion [「X6后续更新与维护计划」#4387](https://github.com/antvis/X6/discussions/4387)（2024-08-13 发起，6 赞 7 回复）——原话「看到 issues 里，很多问题，已经很久都没有修复了」；跟帖包括「最近提的 issue 基本没人解决和回复了」「新项目还在纠结要不要用呢，看了下发布日志，最新版本还是一月份的」「等一个已合并的 PR 等了七个月」。**该讨论中未见 antvis 官方成员回复**（页面全部楼层均为社区用户）。另见知乎提问「antv x6是不是不更新,作废了?」（[DuckDuckGo 结果](https://duckduckgo.com/?q=antv+x6+%E7%BB%B4%E6%8A%A4+%E5%81%9C%E6%AD%A2+%E4%B8%8D%E7%BB%B4%E6%8A%A4&ia=web)，检索自 zhihu.com）。
3. **3.x 重启点**：npm 版本时间线 3.0.1 = **2025-11-22**（同 registry；2022-11-25 存在一个早期 3.0.0 占位版本，随后回退 2.x 线）——即 2.18.1 → 3.0.1 之间**约 22 个月无稳定版发布**。此后 3.1.3（2025-12-19）→ 3.1.4 → 3.1.5 → 3.1.6 → 3.1.7（2026-03-18）→ 3.1.8（2026-08-11，npm）恢复小步快跑。
4. **当前强度**：[commits API since=2026-03-29](https://api.github.com/repos/antvis/X6/commits?per_page=100&since=2026-03-29T00:00:00Z) 近 6 个月仅 **8 个 commit**（5月2/6月3/7月1/8月2），内容为 chore/fix(ci)/docs 修复/小 feat（container string 支持）——与 LogicFlow 同期 89 个形成对比。
5. **官方姿态信号**：X6 官网首页横幅展示「**OSCP 开源共建计划**：AntV 开启 OSCP 开源共建计划，欢迎大家来贡献代码」（https://x6.antv.antgroup.com/，链接指向 [github.com/orgs/antvis/projects/25](https://github.com/orgs/antvis/projects/25)）——官方将维护部分转向社区共建模式。未发现 antvis 发布「X6 进入维护模式/停止维护」的正式公告（**未确认**存在此类官方公告）。
6. 更新日志托管在语雀：https://www.yuque.com/antv/x6/gkniz4iiyxftgv0r （官网「更新日志」入口指向）。

### 3. License

**MIT** ✓（[repo API `license.spdx_id: "MIT"`](https://api.github.com/repos/antvis/X6)；[npm @antv/x6 license: MIT](https://registry.npmjs.org/@antv/x6)；仓库根 [LICENSE](https://github.com/antvis/X6/blob/master/LICENSE)）

### 4. 功能矩阵逐项（✓/✗ + URL）

3.x 文档站：https://x6.antv.antgroup.com （中文为主）；文档源码 [site/docs](https://api.github.com/repos/antvis/X6/contents/site/docs/tutorial/plugins)（全部 .zh.md/.en.md 双语）。3.x 起插件并入主包：`import { Graph, Stencil } from '@antv/x6'`（[stencil.zh.md 示例](https://github.com/antvis/X6/blob/master/site/docs/tutorial/plugins/stencil.zh.md)）。

| 功能 | 状态 | 说明与证据 |
|---|---|---|
| 拖拽节点（Dnd 插件） | ✓ | [plugins/dnd.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/plugins/dnd.zh.md) |
| 左侧模板面板（Stencil：Dnd 之上的侧边栏 UI，支持分组/折叠/搜索） | ✓ | [plugins/stencil.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/plugins/stencil.zh.md)——官方原话「提供了一个类似侧边栏的 UI 组件，并支持分组、折叠、搜索等能力」；`stencil.load([node...], 'group1')` |
| 连线 + 校验/约束（connecting.allowXXX + validateConnection） | ✓（allowXXX 已逐字确认） | [basic/interacting.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/basic/interacting.zh.md)：`connecting` 配置含 `allowBlank/allowLoop/allowNode/allowEdge/allowPort/allowMulti`（均支持 boolean 或函数动态判断）、全局 `router/connector`（如 orth）、`createEdge`、magnet=true 拉线。文档指向完整 API `/api/model/interaction#连线`（validateConnection 在该 TS 生成的 API 表中；本次未逐字抓取 3.x API 表原文——**该单项标注未逐字确认**，2.x 时代 validateConnection/validateMagnet 为公开 API） |
| 小地图（MiniMap 插件） | ✓ | [plugins/minimap.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/plugins/minimap.zh.md) |
| 对齐线（Snapline 插件） | ✓ | [plugins/snapline.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/plugins/snapline.zh.md)（有中文版，与 LogicFlow 的 snapline 缺中文形成对比） |
| 撤销重做（History 插件） | ✓ | [plugins/history.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/plugins/history.zh.md) |
| 只读（interacting 配置禁用交互） | ✓ | [basic/interacting.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/basic/interacting.zh.md) 章节含「怎么禁止、启用一些交互动作」 |
| 导出图片（Export 插件 toSVG/PNG/JPEG） | ✓ | [plugins/export.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/plugins/export.zh.md)；2026-06-18 commit「docs: fix Export plugin docs and refresh demo」（[commits API](https://api.github.com/repos/antvis/X6/commits?per_page=100&since=2026-03-29T00:00:00Z)） |
| 其他配套插件 | ✓ | clipboard（剪贴板）、keyboard、scroller、selection（框选）、transform 均有 zh+en 文档（[plugins 目录清单](https://api.github.com/repos/antvis/X6/contents/site/docs/tutorial/plugins)） |
| **React 封装 @antv/x6-react-shape** | ✓ | [intermediate/react.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/intermediate/react.zh.md)：`register({ shape, width, height, component })`；`effect: ['data']` 声明式控制重渲染；Portal 模式解决 Context。**官方版本兼容警告原话**：「X6 3.x 须使用 x6-react-shape 3.x 版本。同时 x6-react-shape 自 2.0.8 起仅支持 React 18 及以上」。文档示例节点内直接使用 antd `<Progress type="circle">` 组件（antd 可入节点的官方演示） |
| Vue/Angular 封装 | ✓ | intermediate/ 下 vue.zh.md、angular.zh.md 并存 |
| 数据结构（toJSON/fromJSON） | ✓ | [basic/serialization.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/basic/serialization.zh.md)：`graph.toJSON()` 返回 `{ cells: [] }`（cells 按渲染顺序存节点+边，节点含 id/shape/position/size/attrs/zIndex，边含 source/target）；`graph.fromJSON(cells数组 或 {cells,nodes,edges})` |
| 官方 BPMN 示例 | ✓ | 示例站 https://x6.antv.antgroup.com/examples/showcase/practices/#bpmn（同页还有 #flowchart 流程图、#agentFlow 智能体流程编排、#dag、#er 等）；React 自定义节点示例 /examples/node/custom-node/#custom-with-react |
| embedding（节点嵌套分组） | ✓ | interacting.zh.md 章节列表含「节点之间怎么嵌入」（[源文件](https://github.com/antvis/X6/blob/master/site/docs/tutorial/basic/interacting.zh.md)），另有 intermediate/group.zh.md |

### 5. npm 数据

| 包 | latest | 发布时间 | 其他版本 | 周下载（2026-09-21~27） | 来源 |
|---|---|---|---|---|---|
| @antv/x6 | 3.1.8 | 2026-08-11 | 2.x 末版 2.18.1（2024-01-24）；3.0.1（2025-11-22） | **138,884** | [registry](https://registry.npmjs.org/@antv/x6) / [downloads](https://api.npmjs.org/downloads/point/last-week/@antv/x6) |
| @antv/x6-react-shape | 3.0.1（latest tag） | 2025-11-27 | time 表另有 3.1.1 / 3.2.1（2026-05-19，非 latest tag 发布） | **28,449** | [registry](https://registry.npmjs.org/@antv/x6-react-shape) / [downloads](https://api.npmjs.org/downloads/point/last-week/@antv/x6-react-shape) |

- @antv/x6 依赖：dom-align、lodash-es、mousetrap、utility-types（latest 的 dependencies）。
- @antv/x6-react-shape peerDependencies：`react: ">=18.0.0"`、`react-dom: ">= 18.0.0"`、`@antv/x6: "^3.x"`——与 React18 + X6 3.x 组合直接对齐。
- react-shape latest（3.0.1）与 x6 latest（3.1.8）存在小版本差；3.1.1/3.2.1 已在 2026-05-19 发布但未打 latest tag（跟随 3.x 主线的 alpha/beta 通道——**dist-tag 归属未进一步确认**）。

### 6. 优缺点清单（事实向）

**优点（每条附证据）**
1. 生态存量极大：周下载 138,884（约 LogicFlow 的 11 倍），中文社区案例/踩坑文章多（[downloads API](https://api.npmjs.org/downloads/point/last-week/@antv/x6)；[掘金踩坑文](https://juejin.cn/) 等社区内容见于 DDG 检索）。
2. 钉钉式设计器三件套齐备且内置主包：Stencil 侧边栏（分组/折叠/搜索）+ Dnd + connecting 约束体系（[stencil.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/plugins/stencil.zh.md)、[interacting.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/basic/interacting.zh.md)）。
3. React 官方封装成熟（164 个版本的 @antv/x6-react-shape，周下载 2.8 万），文档示例直接演示 antd 组件入节点，且官方明确 React18+ 兼容矩阵（[react.zh.md](https://github.com/antvis/X6/blob/master/site/docs/tutorial/intermediate/react.zh.md)）。
4. 3.x 文档全量中英双语，含 serialization（toJSON/fromJSON）、interacting、port、edge 等基础教程与 11 个插件文档（[site/docs 目录](https://api.github.com/repos/antvis/X6/contents/site/docs/tutorial/plugins)）。
5. MIT 许可，比 Apache-2.0 更宽松。
6. 官方示例库直接提供 BPMN/流程图/DAG/ER 场景 demo（[examples/showcase/practices](https://x6.antv.antgroup.com/examples/showcase/practices/#bpmn)）。

**缺点/风险（每条附证据）**
1. **维护强度低是最大风险**：近 6 个月 8 个 commit（chore/docs/CI 为主）vs LogicFlow 同期 89 个（[X6 commits](https://api.github.com/repos/antvis/X6/commits?per_page=100&since=2026-03-29T00:00:00Z)）；open issues 150 个堆积。
2. 历史上出现过 22 个月（2024-01→2025-11）无稳定版发布，社区 PR 合并后长期不发版（[Discussion #4387](https://github.com/antvis/X6/discussions/4387)：「等一个已合并的 PR 等了七个月」）——升级/bugfix 响应节奏不可依赖官方承诺。
3. 3.x 为破坏性大版本（仓库从 monorepo 重构为单包、插件并入主包、x6-react-shape 需 3.x 配套，[react.zh.md 版本警告](https://github.com/antvis/X6/blob/master/site/docs/tutorial/intermediate/react.zh.md)）；存量 2.x 教程/博客与 3.x API 存在代差，检索资料需辨别版本。
4. Discussion #4387 中官方零回复 + OSCP 社区共建转向（[官网横幅](https://x6.antv.antgroup.com/)），官方投入重心存疑（**推断性描述，基于横幅与回复缺失的事实**）。
5. 更新日志放在语雀（外部平台），GitHub Releases 不完全同步（npm 3.1.8 在 Releases 页缺失）——发版透明度打折（[官网更新日志入口](https://x6.antv.antgroup.com/)）。
6. react-shape latest（3.0.1，2025-11）落后于 x6 latest（3.1.8，2026-08），配套包节奏不同步（[registry x6](https://registry.npmjs.org/@antv/x6) / [registry react-shape](https://registry.npmjs.org/@antv/x6-react-shape)）。

---

## 来源列表（访问日期均为 2026-09-29）

| # | 来源 | URL |
|---|---|---|
| 1 | GitHub API: didi/LogicFlow 仓库元数据 | https://api.github.com/repos/didi/LogicFlow |
| 2 | GitHub API: didi/LogicFlow releases（最近5个） | https://api.github.com/repos/didi/LogicFlow/releases?per_page=5 |
| 3 | GitHub API: didi/LogicFlow commits（近6个月） | https://api.github.com/repos/didi/LogicFlow/commits?per_page=100&since=2026-03-29T00:00:00Z |
| 4 | npm registry: @logicflow/core | https://registry.npmjs.org/@logicflow/core |
| 5 | npm registry: @logicflow/extension | https://registry.npmjs.org/@logicflow/extension |
| 6 | npm registry: @logicflow/react-node-registry | https://registry.npmjs.org/@logicflow/react-node-registry |
| 7 | npm downloads: @logicflow/core 周下载 | https://api.npmjs.org/downloads/point/last-week/@logicflow/core |
| 8 | npm downloads: @logicflow/extension 周下载 | https://api.npmjs.org/downloads/point/last-week/@logicflow/extension |
| 9 | LogicFlow 官方文档站（2.x） | https://site.logic-flow.cn |
| 10 | LogicFlow 插件总览页 | https://site.logic-flow.cn/tutorial/extension/intro |
| 11 | LogicFlow DndPanel 文档 | https://site.logic-flow.cn/tutorial/extension/dnd-panel |
| 12 | LogicFlow 文档源码: tutorial/extension 目录（插件清单） | https://api.github.com/repos/didi/LogicFlow/contents/sites/docs/docs/tutorial/extension |
| 13 | LogicFlow 文档源码: tutorial/advanced 目录 | https://api.github.com/repos/didi/LogicFlow/contents/sites/docs/docs/tutorial/advanced |
| 14 | LogicFlow 文档源码: react.zh.md（React 节点） | https://raw.githubusercontent.com/didi/LogicFlow/master/sites/docs/docs/tutorial/advanced/react.zh.md |
| 15 | LogicFlow 文档源码: snapline.en.md（对齐线，仅英文） | https://raw.githubusercontent.com/didi/LogicFlow/master/sites/docs/docs/tutorial/advanced/snapline.en.md |
| 16 | LogicFlow 文档源码: bpmn-element.zh.md（BPMN 插件+免责声明） | https://raw.githubusercontent.com/didi/LogicFlow/master/sites/docs/docs/tutorial/extension/bpmn-element.zh.md |
| 17 | LogicFlow 文档源码: 构造 API index.zh.md（history/grid/snapline 默认值） | https://raw.githubusercontent.com/didi/LogicFlow/master/sites/docs/docs/api/logicflow-constructor/index.zh.md |
| 18 | LogicFlow 文档源码: render-and-data.zh.md（getGraphData/render/adapter） | https://raw.githubusercontent.com/didi/LogicFlow/master/sites/docs/docs/api/logicflow-instance/render-and-data.zh.md |
| 19 | LogicFlow 文档源码: history.zh.md（undo/redo） | https://raw.githubusercontent.com/didi/LogicFlow/master/sites/docs/docs/api/logicflow-instance/history.zh.md |
| 20 | LogicFlow 示例目录（react/extension/graph/node） | https://api.github.com/repos/didi/LogicFlow/contents/sites/docs/examples |
| 21 | GitHub API: antvis/X6 仓库元数据 | https://api.github.com/repos/antvis/X6 |
| 22 | GitHub API: antvis/X6 releases（最近5个） | https://api.github.com/repos/antvis/X6/releases?per_page=5 |
| 23 | GitHub API: antvis/X6 commits（近6个月） | https://api.github.com/repos/antvis/X6/commits?per_page=100&since=2026-03-29T00:00:00Z |
| 24 | GitHub Discussion: X6后续更新与维护计划 #4387 | https://github.com/antvis/X6/discussions/4387 |
| 25 | npm registry: @antv/x6（版本时间线 2.18.1/3.0.1/3.1.8） | https://registry.npmjs.org/@antv/x6 |
| 26 | npm registry: @antv/x6-react-shape | https://registry.npmjs.org/@antv/x6-react-shape |
| 27 | npm downloads: @antv/x6 周下载 | https://api.npmjs.org/downloads/point/last-week/@antv/x6 |
| 28 | npm downloads: @antv/x6-react-shape 周下载 | https://api.npmjs.org/downloads/point/last-week/@antv/x6-react-shape |
| 29 | AntV X6 官网（含 OSCP 横幅） | https://x6.antv.antgroup.com/ |
| 30 | X6 文档源码: plugins 目录（11个插件双语清单） | https://api.github.com/repos/antvis/X6/contents/site/docs/tutorial/plugins |
| 31 | X6 文档源码: intermediate 目录（react/vue/angular/html） | https://api.github.com/repos/antvis/X6/contents/site/docs/tutorial/intermediate |
| 32 | X6 文档源码: react.zh.md（x6-react-shape + React18 兼容警告） | https://raw.githubusercontent.com/antvis/X6/master/site/docs/tutorial/intermediate/react.zh.md |
| 33 | X6 文档源码: stencil.zh.md（侧边栏模板面板） | https://raw.githubusercontent.com/antvis/X6/master/site/docs/tutorial/plugins/stencil.zh.md |
| 34 | X6 文档源码: serialization.zh.md（toJSON/fromJSON） | https://raw.githubusercontent.com/antvis/X6/master/site/docs/tutorial/basic/serialization.zh.md |
| 35 | X6 文档源码: interacting.zh.md（connecting/allowXXX/只读/嵌入） | https://raw.githubusercontent.com/antvis/X6/master/site/docs/tutorial/basic/interacting.zh.md |
| 36 | X6 官方示例站（BPMN/流程图/agentFlow） | https://x6.antv.antgroup.com/examples/showcase/practices/#bpmn |
| 37 | DuckDuckGo 检索: antv x6 维护 停止 | https://duckduckgo.com/?q=antv+x6+%E7%BB%B4%E6%8A%A4+%E5%81%9C%E6%AD%A2+%E4%B8%8D%E7%BB%B4%E6%8A%A4&ia=web |
| 38 | 知乎提问（DDG 检索命中）：antv x6是不是不更新作废了 | （经来源37检索命中 zhihu.com 页面，未单独打开原文） |
| 39 | X6 更新日志（语雀，官网入口） | https://www.yuque.com/antv/x6/gkniz4iiyxftgv0r |
| 40 | AntV OSCP 开源共建计划项目板 | https://github.com/orgs/antvis/projects/25 |
