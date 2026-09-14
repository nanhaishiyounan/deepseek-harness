# Agent Note: G9 unified-verification fixes — column-drift false success and truthful evidence chains

Status: implemented

English | [中文](2026-09-14-g9-unified-verification-fixes.zh.md)

## Problem

Unified verification scored FAIL 78/100 with core business fully green; the loss concentrated in two families. Real defects: the quick-search contacts deep link landed on the list page (the G6 fork note "CRM has no contact detail route" was wrong — the `show/:id` route existed all along); the project form bound a `code` field while `hub_pj_projects` ships `no`, so AI fill showed the value in the UI while the API silently dropped it (false success, NULL on disk); seed backfills unconditionally overwrote hand-edited values; create had no double-submit guard. Falsified evidence: the archived "dark" screenshots were light-theme captures (MD5-identical to the light shots, brightness 245+) while both gates.log rows recorded them as dark theme.

## Decision

The `code → no` rename covers the whole read/write chain — form.tsx (FormField/defaultValues ×2/aiFields), types.ts (ProjectRecord/ProjectFormValues), list.tsx (cell + CSV export), show.tsx, and the quick-search.tsx local type and secondary line — not just the AI binding. Double submits are guarded by a `useRef` flag that short-circuits synchronously on the first handler line and resets in `finally`, because react-hook-form's `formState.isSubmitting` flips a tick late and same-tick clicks pass through. Seed backfill guards read `row.tag ?? 'AST-…'` / `row.createdAt == null ? […] : []`, reusing the backfill loop's existing `row[key] !== value` filter instead of adding branches. Dark screenshots are re-recorded with `localStorage.nocobase-theme=dark` + a full reload + ~700 ms settle + a plain emulated-viewport shot (fullPage freezes module graphs per the F7 lesson), and each gates.log dark line now carries two in-log assertions: MD5 differs from the light shot and mean brightness < 150. Historical batch logs keep their factual lines; corrections ride inline (new MD5/brightness) or as a dated G9 section, and overclaims ("zero product changes this batch", "zero column-does-not-exist") become truthful counts or registered residuals (crm_leads.email family and crm_deals.contact_id still throw; queued for H). The gateway-smoke row carries the accept: text/html fallback caveat, same probe convention as the deep-link row.

## Alternatives considered

**Fix only the AI field binding (`name: 'code'` → `'no'` in aiFields).** Rejected: it preserves a second false success — hand-typed codes still drop silently and list/show cells still read a nonexistent column, so the verification finding would resurface one field away.

**Rely on `formState.isSubmitting` for double-submit protection.** Rejected: the disabled attribute lags one tick, so three same-tick clicks all reach onFinish; the G9 acceptance case (three clicks → one row) fails under it. The API-level idempotency key remains the real cross-process defense and stays registered for the H round rather than shipping half-designed now.

**Guard seed backfills with explicit `if (row.tag) return []` branches.** Rejected as duplication: the backfill loop already drops no-op patches via `row[key] !== value`, so a null-coalescing expression expresses "keep existing values" in the same style the crm_products guards already use.

**Rewrite the falsified dark-theme lines in place with no trace.** Rejected: gates.log rows are batch records; silently rewriting them would repeat the original sin. Corrections name the original state (light MD5/brightness) and the re-recorded values, so the archive shows both the failure and the fix.

## Consequences

Cost: the project form field rename touches six files and the project drawer form value type changed shape (`code` → `no`), so any future consumer of `ProjectFormValues` must use `no`; the guard expressions make backfill rows read slightly denser. Bought: the project number now survives the whole path (UI → API → `hub_pj_projects.no` → list/CSV/show/quick-search), hand edits survive seed reruns by contract rather than by luck, exactly one row is created per submit intent, and the dark-theme evidence in gates.log is machine-checkable (MD5 + brightness) instead of narrative. The truthful-residual wording also converts the next cleanup round's entry condition from "believed done" to "registered list".

## Testing

demos/acceptance-g9/gates.log: live deep-link check (/contacts/show/1 renders the detail with name + email); triple-click yields exactly one row with non-null no; seed-guard negative path (hand-set tag and createdAt both survive script reruns); four dark shots with MD5/brightness assertions; portal tsc 0, vitest 13/13, deploy double-run tree hash identical, typecheck/lint 0, doc-sync 28/28, and the e2e spot-check failure proven pre-existing via a stash-baseline rerun.
