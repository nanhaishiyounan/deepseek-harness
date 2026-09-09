# @deepseek-ai/dsh-lakehouse

[English](README.md) | 中文

湖仓能力缝（`ctx.lakehouse`）：catalog 与引擎 provider 注册表，加上围绕 Parquet 表的 load/query 编排。加载一个 `(tenantId, tableName)` 身份会在数据根目录下写出一个 Parquet 文件并在 catalog 中登记；查询时只把该租户的表暴露给引擎并按行数截断。

## 编排

`load` 解析两个 provider，计算数据文件位置 `<dataRoot>/<tenantId>/<tableName>.parquet`，创建父目录，把表格数据交给引擎的 `writeParquet`，再把结果登记进 catalog。同一身份重载会替换既有登记并保留原始 `createdAt`。表名必须是纯 SQL 标识符（`[A-Za-z_][A-Za-z0-9_]*`），租户 id 不得含路径分隔符——两者都会成为文件名与视图名。

`query` 列出租户的登记，把 workspace 相对路径解析为绝对路径，并按解析后的 `maxRows` 执行 SQL。租户隔离靠表集合实现：引擎只看到该租户的表，引用其他租户的表会以未知表失败。用量计量（`loadedTables` / `lakehouseQueries`）在成功后经 catalog 记录；计量失败只记日志，绝不使数据操作失败。

## Provider 选择

`./data-router` 子导出是共享的上传路由判别器：纯函数 `resolveDataRoute(filename, bytes, mime?)` 按扩展名白名单、无已知扩展名时声明的 mime 类型、以及魔数一致性校验（pdf/zip/json 数组签名；csv 与纯文本无魔数），把一个上传文件分类为湖仓载入（csv/xlsx/json）或 kb 文档（md/txt/pdf/docx）。拒绝携带可机读原因——`unsupported-type`、`type-mismatch`、`empty-file`——apiproxy `data` 域与（自连接器批次起）传输管线据此映射各自的 wire 错误码。判别器放在本包是因为两个消费方都已依赖能力缝，单一路由真相无需新包。

两个注册表都在执行期解析，绝不依赖注册顺序。对每个角色：配置的 id 已注册且 `available()` 则胜出；配置的 id 缺失或不可用各有专属错误码（`*_CONFIGURED_MISSING`、`*_CONFIGURED_UNAVAILABLE`）；未配置时恰好一个可用 provider 自动选中，多个抛 `*_AMBIGUOUS`，没有抛 `*_UNAVAILABLE`。引擎没有降级替身：无可用引擎时 catalog 面（`listTables`、`stats`、`usage`、`dropTable`）继续工作，而 `load` 与 `query` 以 `LAKEHOUSE_ENGINE_UNAVAILABLE` 显式失败；`stats` 报告 `engineAvailable: false` 而不抛错。

## 配置（schemastery）

```ts
interface Config {
  catalogStore?: string   // explicit catalog id; omitted = auto-select when exactly one usable
  queryProvider?: string  // explicit engine id; omitted = auto-select when exactly one usable
  dataRoot?: string       // workspace-relative (or absolute) data root; default 'workspace/lakehouse'
  maxRows?: number        // query result cap; default 200
}
```

## Model Experience

间接：本缝不注册任何 prompt、schema 或工具；后续 Consumer 包拥有已加载表与查询结果的全部模型可见呈现。

#### KV Cache effect

与模型请求流无关：load 与 query 产生的是后续请求消费的工具结果，本包既不追加也不失效任何可复用请求前缀。

## Known Limitations and Deferred Work

- **load 路径仅 Parquet** — `load` 始终写 Parquet；`csv` 格式值用于引擎读取与未来的直接 csv 加载。
- **无行级授权** — 隔离以租户为单位（通过可见表集合）；列级或行级掩码不在本缝范围。
- **计量尽力而为** — 用量计数器存于 catalog，失败的累加绝不使数据操作失败，因此计数器可能滞后于已成功的操作。
