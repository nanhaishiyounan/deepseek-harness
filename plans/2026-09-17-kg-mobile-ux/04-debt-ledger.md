# 大迭代收口：遗留债清单（M1 + M2 + M3）

汇总三个实施批次（[01-m1-dsh-web-ux-redesign.md](01-m1-dsh-web-ux-redesign.md)、[02-m2-ontology-kg-ai-rebuild.md](02-m2-ontology-kg-ai-rebuild.md)、[03-m3-mobile-client.md](03-m3-mobile-client.md)）验收后仍开放的事项，以及收口修复批次（2026-09-19）质量门抽验新增的记录。每项含来源批次、问题描述、影响、建议处理时机。

收口修复批次本身已清零：ui-kg/ui-mobile-preview 的 25 处未解析 `--dsw-alias-*`/`--dsw-*` 令牌引用改直引既有令牌；ui-primitives 语法懒加载测试的 it 级时间预算放宽（并行负载下 23 个动态 import + eager regex 编译超过默认 5s，产品代码无错误路径）。`pnpm run test:gui` 连续两次 4483 passed + 1 条件 skipped（win32-dialog 于 macOS 平台跳过）、0 failed；typecheck / lint（触面）/ doc-sync（28 项）/ build 全绿。

## 一、M2 本体/KG/AI 重建

### D1. kg_cluster 物化表延后

- 来源批次：M2-P2（社区/变更流）。
- 问题：社区检测（louvain）结果不落物化表，每次查询在内存中现算。
- 影响：当前语料规模（1159 节点）毫秒级完成，无用户可感延迟；语料增长 10 倍后每次进入 KG 视图的首算成本线性上升。
- 建议处理时机：出现跨运行消费者（如按社区聚合的业务卡、订阅社区变更的推送）时一并落地，避免为单一 UI 触点建表。

### D2. corefers_with v2 全图串行 pairwise 判决

- 来源批次：M2-P1（共指 v2）。
- 问题：共指候选对的 LLM 判决逐对串行发起，无结果缓存、无批量化。
- 影响：全图首跑耗时分钟到小时级；重复构建对相同候选对重复计费。
- 建议处理时机：下一次全量重建语料前，先加判决缓存（输入对哈希 → 结论）与批量请求；否则重建窗口不可控。

### D3. Instruct-KGC A/B 门禁未达切换阈值

- 来源批次：M2-P0（抽取闭环）。
- 问题：Instruct-KGC 抽取器与 legacy 抽取器的 A/B 对比未达到预设切换阈值，默认仍走 legacy。
- 影响：新抽取器已具备但未启用；切换决策证据不足。
- 建议处理时机：凑齐 ≥10 chunk 的对照语料复测后决定启用或下线，避免两套抽取器长期并存。

## 二、M3 移动端

### D4. history 轮询非流式

- 来源批次：M3-P0（移动端壳）。
- 问题：会话历史以 1.2s/5s 双频轮询拉取，agent 回复不流式渲染。
- 影响：移动端看到的是成段跳出的回复；轮询间隔内 UI 停顿；服务端承受重复全量查询。
- 建议处理时机：BFF 暴露 SSE/WS 通道后改造（依赖 web-app 传输层升级），或移动端 PWA 化时一并处理。

### D5. 多步链条驳回后前序已写行不回滚

- 来源批次：M3-P2（AI 填表助手任务卡）。
- 问题：多步填表链（步骤 A 写行 → 步骤 B 被人工驳回）不回滚 A 的已写入。
- 影响：驳回后表内留下半链数据，需人工清理；产品语义（驳回 = 整链作废还是仅当前步）待定。
- 建议处理时机：先由产品确认驳回语义；若整链作废，用已有 tombstone 机制补一条链式回滚。

### D12. 任务卡标题槽的单 slot 启发式未 token 化（移动端 v2 清尾批次，2026-09-20）

- 来源批次：M3（AI 填表助手任务卡）移动端 v2 清尾批次验证器判定「可后续」。
- 问题：标题尾括号组与 relation 字段的对应靠启发式（[task-cards.tsx](../../packages/client/ui-mobile/src/client/forms/task-cards.tsx) 的 `TITLE_NAME_GROUP` 取首个 relation 字段），有三类边界：
  1. 多 relation 字段的 draft 首字段未必是标题括号组所指，错配后标题显示与落库不符；
  2. 尾括号内容并非 relation 名（如 PO 号补充说明）时也会被改写为 label 或 `#id` 占位；
  3. label 本身含全角括号时嵌套破坏尾组正则匹配。
- 影响：上述边界下标题与事实不符；单 relation 字段 + 纯名字 label 的主路径（采购单场景）无感。
- 建议处理时机：出现第二个带 relation 标题槽的业务表时落地——persona prompt 产出结构化 `title_tokens`（如 `{prefix, po, supplier_id}`），渲染端按 token 组装，替代正则启发式；需 TITLE_NAME_GROUP 重写与 persona prompt 契约双端同步改。同 id 查询缓存、KNOWN_ENUMS、options 分页维持既有设计，不在此列。

### D6. 演示级鉴权（verifyCode 缝）

- 来源批次：M3-P0（登录）。
- 问题：移动端登录的 verifyCode 校验是演示级实现，无防重放、无频控、无与正式身份体系的对接。
- 影响：不可对外网开放；任何持有码者可反复尝试。
- 建议处理时机：接入真实身份体系（OIDC 或 NocoBase 用户表）时替换，上线前必须完成。

## 三、M1 UI/UX 重设计

### D7. assembled 多源混合 turn 单根工具调用渲染限制

- 来源批次：M1（答案来源卡 SourceTrail / 工具行改造）。
- 问题：一个 turn 内混合多来源（本地会话 + 装配投影）的工具调用时，只按单根调用树渲染。
- 影响：混合 turn 的工具调用展示为扁平单链，与真实并行/嵌套结构不一致。
- 建议处理时机：session 投影层支持多根工具树后跟进渲染；当前触发面窄（仅跨端装配 turn）。

### D8. 供应商 360 真实数据降级路径

- 来源批次：M1（业务管理页四改造）。
- 问题：供应商 360 视图在真实数据源（connector）不可用时降级为静态演示数据，降级无 UI 提示。
- 影响：用户无法区分看到的是真实数据还是演示数据。
- 建议处理时机：connector 稳定性达标后移除降级路径；短期可先加降级角标（低成本）。

## 四、仓库级

### D9. 全仓 oxlint 存量

- 来源批次：仓库既有（非本迭代引入）。
- 问题：全量 `pnpm run lint` 存在存量告警；CI 按 diff 范围门禁。
- 影响：本地全量 lint 非绿；新增代码必须保持触面零告警（本次收口批次触面文件 0 warnings 0 errors）。
- 建议处理时机：按目录分批清偿，不阻塞本迭代。

### D10. kb 域四包 + ui-mobile 的 CI per-file 100% 覆盖缺口（收口批次抽验，2026-09-19）

- 来源批次：M2/M3 实施批次引入的源码面。
- 问题：按 CI 覆盖门禁口径（`vitest --coverage`，per-file statements/branches/functions/lines 100%，豁免清单见 [vitest.config.ts](../../vitest.config.ts)）抽验五包，均未达标且均不在豁免清单内。仅跑五包自身测试时 per-file 缺口（uncovered statement 条数，top 项）：
  - `packages/kb/tool-kb/src/kg-edit.ts` — 229 条（大面积；本体编辑工具的主路径）
  - `packages/kb/kg-build/src/index.ts` — 48 条（流水线编排 API 簇）
  - `packages/kb/tool-kb/src/kg-query.ts` — 36 条（含 `fillPlanViaLlm` 整函数）
  - `packages/kb/kb-graph/src/index.ts` — 30 条（`ontologyVersion`/`ontologyRevisions`/`latestBuildRun`/`listEpisodes`/`edgeMentions`/`pprNeighborhood`/`listOntologyXrefs`/`putCorefRejects` 等 API 未测）
  - `packages/kb/kg-build/src/extract.ts` — 27 条
  - `packages/kb/kb-graph-sqlite/src/store.ts` — 14 条
  - `packages/kb/tool-kb/src/llm-complete.ts` — 10 条（`completeViaLlm` 整函数）
  - `packages/client/ui-mobile/src/client/` 各视图 — ChatView 55、KgEvidence 54、hooks 43、DataView 43、MessagesView 30、LoginView 30、WorkbenchView 24、sessionsService 23、TaskCardView 16、rpc 12、router 12 条等
  - 其余 1–9 条散布：kb-graph 的 shacl/kgcl/ontology/louvain/ppr/kg-nl，kg-build 的 mappings/cross-source/validate/corpus-manifest，tool-kb/src/index，ui-mobile 的 auth/form-draft/fold/ui/entry/invariant 等
- 影响：当前分支跑全量 `pnpm run test:coverage` 会在上述文件触发 per-file threshold 失败（抽验运行共 132 条 threshold ERROR）；kb-graph 93.21% / kg-build 91.23% / tool-kb 65.71% 语句覆盖（仅自身测试口径）。
- 处理：按收口批次约束未补空测试——缺口为成簇的真实行为（整函数、整 API 组、LLM 交互路径），补测需要独立批次编写行为测试。
- 登记 22 文件清单（[vitest.config.ts](../../vitest.config.ts) coverage exclude 的 M1/M2/M3 域面段，清偿批次按此逐文件摘除，无需回 diff）：
  - 预存域面 16 个（M1/M2/M3 未触达）：`packages/connector/connector-file/src/provider.ts`、`packages/connector/connector-nocobase/src/client.ts`、`packages/connector/connector-nocobase/src/provider.ts`、`packages/connector/tool-connector/src/assets.ts`、`packages/connector/tool-nocobase/src/index.ts`、`packages/connector/tool-nocobase/src/write.ts`、`packages/expert/expert-orders/src/draft.ts`、`packages/expert/expert-orders/src/index.ts`、`packages/expert/expert-pdf/src/render.ts`、`packages/client/ui-connectors/src/client/index.ts`、`packages/client/ui-agent-preset/src/client/index.ts`、`packages/client/ui-agent-preset/src/client/ModeSelector.tsx`、`packages/context/view-context/src/index.ts`、`packages/interaction/tool-view-actions/src/index.ts`、`packages/test-support/llm-replay/src/index.ts`、`packages/test-support/loader-smoke/src/index.ts`。
  - F-round 引入 6 个（缺口来自已提交迭代 `fba5300859`「orders deliverables view」，非 kg-mobile-ux 触面）：`packages/connector/tool-connector/src/order.ts`、`packages/connector/tool-nocobase/src/read.ts`、`packages/client/ui-assets/src/client/index.ts`、`packages/client/ui-assets/src/client/marketStore.ts`、`packages/client/ui-assets/src/client/MarketView.tsx`、`packages/client/ui-assets/src/client/OrderDeliverableModal.tsx`（F-round 新建的零单测文件）。
- 建议处理时机：合入主干前拆两个补测批次（kb 域工具与图谱 API；ui-mobile 视图与 hook），或先在 [vitest.config.ts](../../vitest.config.ts) 豁免清单登记 TODO(gui) 式条目再逐包清偿；`kg-edit.ts` 与 `kg-query.ts` 的 LLM 路径需要 mock-provider 行为测试设计。

### D11. verify-client-catalog 门禁在每个 gate 链内整仓重复走查（M4 验证批次，2026-09-19）

- 来源批次：M4 验证失败修复批次的 flake 评估。
- 问题：`verify-client-catalog`（[scripts/gen-client-catalog.ts](../../../scripts/gen-client-catalog.ts) 的 `--check`）在 doc-sync、check-all 等每个含该 gate 的模式里都完整执行一次全仓 slot 走查；连续运行多个 gate 链时同一走查被重复支付。无 pretest 可拆——`gen-client-catalog.spec.ts` 只测纯函数契约，脚本的 import guard 已确保 `main()` 不随 import 执行，也没有任何测试或 pretest 钩子重复触发走查。
- 评估：改为 vitest globalSetup 单次执行会把"目录新鲜度校验"从独立 gate 变成测试前置，doc-sync 链仍需 gate 本体，管道语义变化与迁移成本大于收益，属结构性；按"不强行改管道"结论记录为债。分区并发负载下 `gen-client-catalog.spec.ts` 的 `collects every declared slot`（真实 workspace 走查）实测可达 45s，已把该用例时间预算放宽至 120s（超时 flake 的直接修复，不属管道改造）。
- 影响：本地连续验证耗时上升（每次走查数秒级）；无正确性风险（`--check` 只读比对，无写副作用）。
- 建议处理时机：gate 执行器支持按内容哈希缓存 slot 走查结果（或 gate 链共享单次执行会话）时收编，随 run-gates 的调度层改造一并处理。
