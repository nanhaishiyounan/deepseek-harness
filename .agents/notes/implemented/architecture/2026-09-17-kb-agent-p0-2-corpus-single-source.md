# Agent Note: kb-agent P0-2 corpus single source of truth — kb-corpus.yml manifest, manifest-driven KG scan, fail-loud document ceiling

Status: implemented

English | [中文](2026-09-17-kb-agent-p0-2-corpus-single-source.zh.md)

## Problem

The kb-agent example carried two independent corpus lists that could only stay aligned by comments. `seed-kb.mts` hardcoded five directories (21 documents) as the KB whitelist; `setup-dsh-data.mts` duplicated the same list for its watermark probe; the kg-build corpus leg recursively scanned all of `workspace/data/` capped by `maxDocuments: 50` with a silent newest-mtime-first truncation. The live consequence: the nine export-risk documents entered the KG as extraction entities (141 nodes) but never entered the KB, so `kb_search` could never return them — and `data/` held 47 markdown files against the 50 cap, one added directory away from documents silently disappearing from KG builds.

## Decision

`examples/kb-agent/kb-corpus.yml` is now the only corpus list: fourteen directories with their document kinds, non-corpus drop-ins (`connector-files/`, `crm/`, `experts/`, `hub/`) deliberately unlisted. `@deepseek-ai/dsh-kg-build` owns the strict reader (`src/corpus-manifest.ts`, mirroring the kg-mappings parser): unknown keys, duplicate directories, a wrong version, an empty list, or an unreadable file fail with `KG_BUILD_CORPUS_MANIFEST_INVALID` at plugin load. Three consumers read the one file: `seed-kb.mts` (KB ingestion, `workspace/data/<dir>` source paths), `setup-dsh-data.mts` (watermark probe), and the kg-build corpus leg through the new `corpus.manifestFile` config — the scan covers exactly the manifest directories instead of recursing the root. `maxDocuments` changed from a truncation to a protective ceiling: a scan finding more documents than the ceiling fails the run with `KG_BUILD_CORPUS_OVER_BUDGET`; a manifest directory that is missing on disk or carries no extension-matching file fails with `KG_BUILD_CORPUS_DIR_EMPTY`. The mtime ordering is gone with the truncation it served.

## Alternatives considered

- **Keeping the recursive root scan and raising `maxDocuments`.** The drift was structural, not numeric — any cap leaves the KB whitelist free to lag the disk again; the manifest removes the second list rather than enlarging the first.
- **A `!!js` expression in `cordis.patch.yml` reading the manifest at composition time.** Composition files stay declarative; a config field (`corpus.manifestFile`) with a validated, fail-loud loader keeps the same shape as `nocobase.mappingsFile`.
- **Manifest parsing inside the example scripts only.** The KG leg is a package; sharing the parser from `dsh-kg-build` (like `loadMappingsFile`) keeps every consumer on one strict reader instead of three tolerant ones.

## Consequences

- Adding corpus is a one-file edit (`kb-corpus.yml`); the KB ingest, the setup probe, and the KG extraction scan follow together.
- Non-corpus directories under `workspace/data/` no longer produce extraction noise (the `kb:connector-files/...` and OU-certifier entities of the recursive era).
- A corpus that outgrows `maxDocuments` stops the build instead of quietly shrinking it; the ceiling is a deployment guard, not a sampling tool.
- Re-seeding is idempotent as before (store keyed on `(tenantId, sourcePath)`; the embed provider's sha256 cache keeps re-runs cheap).

## Verification

- Failing tests first, all green after: `packages/kb/kg-build/tests/corpus-manifest.spec.ts` (parser matrix: version, unknown keys, duplicates, empty list, unreadable file), `packages/kb/kg-build/tests/pipeline.spec.ts`「scans only the manifest directories and records their corpus-relative scopes」「fails loud when the scan exceeds maxDocuments instead of truncating」「fails loud when a manifest directory is missing or carries no matching files」「rejects an invalid manifest file at load」, and `examples/kb-agent/tests/kb-corpus-manifest.spec.ts`（every manifest directory exists on disk with documents; every disk directory holding markdown is listed or is the declared `connector-files` drop-in; export-risk is present）.
- One pre-existing test that encoded the mtime-truncation behavior was updated with the behavior (`covers ambient baseUrl…` now expects both documents under the ceiling).
- Real re-seed with live MiniMax embeddings: 46 documents ingested (21 → 46), export-risk present in `documents.source_path`; a real hybrid `kb.search` for「俄罗斯仓库被炸 应急 备份启用」returns `export-risk/2026-08-russia-warehouse-emergency.md` chunks as the top hits.
- `pnpm run typecheck` green; kg-build, kb-agent manifest, and pipeline suites green (79 tests over the touched packages).
