# Agent Note: W2-B5 approval threshold/tolerance config + multi-approver routing + RFQ CLI

Status: implemented

English | [中文](2026-09-27-w2-b5-approval-threshold-config.zh.md)

## Problem

99-legacy #1/#3: the two-level approval threshold (100_000) was a baked-in constant on both entry points, the invoice three-way-match tolerance (0.05) a second constant in the w3 script, approver_map carried a single admin username, and sendRfq/awardRfq had no CLI. Batch 05-b5 requires all four configurable — with the W-round behavior as the exact default (zero drift when extras stay empty) and the packages-side rules module (`tool-nocobase`, the only W2 batch that touches `packages/`) keeping both entry points (script engine and `nb_approve`) on one source.

## Decision

- **The config seat is the flow row's extras JSON, not cordis.yml (PLAN D7).** `wfl_flow_configs.extras` gains `amount_threshold` (positive number) and `invoice_match_tolerance` (non-negative number). Rationale: approval-engine is a scripts-side standalone process, not a plugin — data-side flow rows are the natural per-flow seat, and the repo's no-hardcoded-tunables stance lands on examples side as data files/env (the `W1_ENGINE_CALLBACK` precedent), never plugin Config.
- **`thresholdOf(extras)` + `approversOfRole(map, role)` are the shared pure functions** ([approval-rules.ts](../../../../packages/connector/tool-nocobase/src/approval-rules.ts)). thresholdOf: missing key/null extras → `DEFAULT_AMOUNT_THRESHOLD` (the renamed APPROVAL_AMOUNT_THRESHOLD — the fallback, no longer the only value); a present-but-malformed value (string, zero, negative, NaN) fails loud. approversOfRole: a role's value may be one username or an array — array = OR-sign-off (any one may act; counter-sign is enterprise scope, refused). `nextStateOf`/`FlowVocabulary.nextOf` grow an optional trailing `threshold` parameter defaulting to DEFAULT — every pre-B5 call site keeps its exact behavior.
- **Both entry points resolve the threshold at flow load.** `loadFlow` (engine) and `loadFlowConfig` (nb_approve) run `thresholdOf(extras)` once and pass the resolved value into `vocab.nextOf`; the missing-key fallback logs one line per flow per process (engine side). act()'s transition cross-check stays on the seeded condition literal, so a drifted extras-vs-condition pair fails loud as a missing transition (rules and configuration cross-check).
- **Todos expand one row per approver; any one act completes the tier.** openTodo/openTodoAt expand `approversOfRole` into one `wfl_approval_todos` row per user; closeTodos already closes every open row at the state, so either approver's act voids the rest — the audit five elements unchanged. Every mapped username is asserted to exist in the users table (fail-loud「引用不存在的用户」before any todo row lands).
- **seedDocFlow converges what the options own; every change appends one config_note audit line.** Options amountField/amountThreshold/invoiceMatchTolerance/approverMap converge transitions (column + threshold literal normalized idempotently), the owned extras keys, and the map onto the configured target; undefined options leave an existing flow's values untouched (a hand-tuned so_orders threshold survives w3 re-runs). `wfl_flow_configs.config_note` (the audit column this batch adds) records who/when/old→new per repair — the measured live loop: seed wrote the 200000 switch, the negatives script's ghost/abc probes drifted it, the next w3 run repaired it back and both directions left audit lines.
- **The three-way-match tolerance rides the pur_orders flow extras** (`matchTolerance(io)` reads `invoice_match_tolerance`, default MATCH_TOLERANCE=0.05, malformed fails loud); `--send-rfq <code>` / `--award-rfq <code> [--quote <报价行id>]` are standalone w3 CLI verbs (quote names a non-lowest winner; the collection carries no code column, so the row id is the key).
- **Demo config (the acceptance pair):** pur_orders extras = amount_threshold 200000 + invoice_match_tolerance 0.1, manager tier ['admin','quality_lead'] — so ¥150k lands one round (quality_lead) and ¥250k routes to the gm sign-off; so_orders and every other flow carry no key (default 100_000, W-round literal `amount <= 100000` verified unchanged). The `admin` username became a real users row (the snapshot's super admin is `nocobase`; W-round maps referenced `admin` as a plain string that no users row ever carried — the fail-loud check would have refused every flow).

## Notes

- The reject→resubmit replay cannot re-demonstrate the todo expansion on an approved document (reject only admits pending states): the demo keeps a dedicated witness document (PO-B5-C approved with its two completed tier rows; PO-B5-D left pending with two open rows for the live page).
- `s2` zero-regression holds because the B9 purchase order is ¥880 (one-round under any threshold); the w3 demo-chain PO ¥120,000 legitimately changed rounds under the configured 200k — an intended config effect, not drift.
- `pnpm run lint` (full-repo, 89-rule set) still reports 27 pre-existing errors (write.ts's B2/B3 `no-unnecessary-condition` cluster + ui-mobile v6); the B5 change surface contributes zero (staged oxlint on the four touched files: 0 errors) — the full-repo cleanup belongs to a later hygiene batch, not B5.
- b9 `--stage s7` does not replay on an already-shipped SO (shipSo's reservation was consumed by the first run) — a W-round idempotence shape, untouched by B5; the s7-relevant B5 face (pur_payments default threshold + one-round payment record) is covered by psql evidence instead.
- The negative-drive scripts (research/2026-09-27-w2-evolution/w2-b5-negatives.mts, w2-b5-rfq-cli.mts) are idempotent evidence drivers: each restore-drifted config and destroy their probe documents before exiting.

## Evidence

- `research/2026-09-27-w2-evolution/w2-b5-threshold-cases.txt` — the hand-computed psql pair: pur_orders condition `amount <= 200000`, PO-B5-A ¥150k two-step trace (submit → quality_lead approve → approved, no gm node), PO-B5-B ¥250k three-step trace (→ pending_level2 → gm approve), the two-row tier expansion (PO-B5-C completed pair, PO-B5-D open pair), so_orders default literal 100000 + keyless extras, the remaining flows' keyless extras, pur_payments default + B9 payment record, and the config_note audit lines (old→new with operator and timestamp).
- `w2-b5-negatives.txt` — tolerance pair (¥0.08 off: 0.05口径 exception vs 0.10口径 matched, same document), ghost-approver fail-loud with zero residue, `"abc"` threshold fail-loud with extras restored.
- `w2-b5-rfq-cli.txt` — `--send-rfq` (approved → sent, sent_at backfill ×2) and `--award-rfq --quote 9` (¥2.5 named over the ¥2.2 low → closed + PO ¥250), plus the idempotent replay.
- `w2-b5-vitest.txt` (41/41: 34 baseline + 7 B5) / `w2-b5-selftest.txt` (engine selftest incl. the B5 leg) / `w2-b5-verify.txt` (setup-nocobase verify OK with the w2-b5 block).
- `w2-b5-approval-center.png` — the 审批中心 page (18-row todo table live).

## Alternatives considered

- **cordis.yml Config for the threshold** — refused (PLAN D7): approval-engine is a scripts-side process, not a plugin; the flow row is the per-flow seat that already exists, and env/CLI are the only process-level knobs this side of the repo.
- **Silent fallback on malformed extras values** — refused: the batch doc's acceptance names `"amount_threshold":"abc"` as fail-loud (misconfiguration fails loud); only the absent key falls back (and logs once).
- **Counter-sign (会签) semantics for arrays** — refused: enterprise-scope; the array is OR-sign-off with the full tier's todos voided by any one act, keeping the audit five elements unchanged.
- **A dedicated wfl_config_audit table** — refused for this batch: the config_note column on the owning row answers who/when/old→new without a new collection; a structured audit table can supersede it later without migration pain (the notes are append-only text).

## Consequences

本 Note 记录的决策自此成为对应面的现行契约（详见 Decision 与 Evidence）。
