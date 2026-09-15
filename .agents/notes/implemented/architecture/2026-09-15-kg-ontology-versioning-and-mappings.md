# Agent Note: Versioned KG ontology and the declarative mappings file

Status: implemented

English | [中文](2026-09-15-kg-ontology-versioning-and-mappings.zh.md)

## Problem

The knowledge graph met four of five usability bars, but three faces were missing: the ontology had no version (any registry edit was an untracked silent change), the NocoBase→graph mapping rules lived inside `cordis.patch.yml` next to unrelated plugin config, and the build report died with the process (quality numbers could not be inspected after the fact).

## Decision

Stay on SQLite and the TS registry — the L4 survey killed the migration options (Kùzu archived, core team hired away; LinkML's JS runtime unmaintained for four years). Instead:

- The TS seed registry stays the single source of truth and grows a semver `ontologyVersion()` plus an append-only `kg_ontology_revisions` audit table; derived registrations (nocobase-derived, agent-defined) ride the store's revision audit instead of the seed version. `SCHEMA_VERSION` moves 2→3 and v2 databases are refused with a rebuild instruction.
- Mapping rules move to a standalone versioned `kg-mappings.yml` (a YARRRML-semantics subset direction: collections, fkLinks, skippedRelationFields). The old keys inside `cordis.patch.yml` fail loud when present, so the dual-source window cannot drift silently. `ctx.kgBuild.mappings()` and the apiproxy `kg.mappings` route expose the file to UI and agent.
- Every build appends a `kg_build_runs` row (report + metrics JSON) before metrics are computed; the first metric set is coverage/island/conflict/process counts, exported through an extended `kg.stats`. The graph tab gains a read-only 质量与映射 panel backed by these rows, and NL querying ships as template + slot filling (`kg.query` compiling to `{seeds, relation_types, hops}` with closed-set validation) rather than free generation — the dbt benchmark basis (templates 100% vs raw generation 64.5%).
- The v1 `kb_graph_query`/`kb_graph_add` tools flip to config-default-disabled (code retained), ending the two-generation vocabulary split; `kg_subgraph` remains the agent path and is verified working with the v1 pair off.

## Consequences

Ontology edits are now auditable rows with a semver; mapping changes are file edits reviewable in git and the old in-patch keys fail loud. Quality numbers survive the process (kg_build_runs) and feed the graph-tab panel and kg.stats. v2 graph databases are refused until rebuilt, and agents speak one graph-tool vocabulary (kg_subgraph) with the v1 pair off by default.
## Alternatives considered

**Kùzu or another graph engine.** Dead upstream; the migration would buy query syntax and lose the operational simplicity of one SQLite file.

**OWL/SHACL or LinkML runtimes.** None maintain a usable JS runtime; each adds a second source of truth the TS registry would have to mirror.

**Free-form NL→query generation.** The surveyed accuracy gap (64.5% vs 100%) makes it a liability for a food-compliance graph; templates with slot filling cover the audited question set today and stay extensible per template.
