# Agent Note: W23-R4 — denylist case normalization + edge assertions + files render wiring + evidence corrections

Status: implemented

English | [中文](2026-10-09-w23-r4-denylist-case-normalization.zh.md)

## Problem

The W23-R3 verification failed its production-simulation dimension on one root cause family: the R3 denylist matched lowercase only, so a leak arriving as `WFL_Approval_Todos` / `Ask_Field` / `NB_LIST` passed through both sanitize passes untouched, and no boundary assertion existed to catch the gap. Three further findings rode along: `FilesView` rendered `artifact.title` / `artifact.subtitle` raw (the R3 wiring covered only the chat report branch), the AlertsView group-key comment claimed a head-independent derivation the grouping rule does not guarantee, and two verification reports carried wrong hash annotations and counts.

## Decision

- **Case normalization**: `client/sanitize.ts` now builds every matcher with the `i` flag, so any casing variant of a denylist family strips. The closed list is exported as `PROTOCOL_BLACKLIST` (the always-stripped prefix families `wfl_*` / `ask_*`, plus the `suggestions` field name) for shared consumption and extension; the subtitle-only tool families stay a private `SUBTITLE_BLACKLIST` array. `suggestions` doubles as a plain English word, so it strips only inside a protocol context — a CJK narrative, or a string that also carries any stripped token family (`CONTEXT_PROBE`, deliberately no `g` flag so `lastIndex` cannot leak across calls); English body prose keeps the word.
- **Edge assertions**: a new `sanitize-edge.client.spec.ts` locks the four boundary behaviors — a >10KB clean body passes verbatim, every casing variant strips, a longer token (`wfl_approval_todos_inner`) strips whole with no partial residue, and code-fence markers survive both passes so a successful protocol payload stays renderable — plus the exported denylist contract. The existing render-site spec gained the DOM-level casing assertion (`/wfl_approval_todos/i` over the whole body text).
- **FilesView wiring**: `renderRow` sanitizes through the same render-face pass the chat report branch uses — `sanitizeBody` for the row title (and its `打开 …` aria-label), `sanitizeSubtitle` for the row subtitle with the blank-as-omitted equivalence (a fully-stripped subtitle renders as absent).
- **AlertsView key**: the group key derives from `band::ruleType::head.entityCode` only — the title fallback is gone, matching the derivation the R3 report stated. The comment now states the real contract: the entity code is a stable identity only for groups folded on their shared code; a title-folded group keys on whichever member leads the read, so a re-read that reorders members re-keys it and the opened state resets.
- **Evidence corrections**: `r3-verify-report.md` and `b2-verify-report.md` now carry the measured sha256 values — the annotated "sha256 8c44276f…" was a SHA-1 digest, and "3340b0db…" matches sha1/sha256/md5/crc32 of no evidence file (an unreproducible record value); the alerts suite count is corrected from 11 to the measured 7, and the R3 line's head-independence claim is restated per the contract above.

## Consequences

- ui-mobile suite green with the new assertions (sanitize-edge 6, sanitize 11 incl. the DOM casing case, files-view 9 incl. the wiring probe, alerts 7); typecheck and the toolcard e2e 6/6 unchanged.
- A title-folded alerts group whose head changes across a re-read loses its opened state — accepted and now documented at the derivation site; entity-code-folded groups (the far-band shape) keep the guarantee.
- An all-English subtitle consisting solely of `suggestions` now survives the body pass unless a protocol token co-occurs — the denylist is a protocol-context strip, not a general word ban.
- Render-face sanitization now lives at three sites (FlowItem report branch, FilesView rows, the shared module); folding them into one centralized text pipeline is deferred future work, recorded here rather than in code comments.

## Alternatives considered

- **Lowercasing the input before matching** — the denylist would then rewrite casing of legitimate words that merely contain a family prefix boundary case; matching case-insensitively at word boundaries leaves the surviving text byte-identical.
- **Unconditional `suggestions` stripping with the `i` flag** — the simplest normalization, but it strips "Here are our Suggestions for next quarter"; the protocol-context probe keeps English prose intact at the cost of one boolean check.
- **A centralized `__text-pipeline` at the projection layer** — the correct long-term home once more render sites need the pass; two consumers today do not justify the indirection yet.
- **Keeping the title fallback in the group key** — it restores stability only for title-folded groups with empty entity codes (a shape the live data does not carry); the honest derivation without it matches what the R3 report already claimed.
