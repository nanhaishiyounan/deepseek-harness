# @deepseek-ai/dsh-tool-view-actions

[English](README.md) | 中文

view-actions 缝之上的模型面视图工具：`switch_view`（tab 导航）、`view_apply`（在视图内执行一个白名单动作并等待其摘要）、`view_state_get`（读取缓存的工作台状态）。注册需要 `ctx.viewActions`（能力缝）与 `ctx.viewState`（缓存）——同时挂载 `dsh-view-actions` 与 `dsh-view-context`。

视图操控是可逆的 UI 状态，因此这些工具不带审批；破坏性数据写仍走 `nb_*` 的会话内确认契约。前端不可达（超时）或动作未注册时，`view_apply` 以可读消息立即失败。

## 已知限制与后续工作

- 工具描述里的已知动作清单是散文而非逐视图 JSON Schema；收紧为生成目录留后。
- `view_state_get` 只读当前激活视图的缓存；后台 tab 读取的 `view` 参数随多 tab 上下文一并留后。
- `view_apply` 失败时原样透出执行器消息；工具结果上的结构化错误分类留后。
