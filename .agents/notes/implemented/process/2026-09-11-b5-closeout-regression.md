# Agent Note: B5 closeout regression — three test-baseline root causes and the completed setup chain

Status: implemented

English | [中文](2026-09-11-b5-closeout-regression.zh.md)

## Problem

Four verification batches (B1-B4) had accumulated six debts, and the full `pnpm run test:web` run carried roughly 45 failures mixing four distinct root causes: a wholesale crash of the jsdom assembled-snapshot lane, a local build profile diverging from the official artifacts, e2e goldens never re-recorded after the sidebar gained its four entries, and a missing opt-in on the browser upload route. On the setup chain, neither the expert roster nor the historical orders rode the `all` chain — a NocoBase reset followed by a single `all` could not restore the full market catalog, and kg-build's every-collection-nonempty assertion failed outright on an empty orders collection.

## Decision

- **The jsdom WebGL enum stub belongs to the test scaffolding** (`apps/web/tests/assembled-boot.ts`): the sigma renderer inlined into the client bundle reads `WebGL2RenderingContext` static enums at module top level, and jsdom defines no such global, so the ui-kg factory threw on first require and the whole package failed to load. The stub carries only the enum numbers (the same shape the ui-kg package tests install via `vi.hoisted`); the degraded relation-list path never reaches a real GL context.
- **Running test:web locally requires official-profile artifacts first**: a plain `pnpm run build` (no profile) leaves `DSH_CLIENT_BUILD_PROFILE` as an empty-object read in the bundle, ui-brand-official's official guard switches itself off, and built-boot's wordmark assertion falls back. CI sets `DSH_BUILD_CLIENT_PROFILE=official`; the local equivalent is `DSH_BUILD_CLIENT_PROFILE=official pnpm run build`.
- **Golden re-recording is governed by diff review**: the aria-golden drift from the B4 sidebar entries (Data assets / Connectors / Graph / Business buttons and tabs) was re-recorded via `DSH_SNAPSHOT=refresh` after per-file diff review of the true figures — 45 files, +536/-54; the deletions live only in lifecycle-chrome's hero and plan-active goldens, the legitimate B3 scenario-IA replacement (featured plus folded categories plus live search displacing the old flat hero). Any content loss or disappearing control must be root-caused first.
- **Test selectors narrow with legitimate duplicate text**: steering's `getByText('Standard mode')` hit a strict-mode violation because the hero preset label and the composer preset seat now both carry the name (a product shape introduced by 57a87db34c); the assertion narrows to the seat's button role.
- **Upload-route opt-ins follow channel migration**: once browser uploads ride the unified `data.upload` route, the kb-workbench e2e overlay must opt into `dataUploadEnabled` alongside `kbWriteEnabled` — the one missing line left every upload row stuck in its failure state.
- **The expert roster and the historical orders join the `all` chain** (`setup-dsh-data.mts`): the roster watermark requires all 32 roster expert names present, the orders watermark requires all 24 `ORD-B5-` rows present, and a miss replays the owning seed script (both are idempotent by name and by order-number prefix); the verify assertion group gains experts / expert_services / datasets / orders row floors. This closed the last gap in "a reset plus one `all` yields the complete system".

## Verification

- `kb-workbench.e2e.ts` uploads×3 green across two consecutive full-file runs (14/14 each; upload durations back to normal scale).
- 28 drifted files re-verified in replay mode: 104 passed; the jsdom snapshots (`built-boot`, `command-image-envelope`, …) pass under official artifacts plus the WebGL stub.
- reset → delete the three sqlite files → first `all` replayed the roster (32 experts / 49 services / 23 assets) and exposed the empty-orders assertion failure; after the orders orchestration landed, `all` exited 0 (orders replayed 24 rows) and the next `all` reported every step kept with verify OK.
- Five-scenario demo 5/5 PASS (transcript `demos/full-journey-20260911-160059.md`; the first run failed only because :3080 was not up — the fulfill callback had no service, an environment prerequisite rather than a product defect).
- `pnpm run typecheck`, `pnpm run lint` (0/0), `pnpm run doc-sync` (28/28), and the `examples/kb-agent/tests/` partition (46 tests) all green.

## Consequences

- **hmr-live×1 waived**: `pnpm run dev:web` crashes deterministically on this machine — a load-hook interop defect between tsx@4.22.4 (async `module.register` hooks) and tsdown@0.22.2 via import-without-cache@0.4.0 (synchronous `registerHooks`) inside one process (Node 22.19.0, `ERR_INVALID_RETURN_PROPERTY_VALUE`). Minimal reproduction: calling `tsdown build({ workspace })` in-process under tsx; the tsdown CLI subprocess and `scripts/build.ts`'s all-subprocess path both work. The chain has zero changes this effort and fails identically at HEAD — not load jitter and not a product regression. A fix needs upstream movement (tsdown / tsx / the Node hooks protocol); restructuring dev-web from the repository side exceeded this round's scope. CI's Linux matrix owns the signal.
- **remote-welcome×1 and smoke-real×1 classified as environment items**: both green on serial single-file reruns (the former inside the 28-file re-verification batch, the latter 4 passed / 8 skipped, EXIT=0); the run-2 smoke-real failure spanned a system sleep (the single file ran 100 minutes).
- **n22-think-filter.spec.ts +2/-1 attribution** (a B1 carry-over fix): the `filterNonStreamBody` case narrowed the chained any access `JSON.parse(...).choices[0].message.content` into a typed cast with optional chaining (`{ choices: { message: { content: string } }[] }`), a type tightening made while B1 fixed think filtering; attributed here as part of the closeout.

## Alternatives considered

- **Rewriting the roster claim in the docs instead** (debt 1 option b): rejected — restoring the 32 experts from a single `all` after a NocoBase reinstall is part of the "reset yields the complete system" contract, and downgrading the docs would fossilize the gap.
- **Switching KgGraphCanvas to a dynamic sigma import**: rejected — the single-file bundle is an adjudicated design (the ModuleLoader serves no relative-path chunks); the jsdom gap belongs in the test environment as a stub.
