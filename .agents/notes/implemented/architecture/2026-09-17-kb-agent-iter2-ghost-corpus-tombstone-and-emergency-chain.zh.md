# Agent Note: kb-agent 迭代2 —— 幽灵语料墓碑协议、对齐 scope 过滤与应急专家链

Status: implemented

[English](2026-09-17-kb-agent-iter2-ghost-corpus-tombstone-and-emergency-chain.md) | 中文

## Problem

迭代1 验证有三项阻塞。kg-build 语料腿没有 disappeared→墓碑协议（nocobase 腿有），全根扫描时代的 `kb:connector-files/sample-export-compliance.md` 以幽灵状态存活：`kg_source_runs` 的 kb=47 对 KB 的 46 篇文档，17 个幽灵节点挂 35 条活边，而跨源对齐 pass 按 `kb:` 裸前缀取候选，每轮都重新为幽灵配对。另外，原始单问「俄罗斯仓库被炸了，有没有别的路径」始终到不了专家链：迭代1 两次重放（session `445a4c1b` / `38c89ae1`）零 `nb_list`、零 `kg_subgraph` 收尾——persona 的软引导敌不过「答路线」的惯性。

## Decision

- 语料腿补 manifest 差集清扫，镜像 nocobase 腿的 `plan.disappeared` 协议：每轮 run 后，scope 不在 manifest 目录下的 kb source run 先失去活边（`tombstoneBySource('kb', scope)`）再失去水位行。支撑它的是两个 `KgStore` 原语——`listSourceRuns(system)` 与 `deleteSourceRun(system, scope)`（seam 类型、sqlite store + sql 资源、runtime 转发）。
- 对齐 pass 按 manifest scope 过滤文档候选（`kbScopeOfNodeId` 从 `kb:<scope>#<name>` 读回 scope）；旧边墓碑循环仍覆盖全部 `kb:` 节点，幽灵的共指边死亡且不再重建。`CorpusReport.tombstonedScopes` 记录清扫量。
- kb-agent persona 增加按应急类收窄的硬规则（仓库被毁、战争、口岸关闭、罢工）：先用 `kg_subgraph` 摸清中断，再 `nb_list` expert_services、expertId→experts 解析人名、答案署名专家——只以 KG/运价/文档事实收尾的答案不完整。
- Pre-release 立场下删库重建收敛租户图，顺带把 `corefers_with` 注册行的 source 从迭代1 漂移的 `agent-defined` 恢复为 `builtin-ontology`。

## Alternatives considered

- **直接删除幽灵节点。** 图里任何地方都没有节点删除；nocobase 协议对消失的行保留节点、只杀边。镜像它保持单一生命周期模型。
- **kb_search 结果尾部的加固提示。** 仅靠 persona 两次重放都已闭合人名链，提示保持关闭——再加属于过度工程。
- **按节点 id 前缀而非 source run 清扫。** 幽灵 scope 可能所有实体都合并进了规范行（不留任何 `kb:` 节点）；只有水位行如实枚举 scope。

## Consequences

- 幽灵语料无需重建即可自愈：从 manifest 退役的 scope 在下一轮失去边与水位（`tombstonedScopes=1` 再 0，重跑计数稳定）。
- 重建后的图收敛：`kg_source_runs(kb)`=46=KB 文档数，`kb:connector-files/*` 下活边与节点为零，莫斯科主仓↔`nocobase:experts:1` 递归 CTE 连通，张红喜 2 跳供货链仍返回 export-risk 节点，幂等二跑计数稳定（1157 节点 / 853 边）。
- 原始应急 prompt 无需变体辅助即可端到端闭合；迭代1「仅变体闭合」的事实已记入 P0-3 与 P1 的重放矩阵。

## Verification

- 失败测试先行，后全绿：`packages/kb/kg-build/tests/pipeline.spec.ts`「tombstones manifest-external kb scopes, deletes their watermarks, and stays idempotent」、`packages/kb/kg-build/tests/cross-source.spec.ts`「excludes manifest-external kb nodes from alignment and drops their stale coreferences」、`packages/kb/kb-graph-sqlite/tests/store-v2.spec.ts`「lists source runs per system and deletes retired scopes」、`packages/kb/kb-graph/tests/runtime-v2.spec.ts`「forwards source-run listing and deletion to the v2 store」；kg-build / kb-graph / kb-graph-sqlite / tool-kb 套件通过（321 测试）。
- 对活 NocoBase + MiniMax 真实重建（`examples/kb-agent/scripts/kg-build.mts`）：ALL CHECKS PASSED；SQL 断言 46=46、connector-files 活边与节点为零、递归 CTE CONNECTED、`corefers_with|builtin-ontology`、幂等二跑计数不变。
- 锁定 prompt「俄罗斯仓库被炸了，有没有别的路径」两次独立重放（session `7055db1c` / `847d60ad`）：零 `FS_NOT_FOUND`、`nb_list` 3/2 且零 `INVALID_ARGS`、`kg_subgraph` 1/1、两次最终答案均署名 张红喜 并给出 `expert_services/2`（¥6,800，PDF 交付物）。
- `pnpm run typecheck` 绿；`pnpm run lint` 绿。

## 迭代3 收尾追加

- `normalizeCorpusDir`（corpus-manifest.ts）在解析时归一化每个 manifest `dir`——剥掉前导 `./` 与尾部 `/`，大小写不动（写错的目录名保持可见）——重复检测按归一化键判定；对齐 scope 的前缀查找消费同一导出函数。原始字符串前缀匹配永远命中不了 `./kb/` 写法条目下的 `kb/...` 节点 scope，会把跨源文档候选静默清零。
- `parseCorpusManifest` 同时拒绝逃逸 corpus root 的 dir：含 `..` 段或前导 `/` 即以 `KG_BUILD_CORPUS_MANIFEST_INVALID` 失败并点名非法值，受信 manifest 的 `dir: ../secrets` 无法通过解析进入 KB 播种与 KG 扫描的 scope 前缀。
- `tombstoneBySource` 进 store 的 `write()` 事务，与 `deleteSourceRun` 对称。语句裸跑时，强制语句中途失败（`AFTER UPDATE … RAISE(FAIL)`）会让第一条被扫的边保持墓碑；store-v2.spec 的 write-parity 用例对把两方法钉死为无部分状态的 fail-closed。
- 机械收尾（不另立 note）：api-catalog 的 CorpusReport 投影刷新以携带 `tombstonedScopes`、store.ts 两段错位 JSDoc 移回目标声明、seed-kb.mts 改经 `fileURLToPath` 读路径并以 `existsSync` 守卫。
