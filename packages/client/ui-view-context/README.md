# @deepseek-ai/dsh-client-ui-view-context

English | [中文](README.zh.md)

Browser half of the tab-aware workbench context: publishes `ctx.viewContext`, the service business view packages register their state projections on. The conversation session body reports its resolved active view through the service, and a 500 ms debounced loop uplinks `{ sessionId, view, label, snapshot, actions }` over `session.viewStateReport`, keeping the host-side view-context cache in sync with the tab the user is looking at.

## Registration surface

```ts ignore-check
ctx.effect(() => ctx.viewContext.provide({
  view: 'kg',
  label: () => bound('view.kg'),
  changes: store.store,               // optional: any change re-triggers the report
  snapshot: () => ({ '选中实体': state.selected ?? '无' }),
}), 'ui-kg: view-context provider')
```

The `chat` view never registers: its report carries the minimal empty snapshot the host renders as the one-line conversation-view block. Transport failures are swallowed by name — the retry is the next notify (tab switch or store change).

## Model Experience

None, as a browser-side registration layer: the providers project view state over the uplink and register nothing model-facing.

#### KV Cache effect

None: the layer runs in the browser and never contributes to a model request.

## Known Limitations and Deferred Work

- Component-local view state (a details drawer's open target, a scenario category filter) is not projected until it lands in a package store; bridging it via a push-style notify carrying a local snapshot is deferred.
- Only the active view of the current session is reported; background-tab and multi-session screens are deferred.
- The report loop does not retry on a refused RPC (deployment without the host view-context plugin); the uplink stays silent until composition changes.
