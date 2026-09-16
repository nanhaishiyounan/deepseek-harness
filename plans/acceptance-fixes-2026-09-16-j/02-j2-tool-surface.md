# J2：五域工具面全覆盖（2026-09-16，批次详档）

> 诉求 2 原话：「dsh能够调用的数据包含**知识库、数据湖仓、数据资产、连接器、业务系统的所有数据**！！！！」。缺口矩阵见 [00-research-notes.md §2](00-research-notes.md)。

## 0. 裁决摘要

| 决策点 | 裁决 | 理由 |
|---|---|---|
| 30 场景工具面 | **全量挂载 18 工具**（与默认会话对齐），persona 保持场景聚焦指引（「优先用本场景语料与 kb_search，跨域问题按需用其他域工具」） | 用户四个感叹号要的是全量可达；B 轮「场景=语料隔离」设计通过 persona 聚焦而非工具裁剪来保；技术上最简单（30 个 yml 统一加行+快照再生），且 J3 的 tab 上下文注入让场景会话也能感知视图 |
| kg 模板查询 AI 投影 | **`kg-nl.ts` 模板编译器从 apiproxy 下沉到 [`packages/kb/`](../../packages/kb) 能力面**（单一事实源），apiproxy `kg.query` RPC 与新 AI 工具 `kg_query` 共用 | H 轮 9 模板精度收益（模板+槽位 100% vs 自由生成 64.5%）应惠及对话；工具定义放 tool-kb 与 kg_schema/kg_subgraph 同处；apiproxy 行为零漂移由单测锁死 |
| 资产目录 AI 面 | **新增只读工具 `assets_browse`**（list/detail/stats 三动作，单工具+action 枚举） | 缺口矩阵 market 行；只读零风险；数据读取路径与 apiproxy assets 域同源（第 0 步核实后决定抽共享 service 还是直查） |
| 连接器管理 AI 面 | **不加**（连接增删/凭据配置保持 UI-only） | 涉凭据面，UI-only 是安全设计；数据面 discover/fetch/transfer 已够「调用连接器数据」——在 PLAN 期待管理中说明 |
| NocoBase workflow/审批工具 | **不加**（保持通用 nb_* + 确认契约） | 「确认契约+通用 REST」是既有设计哲学（00 §2.3）；workflow 语义工具留五系统后期路线 |
| 默认会话 persona | **补 kg 路由行**（五域分流指引补全为完整六面清单） | persona 缺 kg 仅靠 `tool:kg` 兜底（order112）；一行文案修复 |

## 1. 范围

**做**：30 场景 `agent.cordis.yml` 工具行扩容 + 快照再生；kg-nl 编译器下沉 + `kg_query` 工具；`assets_browse` 工具；默认 persona 补 kg；工具 `tool:*` 指引段与 persona 文案对齐；verify 断言更新。
**不做**：host 组合层（`cordis.patch.yml:120-258`）无 preset 会话的工具面（已全）；连接器管理/workflow 工具；`cordis.patch.yml` host persona（被 preset 遮蔽，改无意义）。

## 2. 实施步骤

### 步骤 0：第 0 步核实（先跑再动手）

1. `assets` 域数据读取路径：`rg "assets" packages/host/apiproxy/src/api/` 找到 catalog/stats 查询实现位置（api-proxy.ts 内嵌或独立模块）——裁决 `assets_browse` 数据面挂点。
2. 跑基线：`pnpm vitest run examples/kb-agent` 记录当前 scenarios/kb-presets 快照状态。

### 步骤 1：kg-nl 编译器下沉（先重构后加工具，TDD）

1. 把 [`packages/host/apiproxy/src/kg-nl.ts`](../../packages/host/apiproxy/src/kg-nl.ts:52)（9 模板 + `compileKgQuery` + 错误码 `kg-query-unsupported`/`kg-seed-unresolved`）整体迁至 [`packages/kb/kb-graph/src/`](../../packages/kb)（或 tool-kb 可 import 的 kb 包内合适位置——kb-graph 是图管线所在；错误码/类型随迁导出）。
2. apiproxy [`api-proxy.ts:4265-4307`](../../packages/host/apiproxy/src/api-proxy.ts:4265) 改为 import 共享实现；**RPC 行为零漂移**：为 `kg.query` 补/迁移单测（9 模板正反例、闭集校验、seed 未解析错误码）。
3. 运行 `pnpm run test`（kb + apiproxy 相关面）确认绿。

### 步骤 2：`kg_query` AI 工具（tool-kb）

新文件 `packages/kb/tool-kb/src/kg-query.ts`（模式对齐 [`kg.ts`](../../packages/kb/tool-kb/src/kg.ts:269)）：

- 输入 schema：`{ phrase: string }`（自然语言短语，如「供应酱油原料的供应商有哪些产品」）+ 可选 `hops` 修正。
- 执行：`compileKgQuery(phrase)` → `{seeds, relation_types, hops}` → 复用 `kg_subgraph` 的执行路径（闭集校验）→ 返回结构化子图摘要（模板名/restated/实体关系行，对齐 apiproxy `kg.query` 返回字段）。
- `tool:*` system prompt section（order 对齐 kg 族 112 带）说明：中文短语模板清单（9 模板名+示例问法）、失败时回退 `kg_schema`+`kg_subgraph` 自由查询。
- 在 [`index.ts`](../../packages/kb/tool-kb/src/index.ts:55) 注册（`ctx.effect()`；config 开关沿用族配置风格，默认启用）。
- 单测：9 模板编译直达 + 不可识别短语错误回传（模型可读的失败文案）。

### 步骤 3：`assets_browse` 工具

- 位置裁决（第 0 步结论）：
  - 若 apiproxy assets 查询逻辑可抽：新包 `packages/assets/tool-assets/`（对齐 tool-connector 目录形态），数据面走共享 service；
  - 若深嵌 api-proxy.ts：工具放 `examples/kb-agent` 组合层直查 PG（同 expert-orders 的部署层形态），**不在 apiproxy 里加 AI 面**（apiproxy 是 UI→BFF 面，AGENTS.md 分层）。
- 输入 schema：`{ action: 'list' | 'detail' | 'stats', filter?: {category?, provider?, q?}, id?: string }`。
- 返回：list=资产卡摘要行（id/标题/分类/provider/价格锚）；detail=单资产完整描述+样例数据说明；stats=分类计数与总量。
- `tool:*` section + 单测（三动作 + 过滤词表）。

### 步骤 4：30 场景工具面扩容

1. 统一在 [`examples/kb-agent/scenarios/*/agent.cordis.yml`](../../examples/kb-agent/scenarios/supplier-development/agent.cordis.yml:5) 追加工具行（对齐默认会话 [`enterprise-data-assistant/agent.cordis.yml:19-27`](../../examples/kb-agent/agent-presets/enterprise-data-assistant/agent.cordis.yml:19) 的 insert 集合：tool-lakehouse/tool-connector(含 order)/tool-nocobase/kg 族/kg_query/assets_browse）——脚本化批量（node 一次性脚本，幂等：已有行跳过），30 文件一致。
2. persona 增补一段「数据面使用边界」：场景语料优先；跨域数据（湖仓表/NocoBase 业务数据/图谱/资产目录）按需调用，回答注明来源域。
3. **快照再生**：[`examples/kb-agent/tests/snapshots/scenarios/expected.md`](../../examples/kb-agent/tests/snapshots/scenarios/expected.md) 每场景工具清单 6→20（18 既有+`kg_query`+`assets_browse`）；`pnpm vitest run examples/kb-agent` 更新快照后二跑零漂移。
4. 默认会话 persona（[`examples/kb-agent/agent-presets/enterprise-data-assistant/agent.cordis.yml`](../../examples/kb-agent/agent-presets/enterprise-data-assistant/agent.cordis.yml:19)）补 kg 路由行 + kg_query/assets_browse 提示；[`tests/snapshots/kb-presets/expected.md`](../../examples/kb-agent/tests/snapshots/kb-presets/expected.md) 相应再生。

### 步骤 5：门禁与断言

- [`examples/kb-agent/tests/verify*.mts`](../../examples/kb-agent/tests/)（H 轮 verify 框架）：新增断言——每场景 agent.cordis.yml 包含全部五域工具插件行（grep 计数 = 30×N）；工具目录（`pnpm run gen-tool-catalog` 若受影响则再生）。
- `pnpm run typecheck && pnpm run lint` EXIT=0；`pnpm run doc-sync`（若 tool-kb README 需更新——新工具要 README 一段）。

## 3. 验收标准（J2 完成 definition）

1. **AI 实调**（真机 :3080 + DEEPSEEK_API_KEY，默认会话）：五域各至少一问真实走通——kb 检索（回归）、湖仓「lakehouse 有哪些表+查询某表行数」、kg「供应酱油原料的供应商」（走 `kg_query` 模板，transcript 出现 tool call）、资产「市场上有哪些专家服务/数据资产」（`assets_browse`）、业务「SRM 里供应商有几家/某供应商证照状态」（`nb_list`）、连接器「能发现哪些数据集」（`connector_discover` 回归）——transcript 截图归档 demos/acceptance-j2/。
2. 场景会话（任选 2 场景，如 supplier-development + market-insight 类）实调：场景内问跨域问题（「该供应商在 SRM 系统的证照状态」）能调 `nb_list` 成功作答——30 场景工具可达的直接证据。
3. scenarios/expected.md 快照：30 场景×20 工具行，二跑零漂移；kb-presets 快照含 kg 路由。
4. apiproxy `kg.query` UI 面（图谱 tab 搜索框）行为回归零漂移（既有单测+真机一短语）。
5. verify 断言全绿；typecheck/lint EXIT=0。

## 4. 风险与回退

| 风险 | 预案 |
|---|---|
| 场景会话工具膨胀导致系统提示变长/模型分心 | persona 聚焦段对冲；J4 观察实调质量，必要时下轮给场景加「工具分组提示精简」 |
| kg-nl 下沉破坏 apiproxy RPC | 单测锁 9 模板+错误码；真机图谱 tab 短语回归 |
| assets 数据面深嵌 api-proxy 抽取成本超预期 | 降级：工具放 examples/kb-agent 部署层直查（裁决 B），不改 apiproxy |
| 30×yml 批量改动与后续场景新增的漂移 | verify 计数断言固化（新场景缺工具行即 fail） |
| 回退 | 三段独立提交：kg-nl 下沉+kg_query / assets_browse / 场景扩容+persona——可分段 revert |
