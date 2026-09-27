# Agent Note: W-round R2 write guards — engine-side collision refusal, script timeouts, Shanghai day boundary, and the sixteen-form welcome

Status: implemented

English | [中文](2026-09-26-w-round-r2-write-guards.zh.md)

## Problem

The W-round verification left four defects open: a model-issued document number could collide with an existing row (prompt discipline alone had already let one through — B5 #1), the kb-agent scripts' `fetch` calls hung forever against a stuck NocoBase or proxy, `kpi-run` bucketed "today" in UTC so the 20:00 UTC replay wrote Shanghai's next day onto the wrong date, and the published welcome block still advertised ten forms while the registry carried sixteen.

## Decision

**The collision guard is engine-side and fail-loud.** `CODE_UNIQUENESS_COLUMNS` in dsh-tool-nocobase names the six guarded collections (five `code` columns plus `wms_receipts.receipt_no`); `enforceCodeUniqueness` runs one filtered list read before any create writes and refuses a number another row already holds, with the four-element message (collection, column, code, holding row's id). Live column names were verified against the database before the map landed; a read-only psql sweep confirmed zero pre-existing duplicates, so enabling the guard could not strand a dirty table.

**Script-domain fetches carry a per-request timeout.** `call()` in nocobase-flow-page-lib wraps every request in `AbortSignal.timeout` (default 30s, `NOCOBASE_TIMEOUT_MS` overrides) and the timeout error names the method, path, budget, and the override knob.

**KPI day bucketing uses `shanghaiDate()`.** The three UTC "today" reads in kpi-run (PRESENT_ONLY gating, backfill start, `--calc-kpi`) share one UTC+8 formatter; the selftest pins the 20:00-UTC (next Shanghai day), 15:59 (same day), and 16:00 (day flip) boundaries.

**The welcome block mirrors the registry.** preset.yml `welcome.capabilities` lists all sixteen registry biz names in registry order (the roster's 质检记录 label corrected to the registry's 质检登记), and the `.dsh` deployment mirror is byte-identical.

## Consequences

A duplicate document number now refuses inside the tool with a business-readable message instead of landing a silent collision; a hung backend surfaces as a named timeout instead of a stuck script; the 90-day KPI replay dates like a Shanghai operator reads them; the mobile empty state and the published preset agree on all sixteen forms.

## Alternatives considered

- **Prompt-side numbering discipline** — already failed once in B5 #1; the engine boundary is the only layer every caller crosses.
- **A global fetch agent with one timeout** — coarser than a per-call budget; scripts mixing cheap probes and heavy calls need call-level control.
- **Server-side timezone bucketing** — the KPI bucketing is a client reading `calc_date`, not a server default; the formatter belongs where the reads are.

## Verification

`r2-01..04` evidence (bracket-sweep before/after, 13-test welcome output with the 16-form assertion, live duplicate sweep over the six collections, hang-port timeout at 223ms); `pnpm vitest run packages/client/ui-mobile packages/connector/tool-nocobase` 663/663; `setup-nocobase.mts verify` OK; note gates green.
