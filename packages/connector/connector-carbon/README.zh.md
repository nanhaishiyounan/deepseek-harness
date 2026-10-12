# dsh-connector-carbon

[English](README.md) | 中文

Carbon 连接器能力（`ctx.carbon`）：carbon 社区 Data API（session cookie + PostgREST/kong）之上的 HTTP provider，凭据从 `CARBON_URL`/`CARBON_ANON_KEY`/`CARBON_EMAIL`/`CARBON_PASSWORD` 解析。

## 模型体验

间接：经 carbon 工具套自身的注册；本 provider 只承载 HTTP 能力，所有 prompt、schema、工具面都在 dsh-tool-carbon。

#### KV Cache 影响

独立于模型请求流：连接器结果产生的是后续请求消费的工具结果，本包既不追加也不失效任何可复用请求前缀。

## 已知限制与遗留工作

- 遗留：超出 B3 已启用表的写层扩展随后续批次到来；社区 Data API 面保持读多写少。
