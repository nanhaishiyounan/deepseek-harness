# Agent Note: kb-agent P0-1 tool correctness — kb_ingest session cwd, nb_list includes, kg_query full miss message

Status: implemented

English | [中文](2026-09-17-kb-agent-p0-1-tool-correctness.zh.md)

## Problem

A real food-kb-agent session (preset `enterprise-data-assistant`, workspace cwd ≠ harness repo root) hit three tool-layer defects when answering「俄罗斯仓库被炸了，有没有别的路径」:

- `kb_ingest` resolved its model-visible relative `path` against the server's launch directory (`fs-local` falls back to `process.cwd()` when a caller passes no `cwd`), while `read`/`write`/`edit` resolve the same kind of input against the session cwd. Three `FS_NOT_FOUND` failures followed; the ingest tool's basis disagreed with the rest of the fs tool family.
- `nb_list`'s restricted filter vocabulary (`eq/in/gt/lt`) had no fuzzy-match operator at all. The model retried `like` three times, the enum refusal listed no usable alternative, and the `experts` rows (the human names behind the recommended services) were never retrieved.
- `kg_query`'s miss message sliced the supported-shape list to 4 of 9 templates, steering the model toward an incomplete picture of what the tool accepts instead of the documented fallback decision.

## Decision

### kb_ingest resolves against the session cwd, through one shared fs-seam function

`sessionResolveCwd(cwd, requestedPath)` is a pure function at `@deepseek-ai/dsh-fs` (`packages/fs/fs/src/session-path.ts`): it passes `undefined` through for non-agent callers (the backend default applies), returns an ordinary cwd verbatim, and canonicalizes the cwd when either side traverses a parent segment (a symlinked workspace's filesystem identity is what resolves). `dsh-tool-fs`'s `sessionCwd(exec, requestedPath)` became a thin delegation over it, and `kb_ingest`'s `execute` now resolves with the same basis `read`/`write`/`edit` use: `sessionResolveCwd(exec.agent?.session.header.cwd, path)` passed as `ctx.fs.resolve`'s `cwd` option. No tool package carries a private copy of the parent-traversal/canonicalization logic.

### nb_list gains `includes` — one controlled operator, three synchronized mirrors

The restricted vocabulary grows from four operators to five: `includes` maps to NocoBase `$includes` (substring fuzzy match) and takes a scalar operand, validated by the existing scalar arm of `parseNbFilterCondition`. `like` is not added as an alias (`%`-wildcard semantics are ambiguous, and NocoBase's `$like` is not what the model's instinct assumes). The closed-vocabulary mirrors move together:

- `NbFilterOp` + `OPERATOR_KEYS` in `packages/connector/connector-nocobase/src/filter.ts` (the vocabulary source);
- the `nb_list` schema enum plus tool description, filter description, and system-prompt section in `packages/connector/tool-nocobase/src/read.ts`, each stating「for fuzzy matching use includes (substring match), never like」;
- the wire view type and zod enum in `packages/host/apiproxy/src/api/nocobase.ts` and `nocobase.schema.ts`, so the RPC domain accepts the same vocabulary it compiles.

### kg_query's miss message names every supported shape

`unsupportedMessage()` joins all of `KG_QUERY_EXAMPLES` (nine templates). The template closed set itself is unchanged — a miss still points at the `kg_schema` + `kg_subgraph` fallback.

## Alternatives considered

- **`kb_ingest` importing `dsh-tool-fs`'s `sessionResolveOptions` directly.** A tool package importing another tool package crosses capability domains for one helper, and the `./src/*` export is not part of the published surface (`files` ships only `lib/`). Depositing the pure function at the fs seam keeps the dependency direction on Service Definition packages.
- **Adding `like` as an alias for `$includes`/`$like`.** SQL `LIKE` carries `%`/`_` wildcard expectations NocoBase's `$includes` does not honor; a name whose implied semantics the backend will not deliver is worse than one controlled operator whose semantics are exact.
- **Opening the filter vocabulary to raw `$operator` trees.** The restricted flat list exists precisely so arbitrary operator trees never cross a consumer boundary; a fuzzy-match gap is fixed by one more named operator, not by removing the boundary.
- **Listing template ids instead of example phrases in the kg_query miss.** The model rewrites phrases, not ids; the example list is the actionable form of the closed set.

## Consequences

- The session cwd is now the single resolution basis every model-visible relative path tool uses; the invariant lives in one shared function, and a future tool adopts it by calling `sessionResolveCwd` rather than copying logic.
- `nb_list` answers name-ish questions (`name includes 红喜`) without the full-table paging workaround; the `like` refusal message now advertises `includes` because the enum list it prints includes it.
- The apiproxy `nocobase.list` RPC accepts `includes` in the same change — the two consumers of the vocabulary cannot drift apart.
- The kg_query miss message is longer (nine shapes, one line); the model reading it sees the full closed set instead of a truncated prefix.

## Verification

- Failing tests written first, all red for the pre-fix defect, all green after: `packages/kb/tool-kb/tests/ingest.spec.ts`「resolves a relative path against the per-session cwd, not the backend default」(was `FS_NOT_FOUND` under the backend default), `packages/connector/tool-nocobase/tests/tool-nocobase.spec.ts`「compiles includes to the $includes wire operator for fuzzy matching」and「refuses like, naming the supported operators (including includes) in the refusal」, `packages/connector/connector-nocobase/tests/client.spec.ts` restricted-vocabulary assertions, `packages/kb/tool-kb/tests/kg-query.spec.ts`「names every supported shape in the miss message」.
- `packages/fs/fs/tests/session-path.spec.ts` covers the shared function's branches; the `dsh-tool-fs` suite stays green over the delegation.
- Keyless snapshots refreshed through the real Loader compositions: `examples/kb-agent/tests/nocobase-tools.spec.ts` (a `serviceName includes 合规` journey step) and `examples/kb-agent/tests/kg-tools.spec.ts` (the full-shape miss message).
- `pnpm run typecheck` green; `oxlint` over every changed file reports 0 warnings, 0 errors; `pnpm vitest run packages/host/apiproxy` green (445 tests).
