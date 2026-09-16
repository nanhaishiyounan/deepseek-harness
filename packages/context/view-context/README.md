# @deepseek-ai/dsh-view-context

English | [中文](README.zh.md)

Tab-aware workbench view context for web deployments: a per-session in-memory view-state cache (`ctx.viewState`) plus a durable per-step snapshot injection over `agent/pre-step` (the time-context skeleton). The browser uplinks the active tab and its state projection through the gateway's `session.viewStateReport` RPC; this plugin turns that cache into the model-visible 【当前工作台视图】 block so the conversation always targets the tab the user is looking at.

## How it satisfies model-visible⟺logged

View state is the user's screen, not conversation history — the cache is process memory that never touches the session log and is cleared on `session/disposed`. The model-visible half is the injected snapshot message itself: a `user/message` with `source: { kind: 'plugin', plugin: 'view-context', form: 'snapshot' }`, durable and replayable exactly as the model read it.

## Config

```yaml
- id: view-context
  name: '@deepseek-ai/dsh-view-context'
  config:
    enabled: true     # optional; false disables injection while keeping the cache service
    maxAgeMs: 0       # optional; positive values treat older cached view states as absent
```

## Injection semantics

The prepended `agent/pre-step` listener delegates first, then reads the session's cached view state. `chat` (and the absent-cache case) inject the one-line minimal block; a business view injects `tab=<label>(<view>)` plus each snapshot field as `key=value`, followed by the view-tools hint. Unchanged text (same view and snapshot) reuses the previous durable injection instead of appending a duplicate block, and a static `systemPrompt.context` entry documents the view-tool vocabulary for deployments that compose system-prompt.

## Known Limitations and Deferred Work

- Only the active tab is injected; parallel multi-tab references (a main tab plus background descriptions) are deferred.
- Explicit @-reference chips that pin an object into the conversation are deferred.
- View-state reporting depends on the browser being connected; headless sessions see only the minimal block.
