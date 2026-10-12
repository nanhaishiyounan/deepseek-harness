# ui-lakehouse

[English](README.md) | 中文

湖仓工作台界面：侧边栏导航行（order 12.5，位于连接器与图谱之间）加隐藏的 `lakehouse` 会话视图 —— 按 schema 分组、带实时行数的表目录，选中表的 schema 卡（列 + 样本行），以及只读 SQL 编辑器与结果表格。数据走网关的 `lakehouse.tables/query/schema` 域（湖仓引擎 DuckDB + DuckLake）；未组合引擎的部署就地显示结构化拒绝信息，恶意语句就地显示守卫的拒绝文本。

## Model Experience

None, as this client page renders model-independent reads only; every prompt, schema, and tool surface lives in server packages.

#### KV Cache effect

独立于模型请求流：客户端页读取从不进入请求，本包既不追加也不失效任何可复用请求前缀。

## 已知限制与遗留工作

- 遗留：更深的血缘与质量界面随 B6 目录治理批而来；面板当前每次请求读取湖快照。
