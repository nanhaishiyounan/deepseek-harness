# Workbench View Context & View Actions

English | [中文](view-context.zh.md)

The tab-aware view surfaces of [dsh-view-context](../../packages/context/view-context) and [dsh-view-actions](../../packages/interaction/view-actions). The browser workbench reports what the active tab shows; the model-facing tools may then read that state and steer the view instead of asking the user to operate the UI by hand. View state is the user's screen, never conversation history — the cache does not touch the session log; the durable snapshot injection message is what makes the model-visible surface logged.

Sources: [`packages/context/view-context/src/index.ts`](../../packages/context/view-context/src/index.ts), [`packages/interaction/view-actions/src/index.ts`](../../packages/interaction/view-actions/src/index.ts)

## View report

`ViewReport` is one browser report for a session: which conversation view is active, its flat state projection, and the action catalog `view_apply` validates against.

```ts type-equiv
/** One browser view-state report for a session. */
interface ViewReport {
  /** Active conversation view id (`chat` for the plain conversation view). */
  view: string
  /** Optional display label for the view (rendered as `label(view)`). */
  label?: string
  /** The active view's flat state projection. */
  snapshot: ViewSnapshot
  /** Registered action names per view, used to validate `view_apply` targets. */
  actions: ViewActionCatalog
}
```

## Cached entry

`ViewStateEntry` is the cached report plus its arrival time; `viewState.read` treats entries older than the configured retention bound as absent.

```ts type-equiv
/** Cached report plus its arrival time. */
interface ViewStateEntry extends ViewReport {
  /** `Date.now()` at report time. */
  reportedAt: number
}
```

## Apply request

`ViewActionApplyRequest` is the full request the service forwards to the active provider: the target view, the action name, its arguments, and the calling context the provider needs for ownership checks and cancellation.

```ts type-equiv
/** Full request as the service forwards it to the provider. */
interface ViewActionApplyRequest extends ViewActionRequest {
  /** Exact live calling agent, when the request came from an agent tool call. */
  agent?: Agent
  /** Abort signal for the owning tool/step. */
  signal?: AbortSignal
}
```

## Provider

`ViewActionProvider` is the UI-side executor slot: the browser-side executor applies whitelisted actions and resolves with a readable summary. The single-provider slot is enforced by `registerProvider`; the gateway owns the provider in compositions with a browser face (an optional seam — a browser-less host mounts none and `view_apply` reports `NO_PROVIDER`).

```ts type-equiv
/** UI-side provider for view actions; receives the full apply request. */
interface ViewActionProvider {
  apply(request: ViewActionApplyRequest): Promise<ViewActionResult>
}
```

## Apply result

`ViewActionResult` carries one model-readable summary line of what the view now shows; callers surface it verbatim.

```ts type-equiv
/** The executor's result: a model-readable summary of the view's new state. */
interface ViewActionResult {
  /** One-line human-readable account of what the view now shows. */
  summary: string
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxviewactions--viewactionservice"></a>

### `ctx.viewActions` — `ViewActionService`

`ctx.viewActions`: one active UI provider plus an `apply()` API.

```ts cordis-catalog
/**
 * Register the UI provider. Only one provider may be active in a context.
 *
 * @param provider UI-side implementation executing whitelisted actions.
 * @returns Disposer that unregisters this provider.
 */
registerProvider(provider: ViewActionProvider): () => void

/**
 * Apply one view action through the active UI provider and await its summary.
 *
 * When a caller supplies an agent, view manipulation is valid only for the
 * exact live runtime root — the same ownership boundary ask() enforces: an
 * owned child has no browser to serve it and would block until timeout,
 * while a lineage-bearing session resumed as a new runtime root may apply
 * normally.
 *
 * @param request Target view/action/args, owner agent, and abort signal.
 * @returns The executor's result summary.
 * @throws {ViewActionError} code `CALLER_NOT_LIVE` when a supplied agent is
 *   not the registry's exact live instance, `DELEGATED_CALLER` when that
 *   live agent is owned by another agent, `BAD_REQUEST_SHAPE` on empty view
 *   or action names, `NO_PROVIDER` before any provider registers, or
 *   `APPLY_ABORTED` when the owning signal fires first.
 */
async apply(request: ViewActionApplyRequest): Promise<ViewActionResult>
```

Source: [`packages/interaction/view-actions/src/index.ts`](../../packages/interaction/view-actions/src/index.ts)

<a id="ctxviewstate--viewstateservice"></a>

### `ctx.viewState` — `ViewStateService`

`ctx.viewState`: per-session latest view-state cache (screen state, never logged). Fields are TypeScript-private (not `#private`): the runtime service shadow Cordis hands scoped consumers is a prototype heir, which a private-field brand check would reject.

```ts cordis-catalog
/**
 * Cache one session's latest view report, replacing any prior entry.
 *
 * @param sessionId - the session whose screen the report describes.
 * @param report - the browser's report (view, projection, action catalog).
 * @throws when the view id is empty or the serialized snapshot exceeds the wire bound.
 */
report(sessionId: SessionId, report: ViewReport): void

/**
 * Read a session's cached view state under the age bound.
 *
 * @param sessionId - the session to read.
 * @param maxAgeMs - when positive, entries older than this are treated as absent.
 * @returns the cached entry, or undefined when absent or expired.
 */
read(sessionId: SessionId, maxAgeMs: number = 0): ViewStateEntry | undefined

/**
 * Drop one session's cached view state.
 *
 * @param sessionId - the session being removed.
 */
clear(sessionId: SessionId): void

/** Drop every cached view state (plugin teardown). */
clearAll(): void
```

Types: [SessionId](core.md)

Source: [`packages/context/view-context/src/index.ts`](../../packages/context/view-context/src/index.ts)
<!-- END GENERATED cordis-surface -->
