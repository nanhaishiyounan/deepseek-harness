# Agent Note: kb P1 债务修正——embed 退避可配置化与 sqlite 双连接测试

Status: implemented

[English](2026-08-29-kb-p1-debt-fixes.md) | 中文

## Problem

P0 闭环验证两轮通过，但点名了三项机械债务：kb-agent 闭环 fixture 的头注释通过 `../..//` 笔误指向已删除的 `examples/kb-agent/cordis.yml`；kb-sqlite store 的 WAL + busy-timeout + BEGIN IMMEDIATE 并发机制没有显式的双连接测试（只有单连接 `:memory:` 规格）；两个 embed provider 都把 `RETRY_BACKOFF_BASE_MS = 100` 硬编码为模块常量，而旁边的 `maxRetries` 却可配置——与 `dsh-llm` 的 `BackoffConfig` 模式不对称。

## Decision

### F1：fixture 注释指向现行入口

`examples/kb-agent/tests/fixtures/kb-closed-loop.cordis.yml` 现在指向 `../../cordis.patch.yml`——D4 删除独立示例配置后的真实入口；`examples/kb-agent` 下没有其他文件引用已删除的路径。

### F2：双连接并发由 worker 持锁钉死

`packages/kb/kb-sqlite/tests/concurrency.spec.ts` 在同一临时文件上打开两个 `SqliteKbStore` 实例，覆盖：已提交写入的 WAL 跨连接可见性；busy-timeout 化解——一个 `worker_threads` 持锁者在另一线程执行 `BEGIN IMMEDIATE` 并于 150 ms 后提交，第二个连接的 `putDocument` 在 5 s busy timeout 内等待并成功；busy-timeout 耗尽时以 SQLITE_BUSY 直接失败，`terminate()` 释放锁后恢复；以及跨两个连接交错进行的 12 次 `putDocument`，stats 计数与逐文档检索精确无误。持锁者必须是 worker：store 的 SQLite 调用是同步的，主线程永远无法在第二个连接等待时释放锁。eval 字符串 worker 使用 CommonJS，vitest 无需在其内部做 TypeScript 转换。

### F3：退避常量改为 Config 字段，默认值不变

两个 embed provider 均暴露 `backoffBaseMs`（默认 100，即原常量）与 `backoffMaxMs`（默认 2,147,483,647——Node 可调度的最大 `setTimeout` 延迟，默认因此等效于指数增长不设上限）作为 schemastery 字段，带 `step(1).min(1)` 校验；`backoffMaxMs` 同时以该平台上限封顶。单个退避槽为 `min(base × 2^attempt, max)`；[P0 修正 note](../bug-fix/2026-08-29-kb-agent-p0-fixes.zh.md) 中的 50–100% 均匀抖动与每次重试的 debug 日志保持不变。resolved-options 接口与 `apply` 接线逐字段对照 `maxRetries`。

## Alternatives considered

- **完全照搬 `dsh-llm` 的嵌套 `BackoffConfig` 对象** —— llm 策略还携带 `jitterRatio` 与模式语义，embed 缝用不上；两个扁平字段已命名此处全部可配项，无需引入一套策略词汇。
- **给 `backoffMaxMs` 设一个较小的默认值（如 30 s）** —— 会在大 `maxRetries` 配置下改变已发布行为，违背本债务"默认保持不变"的契约；`setTimeout` 上限是唯一表现为"无上限"的默认值。
- **用两个同线程 store 测 busy 化解** —— 不可能：单线程同步 SQLite 将 `putDocument` 调用串行化，任何连接都观察不到他人持有的锁；worker 线程是最小且如实的测试装置。
- **用假定时器做退避时序断言** —— 重试循环将真实 HTTP 与本地 mock server 交错；把 `Math.random` 桩在 0.99 能精确钉住每个延迟，同时保留真实定时器下的真实请求路径。

## Consequences

- 部署方可以在 `cordis.yml` 中放慢 embed 重试风暴（`backoffBaseMs`）或约束最坏重试延迟（`backoffMaxMs`）；默认值精确复现原有时序。
- 该并发规格是 kb-sqlite 首个从两个连接针对文件级 WAL 数据库的测试；未发现 src 缺陷——机制本就正确，只是缺测试。
- `docs/config-catalog.md` 及其中文副本携带新字段（生成器只写英文文件；zh 侧代码块为逐字英文，手工同步），两个 embed README 三件套同步记录了字段。

## Verification

- `pnpm vitest run packages/kb examples/kb-agent`：19 个文件 259 个测试全绿。
- `pnpm vitest run packages/kb --coverage.enabled --coverage.include='packages/kb/*/src/**'`：每个 src 文件语句、分支、函数、行均 100%。
- `pnpm run typecheck`、`pnpm run lint`（0 警告 0 错误）、`pnpm run doc-sync`（28/28 门）全绿。
