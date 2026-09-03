# Agent Note: kb-agent P0 verification fixes — entry overlay, doc-sync revert, hermetic tests

Status: implemented

English | [中文](2026-08-29-kb-agent-p0-fixes.zh.md)

## Problem

The unified verification of the kb-agent stack scored 70/100 with every failure a last-mile gap: the README's four `pnpm dsh --profile headless` entry commands could not load the kb composition (the headless profile has no kb tools, `dsh` is not a workspace script inside `examples/`, and `--patch` over a root-format `cordis.yml` is a no-op), `doc-sync` was red because `apps/cli/composition.md` claimed an `llm-minimax` row the base bundle never had, the four new packages sat below the per-file 100% coverage gate on real error paths, the import script trusted its `--kind` argument, the keyless spec leaked a host `MINIMAX_API_KEY`, and the README's degraded-mode demo described an impossible step (unsetting the shared key kills chat too).

## Decision

### README entry: `--patch` insert overlay over the shipped headless profile

`examples/kb-agent/cordis.patch.yml` is a loader patch list — config overrides plus one insert group — applied with `dsh --profile headless --patch`. Two facts shape it:

- **`llm-pi-ai` must be disabled in the overlay.** The base bundle mounts `llm-pi-ai`, whose installed pi-ai catalog declares `minimax` and `minimax-cn` as configurable providers from the moment it mounts; `llm-minimax` registers `minimax` itself, and `registerConfigurableProviders` throws `DUPLICATE_DIRECTORY` on the collision. This is also why `llm-minimax` can never join the base bundle: the dedicated adapter replaces that whole half instead of coexisting with it.
- **`DSH_HOME` is pinned inside the example** (`DSH_HOME=examples/kb-agent/.dsh`). The auto-initialized profile lives under `$DSH_HOME/profiles/headless`, and its plugin resolution walks parent directories into `examples/node_modules`, where the workspace links for the kb packages live; the default `~/.dsh` home would strand the overlay's bare specifiers away from the examples workspace. The pin also keeps sessions, credentials state, and the SQLite store inside the gitignored example tree.

`agent-default-model` and `system-prompt` config rows are overridden to route the headless runner's agent to MiniMax-M3 with the kb persona. A second overlay, `cordis.text-only.patch.yml`, disables `kb-embed-minimax` for the degraded demo: retrieval observably degrades to `mode: 'text'` while chat answers on the same key — the real "embed pulled, chat alive" behavior, replacing the impossible unset-the-key wording.

### composition.md regenerated, claim reverted

`apps/cli/composition.md` is generated from `packages/bundle/base/cordis.patch.yml` by `gen-doc-graphs`; regenerating after fixing the patch file's trailing double newline drops the `llm-minimax` row the hand edit had added. The generator's `SERVICE_ROLES` also gained the missing implementations (`kb-embed-minimax`, `kb-embed-dashscope`, `llm-minimax`) and the `tool-kb` consumer, with `capability-seams.md`, its Chinese twin, and the pairing record brought along.

### Credential resolution stays split, by contract

Unifying kb-embed credential resolution with llm-minimax's (managed credential store first) is blocked by two published contracts, not by dependency risk: `EmbedProvider.available()` is the seam's synchronous degraded-mode probe, while `CredentialProvider.resolve` is async and explicitly forbids caching across operations. Making `available()` async is a capability-seam change; caching violates the credentials contract. The divergence is therefore documented as a Known Limitation in both embed packages and the example README: a key stored only through the managed store serves chat but not embeddings, and the correct configuration is an exported variable or a `.env` file.

### Hermetic keyless spec through the existing fixture knob

The spec's `beforeEach` pins `KB_TEST_EMBED_ENV` to a name nothing supplies, so the fixture's embed provider resolves an absent reference regardless of the host environment — the mechanism the previous note described is now the load-bearing one, and a host `MINIMAX_API_KEY` can neither flip the snapshot to hybrid nor spend money.

### Import script: whitelisted directory kinds

`--kind` accepts exactly `meetings|profiles|regulations` (the corpus directory names) and maps to the singular `doc_kind`; anything else exits non-zero, which closes the path-traversal hole for agent-driven invocations. All interpolations use braced `"${kind}"` forms so macOS bash 3.2 parses the CJK-adjacent hint line.

### Coverage: real error paths, one justified ignore

The missing paths were symmetric across the two embed providers (abort during backoff, mid-flight caller abort, non-JSON 200 bodies, message-less error envelopes, decode shape violations, apply-level credential wiring) plus llm-minimax's credentials-service arm, retry-policy registration swap, TRANSPORT wrap, and splitter tails. The dashscope "missing index" decode branch is unreachable — `data.length === expectedCount` with unique in-range integer indices is a bijection — and carries a `v8 ignore` with that argument. The TRANSPORT wrap needed a mock-server behavior that resets the socket after headers arrive; destroying before the headers flush only exercises the request-side wrap.

## Alternatives considered

- **Installing the kb packages into a profile via `dsh plugin add`** — pnpm would copy workspace packages and fail to resolve their `workspace:^` dependencies from `$DSH_HOME`; the `DSH_HOME` pin achieves resolution with zero installation steps.
- **Adding the kb packages to `apps/cli` dependencies so the default home resolves them** — widens the product CLI's dependency closure for an example's benefit and changes the published package.
- **Unifying credential resolution with an event-invalidated cache** — violates the letter of the credentials seam's no-cache contract; reviewers would rightly reject it.
- **Migrating the example's keyless snapshot to the repository `*.snapshot.ts` convention now** — the assembled-app replay harness drives a different process model than the in-process Loader composition; recorded as P1 debt instead of risking the closed loop.

## Consequences

- The README entry command is one line, needs no profile installation, and keeps all example state inside the gitignored `examples/kb-agent/.dsh` and `workspace/` trees.
- `llm-minimax` remains example-composed only; any future base-bundle membership must first solve the pi-ai catalog collision.
- The embed/chat credential divergence is a documented configuration requirement, not a silent failure.
- Retry backoff in both embed providers (`packages/kb/kb-embed-minimax/src/index.ts` and the symmetric `packages/kb/kb-embed-dashscope/src/index.ts`) now carries jitter (uniform 50–100% of the exponential slot) and a debug log per retry hit, wired to the plugin logger.

## Verification

- `pnpm vitest run packages/kb packages/llm/llm-minimax --coverage.enabled …`: 321 tests green, every `src` file at 100% statements and branches; the full `pnpm run test:coverage` run reports no coverage threshold error.
- `pnpm run doc-sync`: 28/28 gates green, including regenerated graph docs and 1013 consistent bilingual pairs.
- `/bin/bash` (3.2) runs of the import script: traversal and singular kinds rejected with exit 1, `--kind meetings` lands in `workspace/data/meetings/` with exit 0.
- `MINIMAX_API_KEY=<fake> pnpm vitest run examples/kb-agent/tests/kb-closed-loop.spec.ts` passes with zero network calls.
- Keyless boot of the README command fails exactly at `MISSING_CREDENTIAL` after the full tree loads, proving plugin resolution; the with-key closed-loop run is recorded in the example README's verification transcript.
