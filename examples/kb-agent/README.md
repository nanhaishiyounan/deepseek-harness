# kb-agent

English | [中文](README.zh.md)

This directory owns the food-industry knowledge-base agent composition: MiniMax-M3 chat + the kb capability seam (SQLite store, MiniMax embeddings, `kb_search`/`kb_ingest`/`kb_ingest_url`/`kb_stats`/`kg_schema`/`kg_subgraph` tools). It demonstrates the closed loop "ingest corpus → retrieve with numbered citations → answer grounded in the knowledge base", including the text-only degraded mode with chat still live. The tenant is a deployment-side binding (the overlay reads `DSH_KB_TENANT`, falling back to `demo-food-co`); the model never supplies one. For a hands-on first run (Chinese, every command verified on the repository root) see [QUICKSTART.zh.md](QUICKSTART.zh.md).

## Configure the key

```sh
# repo root .env (gitignored) or exported env:
#   MINIMAX_API_KEY=sk-…          # chat (MiniMax-M3) + embeddings (embo-01)
#   MINIMAX_BASE_URL=https://…    # optional; defaults to https://api.minimaxi.com/v1
```

Without `MINIMAX_API_KEY` the embed provider stays unavailable and retrieval runs text-only (`mode: 'text'` in every search result); chat requests then fail with `MISSING_CREDENTIAL`, which is the documented degraded behavior — the ingest/search/stats loop itself stays fully runnable keyless.

## Run it

From the repository root, boot the shipped headless profile with this example's overlay. `DSH_HOME` is pinned inside the example so the auto-initialized profile, sessions, and the knowledge base all stay under `examples/kb-agent/` (gitignored):

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml \
  "列出你当前可用的工具名，然后用 kb_stats 报告知识库覆盖情况"
```

The overlay swaps the chat route to MiniMax-M3 (disabling `llm-pi-ai`, whose installed catalog already declares the `minimax` configurable provider), mounts the kb seam, and inserts the `web-fetch-http` provider on the base bundle's already-mounted web seam (powering `kb_ingest_url`). It also disables the base bundle's model-facing tool rows — shell, editor, filesystem, web search, delegation — so every agent in this composition answers from the knowledge base alone and cannot list directories: ingest prompts must name exact file paths. Expect `kb_search`, `kb_ingest`, `kb_ingest_url`, `kb_stats`, `kg_schema`, and `kg_subgraph` in the tool list (the legacy v1 graph pair `kb_graph_query`/`kb_graph_add` stays off by default; opt back in with tool-kb `graph: true`) and a stats answer naming the bound tenant; the SQLite store opens eagerly at `examples/kb-agent/workspace/kb.sqlite`.

## Ingest the shipped corpus

The six-document starter corpus under `workspace/data/` is desensitized representative material: two meeting minutes, two enterprise profiles, and two regulation excerpts (`doc_kind` covers `meeting`/`profile`/`regulation`). The agent cannot list directories, so the prompt names each document's exact path:

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml \
  "用 kb_ingest 逐篇入库这六篇文档：examples/kb-agent/workspace/data/meetings/2026-08-20-supplier-visit-hongfa.md 与 examples/kb-agent/workspace/data/meetings/2026-08-27-project-kickoff.md（doc_kind 取 meeting）、examples/kb-agent/workspace/data/profiles/hongfa-food.md 与 examples/kb-agent/workspace/data/profiles/lvyuan-ingredients.md（doc_kind 取 profile）、examples/kb-agent/workspace/data/regulations/gb2760-excerpt.md 与 examples/kb-agent/workspace/data/regulations/gb14881-excerpt.md（doc_kind 取 regulation），完成后用 kb_stats 报告覆盖情况"
```

Ingest is overwrite-shaped per source path, so re-running the command replaces the same six documents instead of duplicating them. The full batch corpus lives in the versioned `kb-corpus.yml` manifest (14 directories under `workspace/data/`, 46 documents): `scripts/seed-kb.mts` ingests it into the KB with real MiniMax embeddings, and the kg-build corpus leg reads the same manifest through `corpus.manifestFile`, so the KB document set and the KG extraction scan cannot drift apart (the manifest deliberately excludes non-corpus drop-ins like `connector-files/`).

## Ask a grounded question

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml \
  "调味品企业的食品添加剂合规要点是什么？"
```

Expect an answer citing `[n]` with the document name and heading path (GB 2760 excerpt, visit notes), retrieved through `kb_search` in hybrid mode when the key is configured.

## Ingest real documents from your machine

Real visit notes never belong in the repository. Copy them into the example workspace first, then ingest by exact path — the agent cannot list directories, so the prompt must name the copied file's full path:

```sh
# one-off copy (keep secrets out; desensitize visit notes before ingestion)
cp /path/to/真实纪要.md examples/kb-agent/workspace/data/meetings/
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml \
  "用 kb_ingest 把 examples/kb-agent/workspace/data/meetings/真实纪要.md 入库，doc_kind 取 meeting，然后 kb_search 查询它记录的成本口径"
```

`examples/kb-agent/scripts/import-real-docs.sh` automates the copy for `.md`/`.txt`/`.pdf`/`.docx` files (PDF and docx are parsed to text before the chunker). The `--kind` value is whitelisted to the corpus directory names and maps to the `kb_ingest` `doc_kind`:

```sh
bash examples/kb-agent/scripts/import-real-docs.sh /path/to/notes.md /path/to/standards/ --kind meetings   # or profiles | regulations
```

## Ingest a web page

`kb_ingest_url` fetches one http(s) page, converts it to text, and stores it with the URL as the citation identity. Private/internal addresses are refused unless the composition opts in:

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml \
  "用 kb_ingest_url 把 https://example.com/ 入库，doc_kind 取 other，然后 kb_search 查询它页面的用途"
```

## Text-only degraded demo (embed pulled, chat alive)

Stack the second overlay to disable the embed provider while the chat route keeps the same key — the real degradation, without touching credentials:

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml --patch examples/kb-agent/cordis.text-only.patch.yml \
  "调味品企业的食品添加剂合规要点是什么？先用 kb_search 检索，再回答"
```

Expect the same cited answer shape, with `mode: 'text'` and `embed_available: false` observable in the `kb_search`/`kb_stats` results the model reports, while MiniMax-M3 still answers on `MINIMAX_API_KEY`.

## Expert-service orders (NocoBase business backend)

The composition also mounts the connector seam and the orders domain: `connector_discover` surfaces the 张红喜 expert dataset (expert card + orderable services) and `order_create` places an order and generates the proposal PDF. The single source of truth for orders is an external NocoBase 2.x backend: `scripts/setup-nocobase.mts` brings it up end to end — install, start, collections, dataset seeding, API key issuance, and the approval workflow (manual approval → approve calls back into DSH to produce the deliverable / reject writes the failure) — writing credentials into the repository root `.env`; without them the related tests self-skip. Full steps and the real-track e2e live in the NocoBase section of [QUICKSTART.zh.md](QUICKSTART.zh.md) (Chinese). Delivered PDFs hang off the order row's attachment field through `attachments:upload`; the local `workspace/deliverables/` copy is only a cache.

## One-command demo of the three user journeys

`scripts/demo-full-journey.mts` chains the three customer motions (upload auto-routing csv→lakehouse / md→kb, the export-risk question with President Zhang's expert card, and order → approval → PDF delivery) into one real end-to-end run: with-key + with-NocoBase, tracks whose preconditions are missing self-skip with an explanation, each scenario asserts and appends its transcript under `demos/`. Command and preconditions live in the demo section of [QUICKSTART.zh.md](QUICKSTART.zh.md) (Chinese).

## FAQ

- **A v1 knowledge base is rejected at boot** — the current build refuses an old `workspace/kb.sqlite` (schema v1) fail-loud. Rename it (e.g. `workspace/kb.sqlite.v1-backup`); the next boot rebuilds a fresh database, then re-ingest the corpus. See the FAQ section of [QUICKSTART.zh.md](QUICKSTART.zh.md) and DEPLOY.md §6.

## Known Limitations

- **Multi-tab recent searches degrade to last-write-wins** — the portal's recent-search log persists whole-value to one `localStorage` entry (`dsh-kb-recent-searches`), so two tabs running searches at the same moment can interleave writes and rarely drop one recorded query. Single-tab use is unaffected; the trigger is two tabs each completing a workbench search within the same write window.
- **`truncated` means cap-reached** — `kb_search` reports `truncated: true` when the result cap cut the ranking, not when more matching content exists; the seam reports no total match count.
- **MiniMax-M3 thinking cannot be disabled** — the model always thinks inline; there is no toggle to configure.
- **Embed credentials resolve from the launch environment only** — a key stored solely through the managed credential store (web Models page) serves chat but leaves embeddings unavailable; export `MINIMAX_API_KEY` or put it in a root `.env` so both halves work. See the kb-embed-minimax README for the contract conflict that blocks unification.
- **kb-embed-* keeps its own retry/backoff and credential resolution** — the synchronous `available()` probe contract rules out sharing them with `dsh-llm`; the argument lives in the kb-agent P0 fixes Agent Note.

## Tests

- `tests/kb-closed-loop.spec.ts` — hermetic keyless snapshot through the real Loader composition; the fixture pins the embed credential reference to an absent name, so a host `MINIMAX_API_KEY` can neither flip the snapshot nor trigger network calls. Refresh with `DSH_SNAPSHOT=refresh`.
- `tests/kb-closed-loop.e2e.ts` — with-key hybrid ingest + one real MiniMax-M3 grounded answer; self-skips without `MINIMAX_API_KEY`.
