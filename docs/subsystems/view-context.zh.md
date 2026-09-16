# 工作台视图上下文与视图操控

[English](view-context.md) | 中文

[dsh-view-context](../../packages/context/view-context) 与 [dsh-view-actions](../../packages/interaction/view-actions) 的 tab 感知视图面。浏览器工作台上报当前 tab 的状态；模型侧工具据此读取视图状态并直接指挥视图，而不是让用户手动操作 UI。视图态是用户的屏幕、不是会话历史——缓存不触碰会话日志；模型可见面之所以被记录，靠的是注入的快照消息本身 durable。

源码：[`packages/context/view-context/src/index.ts`](../../packages/context/view-context/src/index.ts)、[`packages/interaction/view-actions/src/index.ts`](../../packages/interaction/view-actions/src/index.ts)

## 视图上报

`ViewReport` 是浏览器对某个会话的一次上报：当前激活的会话视图、它的扁平状态投影，以及 `view_apply` 校验目标所用的动作目录。

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

## 缓存条目

`ViewStateEntry` 是缓存的上报加到达时间；`viewState.read` 把超过配置保留时限的条目视为不存在。

```ts type-equiv
/** Cached report plus its arrival time. */
interface ViewStateEntry extends ViewReport {
  /** `Date.now()` at report time. */
  reportedAt: number
}
```

## 执行请求

`ViewActionApplyRequest` 是服务转发给活跃 provider 的完整请求：目标视图、动作名、参数，以及 provider 做所有权校验与取消所需的调用上下文。

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

`ViewActionProvider` 是 UI 侧的执行槽：浏览器端执行器应用白名单动作并以可读摘要 resolve。单 provider 槽由 `registerProvider` 强制；带浏览器面的组合中 provider 由网关持有（可选缝——无浏览器面的 host 不挂 provider，`view_apply` 报 `NO_PROVIDER`）。

```ts type-equiv
/** UI-side provider for view actions; receives the full apply request. */
interface ViewActionProvider {
  apply(request: ViewActionApplyRequest): Promise<ViewActionResult>
}
```

## 执行结果

`ViewActionResult` 携带一行模型可读的摘要，描述视图当前展示的内容；调用方原样透出。

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

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [SessionId](core.zh.md)

Source: [`packages/context/view-context/src/index.ts`](../../packages/context/view-context/src/index.ts)
<!-- END GENERATED cordis-surface -->
