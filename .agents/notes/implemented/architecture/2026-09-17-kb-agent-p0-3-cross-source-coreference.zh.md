# Agent Note: kb-agent P0-3 跨源共指 — 文档实体与业务行之间的 `corefers_with` 桥

Status: implemented

[English](2026-09-17-kb-agent-p0-3-cross-source-coreference.md) | 中文

## Problem

知识图里躺着两个互不连通的家族。语料抽取实体（`kb:` id，708 节点）落内置本体类型（Region/Warehouse/Process/company…）；NocoBase 行（`nocobase:` id，207+ 节点）落集合名类型。`alignEntity` 按同类型限定候选，两套类型永不相交，合并永不触发——kg-build 的四条腿之间也没有任何跨源建边的 pass。结构性后果：从「莫斯科主仓」走图永远到不了 `nocobase:experts:1`（张红喜——其 中亚货运动线方案/海外仓风险应对咨询/食品出海合规咨询 正是仓库应急问题的答案），尽管 `customs_export:1` 与文档 Region 同名「中亚」。

## Decision

第五条管线腿只建共指边、不合并任何实体。内置本体注册 `corefers_with`（共指，`builtin-ontology`，端点不限——配对跨本体层：文档 Region 是 Concept，NocoBase 行是 Object；版本 1.0.0 → 1.1.0）。`KgStore.listNodes(tenant, k)` 是新的批量枚举原语（store + runtime 转发）；kg-build 的 `crossSourceAlign` 腿拉取租户节点，按自家 mappers 铸出的 id 前缀分流（`kb:` 文档 vs `nocobase:` 行），应用 `src/cross-source.ts` 的确定性规则：归一化名称相等建置信 1 的边，行名包含文档名建 0.75 的边，归一化后不足两字符的名字与人名 `Expert` 类型排除，包含方向单向（行名以子串携带文档主题，反向不成立）。每条边以 `sourceSystem: 'kg-align'`、文档节点 id 作 `sourceId`，七列锚保证重跑幂等；重跑先墓碑每个存活文档实体的旧断言再重建，行伙伴改名后旧边随之消失。`crossSourceAlign: { enabled, exactOnly }` 是已验证的配置字段（`exactOnly` 丢弃包含匹配，供对噪音敏感的部署收紧）；枚举上限 fail loud，绝不对半张图做对齐。

## Alternatives considered

- **放宽 `alignEntity` 做跨类型合并。** 合并改写 id 归属，只能靠别名手术回退；错误的跨家族合并比错误的边代价更高，而灰区 LLM 裁决路径本就为同类型合并而设。
- **LLM 裁决跨源配对。** 关键匹配是短主题名上的精确归一化或包含关系；确定性规则不需要 key、没有 prompt 漂移、可单测。
- **每次 run 用固定 scope 一次性墓碑全部 `kg-align` 边。** 按文档实体定域让 provenance 地址有意义（`sourceId` = 文档实体），并沿用其他腿使用的同一七列锚。

## Consequences

- 两个家族在走图意义上合一：文档实体经一条共指边加既有 fk 边到达专家服务与专家，双方都不失去身份与溯源。
- 重建后的租户图有 134 条活跨家族边（此前为 0）；`examples/kb-agent/scripts/kg-build.mts` 的递归 CTE 断言「莫斯科主仓 ↔ nocobase:experts:1」无跳数限制可达，并断言文档「中亚」共指到 中亚货运动线方案。
- `kg_query`「张红喜的供货链」（2 跳）返回 export-risk 社区节点（食品出海等）——原始会话无法产出的跨社区答案。
- 包含边按构造即主题相关（「中亚」连中亚相关服务/数据集）；只要精确匹配的部署设 `exactOnly: true`。

## Verification

- 失败测试先行，修复后全绿：`packages/kb/kg-build/tests/cross-source.spec.ts`（规则矩阵：精确/包含置信度、归一化、`exactOnly`、短名与 Expert 排除、错侧 id 过滤；管线集成——文档 Region 经 `corefers_with` 边 2 跳到达 `nocobase:experts:1`、重跑计数稳定、`enabled`/`exactOnly` 开关）、`packages/kb/kb-graph/tests/ontology.spec.ts`（`corefers_with` 不限端点注册、版本 1.1.0）、`packages/kb/kb-graph-sqlite/tests/store-v2.spec.ts`（`listNodes` 租户隔离与上限）。
- 对活 NocoBase + MiniMax 真实重建：cross-source align 报告 `docCandidates=708 nocobaseNodes=222 edgesCreated=134`；验收脚本的递归 CTE 证明 莫斯科主仓 ↔ experts:1 路径；「张红喜的供货链」走查返回 export-risk 节点；幂等第二次 run 计数不变（1110 节点 / 814 边稳定）。
- 重放矩阵（headless 重放；`nb_list`/`kg_subgraph` 按真实 `tool/call` 事件计数；「张红喜」指名字出现在最终答案）：

  | Prompt | nb_list | kg_subgraph | 答案含张红喜 |
  |---|---|---|---|
  | 「俄罗斯仓库被炸了，有没有别的路径」— 迭代1，session `445a4c1b` / `38c89ae1` | 0 / 0 | 0 / 0 | 否 / 否 |
  | 「…有没有别的路径？另外有没有能出海外仓风险应对方案的专家？」— 迭代1，专家追问变体 | ≥1 | — | 是 |
  | 「俄罗斯仓库被炸了，有没有别的路径」— 迭代2，persona 硬规则后，session `7055db1c` / `847d60ad` | 3 / 2 | 1 / 1 | 是 / 是 |

  迭代1的闭合由专家追问变体达成，而非原始单问：两次原始 prompt 重放都以改道路径事实收尾，`nb_list`/`kg_subgraph` 均为 0，未署名任何专家。原始单问在迭代2（kb-agent persona 应急类硬规则）后闭合——两次重放都署名 张红喜 并给出 `expert_services/2`（¥6,800，PDF 交付物），零 `FS_NOT_FOUND`、零 `INVALID_ARGS`。
- `pnpm run typecheck` 绿；kg-build、kb-graph、kb-graph-sqlite、tool-kb 套件绿（涉及包共 170 + 219 测试）。
