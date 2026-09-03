# AI 食安合规官（food-compliance-officer）

[English](README.md) | 中文

食品安全合规问答预设：依据知识库中的 GB 2760/GB 14881 等法规标准作答，回答带编号引用（文档名 + 标题路径），并输出审核要点清单。

- `preset.yml` — 预设名与描述（roster 发现入口）。
- `agent.cordis.yml` — agent 面组合：persona + 检索专用 kb 工具行（kb_search/kb_ingest/kb_ingest_url/kb_stats/kb_graph_*）。无 shell/editor/web 等破坏性工具。
- 租户保持部署侧绑定：本预设的 `tool-kb` 行与宿主组合的 `tool-kb`/api-gateway 行读取同一 `DSH_KB_TENANT`（默认 `demo-food-co`），kb 能力缝留在宿主面。

语料来源：`workspace/data/regulations/`（法规摘录）与 `workspace/data/food-safety/`。预设仅在网页版工作台生效——命令行 headless 会话不挂预设。示例组合已把本目录挂为信任预设根，任何 `DSH_HOME` 下无需复制即可在名册选到；门户中同名场景卡（`food-compliance`）是该角色的点击入口，仅自建预设需要可写根 `$DSH_HOME/.agent-presets`。见 [`QUICKSTART.zh.md`](../../QUICKSTART.zh.md) 的「换角色」节。
