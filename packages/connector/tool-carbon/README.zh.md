# dsh-tool-carbon

[English](README.md) | 中文

模型可见的 carbon 工具套（读 `cb_collections`/`cb_list`/`cb_get`，带风险标签的确认写 `cb_create`/`cb_update`——标签取自 carbon 名册），构建在 `ctx.carbon` 连接器能力之上。

## 模型体验

间接：经 cb_* 工具注册；carbon 行仅作为带会话日志信封的工具结果到达模型，本包拥有 schema、prompt 指引与风险标签。

#### KV Cache 影响

独立于模型请求流：cb_* 结果是后续请求消费的工具结果，本包既不追加也不失效任何可复用请求前缀。


## 已知限制与遗留工作

- 遗留：超出 B3 集合的更多 cb_* 工具随写层扩展一起在后续批次到来。
