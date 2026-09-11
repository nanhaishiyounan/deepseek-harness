# 批次 B2：本体+知识图谱内置数据初始化（接入 setup 链 + 图谱页默认视图）

> 隶属 [PLAN.md](PLAN.md) §1.2/§2/§3 根因与方案映射、§4 决策 3/4/5。前置：B1 已合入（connector-files 修复与示例文件就位）。参考方案摘录见 PLAN §3（历史会话.md 的"数据先行+三源综合"与本仓 kg-build 四腿的对应关系）。

**目标**：重置（删除三份 sqlite / 重装 NocoBase）后单跑 `node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts`（默认 all）即得完整内置数据——市场种子、湖仓、**本体+知识图谱（综合业务系统 collections + 湖仓表结构 + KB 语料三源）**；图谱页打开即有图。

## 第 0 步：图谱页空因实证（动工前必做，结论写进本批实录）

当前机器 `workspace/kg-graph.sqlite` **在盘且有数据**（实测 2026-09-10：kg_nodes=1293 / kg_edges=867 / kg_source_runs=73，PLAN §1.2）。起服实测判定用户所见"空图"的页面侧原因：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml --no-open
# 浏览器开 http://127.0.0.1:3080 → 图谱 tab；或 devtools 调 api.kg.stats
```

- **情形 A：stats nodes>0 而画布空** ⇒ 设计现状即"初始空画布+图例 31 类型，等用户输入种子游走"（[ui-kg index.ts:86-107](../../packages/client/ui-kg/src/client/index.ts)）→ 本批第 3 节默认视图修复解决。
- **情形 B：stats=0 或 kg-* 结构化拒绝** ⇒ 按三关排查：`kgEnabled`/seam/`kgTenant`（[api-proxy.ts:1449-1462](../../packages/host/apiproxy/src/api-proxy.ts)）与 cwd 相对路径解析（[store.ts:244-245](../../packages/kb/kb-graph-sqlite/src/store.ts) `resolve(path)`，path 相对 dsh web 进程 cwd；[cordis.patch.yml:156-159](../../examples/kb-agent/cordis.patch.yml)）→ 实证结论决定是否需修组合配置。
- 无论哪种情形，"重置后 setup all 即有图"的结构性修复（下述 1/2 节）都必须做。

## 改动面清单

| 文件 | 改动 | 依据 |
|---|---|---|
| `examples/kb-agent/scripts/setup-dsh-data.mts`（新建） | DSH 侧数据初始化编排：connector-files ensure → seed-lakehouse → seed-market → kg-build（分级）→ 可选 seed-kb（有 key）。子进程重放既有脚本（与 [setup-nocobase.mts](../../examples/kb-agent/scripts/setup-nocobase.mts) 重放 crm/hub 同模式），逐步打印 kept/created | 决策 3；幂等模板参照 [setup-nocobase.mts 的 probe→kept→else create](../../examples/kb-agent/scripts/setup-nocobase.mts)（collection :362-364、种子行 :388-391、workflow :407-410） |
| [setup-nocobase.mts](../../examples/kb-agent/scripts/setup-nocobase.mts) | `all` 链在模块重放（[:854-862](../../examples/kb-agent/scripts/setup-nocobase.mts)）之后、`verify` 之前插入子进程重放 `setup-dsh-data.mts`；`stepVerify` 追加断言：`examples/kb-agent/workspace/kg-graph.sqlite` 存在且 `kg_nodes>0`（sqlite 只读查询） | 决策 3；verify 行数下限断言先例（N16 crm_leads≥30 等，[handoff](../handoff-2026-09-10.zh.md) §2） |
| [setup-dsh-data.mts] 内 kg-build 分级 | 有 `MINIMAX_API_KEY` → 全四腿子进程重放 [kg-build.mts](../../examples/kb-agent/scripts/kg-build.mts)（现成 18 项断言 + 幂等水位，[index.ts:368-408](../../packages/kb/kg-build/src/index.ts)）；无 key → console 明示跳过 corpus LLM 腿，仍跑确定性三腿 | 决策 4；kg-build.mts 需支持"跳过 LLM 腿"参数（若无则本批加 `--no-llm` flag，改动小且向后兼容） |
| [ui-kg/src/client](../../packages/client/ui-kg/src/client) | 图谱页默认视图：进页除 `api.kg.schema` 外自动发起一次默认游走（方案 a：预置种子短语如高频实体"张红喜"跑 `kg.subgraph`；方案 b：`api.kg.stats` 后取 top 实体做种子；方案 c：新增轻端点 `kg.overview` 返回高连接度子图）。**实施时按最小改动选一个**，UI 呈现"默认视图 + 可清空重游" | 决策 5；验收锁定"打开 tab 画布节点>0"不锁实现 |
| [apps/web/tests](../../apps/web/tests) 或 [examples/kb-agent/tests](../../examples/kb-agent/tests) | 图谱页断言：kg tab 打开后画布节点数 >0（e2e 或 keyless 快照，视组合依赖选 lane；[graph-smoke.mts](../../examples/kb-agent/scripts/graph-smoke.mts) 已有冒烟可扩展） | 防假阳 PASS |
| [QUICKSTART.zh.md](../../examples/kb-agent/QUICKSTART.zh.md) | 冷启动链 :48-55 从四步并为两步（setup all 内含 DSH 数据初始化；kg-build 独立命令保留为增量工具） | 文档同步 |

## 三源输入与本体映射（对齐历史会话方案，实施对照表）

历史会话.md 的"数据先行"管线（湖仓先存数据→AI 分析→发现概念/属性/关系→本体→映射→图谱，PLAN §3.4-3.6）落到本仓既有组件：

| 历史会话概念 | 本仓对应（不动） | 备注 |
|---|---|---|
| 数据理解引擎（Schema 分析/实体发现/关系发现） | kg-build 确定性映射腿：NocoBase `listMeta`+R01-R13（表→类型 R01、PK→natural_key R02、列→属性 R05、belongsTo→边 R06…） | 业务系统源 |
| 同上（湖仓表结构） | lakehouse catalog 腿（[index.ts:423-441](../../packages/kb/kg-build/src/index.ts)） | 湖仓源 |
| AI 本体生成/文本抽取（OntoGPT 路线） | corpus 闭集 LLM 抽取腿（[:465-571](../../packages/kb/kg-build/src/index.ts)，MiniMax，输入 `workspace/data/` 46+ 篇） | 知识库源 |
| 本体模型（Class/Property/Relation/Constraint） | kb-graph 注册表 31 类型+23 关系（[ontology.ts:79-172](../../packages/kb/kb-graph/src/ontology.ts)，已发布的"本体 V1"）+ sqlite 七表 | 图谱页图例即本体可视化 |
| 人工审核/本体迭代 V2 | **本轮不做**（范围控制，PLAN §7） | — |

## 实施步骤

1. 第 0 步实证（上文），结论记入实录。
2. 写 `setup-dsh-data.mts`：每子步 `existsSync`/水位探测 → 已就绪打印 kept 跳过 → 否则子进程重放对应脚本；顺序 connector-files ensure（mkdir + 校验示例文件在，B1 已 git 内置则通常 kept）→ seed-lakehouse（[seed-lakehouse.mts](../../examples/kb-agent/scripts/seed-lakehouse.mts) 同表替换幂等）→ seed-market（[seed-market.mts](../../examples/kb-agent/scripts/seed-market.mts) 按 title 幂等）→ kg-build（分级）→（有 key 时 seed-kb，[seed-kb.mts](../../examples/kb-agent/scripts/seed-kb.mts) 同 sourcePath 替换幂等）。
3. setup-nocobase.mts `all` 链插入 + verify 追加 kg 断言。
4. kg-build.mts 支持 `--no-llm`（若现状不支持）：跳过 corpus 腿、其余三腿照跑，输出明示。
5. 图谱页默认视图（三方案选一实施）+ e2e/快照断言。
6. QUICKSTART 更新。

## 幂等要求（硬性）

- `setup all` 二跑 EXIT=0 且全步 kept/skip（kg-build 二跑水位全 skip、计数零增量——[kg-build.mts:121-126](../../examples/kb-agent/scripts/kg-build.mts) 已有此断言语义，setup-dsh-data 透传其输出）。
- 种子脚本幂等键不变（title/name/同表替换）；不引入新的"先删后建"。

## 验收断言（可自动化，防假阳）

1. **重置实证**：`rm examples/kb-agent/workspace/{kg-graph.sqlite,kb.sqlite,lakehouse-catalog.sqlite}*` → 单跑 `node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts` EXIT=0 → `sqlite3 examples/kb-agent/workspace/kg-graph.sqlite "SELECT COUNT(*) FROM kg_nodes;"` **有 key ≥600、无 key >0**；`kg_edges` 同理（有 key ≥400）。阈值低于历史终态 1292/858 是为容纳 reset 后 NocoBase 重放的数据波动；实录中记录实际值。
2. **幂等**：紧接二跑 all → EXIT=0，kg_nodes 计数与首跑末值一致（增量 0）。
3. **页面**：起服后图谱 tab 打开即有图——e2e 断言画布（或降级的关系清单视图）节点数 >0；`api.kg.stats` nodes>0。**不允许"图例 31 类型但 0 实体"假阳**。
4. **既有门禁**：`pnpm run test:web`（kb-workbench/market-pages 不回归）、`pnpm run typecheck && pnpm run lint && pnpm run doc-sync` EXIT=0。
5. **市场联动**：B1 验收复跑（assets.stats 200 且 products>0）。

## 测试与文档同步

- Agent Note：setup 链扩展（DSH 数据编排 + kg 分级语义 + verify 新断言）与图谱默认视图决策。
- QUICKSTART 冷启动链简化 + [handoff-2026-09-10.zh.md](../handoff-2026-09-10.zh.md) 顶部补本轮终态段（或由 B5 统一写）。
- 若新增 `kg.overview` 端点：apiproxy kg 域契约（[api/assets.ts](../../packages/host/apiproxy/src/api) 同级 kg 契约文件）与 SDK 面同步（AGENTS：模型可见⟺ logged 不适用——纯读端点，无新模型输入）。

## 回滚

setup-nocobase.mts 的 all 链插入点单行移除即恢复原语义；setup-dsh-data.mts 独立文件可整体删除；图谱默认视图为前端改动，还原 commit 即可。
