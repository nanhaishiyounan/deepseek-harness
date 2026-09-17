# Agent Note: kb-agent P0-2 语料单一事实源 — kb-corpus.yml 清单、清单驱动 KG 扫描、文档上限 fail loud

Status: implemented

[English](2026-09-17-kb-agent-p0-2-corpus-single-source.md) | 中文

## Problem

kb-agent 示例此前靠注释维持两份互不相干的语料清单。`seed-kb.mts` 硬编码五个目录（21 篇文档）作为 KB 白名单；`setup-dsh-data.mts` 为水位探测复制了同一份清单；kg-build 语料腿递归扫描整个 `workspace/data/`，以 `maxDocuments: 50` 做最新 mtime 优先的静默截断。实际后果：export-risk 的九篇文档进了 KG（141 个抽取实体）却从未进 KB，`kb_search` 永远检索不到——而 `data/` 下已有 47 个 markdown 文件顶着 50 的上限，离某次构建静默丢文档只差一个新增目录。

## Decision

`examples/kb-agent/kb-corpus.yml` 现在是唯一的语料清单：十四个目录连同各自文档 kind，非语料投递目录（`connector-files/`、`crm/`、`experts/`、`hub/`）刻意不列。`@deepseek-ai/dsh-kg-build` 拥有严格读取器（`src/corpus-manifest.ts`，对齐 kg-mappings 解析器）：未知键、重复目录、版本不符、空清单、文件不可读都以 `KG_BUILD_CORPUS_MANIFEST_INVALID` 在插件加载期失败。三个消费方读同一份文件：`seed-kb.mts`（KB 入库，`workspace/data/<dir>` 来源路径）、`setup-dsh-data.mts`（水位探测）、kg-build 语料腿经新增的 `corpus.manifestFile` 配置——扫描只覆盖清单目录，不再递归根。`maxDocuments` 从截断变为保护性上限：扫描发现文档数超上限时以 `KG_BUILD_CORPUS_OVER_BUDGET` 使整次构建失败；清单目录在磁盘缺失或没有任何匹配扩展名的文件时以 `KG_BUILD_CORPUS_DIR_EMPTY` 失败。mtime 排序随它服务的截断一起删除。

## Alternatives considered

- **保留递归根扫描并调大 `maxDocuments`。** 漂移是结构性的而非数值性的——任何上限都仍给 KB 白名单留下落后于磁盘的空间；清单消灭的是第二份清单，不是放大第一份。
- **在 `cordis.patch.yml` 里用 `!!js` 表达式于组合期读清单。** 组合文件保持声明式；带校验、fail-loud 加载器的配置字段（`corpus.manifestFile`）与 `nocobase.mappingsFile` 同构。
- **只在示例脚本里解析清单。** KG 腿是包；从 `dsh-kg-build` 共享解析器（如 `loadMappingsFile`）让所有消费方用同一个严格读取器，而不是三个宽容读取器。

## Consequences

- 新增语料只改一个文件（`kb-corpus.yml`）；KB 入库、setup 探测、KG 抽取扫描一起跟上。
- `workspace/data/` 下的非语料目录不再产生抽取噪音（递归时代的 `kb:connector-files/...` 与 OU 认证机构实体消失）。
- 语料超出 `maxDocuments` 会停下构建而不是悄悄缩水；上限是部署护栏，不是采样工具。
- 重灌幂等性不变（store 以 `(tenantId, sourcePath)` 为键；embed provider 的 sha256 缓存让重跑开销很小）。

## Verification

- 失败测试先行，修复后全绿：`packages/kb/kg-build/tests/corpus-manifest.spec.ts`（解析器矩阵：版本、未知键、重复、空清单、不可读文件）、`packages/kb/kg-build/tests/pipeline.spec.ts`「scans only the manifest directories and records their corpus-relative scopes」「fails loud when the scan exceeds maxDocuments instead of truncating」「fails loud when a manifest directory is missing or carries no matching files」「rejects an invalid manifest file at load」、`examples/kb-agent/tests/kb-corpus-manifest.spec.ts`（每个清单目录磁盘存在且含文档；磁盘上含 markdown 的目录要么在清单要么是声明的 `connector-files` 投递目录；export-risk 在列）。
- 一个编码了 mtime 截断行为的既有测试随行为更新（`covers ambient baseUrl…` 现在期望上限内两篇文档都被处理）。
- 真实 MiniMax 向量重灌：46 篇文档入库（21 → 46），export-risk 出现在 `documents.source_path`；真实 hybrid `kb.search`「俄罗斯仓库被炸 应急 备份启用」以 `export-risk/2026-08-russia-warehouse-emergency.md` 的 chunk 置顶。
- `pnpm run typecheck` 绿；kg-build、kb-agent 清单与 pipeline 套件绿（涉及包共 79 测试）。
