# kb-agent

[English](README.md) | 中文

本目录承载食品产业知识库 agent 组合：MiniMax-M3 对话 + kb 能力缝（SQLite 存储、MiniMax 向量、`kb_search`/`kb_ingest`/`kb_ingest_url`/`kb_stats`/`kb_graph_query`/`kb_graph_add` 工具）。它演示"语料入库 → 带编号引用检索 → 基于知识库作答"的闭环，包括对话仍可用的纯文本降级模式。租户是部署侧绑定（overlay 读取 `DSH_KB_TENANT`，未设置时回落 `demo-food-co`）；模型从不提供租户。上手首选入口：[QUICKSTART.zh.md](QUICKSTART.zh.md)（中文实操指南，每条命令在仓库根目录实跑验证）。

## 配置 key

```sh
# repo root .env (gitignored) or exported env:
#   MINIMAX_API_KEY=sk-…          # chat (MiniMax-M3) + embeddings (embo-01)
#   MINIMAX_BASE_URL=https://…    # optional; defaults to https://api.minimaxi.com/v1
```

没有 `MINIMAX_API_KEY` 时 embed provider 保持不可用，检索以纯文本运行（每个搜索结果 `mode: 'text'`）；对话请求随后以 `MISSING_CREDENTIAL` 失败，这是文档化的降级行为 —— 入库/检索/统计闭环本身无 key 也完整可跑。

## 运行

在仓库根目录，用本示例的 overlay 启动内置 headless profile。`DSH_HOME` 钉在示例目录内，自动初始化的 profile、会话与知识库全部留在 `examples/kb-agent/` 下（gitignored）：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml \
  "列出你当前可用的工具名，然后用 kb_stats 报告知识库覆盖情况"
```

overlay 把对话路由切到 MiniMax-M3（禁用 `llm-pi-ai`，其内置目录已声明 `minimax` 可配置 provider），挂载 kb 缝，并在 base bundle 已挂载的 web 缝上插入 `web-fetch-http` provider（驱动 `kb_ingest_url`）。它同时禁用 base bundle 的模型面工具行——shell、编辑器、文件系统、网页搜索、委派——组合内所有 agent 只从知识库作答，无法列目录：入库指令必须写出确切文件路径。预期工具列表出现 `kb_search`、`kb_ingest`、`kb_ingest_url`、`kb_stats`、`kb_graph_query`、`kb_graph_add`（graph 默认注册；组合未挂 kb-graph provider 时这两个图谱工具调用即拒），stats 回答报出绑定租户名；SQLite 存储急切打开于 `examples/kb-agent/workspace/kb.sqlite`。

## 入库自带语料

`workspace/data/` 下的六篇入门语料为脱敏代表性材料：两份会议纪要、两份企业档案、两份法规摘录（`doc_kind` 覆盖 `meeting`/`profile`/`regulation`）。agent 无法列目录，指令里须写出每篇文档的确切路径：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml \
  "用 kb_ingest 逐篇入库这六篇文档：examples/kb-agent/workspace/data/meetings/2026-08-20-supplier-visit-hongfa.md 与 examples/kb-agent/workspace/data/meetings/2026-08-27-project-kickoff.md（doc_kind 取 meeting）、examples/kb-agent/workspace/data/profiles/hongfa-food.md 与 examples/kb-agent/workspace/data/profiles/lvyuan-ingredients.md（doc_kind 取 profile）、examples/kb-agent/workspace/data/regulations/gb2760-excerpt.md 与 examples/kb-agent/workspace/data/regulations/gb14881-excerpt.md（doc_kind 取 regulation），完成后用 kb_stats 报告覆盖情况"
```

入库按来源路径覆盖写入，重跑这条命令是替换同六篇文档，不会翻倍。

## 提一个有依据的问题

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml \
  "调味品企业的食品添加剂合规要点是什么？"
```

预期回答以 `[n]` 引用文档名与标题路径（GB 2760 摘录、走访纪要）；配置了 key 时 `kb_search` 以 hybrid 模式检索。

## 从本机入库真实文档

真实走访纪要绝不入库到仓库。先拷入示例 workspace，再按确切路径入库——agent 无法列目录，指令里必须写出拷入后的完整文件路径：

```sh
# one-off copy (keep secrets out; desensitize visit notes before ingestion)
cp /path/to/真实纪要.md examples/kb-agent/workspace/data/meetings/
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml \
  "用 kb_ingest 把 examples/kb-agent/workspace/data/meetings/真实纪要.md 入库，doc_kind 取 meeting，然后 kb_search 查询它记录的成本口径"
```

`examples/kb-agent/scripts/import-real-docs.sh` 自动完成 `.md`/`.txt`/`.pdf`/`.docx` 拷贝（PDF 与 docx 在切片前解析为文本）。`--kind` 取值白名单为语料目录名，并映射到 `kb_ingest` 的 `doc_kind`：

```sh
bash examples/kb-agent/scripts/import-real-docs.sh /path/to/notes.md /path/to/standards/ --kind meetings   # or profiles | regulations
```

## 入库一个网页

`kb_ingest_url` 抓取一个 http(s) 页面、转为文本后以 URL 为引用身份入库。私网/内网地址被拒绝，除非组合显式开启：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml \
  "用 kb_ingest_url 把 https://example.com/ 入库，doc_kind 取 other，然后 kb_search 查询它页面的用途"
```

## 纯文本降级演示（拔 embed、对话存活）

叠加第二个 overlay 禁用 embed provider，同时对话路由保持同一把 key —— 不动凭据的真实降级：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml --patch examples/kb-agent/cordis.text-only.patch.yml \
  "调味品企业的食品添加剂合规要点是什么？先用 kb_search 检索，再回答"
```

预期回答形态不变，模型汇报的 `kb_search`/`kb_stats` 结果里可观测 `mode: 'text'` 与 `embed_available: false`，而 MiniMax-M3 仍用 `MINIMAX_API_KEY` 应答。

## 常见问题

- **旧 kb.sqlite（schema v1）启动被拒** —— 当前构建 fail-loud 拒绝旧库文件。改名留存（如 `workspace/kb.sqlite.v1-backup`），下次启动自动重建新库，再重新入库语料。见 [QUICKSTART.zh.md](QUICKSTART.zh.md) 的「常见问题」节与 DEPLOY.zh.md §6。

## 已知限制

- **多标签最近检索退化为最后写入胜出** —— 门户的最近检索日志整值写入同一个 `localStorage` 条目（`dsh-kb-recent-searches`），两个标签页同时完成工作台检索时写操作可能交错，偶发丢失一条已记录的检索词。单标签使用不受影响；触发条件是两个标签页在同一个写入窗口内各自完成一次工作台检索。
- **`truncated` 语义为触顶** —— `kb_search` 的 `truncated: true` 表示结果上限截断了排名，不代表还存在更多匹配内容；缝不报告总匹配数。
- **MiniMax-M3 思考不可关闭** —— 模型始终内联思考；没有可配置开关。
- **embed 凭据仅从启动环境解析** —— 只经托管凭据库（Web Models 页）存入的 key 能服务对话但向量不可用；导出 `MINIMAX_API_KEY` 或写入根 `.env` 让两半都工作。统一解析的契约冲突见 kb-embed-minimax README。
- **kb-embed-* 自持重试/退避与凭据解析** —— 同步 `available()` 探测契约使其无法与 `dsh-llm` 共用；论证见 kb-agent P0 修复 Agent Note。

## 测试

- `tests/kb-closed-loop.spec.ts` —— 经真实 Loader 组合的密封无 key 快照；fixture 把 embed 凭据引用钉在不存在的名字上，宿主的 `MINIMAX_API_KEY` 既翻不动快照也触发不了网络调用。用 `DSH_SNAPSHOT=refresh` 刷新。
- `tests/kb-closed-loop.e2e.ts` —— 带 key 的 hybrid 入库 + 一次真实 MiniMax-M3 引用式回答；无 `MINIMAX_API_KEY` 自动跳过。
