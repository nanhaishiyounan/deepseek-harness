# Agent Note: kb-agent P1 检索可达 — kg_subgraph 上限 3 跳、v2 节点搜索走别名、expertId→人名引导

Status: implemented

[English](2026-09-17-kb-agent-p1-retrieval-reach.md) | 中文

## Problem

三个小表面限制了单次检索能走多远。`kg_subgraph` 把 `hops` 钳制在 2，而 P0-3 的 `corefers_with` 桥需要第三跳才能让仓库侧种子跨到专家行。v2 `searchNodes` 不读 `kg_aliases`，只以别名绑定的名字（对齐逻辑合并的输出）解析不成子图种子——v1 `searchEntities` 本就有这第二趟。而 `expert_services` 行的 `expertId` 外键指向 `experts` 里的人名；没有明说路径，模型读到服务行就停在 id 上，答案断掉人名（原始会话的断名失败模式）。

## Decision

- `kg_subgraph` 的跳数钳制 2 → 3，工具 description 与 `hops` 参数 description 写明 0–3 区间与「第三跳跨共指桥」；`maxNodes` 200 预算仍是子图爆炸的兜底。
- SQLite store 的 v2 `searchNodes` 补上与 v1 面相同的别名第二轮：名称趟之后，`select-aliases-for-search`（现同时选出绑定节点的 id/name/type）解析命中绑定别名的查询，对名称趟去重并按 `k` 截断。
- `tool-nocobase` 的 `nb_list` system-prompt 段与 `nb_get` description 写明 id 解析路径（标量外键 id 用目标集合再一次 `nb_list`、filter op `in` 解析）；kb-agent persona 点名具体实例（`expert_services.expertId` → `nb_list experts filter id in [...]` 取回 张红喜）。

## Alternatives considered

- **维持 2 跳、教模型串联两次子图调用。** 两次调用让走查成本翻倍、桥的穿越跨轮拆分；带预算的第三跳是一次确定性改动。
- **写入期把别名并入节点名。** 别名设计上就是可逆的逻辑合并（删行即撤销）；烤进名字会失去可逆性并复制展示数据。
- **为专家服务做专用 join 工具。** 受限 filter 词汇表已能表达该查询（id 上的 `in`）；缺的是引导，不是新工具。

## Consequences

- 从「莫斯科」出发的 3 跳走查一次 `kg_subgraph` 调用即可跨过共指桥。
- 别名绑定的名字在 v2 面解析为种子，与 v1 行为及图谱页搜索一致。
- 重放的仓库应急会话（专家追问变体）经 `nb_list experts filter id in [1,15]` 取回 张红喜，零 `INVALID_ARGS` 重试；原始单问要到迭代2 的 persona 硬规则后才闭合同一人名链（见下方重放矩阵）。

## Verification

- `packages/kb/tool-kb/tests/kg.spec.ts`「clamps hops to 3 and nodes to the budget, applying the relation filter」断言钳制上限；`packages/kb/kb-graph-sqlite/tests/store-v2.spec.ts`「resolves v2 node search through aliases with name-pass deduplication」覆盖别名命中、去重与类型过滤。
- 经真实 Loader 组合刷新 keyless 快照：`examples/kb-agent/tests/kg-tools.spec.ts`（ontology 1.1.0、schema 清单中的 `corefers_with`、cross-source 报告段）。
- 「俄罗斯仓库被炸了，有没有别的路径」重放矩阵（按真实 `tool/call` 计数；「张红喜」= 出现在最终答案）：

  | 原始单问的重放 | nb_list | kg_subgraph | 答案含张红喜 |
  |---|---|---|---|
  | 迭代1 — session `445a4c1b` / `38c89ae1` | 0 / 0 | 0 / 0 | 否 / 否 |
  | 迭代2（persona 硬规则）— session `7055db1c` / `847d60ad` | 3 / 2 | 1 / 1 | 是 / 是 |

  迭代1的运行零 `FS_NOT_FOUND`、带 export-risk 引用，但从未署名专家；其 张红喜 闭合仅来自专家追问变体。迭代2的两次重放以零 `FS_NOT_FOUND`、零 `INVALID_ARGS` 闭合原始单问；完整三行矩阵在 P0-3 note。
- `pnpm run typecheck` 绿；tool-kb + kb-graph-sqlite 套件绿（涉及包共 219 测试）。
