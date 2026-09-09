# Agent Note: 统一数据上传域与共享路由判别器

Status: implemented

[English](2026-09-03-unified-data-upload-routing.md) | 中文

## 问题

kb 工作台的上传通道（`kb.upload`）只接受文档类（md/txt/pdf/docx）；食品企业部署同时会收到结构化数据（海关台账、订单导出、价格表），它们的天然归宿是可查询的湖仓表而非切片文档。湖仓能力缝落地后（N1：`ctx.lakehouse` + SQLite catalog + DuckDB 引擎），两个路由决策需要唯一属主：上传落到哪里，以及模型回答用哪个检索面。若按调用方各自实现（kb 侧嗅探一次、连接器侧再嗅探一次），分类规则恰好在最不能分叉的地方分叉——同一个文件无论来自浏览器上传还是连接器传输，都必须路由到同一目的地。

## 决策

一个判别器、一个 wire 入口、一个模型侧路由姿态：

- **`@deepseek-ai/dsh-lakehouse/data-router`**（能力缝包的子导出）以纯函数 `resolveDataRoute(filename, bytes, mime?)` 拥有分类。顺序：扩展名白名单（csv/xlsx/json → 湖仓；md/txt/pdf/docx → kb）→ 无扩展名文件回退声明 mime → 魔数一致性（pdf/zip/json 数组签名）。拒绝携带可机读原因（`unsupported-type`、`type-mismatch`、`empty-file`）。子导出放在 lakehouse 包，因为两个消费方——apiproxy `data` 域与后续连接器传输管线——都已依赖能力缝；不新增包，单一路由真相。
- **apiproxy `data` 域**是唯一上传 wire：`data.upload`（与 `kb.upload` 共享同一栈安全 canonical base64 门）先分类再落地。湖仓路由把 csv（仓内 RFC-4180 读取器）、json 行数组、xlsx（exceljs，惰性 import）解析为能力缝的 `TabularData` 并按列推断 SQL 类型（INTEGER/DOUBLE/BOOLEAN/TEXT；超安全整数列保持文本），从文件名派生表名，携带 `workbench-upload` 溯源调用 `ctx.lakehouse.load`。kb 路由原样复用既有上传管线。响应按目的地判别；两个目的地都报告替换事实（kb 用落盘文件身份，湖仓用 catalog 真相）。原始字节始终落盘于 `workspace/data/uploads/` 以供审计。八个新 `data-*` 错误码闭合拒绝词汇；写入需显式 `dataUploadEnabled`（独立于 `kbWriteEnabled`）并共享 `kbTenant` 部署绑定。
- **`tool-lakehouse`** 暴露 `lakehouse_tables`（schema 优先的清单）与 `lakehouse_query`（单条只读语句、缝级行数上限、截断标记、按词边界匹配的 `tables_used` 溯源）。两者渲染 `generic` 卡；查询结果是 markdown 表格加 `Data source: lakehouse table <名>` 行与"回答注明来源"的常驻指引。租户是部署侧绑定，作为模型输入被拒绝——与 `tool-kb` 对齐。
- **查询路由在提示词侧，不是新插件**：每个工具注册自己的系统提示 section（先列表再写 SQL；数值 → 湖仓，文档片段 → `kb_search`），kb-agent 的 persona/preset 承载同一分工。路由指引的连接器分支（`connector_discover`）留到 N3 工具落地后再补。
- **`ui-kb` 切换而非分叉**：向导的上传页签改调 `data.upload`（透传浏览器声明的 mime），在文档类之外接受 csv/xlsx/json，按目的地分行与提示（「已入数据湖：<表> · N 行」/「已入库」；替换提示保留）。`kb.upload` 保留为面向内部调用方的 kb 专用通道。

## 验证

- `pnpm vitest run packages/lakehouse` —— 判别矩阵（结构化三件、四种文档类、mime 回退、大小写不敏感、空/未知/矛盾拒绝）与基于内存 provider 的工具套件（租户绑定、溯源、截断、引擎降级、schema 面）。
- `pnpm vitest run packages/host/apiproxy` —— 五格式路由（csv/xlsx/json/md/pdf，含 exceljs 真实构造的工作簿与共享 PDF fixture）、门禁、拒绝、无湖仓组合、替换事实、wire schema 对。
- `pnpm vitest run examples/kb-agent/tests/data-routing.spec.ts` —— 基于 Loader 真实组合的 keyless 快照，锁定全环 transcript（上传回执 → `lakehouse_tables` → DuckDB 聚合 → `kb_search` 引用）。
- with-key e2e `examples/kb-agent/tests/data-routing.e2e.ts`（无 `MINIMAX_API_KEY` 自跳过）：真实 csv 与 markdown 上传（embo-01 真实嵌入）、湖仓聚合、真实 MiniMax-M3 回答复述查询数字并注明来源表。

## 备选方案

**为什么不在 api 网关内单独分类？** N3 连接器传输管线对拉取的数据集需要同一分类；网关内的模块会迫使连接器包依赖整个宿主 BFF。能力缝包子导出保持依赖单向（`connector → lakehouse` 因 `TabularData` 已存在）。

**为什么不给 `kb.upload` 加目的地提示参数？** 调用方提示让客户端成为路由权威并诱发分歧（两个浏览器两种提示）。分类是字节与文件名的属性；判别器拥有它，客户端从按目的地判别的响应里得知结果。

**为什么现在不支持 parquet 上传？** 计划文本在结构化上传中点名了 parquet，但能力缝的 `load` 契约是 `TabularData → writeParquet`；把 parquet 字节读回该词汇需要引擎协作（经查询路径的 `read_parquet`）与 N1 `QueryProvider` 契约未暴露的列 schema 提取。交付半路由（判别后拒绝）劣于把白名单收敛到 csv/xlsx/json——parquet 随连接器批次的文件级传输落地，此处记录为刻意边界。

**为什么仓内 CSV 读取器而非依赖？** 读取器约 70 行，恰好覆盖上传通道需要的 RFC-4180 子集（引号字段、双引号转义、CR/LF 记录、BOM），且类型推断规则无论如何都要对齐 DuckDB 的封闭 DDL 类型集；papaparse 的招牌能力（流式、worker、自带类型猜测）在此用不上，其审计面反而大于被替换的代码。exceljs 正相反——ZIP+OOXML 解析确属库的领地——故引入（npm 上的 `xlsx` 包最后注册版本带未修复 CVE，排除）。

**为什么提示词侧查询路由而非意图分类插件？** 计划自身的演进阶梯（D2/动线 B）：工具加指引是有先例验证的 MVP 档（kb 引用指令），零 loop 改动，且降级为运营者可在 transcript 里读到的模型可见失误。分类插件是演进档，不是地基。

## 后果

每个上传现在恰有一个入口与一个分类真相；浏览器向导、后续连接器与任何其他生产方对文件落点达成一致，拒绝词汇（`data-*` 错误码）在 wire 上闭合。代价：`data.upload` 让网关耦合到两个可选能力缝（kb、lakehouse），各自有结构化拒绝；xlsx 读取器给网关依赖加了 exceljs 的重量（惰性 import）；CSV/JSON 类型推断是启发式，运营者偶尔需重整源文件来纠正。模型侧，路由负担落在提示指引上——比分类器便宜，但模型仍可能选错面，transcript 即诊断依据。上述 parquet 边界意味着今天上传 `.parquet` 会以 `data-unsupported-type` 拒绝并列出支持集——诚实，且连接器批次负责闭合。
