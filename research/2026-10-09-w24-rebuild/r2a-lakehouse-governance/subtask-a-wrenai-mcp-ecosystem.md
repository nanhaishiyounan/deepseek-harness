# 子任务 A：WrenAI 档案核实 + 引擎 MCP server 生态

日期：2026-10-09。方法：仅 curl（`-sL --max-time 25`），raw.githubusercontent.com 与 GitHub search API、registry.npmjs.org 实抓；输出存 /tmp/wrenaia/ 后 jq/grep/python3 分析。duckduckgo/google 不可达（背景已确认，未重试）。

网络实况备注：
- GitHub core API（repos/contents）未认证限流已耗尽（`API rate limit exceeded`，IP 89.187.185.68，403）→ 无法列举目录/取单仓元数据的 API 端点；search API 为独立限流桶，全程可用。
- docs.wren.ai 不可达（`000` 超时）；docs.getwren.ai 可达（200）。
- 百度 SERP 返回"百度安全验证"页 → 百度 SERP 不可用于 curl。

## WrenAI（license / 架构 / MCP）

### 1. License 精确定性：多许可，当前无任何路径映射到 AGPL

主分支根 [`LICENSE`](https://raw.githubusercontent.com/Canner/WrenAI/main/LICENSE)（HTTP 200，2214 字节）是一份"WrenAI License Overview"多许可概述文件，而非单许可全文。路径映射表：

| 路径 | 许可 |
| --- | --- |
| `core/**`、`sdk/**`、`skills/**`、`examples/**`、根文件 | Apache-2.0（全文 [`LICENSE-APACHE-2.0`](https://raw.githubusercontent.com/Canner/WrenAI/main/LICENSE-APACHE-2.0)，200/11342B） |
| `docs/**` | CC BY 4.0（全文 [`LICENSE-CC-BY-4.0`](https://raw.githubusercontent.com/Canner/WrenAI/main/LICENSE-CC-BY-4.0)，200/18657B） |
| AGPL-3.0 | **当前无任何路径映射**。全文 [`LICENSE-AGPL-3.0`](https://raw.githubusercontent.com/Canner/WrenAI/main/LICENSE-AGPL-3.0)（200/34583B）系"Future AGPL-3.0 modules"章节预置：声明将来可能引入 AGPL-3.0-only 模块，届时才更新映射表 |

其他要点（均出自同一 LICENSE 文件）：
- 无限制商用/多租户/附加条款——引擎部分为纯 Apache-2.0。
- 商标保留：Wren / WrenAI 名称与 logo 为 Canner, Inc. 商标，不在任何上述开源许可内。
- 发布工件以各包 manifest（Cargo.toml / pyproject.toml / package.json 的 license 字段）为权威。
- README badge 与 License 章节同样写 "Apache 2.0"（[README](https://raw.githubusercontent.com/Canner/WrenAI/main/README.md)，grep 'license' 实证）。
- GitHub `license spdx=NOASSERTION("Other")` 的成因即此：根 LICENSE 是自定义多许可概述，GitHub 无法归类为单一 SPDX。

Open core 边界（README "Open core: what's OSS, what's commercial" 章节）：本仓库引擎（MDL 语义层、governed text-to-SQL、**MCP server**、CLI、22+ connectors）Apache-2.0 自托管免费；商业（Wren AI Cloud / Enterprise Plus）= 行列级安全与用户组、GenBI UI/dashboards/embedding/API、GenBI Apps/Agentic Mode、审计/SLA/VPC。

结论：**"WrenAI 是 AGPL-3.0" 的常见说法与 2026-10-09 main 分支现状不符**——AGPL 全文仅为未来模块预置，未生效。

### 2. 架构组件：CLI/Rust 引擎形态；Docker 多容器版已归档

main 分支（README "Project structure" 章节）：

```
core/
  wren-core/         Rust semantic engine (Apache DataFusion)
  wren-core-base/    Shared manifest types + MDL builder
  wren-core-py/      Python bindings (PyPI: wren-core)
  wren-core-wasm/    WebAssembly build (npm: wren-core-wasm)
  wren/              Python SDK and CLI (PyPI: wrenai)
  wren-mdl/          MDL JSON schema
sdk/                 wren-langchain / wren-pydantic
skills/              Agent skills for context authoring
docs/  examples/
```

四层架构（仓库内 [docs/core/reference/architecture.md](https://raw.githubusercontent.com/Canner/WrenAI/main/docs/core/reference/architecture.md)，200/10602B）：Agent workflow（skills）→ Project context（MDL/instructions/profiles/memory）→ Planning engine（sqlglot CTE rewrite + wren-core Rust）→ Execution（22+ connectors，单一 DataFusion 引擎）。

重大历史变更（README FAQ "What happened to the Docker-based Wren AI GenBI app?"）：**2026-05-07 Wren Engine 并入本仓库 `core/`，`Canner/wren-engine` 仓库归档；旧 chat-first Docker BI 产品冻结为 "Wren GenBI Classic"，存于 [`legacy/v1` 分支](https://github.com/Canner/WrenAI/tree/legacy/v1)（tag `v1-final`），不再有新功能或安全修复**。

- main 分支无 docker-compose：`docker-compose.yaml`/`docker-compose.yml` 均 404（实测）。
- legacy/v1 分支 [docker/docker-compose.yaml](https://raw.githubusercontent.com/Canner/WrenAI/legacy/v1/docker/docker-compose.yaml)（200/3421B）服务清单：`bootstrap`、`wren-engine`（ghcr.io/canner/wren-engine）、`ibis-server`（ghcr.io/canner/wren-engine-ibis）、`wren-ai-service`（ghcr.io/canner/wren-ai-service）、`qdrant`（qdrant/qdrant:v1.15.0）、`wren-ui`（ghcr.io/canner/wren-ui）。注意：该 compose 为已冻结的 legacy 版本，不代表当前产品形态。
- 顶层目录清单：GitHub contents API 限流 403 未能列举；以上结构以 README + 各文件 raw 200 实证交叉确认。

### 3. MCP server 支持实况：官方一等公民，`wren serve mcp`

三级证据闭环（README → CLI reference → guide → 在线文档站）：

- README："The engine in this repo (MDL semantic layer, governed text-to-SQL, **MCP server**, CLI, 22+ connectors) is Apache-2.0"；定位为 "Works through the agents you already run (Claude Code, Cursor, Cline, Codex, MCP clients, LangChain)"。
- [docs/core/reference/cli.md](https://raw.githubusercontent.com/Canner/WrenAI/main/docs/core/reference/cli.md)（200/30157B）`wren serve mcp` 章节 + [docs/core/guides/mcp.md](https://raw.githubusercontent.com/Canner/WrenAI/main/docs/core/guides/mcp.md)（200/4348B）。
- 在线文档站 [docs.getwren.ai/oss/guides/mcp](https://docs.getwren.ai/oss/guides/mcp)（HTTP 200）内容与仓库 guide 一致。

启动与分发：`pip install 'wrenai[mcp]'`（mcp 为 extra），`wren serve mcp`。默认 stdio（客户端 spawn 子进程）；`--transport http --port 8080` 提供 Streamable HTTP（默认绑定 127.0.0.1，**无 bearer-token auth，官方明示 keep it local**）。引擎 in-process——"no ibis-server, no separate backend"。前置条件：`wren context build` 产出 `target/mdl.json`。启动时向 stderr 打印可直接复制的 `claude mcp add` / `codex mcp add` / JSON `mcpServers` 配置。

工具/资源清单（cli.md 实录）：

| 组 | 工具 |
| --- | --- |
| Query | `run_sql`, `dry_run`, `dry_plan`, `query_cube` |
| Schema | `get_mdl`, `list_models`, `describe_model`, `get_data_source`, `list_cubes`, `describe_cube`, `list_functions` |
| Knowledge | `get_instructions`, `recall_queries`, `get_context`, `describe_schema`, `list_stored_queries`, `list_knowledge` |
| Write（需 `--allow-write`，默认关） | `store_query` |

资源：`wren://mdl`、`wren://instructions`、`wren://project`、`wren://agents`、`wren://knowledge/{path}`（拒绝越出 knowledge/ 的路径）；prompt：`wren_workflow`。开关：`--no-connect` 纯转译模式（禁 `run_sql`/`dry_run`/`query_cube`）；knowledge 工具在无 `memory` extra 时优雅降级。安全：连接 secrets 仅启动时从 profile 解析，**不跨 MCP 边界**（只暴露 SQL 文本、结果与元数据）。

## MCP server 生态清单

stars/license/pushed 为 GitHub search API 实时快照（2026-10-09 抓取；URL 见来源列表）。

### Doris

| repo | stars | license | 最近 push | 结论 |
| --- | --- | --- | --- | --- |
| [apache/doris-mcp-server](https://github.com/apache/doris-mcp-server) | 351 | Apache-2.0 | 2026-10-01 | **Apache 官方**，活跃。v1.0.0：MCP `2026-07-28` 协议，stdio + Streamable HTTP GA，"8 stable domains / 55 child capabilities"，read-only 定位；Python 包（classifier Beta）；默认分支 master（README main 404、master 200 实证） |
| [morningman/mcp-doris](https://github.com/morningman/mcp-doris) | 15 | Apache-2.0 | 2025-03-07 | 社区（Doris 生态知名团队 morningman），停更约 19 个月 |
| [selectdb/doris-new-mcp](https://github.com/selectdb/doris-new-mcp) | 6 | Apache-2.0 | 2026-08-27 | SelectDB（Doris 商业公司）官方 org，体量小 |
| 其余（iakuf/doris-mcp-server-ts 等 5 仓） | 0-9 | MIT/None | 2025~2026 | demo/个人实验，无生态权重 |

apache/doris 主仓内有无 mcp 目录：contents API 限流未能核实——**未证实**；官方 MCP 归属已由 apache/doris-mcp-server（apache org）确定，不影响结论。

### Trino

| repo | stars | license | 最近 push | 结论 |
| --- | --- | --- | --- | --- |
| [tuannvm/mcp-trino](https://github.com/tuannvm/mcp-trino) | 121 | MIT | 2026-07-01 | **社区主流**，Go 实现，STDIO+HTTP，OAuth 2.1（HMAC/Okta/Google/Azure AD）、JWT、Docker/GHCR 镜像；非 Trino 官方（trino-io org 无官方 MCP，本次搜索 42 结果中无 trino-io org 仓） |
| [alaturqua/mcp-trino-python](https://github.com/alaturqua/mcp-trino-python) | 25 | Apache-2.0 | 2025-12-01 | Python SDK 实现，低频维护 |
| [Dataring-engineering/mcp-server-trino](https://github.com/Dataring-engineering/mcp-server-trino) | 18 | MIT | 2025-04-22 | 停更约 17 个月 |
| txn2/mcp-trino | 3 | Apache-2.0 | 2026-10-09 | 微型，当日有 push 但无社区规模 |

### DuckDB（云版 MotherDuck + 本地社区版）

| 组件 | stars/版本 | license | 最近更新 | 结论 |
| --- | --- | --- | --- | --- |
| [motherduckdb/mcp-server-motherduck](https://github.com/motherduckdb/mcp-server-motherduck) | 527 | MIT | 2026-10-07 | **MotherDuck 官方**，活跃。"Local MCP server for DuckDB and MotherDuck"。分发走 **PyPI/uvx**：`uvx mcp-server-motherduck --db-path :memory: \| /path.duckdb \| md:`；支持 read-only/read-write、S3 远端、切换库、另有 MotherDuck 托管 hosted 版。**npm `@motherduck/mcp-server-motherduck` 404**——任务书给的 npm 包名不存在（registry.npmjs.org 实测），npm search 'motherduck' 亦无此包 |
| [ktanaka101/mcp-server-duckdb](https://github.com/ktanaka101/mcp-server-duckdb) | 179 | MIT | 2025-05-05 | 本地 DuckDB 社区版历史首选，停更约 17 个月 |
| [teaguesterling/duckdb_mcp](https://github.com/teaguesterling/duckdb_mcp) | 66 | Apache-2.0 | 2026-10-06 | **DuckDB 扩展形态**（`LOAD 'duckdb_mcp'; PRAGMA mcp_server_start('stdio')`），既是 MCP server 又可作 MCP client 用 SQL 查外部 MCP 资源；HTTP transport 带认证；文档 duckdb-mcp.readthedocs.io；个人仓库（非 duckdb org），活跃 |
| IzumiSy/mcp-duckdb-memory-server | 59 | MIT | 2026-04-07 | DuckDB 做后端的 memory server（非通用查询面） |
| npm：mcp-duckdb-local@0.8.2 / @seed-ship/duckdb-mcp-native@1.7.0 | — | — | 2026-03-02 / 2026-10-03 | npm 侧 DuckDB MCP 长尾（registry.npmjs.org search 实测） |

### 通用多库 MCP server

| repo | stars | license | 最近 push | 结论 |
| --- | --- | --- | --- | --- |
| [FreePeak/db-mcp-server](https://github.com/FreePeak/db-mcp-server) | 435 | MIT | 2026-09-24 | "multi-database server implementing MCP"，通用多库代表，活跃 |
| Nam088/mcp-db-server | 82 | MIT | 2026-09-04 | 次选 |
| minitragonia/db-mcp-server | — | — | — | **未证实存在**：README main/master 双 404，`db-mcp-server in:name` 搜索（total 239）首屏 top6 无此仓 |

### modelcontextprotocol/servers 官方收录情况

[modelcontextprotocol/servers README](https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md)（200/8707B）：Reference Servers 仅 7 个——Everything、Fetch、Filesystem、Git、Memory、Sequential Thinking、Time。数据库类 PostgreSQL/SQLite **均已移入 servers-archived**（明确标注由外部接管，如 Brave Search 转官方）。**Doris / Trino / DuckDB / MotherDuck 均未收录**（README grep doris|trino|duckdb|motherduck 零命中）。

结论：MCP 官方仓库走"少量参考服务器"路线，数据库 MCP server 生态由引擎厂商（apache、motherduckdb）与社区（tuannvm、FreePeak）承担；WrenAI 自带 MCP server 亦属此厂商自持模式。

## 来源 URL 列表

WrenAI 主仓（raw，均实测 HTTP 码）：
- https://raw.githubusercontent.com/Canner/WrenAI/main/LICENSE （200）
- https://raw.githubusercontent.com/Canner/WrenAI/main/LICENSE-APACHE-2.0 （200）
- https://raw.githubusercontent.com/Canner/WrenAI/main/LICENSE-CC-BY-4.0 （200）
- https://raw.githubusercontent.com/Canner/WrenAI/main/LICENSE-AGPL-3.0 （200）
- https://raw.githubusercontent.com/Canner/WrenAI/main/LICENSE.md （404，任务书首选路径不存在）
- https://raw.githubusercontent.com/Canner/WrenAI/main/README.md （200）
- https://raw.githubusercontent.com/Canner/WrenAI/main/docs/core/reference/architecture.md （200）
- https://raw.githubusercontent.com/Canner/WrenAI/main/docs/core/reference/cli.md （200）
- https://raw.githubusercontent.com/Canner/WrenAI/main/docs/core/guides/mcp.md （200）
- https://raw.githubusercontent.com/Canner/WrenAI/main/docker-compose.yaml 、/main/docker-compose.yml （均 404）
- https://raw.githubusercontent.com/Canner/WrenAI/legacy/v1/docker/docker-compose.yaml （200）

GitHub API（search 独立限流桶可用；core API 403 限流）：
- https://api.github.com/search/repositories?q=doris+mcp+in:name,description
- https://api.github.com/search/repositories?q=trino+mcp+in:name,description
- https://api.github.com/search/repositories?q=mcp+duckdb+in:name
- https://api.github.com/search/repositories?q=motherduck+mcp
- https://api.github.com/search/repositories?q=db-mcp-server+in:name
- https://api.github.com/repos/Canner/WrenAI/contents/ （403 rate limit——限流证据）
- https://api.github.com/search/repositories?q=user:minitragonia （422；随后 raw 双分支 404 判定未证实）

引擎仓库 README（raw）：
- https://raw.githubusercontent.com/apache/doris-mcp-server/master/README.md （200；main 404）
- https://raw.githubusercontent.com/tuannvm/mcp-trino/main/README.md （200）
- https://raw.githubusercontent.com/motherduckdb/mcp-server-motherduck/main/README.md （200）
- https://raw.githubusercontent.com/teaguesterling/duckdb_mcp/main/README.md （200）
- https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md （200）

npm registry：
- https://registry.npmjs.org/@motherduck/mcp-server-motherduck （**404**——负发现）
- https://registry.npmjs.org/-/v1/search?text=mcp%20duckdb&size=15
- https://registry.npmjs.org/-/v1/search?text=motherduck&size=8

文档站与兜底：
- https://docs.wren.ai/ （000 不可达）
- https://docs.getwren.ai/oss/get_started/quickstart （200；提取出 /oss/guides/mcp 链接）
- https://docs.getwren.ai/oss/guides/mcp （200）
- https://www.baidu.com/s?wd=WrenAI+MCP （200 但返回"百度安全验证"页——百度 SERP 不可用于 curl）
