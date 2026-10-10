# 05 · 图谱可视化：Obsidian 范式与选型

本章覆盖调研问题 5：可视化库选型（1万+节点/几万边）+ Obsidian Local Graph 范式的规格化拆解 + React 18/19 + TS 实现蓝图。

## 5.1 Obsidian Graph View 官方规格拆解（一手双源：obsidian.md/help/plugins/graph 网页版 + obsidianmd/obsidian-help 仓库 Markdown 源）

**基本范式**：圆=节点、线=内部链接；**被引用越多节点越大（入度编码尺寸）**；hover 高亮该节点连接；单击打开笔记；右键上下文菜单；滚轮/±键缩放、拖拽/方向键平移、Shift 加速。

**Filters 全集**：搜索词过滤（支持高级搜索语法）、Tags 开关、Attachments 开关、Existing files only、Orphans（孤立节点）开关、Excluded files 排除模式。

**Groups（颜色组）**：按**任意搜索查询**匹配节点染色（不限于文件夹/标签），每组=搜索词+色圈。→ 企业 KG 的「按本体 class 染色」是其子集（查询=`class:Supplier`）。

**Display**：Arrows（方向箭头开关）、Text fade threshold（标签透明度阈值）、Node size、Link thickness、Animate（按创建时间 time-lapse）。

**Forces（官方暴露 4 个力参数）**：Center force（向心紧凑）、Repel force（斥力）、Link force（弹簧张力）、Link distance（连线长度）——**与 d3-force API 一一对应**：Center≈forceX/forceY、Repel≈forceManyBody、Link force≈forceLink().strength、Link distance≈forceLink().distance。

**Local Graph**：`Open local graph` 命令；显示与当前笔记相连的笔记；可复用全局全部设置；**深度滑杆每级显示与上一级显露节点相连的笔记，上限 5**（forum t/32146 原文实证；社区基于工作记忆 5±2 请求扩至 7/9 被多人 +1，官方未改）。

**hover 行为纠偏（重要）**：Graph 内 hover=**高亮连接**（不出预览弹窗）；页面预览弹窗是**独立核心插件 Page preview**（hover 内链出浮窗，编辑视图需按住 Ctrl/Cmd）——即「hover 预览」在 Obsidian 里是编辑器侧交互，图内是「hover 高亮邻域」。forum t/7515 请求"local graph 加进 preview hover"未实现。

**Backlinks 呈现**：Backlinks 是右侧栏插件（**Linked mentions + Unlinked mentions 两区**：前者真实链接、后者纯文本同名提及），**图内不画反向边**——边就是链接本身，方向仅靠 Arrows 箭头区分（forum t/258 请求区分直链/反链未实现）。**Unlinked mentions 对企业 KG 的类比=「未建链的共指实体」（待确认边）**。

## 5.2 引擎技术构成（外部考证）

- **d3 证词**：forum t/72586（2023）用户 Choquet 逆向分析图物理模型，引述「**River said they used to use d3js on graph view**」（River=Obsidian 团队成员），并验证官方 Link force 参数=d3-force 的 link force（胡克定律弹簧模型）。⚠️ 措辞是"used to use"（曾经用）——当前版本是否仍 d3-force 无法验证（闭源），但官方 4 旋钮与 d3-force 概念一一对应，**按 d3-force 调参面板设计是安全的**（🟡）；
- **无 API 无文档**：extended-graph README 原文"the core graph plugin lacks an API and documentation"——社区插件靠 obsidian-typings 逆向类型打补丁；
- **性能实证（关键决策依据）**：t/2349（2020）官方开发者 Silver 确认"graph view is eating CPU while you're not interacting"（空闲 8-20% CPU，100 笔记也发生）→ 力模拟无休眠机制；t/4804 图面板开着拖累编辑器（29 帖）；t/106287（2025-09）大库图直接不可用。**⇒ Obsidian 全局图在数千节点即卡、官方多年未根治——企业 KG 1 万节点必须 Local Graph 优先，且 simulation 应放 Web Worker（这是超越 Obsidian 的必要改进而非复刻项）**；
- 无任何来源提到官方用 Web Worker 布局；d3-force 具体版本与渲染层（Canvas?）无官方证据（2020 排查路径暗示 Canvas）。

## 5.3 开源复刻项目盘点（三条已验证路线）

**C1 · juggl（HEmile/juggl，821★，2025-02 停更）——Cytoscape 系金标准**：cytoscape ^3.26 + 布局插件 cytoscape-d3-force/cytoscape-cola/cytoscape-cose-bilkent/cytoscape-avsdf/cytoscape-dagre + **cytoscape-popper（hover 弹出）+ cytoscape-navigator（小地图）+ cytoscape-cxtmenu（右键菜单）** + Svelte4。4 种布局（Force directed 默认 Cola/Concentric/Grid/Hierarchical=Dagre）；Workspace 模式（选择性展开/隐藏/**pin 节点**/保存图）；**Link type 给边打标签——企业 KG 关系类型可视化的直接先例**。经验：Cola 布局"有时给出怪异的垂直结果"；Dagre 适合层级本体。

**C2 · Logseq（logseq/logseq）——d3-force 系**：package.json 实证 **d3-force 3.0.0 + graphology 0.20.0**——开源双链笔记图视图=d3-force 布局+graphology 图数据结构。

**C3 · react-obsidian-graph-knowledgebase（mmy-lana，2026-10-05 新建）——React+TS 自研 Canvas 复刻蓝图**：React 19 + TS + Dexie.js；自研 Canvas 引擎：**velocity Verlet 积分 + spring-electrical 物理 + Barnes-Hut 四叉树斥力（N>60 启用）+ 高 DPI**，宣称 60FPS；**Local Graph Inspector 1/2 hop 深度选择**；物理滑杆 4 个（charge repulsion/link distance/link strength/collision radius）；orphan/tag/ghost 未解析链可见性开关；Live Demo: react-obsidian-graph-knowledgebase.vercel.app——**几乎就是 W24 需求的参考蓝图**。

**C4 · 官方图增强生态**：ElsaTam/obsidian-extended-graph（234★：节点图片/形状、按 tag+property 过滤、**按关系类型删边**、Focus 聚焦单节点、pin 节点、节点/边尺寸按统计函数）；excalibrain（1000★ 导航型）；persistent_graph（146★ 保存节点位置——**位置持久化是真实需求**）；Graph-Link-Types（151★ 边类型）。

## 5.4 六库选型矩阵（全维度硬数据）

| 维度 | **react-force-graph-2d** | **sigma.js v3+@react-sigma/core** | Cytoscape.js | vis-network | 3d-force-graph | Cosmograph |
|---|---|---|---|---|---|---|
| 渲染 | Canvas 2D | **WebGL（GPU）** | Canvas（#3261 GPU 增强仍 open） | HTML Canvas | WebGL（three） | GPU/WebGL+DuckDB-WASM |
| 万级节点 | 官方 4k 级示例；#201 用户 8k+ 慢 | 优（issues 全是微优化级） | 官方无量级承诺；**v4 性能重设计进行中（#3486）** | **官方自认仅几千节点** | issue 证明 50k+ 可用（#81） | 公开案例 68.8 万点 |
| 布局 | **d3-force-3d 内置（Obsidian 同族）** | 外接 FA2（可 WebWorker）/graphology 系 | fcose/cola/dagre 扩展（fcose 停更但质量好） | 内置物理 | d3-force-3d 或 ngraph | 内置 |
| 增量展开 | **graphData 热更新（数据驱动，最顺；官方 expandable-nodes/dynamic 双示例）** | graphology addNode+refresh（命令式，不杀实例） | 命令式 | 命令式 | 同 2d 版 | — |
| React 18/19 | react-force-graph 官方层，peer `react *`，与底层同日发版 | @react-sigma/core v5.0.6 peer ^18\|\|^19（**锁 sigma ^3，v4 错位**） | **npm 包已消失；plotly 仓 20 个月停摆——需自写** | react 封装全灭 | 官方层同 2d | @cosmograph/react（peer ≥16.8） |
| TS 类型 | 自带 src/index.d.ts | 自带（TS 重写） | 自带（@types 已退役） | 自带 | 自带 | 自带 |
| hover 卡片 | onNodeHover + **graph2ScreenCoords** 坐标换算 + nodeLabel 支持 HTML | useRegisterEvents enterNode + 原生坐标 | **evt.renderedPosition 官方文档实锤** | 标准 | raycasting 投影换算 | 回调式 |
| 周下载 | **82.6 万**（-2d 包） | 49.3 万（graphology 162.6 万） | **1729 万**（传递依赖放大） | 83 万 | 43 万 | 1.6 万 |
| 维护 | 个人（vasturiano，极高频发版 1.52.0@2026-09-28） | 公司化（OuestWare）+gdotv 赞助，4.0.0@2026-10-08 | Consortium 治理，月级 | chore 式续命（323 open issue） | 同作者 | 团队但**闭源+issues 壳仓停滞** |
| 许可 | MIT | MIT | MIT | Apache-2.0 OR MIT | MIT | **CC-BY-NC-4.0（禁商用）** |
| W24 判定 | **主选** | **>1万节点全量备选** | React 层死亡+Canvas 上限 | 排除 | 3D 摩擦+three 包体 | **许可一票否决** |

**关键事实补充**：sigma v4.0.0（2026-10-08 发布）与 @react-sigma/core v5.0.6（peerDeps 锁 sigma ^3.0.2）存在主版本错位——React 项目实际锁 v3 线（v4 需裸用）。force-graph 性能细节：`enablePointerInteraction(false)` 官方明示性能代价大；HOVER_CANVAS_THROTTLE_DELAY=800ms 默认节流（#366）；`nodeVisibility(false)` 可保留力但不渲染；`zoomToFit(ms,px,nodeFilterFn)` 支持只拟合过滤子集；工具方法 `graph2ScreenCoords/screen2GraphCoords` 是 hover 卡片坐标换算关键。react-sigma 架构关键：SigmaContainer 的 settings/graph props 变更会**杀实例重建**（官方建议"treat it as an immutable component"）——与 force-graph 数据驱动热更新是**相反范式**。sigma "In the wild" 名单：Gephi Lite、BloodHound、ipysigma、**LightRAG（LLM 抽取 KG 可视化——同类场景现成先例）**、Polinode。

## 5.5 「Obsidian 范式 → 企业 KG 前端」规格映射清单

1. **初始视图**：全局图仅作「缩略导航态」（≤2k 节点直接渲染；>2k 降级为聚合簇点或要求先搜索）；**默认入口=搜索定位实体→Local Graph**（图是导航器不是首屏）。实现：d3-force@3（Logseq 同款）+ Canvas 渲染（Verlet/弹簧-电荷模型 + **Barnes-Hut 四叉树 N>60 必开**）。
2. **邻域展开（Local Graph 核心）**：中心实体高亮（环/大号图形）；**深度选择器 1-3 默认、上限 5**（Obsidian 硬上限 5 实证 + depth-2 已 overwhelming 的社区证据）；每级=上一级新显节点的邻居增量展开，新节点淡入动画；深度切换时**保留已稳定节点坐标防跳变**（persistent-graph 插件证明位置持久化是真实需求）。
3. **hover 行为（双层）**：图内 hover=**高亮该节点邻域+其余褪色**（官方行为，非弹窗）；预览卡（Page preview 等价物）=延迟 ~300ms 浮出实体摘要卡（异步拉节点属性+关系计数；企业 KG 无 markdown 预览→用属性表）。实现：四叉树/空间索引命中检测；popper 定位（juggl 用 cytoscape-popper 先例）；force-graph 路线用 graph2ScreenCoords。
4. **backlink/出链区分**：**不画反向边**（Obsidian 范式：边即链接）；箭头开关区分方向；侧栏「Linked/Unlinked mentions」双区→企业 KG 版=「**已建关系/疑似共指（待确认边）**」两区，疑似边虚线渲染（extended-graph 按关系类型删边是先例）；**边携带关系类型标签**（juggl Link type 先例）。
5. **着色策略**：Groups 范式：规则=「查询」而非硬编码→默认**按本体 class 染色**（颜色组面板可编辑查询如 `class:Supplier`）；入度映射节点大小；节点尺寸可选统计函数（extended-graph 先例）。
6. **力参数面板**：复刻官方 4 旋钮（Center/Repel/Link force/Link distance）+ collision radius（复刻项目增补）；映射 d3-force：`forceManyBody().strength(-Repel)`、`forceLink().strength/.distance`、`forceX/Y(Center)`、`forceCollide(radius)`；提供「恢复默认」。
7. **大规模策略**：①Local Graph 优先（Obsidian 全局图数千节点即卡的实证）；②**simulation 放 Web Worker**、alpha 衰减自动停模拟（修 Obsidian 空闲烧 CPU 缺陷）+交互时 alphaTarget 重启；③>2k 全局态禁用逐节点标签（Text fade threshold 思路：按缩放级别显隐）；④小地图 minimap（cytoscape-navigator 先例，Obsidian 反而没有）。
8. **导航与操作**：单击=打开实体详情、右键=上下文菜单、滚轮焦点缩放、触控板双指平移+捏合阻尼、键盘 ±/方向键+Shift 加速；搜索结果与当前打开实体实时反映进图（extended-graph 特性）。

## 5.6 最小实现骨架（react-force-graph-2d，真实 API）

```tsx
const fgRef = useRef<ForceGraphMethods>();
const [data, setData] = useState({nodes:[{id:'root'}],links:[]});
const adj = useMemo(()=>buildAdj(allLinks),[allLinks]);      // 全量邻接表（或按需 fetch 邻居）
const expanded = useRef(new Set(['root']));
const onNodeClick = (node) => {
  if (expanded.current.has(node.id)) return;
  expanded.current.add(node.id);
  const newNodes = [...adj.get(node.id)??[]].filter(id=>!expanded.current.has(id))
    .map(id=>({id, name:id, x:node.x, y:node.y}));            // 继承坐标防跳变
  const newLinks = (adj.get(node.id)??[]).map(t=>({source:node.id,target:t}));
  setData(d=>({nodes:[...d.nodes,...newNodes],links:[...d.links,...newLinks]}));
  fgRef.current?.zoomToFit(400,40, n=>visible(n));            // nodeFilterFn 聚焦邻域
};
<ForceGraph2D ref={fgRef} graphData={data} onNodeClick={onNodeClick}
  nodeVisibility={n=>visible(n)} cooldownTime={4000}
  onNodeHover={(node,prev)=>setHover(node)}                    // 注意无 event 参数
  nodeCanvasObject={(node,ctx,globalScale)=>{ /* 自定义绘制：本体 class 染色 */ }} />
```
hover 卡片：`onNodeHover` setState → 组件层 `fgRef.current.graph2ScreenCoords(node.x,node.y)` 换算屏幕坐标定位绝对定位 div；或 `nodeLabel(d=>'<div class="card">…</div>')` HTML 能力（内部 800ms 节流）。sigma 路线：`const sigma=useSigma(); sigma.getGraph().addNode(id,{x,y,size,label}); …; sigma.refresh();` + FA2 worker 重跑。

**最终判定**：主选 **react-force-graph-2d**（Obsidian 范式渐进展开+开发效率+生态活跃）；万级以上全量渲染需求时上 **sigma.js v3 + @react-sigma/core**；追求 Obsidian 手感全控制权时走 **d3-force@3+graphology+自研 Canvas**（Logseq/复刻项目双先例）。三路线共享 graphology 做图数据层可平滑迁移。
