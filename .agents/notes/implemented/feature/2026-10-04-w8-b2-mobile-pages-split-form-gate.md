# Agent Note: W8-B2 — mobile page-level split, alert grouping, and the form gate

Status: implemented

English | [中文](2026-10-04-w8-b2-mobile-pages-split-form-gate.zh.md)

The W8 audit's B2 batch (blueprint §4-B2): the largest single-file surface folds into modules, the alerts list gains density through grouping, home sheds its duplicated quick entries, and the v3 draft card gains the required-field gate. Rendering-decision moves only — the ```dsh``` protocol rendering, cardState replay, and fold semantics moved verbatim.

## Problem

`ChatView.tsx` had grown to 1000 lines (the fold rendering, the composer, the quick panel, the approval read-back, and the send lane in one module); the alerts list rendered same-rule rows flat (three CCP deviations on one scan = three full-height cards, no timestamp anywhere); home carried seven quick chips of which three duplicated on-screen entries (查看工作 = the work Tab, 找 AI 同事 = the agents Tab and the roster rail, 问经营 = the roster's first card); and a blank required field on a v3 draft card could ride 确认写入 straight to the send lane.

## Decision

- **ChatView split** into `messages/chat/`: `FlowItem.tsx` (one row's rendering decision table + `renderKeyOf`), `QuickPanel.tsx` (starter commands + placeholder tools), `Composer.tsx` (chip row + input bar + send/stop + the error toast), `chips.ts` (`contextChipsOf`), `useApprovalReadback.ts` (G2 poll), plus two hooks the 400-line budget forced out mechanically — `useDemoTyping` (the 2.5s demo indicator cell) and `useDraftValues` (hydration + generated system numbers + the edit sink) — and `confirm.ts`/`meta.ts` for the payload builder and the listMeta read. `ChatView.tsx` keeps the orchestration (send lane, callbacks, header/flow tree, hosted modals) at 389 lines and re-exports `contextChipsOf` so `views.client.spec.tsx` keeps its import surface.
- **Alerts grouping**: `groupAlerts` folds *adjacent* still-open unclaimed rows sharing `ruleType` + `title` into one collapsible group card (severity seal + rule name + ×count + newest `relativeTimeOf` on the header; expansion is local per rule+title memory, collapsed by default). Claimed/acknowledged rows and single-member runs render as the plain row card — `data-testid="alert-row"` stays on every detail row, so the W6 acceptance scripts keep their anchor. `AlertRow.createdAt` maps the wire `created_at` (epoch or ISO; undefined hides the cell) — a read of the existing projection, no new wire method.
- **Home chips 7→4** per the audit's content-priority row: 登记一条单据 (the one primary), 我的预警, 我的待办, 看单据. The three duplicates left with no「更多」bucket — each already had a stronger on-screen entry. The now-orphaned home `NewChatSheet` mount was removed (the chats layer's plus button and the roster rail keep the sheet reachable).
- **v3 required gate**: 确认写入 validates the required tier first; a blank field keeps the click (a disabled button cannot host the focus hand-off), paints the nearby `role="alert"` 此项必填 line under the field, and focuses the first blank control. The gate re-opens as soon as the blanks close (live re-validation on the merged values). Numeric widgets on the v3 card carry `inputMode="decimal"`; the * mark stays out per the §8 ruling (the 需要你定 tier is the required semantic). 驳回 is never gated.
- **Hand-overs and small repairs**: the askButton word moved to `--dshm-link` (dark 2.38:1 → 4.5:1); PageNav renders its title as the page's one `h1` (MetricsView dropped its own wrapper); the v3 tier heads dropped h4 for divs; markdown images lazy-load, cap at the bubble width, and name themselves when alt is empty; ReportCard metric values gain the bare-count thousands fallback; the quick panel's open animation aligned to 220ms.

## Evidence

- `wc -l`: ChatView.tsx 389; chat/ units 43/121/32/342/24/87/49/69/93.
- `pnpm exec vitest run packages/client/ui-mobile --no-file-parallelism` 674/674 (the parallel run's single view-spec miss is the resource-timed flake — single-file rerun green, see Repairs); typecheck clean; `build:lib:client` + `apps/web` vite build green; w7-b6 dark-track matrix and the w8-b1 light probe re-passed after the changes.
- R1 postscript (2026-10-04): the alerts/todos rendering specs passing at B2 time was timing luck — the pages then still carried the identity-closure infinite-refetch defect (pre-existing at HEAD); R1's fix re-verified the serial suite at 680/680. The 389/674 figures above are the B2-timepoint numbers.
- `demos/acceptance-w8/w8-b2-01..05-*.png` (375px, qc_inspector real login): home 4 chips, the split chat flow, the blocked-confirm error state, and the alerts group folded + expanded (route-stubbed history/alerts reads over the real :3080 build; the probe log lines ride the script).

## Repairs that surfaced during replay

- The parallel full-suite run twice failed `rejects from the review card…` on `findByTestId('review-card')` (1s default timeout under a loaded 12-thread worker pool, with V8 allocation stack traces in the log); the serial `--no-file-parallelism` pass and the single-file rerun are green — recorded as the known resource-timed flake, not a regression.
- The first shot script stubbed a fixed `rpcId`; the mobile rpc client rejects mismatched ids (rpc.ts), so the interceptor echoes the request's id back.
- `--dshm-*` overrides only: no new antd-mobile selector overrides were introduced (the group card and the field error are plain elements); the existing Picker/Toast precedents in tokens.css remain the only `--adm-*` channel users plus the two documented same-specificity overrides.

## Known residue / hand-overs to B3

- The grouping reads `created_at` opportunistically: where the engine row omits the column the timestamp cell (and the group header's 最新) hides rather than fabricating; verifying the column on the live projection belongs to B3-2's server-projection pass.
- `research/2026-10-04-w8-mobile/b2-notes.md` records the not-taken evaluations: list virtualization (paged windows are the right shape at this scale), the z-index inventory (all layers ride the antd portal channel), and the TaskFormModal draft-coverage review (destroy-on-close stays; the lightweight draft rides the B3-2 creation channel if it lands).

## Alternatives considered

- Disabled confirm button vs the click gate — disabled cannot deliver「focus the first blank field」(no click to hang it on); the click gate satisfies both the probe assertion (confirm sends nothing) and the focus hand-off.
- Keeping home's NewChatSheet on a fifth chip — the sheet already has two stronger entries (the chats plus button, the roster rail), and the audit's four-chip row names no sheet entry.

## Consequences

- New chat-surface work lands in `messages/chat/` units; ChatView stays the orchestration seam, and its re-export keeps `contextChipsOf` importable from the historical path (specs may migrate to `./chat/chips.ts` opportunistically).
- Alert grouping changes the DOM shape of the list (group wrapper + collapsible body); row-level consumers keyed on `alert-row` are unaffected, but anything assuming a flat card sequence must read groups.
