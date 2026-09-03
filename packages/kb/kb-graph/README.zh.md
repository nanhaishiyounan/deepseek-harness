# @deepseek-ai/dsh-kb-graph

[English](README.md) | 中文

知识图谱能力缝（`ctx.kbGraph`）：store provider 注册表与食品产业实体-关系三元组的查询编排。与文档缝（`ctx.kb`）为姊妹缝——三元组与检索命中契约不同，各拥其缝；两者共享租户隔离模型。

本体两端皆闭：实体类型（`company`、`product`、`ingredient`、`additive`、`standard`、`process`、`risk`）与谓词（`produces`、`uses`、`contains`、`complies_with`、`follows`、`flags`、`supplies`）为闭集；消费方 `switch` 以 `assertNever` 收尾。

## Model Experience

间接地，经 kb 工具套件：本缝不注册自己的 prompt、schema 或工具；消费包拥有图谱查询与写入的每一个模型可见投影。

#### KV Cache effect

独立于模型请求流：图谱查询产生的是后续请求消费的工具结果，本包既不追加也不失效任何可复用请求前缀。

## Known Limitations and Deferred Work

- store 选择仅自动：恰好一个可用 provider 胜出；多个可用 provider 抛 `KB_GRAPH_STORE_AMBIGUOUS`（通过只组合一个来配置）。
- 两跳是最深路径查询；更长路径需未来的 `paths(depth)` 扩展与成本上界。
- 尚无图谱专属用量计数；kb 文档缝的计数不覆盖三元组。
