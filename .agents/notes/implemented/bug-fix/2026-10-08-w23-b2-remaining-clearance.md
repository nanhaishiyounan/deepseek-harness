# Agent Note: W23-B2 — audit-remainder clearance (P1×7 + P2×4 + two investigations)

Status: implemented

English | [中文](2026-10-08-w23-b2-remaining-clearance.zh.md)

## Problem

- The W23-B0 audit (`demos/acceptance-w23/audit.md`) left twelve findings after B1: P1-5 card-face terminology leaks (snake_case table/column names, RFC 4180, UTF-8 BOM in subtitles/rows), P1-7 machine-language degraded-notice copy with the CSV locked inside the collapsed item, P1-8 engine-vocabulary alerts copy, P1-9 the hero's「N 件事」sum conflicting with the ledger cards' 0 待处理, P1-10 nine stacked nb_* tool rows per turn, P1-11 no urgency banding and one row per scan-day snapshot, P1-12 hero display grade, P2-1 four protocol-legal actions of which the fourth rendered nowhere, P2-4 machine-flavored send texts, P2-6 mixed-language chatter, P2-8 the desktop mode presets (标准/PTC/极简/创造模式) listed among the business colleagues.
- Two investigation items: session titles fell back to the truncated first prompt on ~100% of new sessions despite the `session/title-llm-request` event firing, and the persona's zero-value metric discipline needed three recorded live observations.

## Decision

- **P1-5/P2-4/P2-6 (persona)**: the card-face people-language rule (`title/subtitle/metrics label/rows label+hint/table columns+cells/actions label`; no table names, snake_case fields, RFC 4180/UTF-8 BOM), the send-text "what the user would say" rule (no machine directives, no field lists), and the Chinese-purity rule (proper nouns excepted) were extended to all four card-bearing presets (`business-advisor`, `mobile-form-assistant` gained the card-face line; `enterprise-data-assistant` already had it from B1 and gained the language lines; `food-compliance-officer` gained the language line). No render-layer enforcement: unlike B1's view-route check (a closed enumerable set), terminology is an open set — a regex guard would misfire on legal English (OTIF, GB 2760, P50) and cannot rewrite, only reject whole cards.
- **P1-7**: the degraded notice's summary became「这条消息未能按卡片正常显示，点开可查看原文」with a 复制原文 button (the shared `copyCode` lane from `RichContent`, exported for reuse) so a rejected report's CSV stays one tap from the clipboard; `fold.ts`'s two notice texts dropped 校验/载荷/系统退回 for cause-neutral wording.
- **P1-8**: the alerts page's empty-state and foot-note copy now reads 认领后由你负责跟进 / 四类预警, dropping 路由责任人白名单/越态/四路规则.
- **P1-9**: the hero line quotes the ledger cards' own vocabulary —「今天：待处理 N 项 · 待确认 M 项 · 进行中 K 项」with zero counts omitted — instead of a third summed figure.
- **P1-10**: `clusterFlowUnits` + `ToolClusterRow` (`messages/chat/ToolClusterRow.tsx`) fold runs of ≥2 consecutive settled tool rows into one「已完成 N 步查询」summary with the wedged assistant narration (the 换个思路 asides) inside the expand; a running row breaks the run so live progress stays row-by-row. Render-layer only — the fold and every projection keep their semantics.
- **P1-11**: `AlertsView` bands rows into 需尽快处理 (critical / ≤7 days / overdue), 近期关注 (≤30 days), and a collapsed「N 条远期提醒」fold for >30 days; `groupAlerts` also merges adjacent open rows sharing a rule type and a non-empty entity code (one certificate across scan days), and the group header carries the day range「72~73 天后到期」(`daysRangeOf`, clean all-positive spans only).
- **P1-12**: the hero title dropped one grade (display→title) and the quick-chip row became one shared four-column grid (the CTA and capsules share track widths).
- **P2-1**: `orderedActionsOf` renders the protocol ceiling — three secondaries beside create-task, four without it — over the already-wrapping flex row; protocol/server/persona stay at four.
- **P2-8**: `listAiEmployees` drops system-trust presets (the desktop composer's interaction modes) from the mobile roster unless one is the deployment default, whose row stays reachable.
- **Title-LLM root cause (fixed)**: MiniMax-M3 always thinks inline (~60–150 reasoning tokens before any title text); the base bundle's `session-title-first-prompt-llm` `maxOutputTokens: 64` hit `finish_reason: length` mid-thought on every call — `session-title-llm`'s max-tokens arm threw, the service caught it, and the fallback stood. The wire-level repro (`finish:["length"]`, 63/64 tokens reasoning) and the 256/512 controls (`finish:["stop"]` plus the title line) pinned it; the config rose to 512. Live after the fix: both probe sessions landed provider titles in ~10s (2/2, was 0/N).
- Not fixed, recorded: the harness registers no cordis logger exporter anywhere (apps/boot/bundles), so `ctx.logger.warn` lands only in the 1000-entry in-memory ring — a standalone observability gap that made this investigation run on external probes.

## Consequences

- ui-mobile 873/873 (new: tool-cluster split 5, alerts banding/far-fold/day-range 1, roster trust cut 1, orderedActionsOf rewrites 2, hero vocabulary 1; updated: the degraded-notice and tool-row assertions), tool-present-card + session-title 200/200, toolcard e2e 6/6, `pnpm run typecheck` green, `build:lib:client` + apps/web vite build rerun, gateway restarted on :3080.
- Live evidence (`demos/acceptance-w23/b2-*`): hero 20px + chip widths 78×4 (spread 0); alerts bands 需尽快处理/近期关注 on admin, the buyer foot-note in people language; roster carries 0 mode rows; the degraded notice shows the new summary with its copy entry; the audited c2 session renders「已完成 8 步查询」expanding to 8 rows; provider titles 2/2; three zero-metric observations (z1 conclusions-in-prose「你名下目前没有待审批的单据」, z2 month card 0 zero metrics, z4 todos cards 0 zero metrics), card-face terminology leaks 0, send texts all people-language, English residue = the buyer username (proper-noun grade).
- The buyer's live alerts set holds no >30-day rows (those live in the recall notices), so the far fold's live proof is the unit test plus admin's band heads; recorded as evidence-shape, not a behavior gap.

## Alternatives considered

- **Server-side terminology validation in `tool-present-card`** — an open set cannot be enumerated; rejecting cards on a snake_case regex would false-positive legal tokens and trade a cosmetic leak for missing cards.
- **Folding tool rows inside `fold.ts`** — would change the fold's pure projection and every consumer (chips, previews) with it; the render-layer split keeps one fold and one render decision.
- **A per-severity sort inside the far band** — the wire already arrives newest-first; re-sorting by days would fight the group adjacency.
- **Raising `timeoutMs` instead of `maxOutputTokens`** — the failing calls died in 6–8s on `finish_reason: length`, not on the 60s deadline; only the token ceiling was binding.
