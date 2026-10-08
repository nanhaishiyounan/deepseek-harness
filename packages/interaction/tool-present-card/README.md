# @deepseek-ai/dsh-tool-present-card

English | [中文](README.zh.md)

Model-facing `present_card` tool: the deterministic structured-card channel for the mobile form assistant. Structured cards (choice asks, field asks, form drafts, submit receipts, reports, approval cards, plan cards) ride validated tool calls instead of probabilistic ```dsh text fences; the four user-action payloads (`form_confirm` / `reject_flow` / `approval_confirm` / `plan_confirm`) stay client-authored fences and are deliberately absent from this tool.

## Tool

`present_card` accepts one required argument:

- `payload` — a non-intercepting `json`-typed value (W21-R2): any lossless JSON value passes the framework matcher, and the closed nine-branch contract discriminated by `type` (`ask_choice` / `ask_field` / `form_draft` / `submit_receipt` / `report` / `approval_pending` / `approval_result` / `plan_suggest` / `plan_result`, every branch pinning `v: 3`) is enforced by the execute-side resolve walk with Chinese field-pathed errors. The parameter description carries the per-branch field/enum table as the model-facing guidance. The branches mirror the assistant-side `DshPayload` interfaces of `@deepseek-ai/dsh-client-ui-mobile`'s protocol module.

### Leniency and pathed errors (W21-R1)

The P3 determinism matrix caught one failure family: the model emits bare numbers at id/value/count leaves (`"value": 13`, a bare-number report cell) or passes the payload as a JSON string, and the `matched 0` oneOf error carries no field path, so retries loop without self-correcting. The mechanism-level repair, mirrored on both validation sides:

- The id/value/count leaf positions (ids, option/suggestion values, field values, summary values, metric values, table cells, `qty`…) accept `string | number`; `execute` normalizes finite numbers to strings as an explicit `resolvePresentCardPayload` step before structural validation. A coerced payload behaves exactly like the equivalent all-strings payload — receipt, landing, and rendering are unchanged. Booleans, arrays, objects, and stray nulls at those leaves stay rejections.
- A required scalar leaf rejects the empty string with a pathed error (`payload.options[0].label 不能为空字符串`, W21-R3) — both mirrors judge identically, closing the divergence where the server accepted `""` and concluded while the client degraded the card. Two legal empty strings survive, matching the client verbatim: a form_draft field `value` keeps `""` as the "generated after landing" spelling, and a blank report table cell stays a blank cell.
- A string `payload` is JSON-parsed first (parse failures and non-object parses are rejections).
- Every execute-side structural violation names the offending field path and expected type in Chinese (`payload.options[2].value 应为字符串或数字（收到布尔值 true）`), so one retry corrects it.

### Non-intercepting payload declaration (W21-R2)

The verifier's num-leg rerun falsified the W21-R1 residual claim ("zero observations"): an object payload with an out-of-range enum leaf (`report.metrics[].kind: "id"`, session seq289) was refused by the framework oneOf walk with the pathless `matched 0` before `execute` could path it, and the model blind-corrected for a round. The repair: `payload` is declared `type: 'json'`, so the framework matcher never rejects a payload shape — every violation, including enum and discriminator out-of-range values, reaches `resolvePresentCardPayload` and comes back with its field path and the legal candidates. An exact-one `oneOf` cannot carry a fallback branch beside the nine strict branches (a valid object would match two branches), so the nine-branch skeleton stays the walk's authority while its model-facing guidance moved into the parameter description. In the same batch, `widget` became required on both mirrors, and an explicit null at an optional leaf without an enum/const constraint is omitted ("left this one out"), mirroring the client parser; optional enum leaves keep rejecting null.

### Actions leniency (W21-R8)

A live supply-chain session folded four consecutive `present_card` calls on the same actions nesting mistake and finally dropped the buttons to get a card through. The raw captures showed two spellings: the wrapper key (`{"view":{"label":…,"route":…}}` — the old parameter description's compact union notation reads exactly that way) and the flat object with the `kind` field missing; the four identical violations named only the four kind values, so the model never learned the flat discriminant field. The repair, mirrored on the client parser: the resolve step flattens the wrapper key, fills a missing `kind` when exactly one branch's other required fields are all present (an explicit illegal `kind` is never overridden; an ambiguous signature like `{label,route,title}` stays a violation), and lifts a lone actions object to the one-element array; a discriminant failure now appends the four concrete JSON skeletons (`{"kind":"view","label":"…","route":"…"}/…`) so one retry hits, and the parameter description spells the flat shape with a copyable example. The persona few-shot gained the `view` form beside `create-task` and the "kind is a sibling field, not a wrapper key" rule.

### Deterministic widget and form contract (W22-R1)

The W22 verification's ten-run repeater caught the model rolling dice on mechanically decidable facts: `widget` hit only 50% (`quantity` declared `text`), the pur_orders required-field set disappeared in 3/10 runs (品名/数量/单价 absent), and one run drifted to an unregistered collection (`hub_inv_products`). Three mechanisms retire the dice. First, the widget resolver in `src/widget.ts`: after structural validation, `form_draft` fields and the `ask_field` field ride the field-name/label classification (`quantity`/`qty`/`unit_price`/`amount` families → `number`, `need_date`/`received_at` families → `date`, a non-empty `options` array → `select`; note-family names and 备注/说明 label words pin the declared widget before money/date fragments can fire — W22-R2). The session log and the model's context keep the declared widget (model-visible ⟺ logged); the rendered control follows the classification because the mobile client mirrors the same rule in its render fold (`dsh-client-ui-mobile` `src/client/widget.ts` — the purity gate forbids the value import, so the tables ship as a mirror pair with the shared fixtures pinning both). Second, the optional `formCollections` config (`src/form-contract.ts`): its keys are the collection whitelist (an unregistered `form.collection` rejects the whole draft card with the legal candidates) and per-collection `requiredFields` state the field floor — the field must APPEAR on the card so the user can correct it, while the value may stay prefilled or null; each group lists synonym column names (`quantity`/`qty`) with the business label the error quotes. An unknown top-level config key fails loud at startup (a mistyped `formCollections` would otherwise read as "no contract" and silently skip enforcement). Both error paths report Chinese field-pathed messages the model corrects in one retry; an empty or absent config enforces nothing, so generic deployments keep the contract-free behavior.

Structural constraints live in the schema; count bounds the schema DSL cannot express (no `minItems`/`maxItems`) are enforced in `execute`: ask_choice options ≥1, form_draft fields ≥1 / revision ≥1 / `value: null` only on `required`-tier fields, submit_receipt and approval_pending summary ≥1, report metrics 1–6 / rows ≤8 / table ≤5 columns ≤10 rows with row width = column count / actions ≤4. Violations throw `ToolArgsError` with messages naming the offending parameter path, so the model corrects and retries within the same turn.

A successful call invokes `exec.concludeTurn()` and returns `{ presented: true }` with a fixed receipt text: the card is the turn's final artifact, the user's pick or confirmation arrives as the next ordinary user message, and the model is told never to answer on the user's behalf. Fire-and-forget: the tool never waits for user input — the legacy fence UX is preserved byte-for-byte.

## Role

This is a Consumer-style plugin registering one tool on `ctx.tools`. It renders no UI and reads no service: presentation is the mobile client's fold of the resulting `tool/call` event (P2), and the desktop web shows the generic tool row. Render intent is `generic` — the output is a fixed text block, a pure function of the tool result.

## Protocol mirror duty

`tests/fixtures/` is the golden corpus both sides share: the tool schema and the client-side args-level validator (P2) must accept and reject the same envelopes. Any protocol change lands on both packages plus these fixtures in one PR.

## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`present_card` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-present-card): a single `payload` argument (json-typed; the per-branch field/enum table rides the parameter description). A validation failure returns a Chinese field-pathed error result the model is expected to correct and retry (the persona contract caps this at two retries, then an honest business-language close-out).

#### Token effect

Fixed schema cost on every request where the tool is visible — the nine-branch union is the price of one deterministic card channel instead of a fenced prose format.

#### KV Cache effect

The schema is static per composition, so the tool-definition prefix is identical across requests and stays cache-friendly; the payload arguments themselves vary per call.

## Known Limitations and Deferred Work

- **Framework-level payload rejection: none (W21-R2 closed the W21-R1 residual)** — the declared `payload` accepts any lossless JSON value, so the pathless `matched 0` diagnostic is structurally unreachable; every payload violation is execute-side and field-pathed. Mirror asymmetries kept deliberately: the client fence parser still defaults omitted presentation hints (`mode`/`variant`/`allowFreeText`), folds the captured `create-task` `text` alias, and normalizes Chinese approval-state words (`草稿`/`待审批`/…) to the English enums when replaying legacy fences — the tool path never exercises them, because the server rejects those shapes before the client renders. W21-R4 closed one asymmetry the other way: an omitted `field.suggestions` now degrades on the client exactly as the server schema rejects it. Optional text leaves stay asymmetric yet render-equivalent: the server keeps the empty string (the W21-R3 legality), the client fence parser treats it as omitted.
- **The two-retry cap is contractual, not mechanical** — the agent loop imposes no per-tool retry ceiling; the persona contract carries the cap and the honest close-out rule.
- **The desktop web renders the generic tool row** — no dedicated `presentCall` presentation yet (Fast-Follow).
- **The four user-action payloads are not tool-ized** — they remain client-authored fences by design; symmetric tool-ization is a recorded future option, not a gap.
