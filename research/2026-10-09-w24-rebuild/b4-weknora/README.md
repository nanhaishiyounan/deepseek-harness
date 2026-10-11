# W24-B4 验收汇报：WeKnora 知识库批（sidecar + 双 provider + 语料 + 基准 + LLM 实跑）

运行时数据与脚本在 `workspace/weknora/`（gitignored，含 compose/.env/语料/嵌入代理），本目录归档验收证据。

## 验收对照（全部真实实跑）

| 验收项 | 结果 | 证据 |
|---|---|---|
| sidecar 启动 + 健康检查/登录 API 200 | ✅ | `health.txt`（/health 200 + compose ps 五容器 healthy + 注册/登录 200） |
| 语料灌入 2-3 分类 ≥30 篇 | ✅ | `ingest-reconciliation.json`（business-ops 29 / food-compliance 15 / system-guide 13 = 57 篇，docId 级对账）+ `knowledge-bases.json`（三分类 KB + knowledge_count） |
| 15 条基准 QA hit@3 ≥ 80% | ✅ | `benchmark-run.json`（20 题：hit@1 = 80%、hit@3 = 90%）+ `benchmark-run-mc5.json`（match_count=10 复跑同值）+ `benchmark-iterations.md`（2 条 miss 归因） |
| web 会话问语料内问题 → KB 工具真实调用 + 真实检索内容 | ✅ | `llm-halal-session.png`（MiniMax-M3 会话：kb_search 多轮真实调用、「知识库检索 · N 条来源」工具行、[1][3] 编号引用指向 food-compliance 真实文档、文档×9 引用面板）；F0/HACCP 会话（`workspace/weknora/` 会话「低酸性罐头F0值与HACCP控制点要求」） |
| 停 sidecar + allowFallback → 显式降级 | ✅ | `degradation-proof.txt`（kb.search 返回 mode hybrid + notice "WeKnora is unreachable; results come from the local fallback store"，8 命中来自 sqlite） |
| 未配 allowFallback → fail loud | ✅ | 同文件（直连客户端 WeknoraApiError transport 失败）；单测覆盖 4xx 拒绝不降级路径 |
| ui-kb 适配 | ✅ | `ui-kb-workbench.png`（工作台经 apiproxy→weknora，stats 59 文档）+ `weknora-admin-login.png`（WeKnora 后台入口） |

## 部署形态（workspace/weknora/）

- compose 项目目录 `workspace/weknora/`（v0.8.2：app/frontend/docreader/paradedb pg17/redis；端口 18080 UI / 18081 API）
- 镜像经 CN 镜像加速拉取回退原 tag（daocloud，`pull.log`）；colima VM 家目录已整体迁移 `/Volumes/ssd/colima`（软链回 ~/.colima，主盘不占）
- 声明式 `config/builtin_models.yaml`：MiniMax-M3（chat）+ embo-01（embedding，经宿主 `embed-proxy.mjs` :18082 适配 MiniMax 原生 embeddings 线协议；`SSRF_WHITELIST_EXTRA` 加白 host.docker.internal）
- `benchmark/benchmark.json`：20 条 QA 对；`bench.mts` 跑分器；`ingest.mts` 语料灌入；`repair.sh` 模型绑定+重处理；`up.sh` 生命周期
- 租户 demo-food-co（id 10001）+ scoped API key（root .env `WEKNORA_API_KEY`）

## dsh 侧改动

- 新包 `packages/kb/kb-weknora`（@deepseek-ai/dsh-kb-weknora）：REST client + WeknoraKbStore + plugin apply；per-file 100% 覆盖（64 tests）
- seam：`KbSearchHit.notice`/`KbSearchResult.notice` 可选字段（降级可见性）；`kb-sqlite` 导出 `openSqliteKbStore`
- `examples/kb-agent/cordis.patch.yml`：kb 行 `storeProvider: weknora`（DSH_KB_STORE 可切回 sqlite）+ kb-weknora 行（allowFallback: true + fallbackPath 复用 kb.sqlite）
- apiproxy `kb.search` 透传 notice；ui-kb 工作台渲染降级提示条（W7 设计语言）
- Agent Note：`2026-10-10-w24-b4-kb-weknora-dual-provider.md`（双语）
