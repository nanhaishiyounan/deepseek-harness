# @deepseek-ai/dsh-view-context

[English](README.md) | 中文

面向 Web 部署的 tab 感知工作台视图上下文：一个按会话的内存视图状态缓存（`ctx.viewState`），加一段挂在 `agent/pre-step` 上的持久化按步快照注入（time-context 骨架）。浏览器经网关的 `session.viewStateReport` RPC 上行当前 tab 及其状态投影；本插件把缓存转成模型可见的【当前工作台视图】块，让对话始终以用户正在看的 tab 为主。

## 如何满足「模型可见⟺落 log」

视图状态是用户的屏幕而非会话历史——缓存是进程内存，绝不进会话 log，并在 `session/disposed` 时清理。模型可见的一半是注入的快照消息本身：一条 `user/message`，`source: { kind: 'plugin', plugin: 'view-context', form: 'snapshot' }`，durable 且可重放，与模型读到的一字不差。

## 配置

```yaml
- id: view-context
  name: '@deepseek-ai/dsh-view-context'
  config:
    enabled: true     # optional; false disables injection while keeping the cache service
    maxAgeMs: 0       # optional; positive values treat older cached view states as absent
```

## 注入语义

前置的 `agent/pre-step` 监听先委托下游，再读本会话的视图缓存。`chat`（以及无缓存场景）注入一行的最简块；业务视图注入 `tab=<标签>(<view>)` 加上每个快照字段的 `key=value`，随后附视图工具提示。文本未变化（视图与快照相同）时沿用上一条持久化注入而非追加重复块；组合了 system-prompt 的部署还会得到一段静态 `systemPrompt.context`，说明视图工具族的词汇表。

## 已知限制与后续工作

- 只注入当前激活 tab；多 tab 并行引用（主 tab 加背景 tab 描述）留后。
- 把对象钉进对话的显式 @ 引用 chip 留后。
- 视图状态上报依赖浏览器在线；headless 会话只能看到最简块。
