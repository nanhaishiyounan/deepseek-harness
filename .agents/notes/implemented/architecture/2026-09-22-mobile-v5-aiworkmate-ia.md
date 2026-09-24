# Agent Note: Mobile v5 — the AI Workmate IA, the v:3 report fence, and the work store's local/log boundary

Status: implemented

English | [中文](2026-09-22-mobile-v5-aiworkmate-ia.zh.md)

## Problem

Through v4 the mobile surface was a chat face over two tabs (消息/我的): the v1 workbench/data tabs' Q&A duty had already folded into chat colleagues, but an answer had nowhere to go — a risk list or an overview evaporated in the scroll, "have the AI handle it" had no work object to attach to, and execution progress was invisible. The IA needed a work domain, not more chat; and that domain's data had to respect the 「model-visible ⟺ log-reconstructable」 red line without pumping UI state into the model's context.

## Decision

**Ten routes, four tabs.** The v5 shell dispatches ten hash routes — `#/` (home, the default landing), `#/chats`, `#/chat/:id`, `#/work`, `#/work/:id`, `#/me`, `#/tasks`, `#/files`, `#/agents`, `#/login` — behind a four-tab bar (AI同事/对话/工作/我的). The tab bar renders on the four whitelisted pages only; chat and work detail are full-screen layers, tasks/files/agents secondary pages. Home owns "what needs me today": the today-ledger stats card, quick-task chips, the colleagues roster scroller, and recent chats with work sessions filtered out.

**Third-generation fold landings moved by meaning.** The legacy hash heads re-land: workbench→work (the workbench's semantic home is now the work tab), contacts→agents (the v2 contacts' duty — starting a colleague's chat — lives in the agents directory); messages/data/kg→chats and profile→me keep their second-generation landings. Old deep links, the PC preview iframe's included, land on a live page instead of a dead tab.

**The report fence rides v:3.** The report payload (id/title/subtitle/metrics/rows/table/actions) is the seventh `dsh`-fence payload under the existing `v:3` envelope, not a `v:5` bump: the envelope version marks the protocol generation — fence + envelope + type discrimination + degrade-on-invalid — and a new payload type changes none of that. The strict equality check means a bump forces all six existing payloads to migrate or a dual-track discrimination, for zero benefit; an old client meeting an unknown payload type and one meeting a wrong version take the same degrade path, so backward compatibility is identical either way. The count bounds (metrics 1–6, rows ≤8, table ≤5 columns ×10 rows, actions ≤4) are part of the persona contract: an out-of-bounds card degrades to a visible collapsed original rather than a lenient frontend truncation silently losing model output.

**The work store is local state; model-visible facts ride real user messages.** Work items (todo→doing→review→done, transition-guarded) live in localStorage, never in the session log — high-frequency UI CRUD (status flips, pins) stays out of the model's context. Every fact the model must see rides the durable log as a real user message: M1 the task-creation notice to the source chat, M2 the execution directive into the isolated exec session, M3 the completion notice, M4 the rework directive, and the report card's send action. Pure UI moves (view/link navigation, modal opens) write nothing. The exec-session isolation set is likewise a local registry (a session-id set the chat lists filter by), not a log property — cross-device replay cannot rebuild it; recorded as a known limitation, not a defect to fix by logging.

**Two run modes behind one data-source interface.** The work detail view consumes a TimelineDataSource; live folds the exec session's polled history into steps and a result, demo advances a scripted sequence — same component, swapped data source. The mode itself: an explicit profile switch wins, otherwise one `llm.models` probe (a catalog holding a servable model means live) decides, and any failure falls safe to demo — a demo must never pose as the real lane. The calibration point resolved in favor of keeping the probe: `llm.models` answered as designed. Demo seed items all carry a demo flag, and 清除演示数据 removes exactly them.

## Consequences

- The registration flow and the report flow are mutually exclusive by persona teaching (a registration never reports; a report answer never drafts) — the model cannot mix the two card families in one reply, and the fences stay one-per-answer trailing.
- Future payload kinds join the `DshPayload` union without an envelope bump; only a structural envelope change bumps `v`.
- Work data never syncs across devices — the local-store cost — while the session logs stay complete, so the M1–M4 audit trail survives where the work items do not.
- The FilesView 最近文件 section is empty by the design's literal-dedup semantics and renders a fixed empty copy until that design question resolves.

## Alternatives considered

- **Restoring the v1 workbench/data tabs.** Rejected: v2 already folded their Q&A duty into chat colleagues; restoring the tabs is a duty regression. The work domain arrives as the work tab plus secondary pages, not as parallel chat tabs.
- **A `v:5` envelope for report.** Rejected on the generation argument above; a dual-track discrimination would outlive its usefulness the moment the next payload kind arrives.
- **Work items as session events.** Rejected: status flips and pins are UI state, and logging them would pump interface noise into the model's context; only user-intent messages (M1–M4, sends) are model facts.
- **A streaming execution timeline.** Rejected for this batch: mobile freshness is the polling model everywhere, and the live timeline reuses readHistory folding; streaming is separate future work.
