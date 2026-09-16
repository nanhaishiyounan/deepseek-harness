# J2 real-machine acceptance — five-domain AI reachability（2026-09-16, :3080）

Server restarted onto the J2 source; default session (企业数据助手, 20 tools);
real DEEPSEEK_API_KEY turns. `transcript.json` holds each question, the tool
the run observed, and the reply tail; `q-*.png` is the live transcript.

| Domain | Question | Tool evidence |
|---|---|---|
| kb | 知识库里有哪些关于食品添加剂使用的规范要点？ | `kb_search` ×3 — 知识库检索 cards with numbered citations (GB 2760 等) |
| lakehouse | 数据湖仓里现在有哪些表？每张表多少行？ | `lakehouse_tables` — 3 tables (240/120/108 rows) |
| kg | 宏发食品的供货链有哪些环节？ | `kg_query` — templated supply-chain walk, 22 entities across 5 sources, not truncated |
| assets | 用 assets_browse 的 stats 和 list 看看市场资产目录总览 | `assets_browse` stats+list — per-kind counts (document/expert-profile/service ≈173), pricing anchors on services |
| business | SRM 业务系统里现在有多少家供应商？ | `nb_collections`+`nb_list` — lifecycle distribution (qualified 4 / preferred 1 / restricted 1 / reviewing 1 / potential 1 / frozen 1) |
| connector | 能发现哪些外部数据集？ | `connector_discover` — ~73 documents + 1 tabular across providers |

Cross-domain proof beyond the default session:

| Entry | What it shows |
|---|---|
| `q-scenario-cross-domain.png` / `scenario-cross-domain` | Inside a scenario session opened via the composer mode selector, a question outside the scenario's corpus (SRM supplier count) answered through `nb_*` — the thirty-scenario tool surface in action. |
| `default-cross-domain` | Same question in the default session first made that session started, driving the selector into its new-session posture. |
