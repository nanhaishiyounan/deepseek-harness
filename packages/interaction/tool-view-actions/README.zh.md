# @deepseek-ai/dsh-tool-view-actions

[English](README.md) | 中文

view-actions 缝之上的模型面视图工具：`switch_view`（tab 导航）、`view_apply`（在视图内执行一个白名单动作并等待其摘要）、`view_state_get`（读取缓存的工作台状态）。注册需要 `ctx.viewActions`（能力缝）与 `ctx.viewState`（缓存）——同时挂载 `dsh-view-actions` 与 `dsh-view-context`。

视图操控是可逆的 UI 状态，因此这些工具不带审批；破坏性数据写仍走 `nb_*` 的会话内确认契约。前端不可达（超时）或动作未注册时，`view_apply` 以可读消息立即失败。

## Model Experience

### Tool schemas

#### What the model sees

三份工具 schema——`switch_view`、`view_apply`、`view_state_get`——描述中携带已知视图 id 与各视图的白名单动作清单（[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-view-actions)）；每次调用返回一行 `summary`，说明视图当前展示什么。

#### Token effect

插件启用期间三份 schema 随每个请求的工具清单走（约 300 token）；调用结果是单行摘要。

#### KV Cache effect

无前缀失效：工具 schema 在会话内稳定，结果以普通工具结果追加。

## 已知限制与后续工作

- 工具描述里的已知动作清单是散文而非逐视图 JSON Schema；收紧为生成目录留后。
- `view_state_get` 只读当前激活视图的缓存；后台 tab 读取的 `view` 参数随多 tab 上下文一并留后。
- `view_apply` 失败时原样透出执行器消息；工具结果上的结构化错误分类留后。
