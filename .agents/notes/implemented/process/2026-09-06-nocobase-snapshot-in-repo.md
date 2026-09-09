# Agent Note: NocoBase 2.2.6 source snapshot at platform/nocobase

Status: implemented

English | [中文](2026-09-06-nocobase-snapshot-in-repo.zh.md)

## Problem

Architecture v2 requires NocoBase to live in this repository as the enterprise business system (orders, approvals, business collections), replacing the v1 stance of "external REST-only deployment against a checkout outside the repo" (`research/2026-09-03-connector-lakehouse-nocobase/nocobase.md`). The open questions were which in-repo form the 159-package yarn-1 monorepo takes without breaking the root pnpm workspace, gates, coverage, and the `@deepseek-ai/dsh-*` publication set, and what the license position of a 2.2.6 snapshot is.

## Decision

### Isolated snapshot at `platform/nocobase/`, not vendoring

NocoBase lands as a top-level isolated snapshot subtree (the `native/landlock-run` precedent of "independent subtree with its own gates"), keeping its yarn-1 workspace self-containment and `packages/*/*` relative layout (`genTsConfigPaths` depends on the depth). The root `pnpm-workspace.yaml` is unchanged: no existing glob matches `platform/`, so `pnpm install` and `pnpm ls -r` never see the 159 upstream packages. The snapshot is 14,031 files / 112 MB from NocoBase 2.2.6 (`lerna.json` `"version": "2.2.6"`), excluding `node_modules/`, `storage/`, `.git/`, `.env`, `.env.test`, `dist/`, `coverage/`, `.turbo/`, `.nx/`, `.cache/`, `.repo/`, `tsconfig.paths.json`, and `docs/` (94 MB upstream doc site, kept out of the first snapshot). Provenance, exclusions, the local-modifications ledger, and the license position live in `platform/nocobase/MANIFEST.md` and `platform/nocobase/NOTICE.md`.

### Four gate immunizations (the complete list)

- `.oxlintrc.json` + `.oxlintrc.staged.json`: `ignorePatterns` gains `"platform/**"` (CI full-repo lint and lefthook staged lint), plus `"research/**"` for the upstream evidence copies under `research/*/sources`.
- `.gitignore`: `platform/nocobase/**/dist/`, `platform/nocobase/**/storage/`, `platform/nocobase/.repo/` (node_modules/lib/coverage/.env are already covered by the unanchored rules).
- `.gitattributes`: `platform/nocobase/** -text` — upstream bytes stay verbatim, so re-syncs diff cleanly against the upstream tag.
- `lefthook.yml` whitespace job excludes `platform/nocobase/**` (upstream trailing whitespace is not this repo's style debt).

Everything else is whitelist-anchored and immune by construction: typecheck (solution `files: []`, references unchanged), vitest/coverage (`packages/*/*/src/**` glob), knip (workspace-membership derived), publint, constraints, node-next-types, doc-sync (all `verify-*` PATTERNS), third-party notices (derived from pnpm-workspace members, no-op).

### Publication guard

`scripts/publication-payload.ts` now rejects any payload path under a `nocobase/` directory (manifest `files` entries and packed tarball members), so NocoBase code cannot leak into `@deepseek-ai/dsh-*` releases. `dsh-connector-nocobase` payloads (`lib/*`) are unaffected — the rule matches the path segment, not the package name.

### License position

NocoBase 2.2.6 ships Apache-2.0 full text plus NocoBase supplementary terms (AGPL-3.0 until v2.0.3, 2026-02-24; upstream CHANGELOG #8682 and the LICENSE.txt snapshot are the authority — 9,450 file headers still carry the old AGPL dual-license wording and must be kept verbatim, LICENSE.txt §5.3). Internal deployment carries no network source-disclosure obligation; offering a public no-code/AI-platform SaaS on it is forbidden (§5.4) and would need a commercial license. The pro plugin set is not in the open-source repo and is never copied. Full analysis: research section 01 (盲区 A) §3.

### Track in-repo

`examples/kb-agent/scripts/setup-nocobase.mts` `NOCOBASE_HOME` default moves from the sibling `../nocobase-main` checkout to the in-repo `platform/nocobase`; the six commands (install/start/init/verify/stop/reset), ensurePostgres, and writeEnv are unchanged, and QUICKSTART.zh.md tracks the new wording. `NOCOBASE_BASE_URL` / `NOCOBASE_API_KEY` keep pointing at `:13000`, so connector-nocobase, expert-orders, and the nocobase-track e2e needed zero changes.

## Consequences

- Upgrades are re-snapshots: rerun the MANIFEST rsync against a new upstream release, update the MANIFEST, and replay or re-adjudicate local-modifications. There is no git history to merge (upstream source is a zip).
- Any edit to a NocoBase source file must be registered in the MANIFEST local-modifications ledger (Apache-2.0 §4(b) modification marking) and is preferably carried as a patch file for re-sync friendliness.
- NocoBase never enters dsh releases (publication guard) and never joins the pnpm workspace; its yarn-1 lockfile stays the only install anchor (`cd platform/nocobase && yarn install`, never `pnpm --dir`).
- The root repo's lint/typecheck/test/doc-sync matrix stays green with the immunizations above; `git status` carries ~14k snapshot files as the accepted one-time cost.

## Alternatives considered

### Why not `vendor/nocobase`?

The `vendor/*` workspace glob would absorb it as a member on contact: `allowBuilds` turns its postinstall-heavy tree into a hard install error, constraints demand `"private": true` and `workspace:` protocol, third-party notices would pull the whole dependency tree into disclosure, and the vendoring contract's rescope to `@deepseek-ai` would break `PLUGIN_PACKAGE_PREFIX='@nocobase/plugin-'` runtime plugin resolution.

### Why not pnpm-workspace absorption?

157/159 upstream packages are CJS against this repo's ESM-only rule; React 18 + antd 5 + formily would share one node_modules tree with the DSH web client; the yarn-1 lockfile cannot merge into pnpm; and the per-file 100% coverage gate would drown in 159 new members.

### Why not a git submodule?

The upstream source arrived as a zip with a hollow `.git` shell (no history), and nested repositories corrode Roo-Code checkpoints per the vendoring policy. A snapshot with a MANIFEST is the only form that supports both re-sync and in-place modification with an audit trail.
