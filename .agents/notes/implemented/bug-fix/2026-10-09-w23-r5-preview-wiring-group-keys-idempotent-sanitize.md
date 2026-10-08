# Agent Note: W23-R5 — final clearance (preview sanitize wiring + empty-code group keys + measured hashes)

Status: implemented

English | [中文](2026-10-09-w23-r5-preview-wiring-group-keys-idempotent-sanitize.zh.md)

## Problem

The W23-R4 verification failed with three blocking findings, all one family — wiring that stopped one layer short or missed an edge:

- The two read-only report previews (`FilesView`'s 查看报告, `WorkDetailView`'s 查看完整报告) handed the stored artifact to `ReportCard` raw: the files rows and the chat branch sanitized, so opening a preview re-leaked the artifact's title/subtitle protocol tokens — and the files-view spec's whole-DOM assertion never opened the preview (`previewId` stayed unset), so the blind spot was structurally unobservable.
- `AlertsView`'s group key used the head row's entity code as the third segment; a title-folded group whose head carries an empty code produced `band::ruleType::`, and every such group in a band shared one React key (duplicate keys, cross-talked expansion). R4 had removed R3's title fallback as "a shape the live data does not carry"; the verification constructed exactly that shape.
- The R4-written evidence hashes were unmeasured: `3340b0db…` is the retake frame's SHA-1 (R4 had written "matches no evidence file's sha1/sha256/md5/crc32"), and the "measured sha256 80299dc5…" matched no algorithm over any evidence file; the true sha256 is `f5584a1b52be…`.

## Decision

- **Preview wiring (exhaustive over the `ReportCard` sites)**: grep over `<ReportCard` found three render sites — FilesView (raw), WorkDetailView (raw), FlowItem's report branch (subtitle sanitized, title raw). All three now hand the card `sanitizeReportPayload(payload)`, a new export in `client/sanitize.ts` that copies the payload with `sanitizeBody(title)` and `sanitizeSubtitle(subtitle)`; the stored artifact keeps its verbatim wire bytes (the copy path and the durable log never see sanitized text). The files-view spec gained the open-the-preview case asserting no casing variant in the whole DOM; the work-detail spec gained the same for 查看完整报告.
- **Group key fallback**: a head with a non-empty code still contributes that code (the stable identity of a group folded on its shared code); a head with an empty code contributes `t::{title}::{rowId}` — the title keeps different-title groups apart, the row id keeps two same-title groups an intervening row split apart keyed apart, and the head-row identity preserves the documented semantics (a re-read that re-orders the members re-keys the group and the opened state resets). Boundary coverage in the alerts suite: empty code (the collision case), single member (plain row, no group card), all-empty codes, duplicate identity (same title split by a cert_due row), and the reorder-reset lock driven through the 30 s poll.
- **Hash corrections (measured, then transcribed)**: `shasum` / `shasum -a 256` over the three frames — b2-01/b2-08 share SHA-1 `8c44276fa4e6…` and sha256 `ea42ec630f21…` (same frame); the retake carries SHA-1 `3340b0dbc090…` and sha256 `f5584a1b52be…`. `b2-verify-report.md`, `r3-verify-report.md`, and the R4 note (en + zh) carry the corrected digests.
- **sanitizeBody idempotency**: the `suggestions` context verdict now reads the business-mapping output, not the raw string — `suggestions from pur_orders` maps to CJK text, so the raw-string verdict kept `suggestions` on pass one and stripped it on pass two; the mapped-text verdict agrees with itself on every pass. Idempotency assertions (`sanitize(sanitize(x)) === sanitize(x)` over both passes) joined the edge spec.
- **Denylist derivation**: `ALWAYS_TOKENS` and `CONTEXT_PROBE` derive from the exported `PROTOCOL_BLACKLIST` (minus the contextual `suggestions` member), so the JSDoc's append-a-family promise holds — a previous append reaching only the private arrays silently stripped nothing.
- **order action tokens**: `order_create` / `order_status` joined the denylist as exact tokens — the closed protocol action names the live body narratives leaked.
- **R3 body-leak claim**: `r3-verify-report.md` states the measured shape — 4 existing lowercase body leaks (B2-era durable-log text, outside the render-fix surface) and 1 new leak in the fresh replay turns (`r3-f2-replay-probe.json` `newBodyLeakTail: 1`), replacing the self-contradicted "zero new leaks" wording.

## Consequences

- ui-mobile 905/905 over three consecutive runs (measured per-file counts: alerts 11, files-view 10, work-detail 26, sanitize 11, sanitize-edge 9); `pnpm run typecheck` exit 0; toolcard e2e 6/6; `build:lib:client` refreshed so the served bundle carries the new sanitize pass.
- A code-folded group's expansion still survives member re-orders (the code segment is unchanged); a title-folded group's expansion resets when the head row changes — both directions now have spec locks.
- Chat report titles now pass the body sanitizer; a clean title renders byte-identical, so only token-bearing titles changed.

## Alternatives considered

- **Sanitizing inside `ReportCard`** — declined again (the R3 decision stands): the card stays a pure payload renderer; each render site hands it the sanitized view.
- **A title-only fallback segment** — two same-title groups an intervening row splits apart would collide again; the head-row id is the only per-group unique that also preserves the documented reset semantics.
- **Keying every group by its head row id alone** — loses the stable code identity the far-band code folds rely on.
- **Re-measuring the body-leak occurrences from the live gateway** — the z2 session state of that night is not reproducible from the repo; the correction cites the recorded probes instead.
