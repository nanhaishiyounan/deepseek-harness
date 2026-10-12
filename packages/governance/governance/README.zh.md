# @deepseek-ai/dsh-governance

[English](README.md) | 中文

治理能力缝的 Service Definition：共享类型加 `ctx.governance` 声明，覆盖跨源资产目录（五源各自经活面盘点）、血缘边、湖仓评估的质量规则、告警事件。缝包只拥有契约 —— `apply` 有意为空，单独挂载时 `ctx.governance` 保持未设置。引擎 provider（`@deepseek-ai/dsh-governance-engine`）注册服务；消费方是网关的 governance 域与治理面板（`@deepseek-ai/dsh-client-ui-governance`）。

## 模型体验

间接：经网关的 governance 读面；缝自身不注册任何 prompt、schema 或工具。

#### KV Cache 影响

无：缝不贡献任何请求内容，既不追加也不失效任何可复用请求前缀；治理行仅在会话经网关域显式请求时到达模型。

## 已知限制与遗留工作

- 缝的 `apply` 设计为 no-op：只挂载缝而不挂引擎 provider 的组合在首次 `ctx.governance` 调用处失败，而非静默降级。
- `inventory()` 是活面快照（「源当下暴露的全部资产」）；带历史的持久化资产快照随跨源审计日志到来。
