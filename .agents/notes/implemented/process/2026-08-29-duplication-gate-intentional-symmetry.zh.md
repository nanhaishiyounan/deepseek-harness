# Agent Note: duplication 门回绿——kb-embed-shared 提取、jscpd ignore 标注与 deleteDocument 事务化

Status: implemented

[English](2026-08-29-duplication-gate-intentional-symmetry.md) | 中文

## Problem

FIX-F 验收后 `pnpm run duplication` 保持红灯：对照 HEAD 基线 0 存在 29 对跨包克隆（llm-deepseek↔llm-minimax 19 对、kb-embed-minimax↔kb-embed-dashscope 8 对、kb-sqlite↔session-persistence-sqlite 2 对），红灯门阻断了 kb 合并。同时还有两条已点名的 Minor 缺陷：embed 退避窗口没有倒置守卫（`backoffBaseMs > backoffMaxMs` 会静默产生被截断的无意义调度），以及 kb-sqlite 的 `deleteDocument` 把存在性 SELECT 放在 `BEGIN IMMEDIATE` 事务之外——SELECT 与 DELETE 之间竞争删除者提交时，方法在删除 0 行的情况下仍报告 `true` 的 TOCTOU 窗口。

## Decision

### 逐字重复的 embed 传输核心移入 `dsh-kb-embed-shared`

新包 `packages/kb/kb-embed-shared` 持有 `HttpEmbedError`、`isRetryable`、`backoffDelay`（对 `min(base × 2^attempt, max)` 施加均匀 50–100% 抖动）、`backoff`、重试循环 `withEmbedRetries`、`EmbedRetryOptions` 切片以及两个退避默认常量。两个 embed 供应商改为消费它；它们的 `Config` 字段、默认值（100 / 2^31−1）、抖动与 debug 日志格式零变化，各供应商的 options 接口改为 extends `EmbedRetryOptions`。提取消掉了唯一一对逐字相同的传输代码克隆；kb-embed 其余 7 对属于供应商模板对称（见下）。

### `assertBackoffOrdered` 在供应商构造时 fail loud

`backoffBaseMs > backoffMaxMs` 会在各供应商构造函数中抛出 `[kb-embed] backoffBaseMs (1000) must be less than or equal to backoffMaxMs (500)`，与 `dsh-llm` 中 `resolveBackoff` 的解析期校验同构（packages/llm/llm/src/retry-policy.ts）。构造是两个值首次同时出现的最早点，配置错误的 cordis.yml 在插件加载时失败，而不是等到第一次重试；两个供应商各带 1000/500 的专项单测。

### 有意模板对称段用 jscpd ignore 标注，而非提取

jscpd 的 mild 模式会归一化字符串字面量与标识符，任何两段结构相同且 ≥6 行 / ≥60 token 的代码无论厂商取值如何都会被判克隆——不引入耦合厂商演进时间线的共享基类，就无法用提取消除供应商模板。仓库既有机制（每个包的 `invariant.ts` companion 已经这样做）适用：`/* jscpd:ignore-start */` …… 理由注释 …… `/* jscpd:ignore-end */` 在双侧包裹每个被接受的段。标注段与理由：

- llm-deepseek↔llm-minimax 共 19 对，分布于 adapter.ts（httpErrorCode、适配器壳方法、watchdog 块、fetch 块）、index.ts（目录 schema、目录归一化、记忆化 options 解析器、注册尾部）、serialize.ts（flattenText/assertTextOnly、serializeAssistant、serializeMessages、请求体尾部）、sse.ts（parseSse）、translate.ts（共享翻译词汇）、types.ts（wire 类型）——每个厂商 LLM 适配器按 docs/cookbook/adding-an-llm-adapter.md 复现并独立演进的骨架。
- kb-sqlite↔session-persistence-sqlite 共 2 对——同构的 node:sqlite 实验告警过滤加载器与闭集 sql 资源加载器；kb 与 session 两组保持跨组零依赖。
- kb-embed-minimax↔kb-embed-dashscope 残余 7 对——Config 面、供应商类壳、requestOnce 骨架与 apply 装配；已提取的传输核心位于 dsh-kb-embed-shared。

### `deleteDocument` 镜像 `putDocument` 的事务形态

存在性 SELECT 移入 `BEGIN IMMEDIATE`：BEGIN → select →（未命中：rollback、返回 false）→ delete → COMMIT，失败回滚。竞争删除 worker（BEGIN IMMEDIATE、删除目标身份、持锁 150 ms、提交）使第二个连接的 `deleteDocument` 先等锁、再在事务内看到身份已消失，从而在删除 0 行时报告 `false`；修复前的形态在 BEGIN 之前观察到该行并错误报告 `true`。回归测试在修复前的 store 形态上失败（通过临时还原验证）、在 shipped 形态上通过。

## Alternatives considered

- **共享 LLM 适配器基类** —— 耦合厂商演进时间线；每厂商一个适配器包是既定模式，且对称段与真正的厂商专属逻辑（files API、think 标签拆分、用量信封）交错分布。
- **调高 jscpd 阈值或在 .jscpd.json 加路径 ignore** —— 会在全仓掩盖新的真实重复；逐段标注为每个被接受的克隆及其理由留名，包裹之外的任何重复仍会让门失败。
- **守卫只放在 `backoffDelay` 内** —— 要到第一次重试才触发，而不是插件加载时；构造期校验到达最早可解析点。
- **把整个 embed 供应商提取成共享基类** —— Config 面与 wire 解码必须留在各包，且 schema 工厂调用点在字面量归一化下照样克隆。

## Consequences

- `pnpm run duplication` 报告 0 克隆（退出码 0），恢复 HEAD 基线并解除 kb 合并阻断。
- ignore 标注就是被接受对称性的登记表：新厂商适配器连同标注一起复制模板，而包裹之外真正新增的重复仍会让门失败。
- `dsh-kb-embed-shared` 是两个 embed 供应商的已发布依赖；[kb P1 债务修正笔记](../feature/2026-08-29-kb-p1-debt-fixes.zh.md)仍拥有 Config 字段本身的决策。
- `deleteDocument` 在存在性检查前先取写锁，同身份删除恰好在删除了行时才报告 `true`。

## Verification

- `pnpm run duplication`：0 克隆、退出码 0（本变更前基线：29 对、退出码 1）。
- `pnpm vitest run packages/kb packages/llm examples/kb-agent`：68 个文件 / 1299 个测试全绿，含竞争删除回归测试。
- 逐文件 100% 覆盖率：`packages/kb`（全部 src，含 kb-embed-shared）与 `packages/llm/llm-minimax`（经 `--coverage.include`）。
- `pnpm run typecheck`、`pnpm run lint`（0 警告 / 0 错误）、`pnpm run build`、`pnpm run doc-sync`、`pnpm run hygiene` 全绿。
