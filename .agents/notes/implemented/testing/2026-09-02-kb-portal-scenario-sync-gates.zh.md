# Agent Note: 门户场景目录与三十场景库同步——防漂移门禁、封闭式暂存与 own-corpus 硬断言

Status: implemented

[English](2026-09-02-kb-portal-scenario-sync-gates.md) | 中文

## 问题

网页工作台门户首屏的场景栏渲染 `KB_SCENARIOS`——`packages/client/ui-kb/src/client/hero/scenarios.ts` 里的静态双语展示表；而选择语义来自运行时 `agentPresets` 名册（部署方的 `cordis.patch.yml` 把 `examples/kb-agent/scenarios` 挂为预设根）。这张表存在，是因为它承载预设目录没有的纯展示信息（类目分组与英文镜像），但两侧没有任何机制关联：当场景库从十一个扩到三十个时，门户仍只提供十一张卡，用量徽标也计数十一。三个测试卫生缺口让该脱节以及更糟的情况都漏过：

- `examples/kb-agent/tests/scenarios.spec.ts` 在 `boot()` 赋临时 `root` 之前就用 `join(root ?? exampleRoot, 'scenarios-staged')` 求值暂存路径，`??` 兜底支路恒生效，暂存的预设副本落在仓库内的 `examples/kb-agent/scenarios-staged/`（FIX-M 评审时60 个文件），且 `afterEach` 只删临时根，仓库内副本永不清除。
- own-corpus 检索校验只进快照：`ownCorpus` 仅喂给打印字符串、没有断言，`DSH_SNAPSHOT=refresh` 可以把"probe 不再引用自己的语料"合法化。
- `examples/kb-agent/.gitignore` 罗列的是单数语料类目目录（`meeting/`、`regulation/` 等），一个都匹配不上；复数目录与评测语料目录处于未忽略状态，而 `expect(scenarioDirs.length).toBeGreaterThanOrEqual(10)` 对任意数量都放行。

## 决策

### 门户目录镜像场景库，以 id 相等挂门

`KB_SCENARIOS` 按 `preset.yml` 的 `order` 顺序收齐三十条，每条按其 `preset.yml` 描述前缀的归类映射到现有八个类目之一（esg-report → data-asset、ecommerce-ops → market、cold-chain 与 supply-chain-finance → supply-chain）。不新增类目：场景库本身把三十个场景归入八类，门户私设类目是展示侧的分叉而非同步。用量徽标保持由 `KB_SCENARIOS.length` 派生。`scripts/scenario-catalog-sync.spec.ts`——`pnpm run test` 下运行的仓库级 vitest spec——用 TypeScript AST 读取目录并断言其 id 集合与 `examples/kb-agent/scenarios/` 目录集合相等；新增、删除或重命名场景而不更新门户，单元门即失败。

### 场景预设进入 e2e 名册；新卡点击有覆盖

`apps/web/tests/kb-workbench.e2e.ts` 向 `launchWebScaffold` 传 `agentPresets` 选项，把场景库与出厂预设并挂（镜像部署方的根）。专门用例点击 cold-chain 卡——同步前门户无法提供的 id——在确认弹层中核对 probe，经真实 `agentPresets.select` 往返开始会话，断言 probe 落入输入框且无失败提示。

### 暂存放进本运行的临时根

`tests/scenarios.spec.ts` 每个测试经 `ensureRoot()` 建一个 `mkdtemp` 暂存根，`scenarios-staged/` 建在其内，`boot()` 复用同一根放置数据库与组合 baseUrl。`afterEach` 无论成败整根删除。仓库内的 `examples/kb-agent/scenarios-staged/` 已删除；示例 `.gitignore` 写入 `scenarios-staged/` 作为落点回归的兜底。

### 检索改为三重硬断言

每个场景在快照写入前断言三件事：至少引用一个 chunk；自己的语料出现在引用中（`toBe(true)`，refresh 模式无法再把失配合法化）；每个被引 chunk 的 `doc_id` 与 `chunk_idx` 都能解析进本次运行 `context.kb.ingest` 返回值记录的文档映射——引用可证指向已入库语料中真实存在的 chunk 空间，而非陈旧或外来文档。

### 语料工作区忽略规则反转为白名单

`examples/kb-agent/.gitignore` 忽略 `workspace/data/*`，再对八个入库语料类目取反：meetings、profiles、regulations（`import-real-docs.sh` 白名单）加 cost、food-safety、market、process、supply。后五个是评测金标语料——`eval/questions.json` 全部13 个不同 gold 文档都在这八个目录下，且 `scripts/graph-smoke.mts` 读取 `workspace/data/supply/`——它们是入库内容而非验证残留，删除会破坏已文档化的评测。`workspace/data/` 下任何其他目录（非法 `--kind` 残留）都被忽略。`eval/results-*.json` 是可再生评测产物，留在本地；`questions.json` 随仓库分发。

## 备选方案

- **把 `verify-scenario-count` 门禁脚本挂进 run-gates**：拒绝——只查数量抓不住 id 错位（重命名或笔误漂移数量不变）；id 相等需要解析目录，而 vitest spec 已在 `pnpm run test` 下运行，无需新增聚合接线。
- **把漂移检查放进 ui-kb 包测试**：拒绝——出厂包的测试读取 `examples/` 会把包耦合到仓库布局；仓库级 scripts spec 把该依赖留在仓库范围（locale-dictionary-parity 先例）。
- **在 scripts spec 里 import 目录模块**：拒绝——会把客户端面源文件拖进 host typecheck face 的文件清单（TS6307）；AST 读取保持编译面分离。
- **把 cost/food-safety/market/process/supply 五个目录当残留删除**：核实后拒绝——它们承载评测金标文档与 graph-smoke 输入；白名单才是正确处置。
- **为合规/ESG/电商/冷链/金融增设门户类目**：拒绝——每个 `preset.yml` 都归入现有八类；额外类目只会制造下一个漂移面。

## 后果

- 门户卡片、名册、README 与场景库在三十个场景上一致；新增第31 个场景而不动门户会让 `pnpm run test` 失败。FIX-M 评为 Critical 的手工同步缺口由门禁关闭，而非依赖警惕。
- `scenarios.spec.ts` 运行零残留：示例内无 `scenarios-staged/`，运行后无 `kb-scenarios-*` 临时根。
- 无 key 快照的期望输出未变——三十条本就记录 `own corpus cited`——无需刷新；未来的退化在 refresh 写入执行前即失败。
- e2e 通道依赖 `examples/kb-agent/scenarios` 作为预设根，与真实部署的 patch 同源；目录契约破坏时该通道失败。
- 十九份语料的内容设计规则仍由[场景库笔记](../feature/2026-09-02-kb-scenario-library-thirty.zh.md)持有。
