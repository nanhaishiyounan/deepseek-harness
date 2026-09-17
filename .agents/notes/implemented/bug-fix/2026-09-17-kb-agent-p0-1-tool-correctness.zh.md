# Agent Note: kb-agent P0-1 工具正确性 — kb_ingest 会话 cwd、nb_list includes、kg_query 全句式 miss 消息

Status: implemented

[English](2026-09-17-kb-agent-p0-1-tool-correctness.md) | 中文

## Problem

一次真实 food-kb-agent 会话（preset `enterprise-data-assistant`，工作区 cwd ≠ harness 仓库根）在回答「俄罗斯仓库被炸了，有没有别的路径」时暴露三处工具层缺陷：

- `kb_ingest` 把模型可见的相对 `path` 解析到服务进程启动目录（调用方不传 `cwd` 时 `fs-local` 回落 `process.cwd()`），而 `read`/`write`/`edit` 对同类入参按会话 cwd 解析。随后三次 `FS_NOT_FOUND`；ingest 工具的解析基准与 fs 工具族其余成员不一致。
- `nb_list` 的受限 filter 词汇表（`eq/in/gt/lt`）没有任何模糊匹配操作符。模型三次重试 `like` 全被拒，拒绝消息里没有任何可用替代，`experts` 表（推荐服务背后的人名行）始终取不回。
- `kg_query` 的 miss 消息把支持句式列表截断为 9 个模板中的 4 个，给模型的是工具接受范围的不完整图景，而非文档承诺的 fallback 决策依据。

## Decision

### kb_ingest 按会话 cwd 解析，经 fs 缝共享函数

`sessionResolveCwd(cwd, requestedPath)` 是 `@deepseek-ai/dsh-fs`（`packages/fs/fs/src/session-path.ts`）上的纯函数：非 agent 调用透传 `undefined`（backend 默认生效），普通 cwd 原样返回，任一侧出现父段穿越时对 cwd 做规范化（symlink 工作区按其文件系统真实身份解析）。`dsh-tool-fs` 的 `sessionCwd(exec, requestedPath)` 变为对它的薄委托，`kb_ingest` 的 `execute` 与 `read`/`write`/`edit` 使用同一基准：`sessionResolveCwd(exec.agent?.session.header.cwd, path)` 作为 `ctx.fs.resolve` 的 `cwd` 选项传入。任何工具包都不再私存一份父段穿越/规范化逻辑。

### nb_list 新增 `includes` — 一个受控操作符，三处镜像同步

受限词汇表从 4 个操作符扩到 5 个：`includes` 映射 NocoBase `$includes`（子串模糊匹配），取标量操作数，由 `parseNbFilterCondition` 既有的标量分支校验。不新增 `like` 别名（`%` 通配语义有歧义，且 NocoBase 的 `$like` 并非模型直觉假设的那样）。闭集词汇表的镜像同步改动：

- `packages/connector/connector-nocobase/src/filter.ts` 的 `NbFilterOp` + `OPERATOR_KEYS`（词汇表源头）；
- `packages/connector/tool-nocobase/src/read.ts` 的 `nb_list` schema enum、工具 description、filter description 与 system-prompt 段，均写明「for fuzzy matching use includes (substring match), never like」；
- `packages/host/apiproxy/src/api/nocobase.ts` 与 `nocobase.schema.ts` 的 wire view 类型与 zod enum，RPC 域接受它所编译的同一词汇表。

### kg_query 的 miss 消息列全支持句式

`unsupportedMessage()` 拼接全部 `KG_QUERY_EXAMPLES`（9 个模板）。模板闭集本身不变 — miss 仍指向 `kg_schema` + `kg_subgraph` fallback。

## Alternatives considered

- **`kb_ingest` 直接 import `dsh-tool-fs` 的 `sessionResolveOptions`。** 工具包互相 import 越过了能力域只为一个助手函数，且 `./src/*` 导出不属于发布面（`files` 只发布 `lib/`）。纯函数沉到 fs 缝，依赖方向保持在 Service Definition 包上。
- **把 `like` 加为 `$includes`/`$like` 的别名。** SQL `LIKE` 自带 `%`/`_` 通配预期而 NocoBase `$includes` 不兑现；一个后端不会兑现其暗示语义的名字，比一个语义精确的受控操作符更糟。
- **向原生 `$operator` 树开放 filter 词汇表。** 受限扁平清单的存在意义就是不让任意操作符树穿过消费者边界；模糊匹配缺口用再加一个命名操作符修复，而不是拆除边界。
- **kg_query miss 消息列模板 id 而非示例句式。** 模型改写的是句式不是 id；示例清单才是闭集的可操作形态。

## Consequences

- 会话 cwd 成为所有模型可见相对路径工具的唯一解析基准；该不变量由一个共享函数承担，后续工具调用 `sessionResolveCwd` 即可接入，无需复制逻辑。
- `nb_list` 直接回答按名查询（`name includes 红喜`），不再需要全表分页绕行；`like` 的拒绝消息因为 enum 清单含 `includes` 而自带替代指引。
- apiproxy 的 `nocobase.list` RPC 在同一改动中接受 `includes` — 词汇表的两个消费者不会漂移。
- kg_query 的 miss 消息更长（9 个句式一行）；读到它的模型看到完整闭集而非截断前缀。

## Verification

- 失败测试先行，修复前全部以缺陷方式红、修复后全绿：`packages/kb/tool-kb/tests/ingest.spec.ts`「resolves a relative path against the per-session cwd, not the backend default」（修复前在 backend 默认目录下 `FS_NOT_FOUND`）、`packages/connector/tool-nocobase/tests/tool-nocobase.spec.ts`「compiles includes to the $includes wire operator for fuzzy matching」与「refuses like, naming the supported operators (including includes) in the refusal」、`packages/connector/connector-nocobase/tests/client.spec.ts` 受限词汇表断言、`packages/kb/tool-kb/tests/kg-query.spec.ts`「names every supported shape in the miss message」。
- `packages/fs/fs/tests/session-path.spec.ts` 覆盖共享函数全部分支；`dsh-tool-fs` 套件在委托改动后保持全绿。
- 经真实 Loader 组合刷新 keyless 快照：`examples/kb-agent/tests/nocobase-tools.spec.ts`（`serviceName includes 合规` journey 步骤）与 `examples/kb-agent/tests/kg-tools.spec.ts`（全句式 miss 消息）。
- `pnpm run typecheck` 绿；全部改动文件过 `oxlint`（0 警告 0 错误）；`pnpm vitest run packages/host/apiproxy` 绿（445 测试）。
