# ui-lakehouse

[English](README.md) | 中文

湖仓工作台界面：侧边栏导航行（order 12.5，位于连接器与图谱之间）加隐藏的 `lakehouse` 会话视图 —— 按 schema 分组、带实时行数的表目录，选中表的 schema 卡（列 + 样本行），以及只读 SQL 编辑器与结果表格。数据走网关的 `lakehouse.tables/query/schema` 域（湖仓引擎 DuckDB + DuckLake）；未组合引擎的部署就地显示结构化拒绝信息，恶意语句就地显示守卫的拒绝文本。

## Model Experience

工作台与湖仓的模型可见词汇一致：表以 `lake.<schema>.<table>` 引用形式列出，SQL 编辑器接受的正是 `lakehouse_query` 接受的（单条只读语句），被拒的写语句渲染模型看到的同一段拒绝原因。
