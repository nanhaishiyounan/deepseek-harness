# Agent Note：P1 角色预设、100 问评测与 KB 工作台

Status: implemented

[English](2026-08-30-kb-p1-presets-eval-workbench.md) | 中文

## 问题

P1-2 交付产品第一个智能面：两个角色 Agent 预设（AI 食安合规官 / 企业数据助手）、证明 RAG 验收线（Top5 ≥ 80%、引用有效率 ≥ 90%）的 100 问检索评测、最小 Web 工作台（用量/带引用检索/入库）（[`plans/food-kb-agent-plan.md`](../../../../plans/food-kb-agent-plan.md)，P1-2/P1-3/P1-6）。

## 决策

- **预设是薄的 agent-plane 组合**：persona + scoped `tool-kb` 行。kb 缝（注册表）留在 host 层——标准预设架构规则——预设只改 agent 的身份与工具面，绝不动能力。示例组合额外 disable 了 base bundle 的模型可见工具行（web-app bundle 自身的模式），使部署检索专用："禁破坏性工具"是组合事实，不是逐预设过滤。
- **预设放在 `examples/kb-agent/agent-presets/`** 而非 shipped 的 `apps/cli/config/agent-presets/`：CLI 的依赖闭包没有 kb 包，shipped 预设行会解析失败。示例 workspace 可解析；roster 行的 `roots` 指向那里。
- **评测 harness 用显式规则度量两个指标**（`examples/kb-agent/scripts/eval-retrieval.mts`）：Top5 命中率 = gold 文档出现在 `kb_search` 前 5 命中中；引用有效率 = MiniMax-M3 回答中至少一个 `[n]` 引用解析到来源为 gold 文档的检索段落（1..5 之外的编号无效）。keyless text 模式与真实 key hybrid 模式共用 harness。
- **实测结果（2026-08-30，真实 key）**：hybrid Top5 **99%**、引用有效率 **95%**——未调参即双双超过验收线。text-only 降级模式 71%（FTS5 trigram 短语窗口漏长中文查询）；向量路径补齐差距，这正是部署默认 hybrid 的文档化理由。
- **工作台 = 网关域 + 客户端插件**：ApiProxy 上的 `kb.stats/search/ingest/ingestUrl`（kb 能力调用时 `ctx.get` 解析——无知识库的部署网关照常工作，每个 kb 方法以 `kb-not-composed` 拒绝），`dsh-client-ui-kb`（侧栏 footer action → 面板）驱动 `connection.api.kb`。URL 入库复用 tool-kb 的 SSRF 门（`assertPublicUrl`）——工作台绝不成为私网探测面。

## 备选方案

- **预设经 isolate realm 拥有 kb 栈**——否决：预设不得拥有注册表；两个预设还会竞争同一 SQLite 路径。
- **kb 域走 typert remote**——推迟：connection 的 `api` 面已可达浏览器；生成式 remote 对无新能力只加生成器一跳。
- **调检索（RRF 权重/chunk 参数）拉高 text 分**——不必要：验收线在部署的 hybrid 模式度量；71% 的 text 基线作为降级模式预期记录在案。

## 后果

- keyless 预设快照（`examples/kb-agent/tests/kb-presets.spec.ts`）钉住检索专用工具面、persona 覆盖与经真实 Loader 挂载的带引用检索；场景集快照把同一模式扩展到每个场景目录。
- 评测语料扩到 14 篇（五类需求），每问标注 gold；无 key 复跑 harness 可复现 text 指标。
- 网关的 `kbTenant` 配置字段是工作台的部署侧租户绑定，与 `tool-kb` 的 `tenant` 镜像——部署又多一处声明租户的地方。
- 已知缺口：工作台面板最小（无分页、无文档列表）；网关域是更丰富 UI 的稳定缝。
