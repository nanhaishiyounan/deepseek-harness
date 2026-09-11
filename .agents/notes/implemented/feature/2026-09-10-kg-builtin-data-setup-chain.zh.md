# Agent Note: 知识图谱成为 setup 链内置数据 + 图谱页默认视图

Status: implemented

[English](2026-09-10-kg-builtin-data-setup-chain.md) | 中文

## 问题

重置后的 kb-agent world（删除 workspace 三份 SQLite，或全新 clone）回来了一个图例正常但实体为零的图谱页：`kg-graph.sqlite`/`kb.sqlite`/`lakehouse-catalog.sqlite` 是 gitignored 运行态，图谱数据只存在于手动跑 `kg-build.mts` 的残留里（QUICKSTART 把它列为独立的冷启动步骤），`setup-nocobase.mts all` 链中没有任何一步重建它们。在结构性缺口之上，图谱页本来就渲染一张刻意留空的画布：`KgView` 挂载时只加载 `kg.schema`，所有游走都在等用户输入种子短语——所以即使机器上盘有 1293 个节点，页面也显示「画布还是空的」直到手动查询（修复前起服实测证实——数据链路、三道门、租户绑定全部健康，输入一个种子立即出图）。

## 决策

### `setup-dsh-data.mts` 编排 DSH 侧数据面；`all` 链在 verify 前重放它

一个新脚本拥有工作台页面读取的、NocoBase 之外的全部数据：connector-files 目录就位（mkdir + B1 的示例资产）、湖仓种子表、市场目录、kg-build 管线、KB 语料入库。各步骤先探测水位（SQLite 只读：catalog 表、已入库的 `documents.source_path`、示例文件），探测未命中才以子进程重放对应脚本；`all` 链在 NocoBase 模块重放之后、`verify` 之前执行它。市场播种无条件重放——其按 title 的探测本身就打印 `assetsSkipped`；kg-build 无条件重放——per-scope 内容哈希水位让无变化的重跑全 skip 且计数零漂移（其自带断言电池会报告）。

### key 分级沿用既有 `MINIMAX_API_KEY` 开关——不加新 flag

任务书允许"若现状不支持则加 `--no-llm`"；`kg-build.mts` 已自带分级（`withKey` 门控语料腿并打印结论），编排器只是向日志复述分级结论后原样重放脚本。`seed-kb` 无 key 时响亮跳过——嵌入就是该步骤的全部意义——而三条确定性腿（NocoBase 映射、湖仓 catalog、连接器发现）总是运行，无 key 的 world 也能得到非空图谱。

### 链式重放带 `--no-incremental`

`kg-build.mts` 的验收场景⑥每次全跑都会铸造一个一次性订单，且其节点在 reconcile 后保留（只有边 tombstone），无条件重放会让 `kg_nodes` 每次 `setup all` 增一、击穿零计数漂移的幂等契约。新增 `--no-incremental` 旗标把该腿转为记录在案的跳过；手工验证运行保留完整断言电池。

### verify 拒绝假空世界

`stepVerify` 现在断言 `workspace/kg-graph.sqlite` 存在且 `kg_nodes > 0`（`node:sqlite` 只读），kg 步骤坏掉会让 `setup all` 失败，而不是留下一个「31 个图例类型罩着 0 实体」的页面。

### 图谱页打开即走默认视图——stats 门控、零协议改动

打开 tab 触发每个客户端会话一次的自动视图：先 `api.kg.stats`，仅实体数非零才继续 `kg.search({ query: '' })` 取前三个节点（searchNodes 的契约是大小写不敏感的子串过滤，空探针匹配全部节点），再以这些名字跑一次 hop 1 的 `kg.subgraph` 游走。零实体图保持构建引导空态——默认视图不得在未构建的世界上伪造画布——探测失败则画布原样保留，用户自己的游走照旧全量报错。该选择同时避开硬编码种子名（页面耦合到某一行专家数据）与新增 `kg.overview` 端点（为一次读取动 apiproxy 契约 + SDK 面）。

## 已考虑的替代方案

**新增返回高连接度子图的 `kg.overview` 端点。** 放弃：改动更大——为 `stats + search + subgraph` 已能回答的读取新增 wire 契约、schema 与 SDK 投影；默认视图是编排问题，不是新服务端能力。

**打开即走预置种子短语（如 张红喜）。** 放弃其耦合：页面将依赖某一行被种下的专家在未来每次 fixture 变更后仍然存活，行一改名默认视图就静默退化；空子串探针自适应图里实际有什么。

**编排器在 kg-build 前加水位探测（节点 > 0 即跳过）。** 放弃：NocoBase 数据可能在上次构建后已变化，kg-build 的内容哈希水位已提供廉价的无操作重跑——编排器层跳过会掩盖正当的增量重建。

## 后果

删除三份 SQLite 后单跑 `setup all` 即端到端重建完整数据面（实测计数见下）；紧接的二跑 `all` 全 kept、kg 计数零漂移。图谱页在 setup 链产出的任何世界上默认打开即有画布，keyless 的 `kg-graph-page` web e2e lane 用内存种子库锁住两半保证（网关 stats 与免手动输入的画布）。QUICKSTART 冷启动文案把独立的图谱构建步骤并入 `all` 链，`kg-build.mts` 保留为增量工具的记载。换来的代价：空子串探针依赖 searchNodes 的子串契约（未来换 FTS 后端的 store 必须保持"空查询匹配全部"该默认视图才成立），且有 key 的首次 `setup all` 变长数分钟（真实语料抽取与嵌入）。
