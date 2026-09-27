# Agent Note: W-round R3 debt closure — the nb_update side door, DB unique backstops, and the real-file mirror tests

Status: implemented

English | [中文](2026-09-26-w-round-r3-debt-closure.zh.md)

## Problem

The W-round final verification passed with debt (88, five Important + six Minor): a code-changing `nb_update` patch bypassed the create-side collision guard entirely; the guard's list→write check was an undisclosed TOCTOU with no database backstop; the mirror tests asserted the preset's welcome against hand-copied strings instead of reading the published file; the preset `description` still counted ten forms; the local welcome fallback carried four capability lines against the preset's five; and the R2 batch had no Agent Note.

## Decision

**The update path runs the same preflight with `excludeId`.** `enforceCodeUniqueness` gained an optional `excludeId`; the lookup reads up to five holders and refuses when any row other than the updated one holds the number, so re-entering a row's own number is legal while taking another row's number refuses with the create-side four-element message. `nb_update` calls it after the edit-lock check and before the write; a patch without a guarded number column never triggers the lookup.

**The TOCTOU is disclosed and backstopped.** The guard's JSDoc and the write module's header state the non-atomic window, the mitigation (serial write path, fail-loud retry), and the root fix. That root fix ships as `stepUniqueDocIndexes` in setup-nocobase: a partial unique index per guarded column (`WHERE <col> IS NOT NULL AND <col> <> ''`, matching the guard's empty-number semantics), behind a duplicate preflight that fails loudly with a count before any CREATE INDEX could hit a constraint error. It runs idempotently (`IF NOT EXISTS`) in the `all` chain and as its own `unique-indexes` command; `verify` asserts all six indexes exist. Rollback is `DROP INDEX IF EXISTS` — data-free and immediately effective.

**The mirror is tested against the real file.** The registry spec reads `preset.yml` from disk (js-yaml resolved from the root manifest — not a ui-mobile dependency) and asserts the first capability line equals `registryCapabilityLine()` verbatim, the `description` enumerates the sixteen biz names in registry order, the `.dsh` deployment copy is byte-identical, and the local fallback (`welcomeOf` with no wire block) equals the published capability lines. The fallback gained the missing fifth line (库存/补货/盘点), so local sessions and the published preset now say the same five things.

**The misconfiguration knob names itself.** `NOCOBASE_TIMEOUT_MS` rejects non-integer, zero, and negative values at import with `NOCOBASE_TIMEOUT_MS 必须为正整数毫秒，当前值 …（解析为 …）`.

## Consequences

A duplicate number now refuses at three layers (tool preflight, database index, REST error echo); a drifted mirror fails in `pnpm vitest` instead of at deployment; the update side door is closed with the same message vocabulary as create; the W-round R2 batch carries its own record.

## Alternatives considered

- **NocoBase field-level `unique`** — the metadata route is unreliable on an already-installed deployment; the SQL partial index is direct, idempotent, and reversible.
- **A `$ne` filter for excludeId** — leans on server operator support the mock backend does not implement; filtering the five-holder read in JS is exact and testable.
- **A deploy-time mirror check** — a vitest read of the real file fails faster and gates every PR, not just deployments.

## Verification

`r3-01..04` evidence: 670/670 vitest (663 baseline + 3 update-guard negatives + 4 mirror tests); `unique-indexes` apply, idempotent re-run, live REST duplicate → HTTP 400 with empty numbers legal, and the DROP → duplicate-lands → rebuild → duplicate-refused rollback loop; `setup-nocobase.mts verify` OK including the new index assertion; typecheck clean; staged oxlint 0 errors (2 unused-disable warnings predate this batch).
