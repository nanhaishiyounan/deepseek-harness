# Agent Note: knowledge graph as setup-chain built-in data + a default view on the graph page

Status: implemented

English | [中文](2026-09-10-kg-builtin-data-setup-chain.zh.md)

## Problem

A reset kb-agent world (the three workspace SQLite files deleted, or a fresh clone) came back with a working legend but zero graph entities: `kg-graph.sqlite`/`kb.sqlite`/`lakehouse-catalog.sqlite` are gitignored runtime state, graph data existed only as the residue of manual `kg-build.mts` runs (QUICKSTART listed it as a standalone cold-start step), and nothing in `setup-nocobase.mts all` recreated any of it. On top of the structural gap, the graph page rendered an intentionally empty canvas: `KgView` loaded only `kg.schema` on mount and every walk waited for the user to type a seed phrase, so even a machine with 1293 nodes on disk showed "画布还是空的" until a manual query (verified live before the fix — the data path, gates, and tenant binding were all healthy; typing a seed drew the graph instantly).

## Decision

### `setup-dsh-data.mts` orchestrates the DSH-side data plane; `all` replays it before verify

One new script owns everything the workbench pages read that NocoBase does not: connector-files provisioning (mkdir + the B1 sample assets), the lakehouse seed tables, the market catalog, the kg-build pipeline, and the KB corpus ingestion. Steps probe a watermark first (SQLite read-only: catalog tables, ingested `documents.source_path`, the sample files) and replay their owning script as a child only when the probe misses; `all` runs it right after the NocoBase module replays and before `verify`. The market seeder replays unconditionally because its by-title probe already prints `assetsSkipped`; kg-build replays unconditionally because its per-scope content-hash watermarks make an unchanged rerun all-skip with zero count drift (its own assertion battery reports it).

### Key grading rides the existing `MINIMAX_API_KEY` switch — no new flag

The task brief allowed a `--no-llm` flag "if not already supported"; `kg-build.mts` already grades itself (`withKey` gates the corpus leg and prints the verdict), so the orchestrator only restates the grading for the log and replays the script as-is. `seed-kb` skips loudly without the key — embedding is that step's whole point — while the three deterministic legs (NocoBase mappings, lakehouse catalog, connector discovery) always run, so a keyless world still gets a non-empty graph.

### The chain replays kg-build with `--no-incremental`

`kg-build.mts`'s acceptance scenario ⑥ mints a throwaway order every full run and its node survives the reconcile (only the edges tombstone), so an unconditional replay would grow `kg_nodes` by one per `setup all` run and break the zero-count-drift idempotency contract. The new `--no-incremental` flag turns that leg into a logged skip; manual verification runs keep the full battery.

### verify refuses a fake-empty world

`stepVerify` now asserts `workspace/kg-graph.sqlite` exists and `kg_nodes > 0` (read-only `node:sqlite`), so a broken kg step fails `setup all` instead of leaving a page that renders 31 legend types over zero entities.

### The graph page walks a default view on open — stats-gated, zero protocol change

Opening the tab triggers one automatic view per client session: `api.kg.stats` first, and only a non-zero entity count proceeds to `kg.search({ query: '' })` for the first three nodes (searchNodes is a documented case-insensitive substring filter, so the empty probe matches every node), then one `kg.subgraph` walk at hop 1 over those names. A zero-entity graph keeps the build-guide empty state — the default view must not fake a canvas over an unbuilt world — and probe failures leave the canvas untouched with the user's own walks surfacing errors as before. The chosen option avoided both a hardcoded seed name (couples the page to one expert row) and a new `kg.overview` endpoint (apiproxy contract + SDK surface churn for a read the existing three methods already compose).

## Alternatives considered

**A new `kg.overview` endpoint returning a high-degree subgraph.** Rejected as the larger change: a new wire contract, schema, and SDK projection for what `stats + search + subgraph` already answer; the default view is orchestration, not new server capability.

**A preset seed phrase (e.g. 张红喜) walked on open.** Rejected for coupling: the page would depend on one seeded expert surviving every future fixture change, and a renamed row would silently regress the default view; the empty-substring probe adapts to whatever the graph actually holds.

**A watermark probe in front of kg-build in the orchestrator (skip when nodes > 0).** Rejected: NocoBase data may have changed since the last build, and kg-build's content-hash watermarks already provide the cheap no-op rerun — an orchestrator-level skip would hide legitimately incremental rebuilds.

## Consequences

Deleting the three SQLite files and running `setup all` alone rebuilds the full data plane end to end (measured below); a second `all` run is all-kept with zero kg count drift. The graph page opens with a drawn canvas by default on any world the setup chain produced, and the keyless `kg-graph-page` web e2e lane locks both halves (gateway stats and the no-manual-typing canvas) against an in-memory seeded store. The QUICKSTART cold-start copy folds the standalone graph-build step into the `all` chain and keeps `kg-build.mts` documented as the incremental tool. The trade-off bought: the empty-substring probe leans on searchNodes' substring contract (a future FTS-backed store must keep "empty query matches all" true for the default view), and `setup all` now takes minutes longer on a first run with a key (real corpus extraction and embeddings).
