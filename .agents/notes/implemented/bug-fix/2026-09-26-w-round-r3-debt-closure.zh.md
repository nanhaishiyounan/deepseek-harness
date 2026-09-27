# Agent Note: W 轮 R3 债务清偿 — nb_update 侧门、DB 唯一后盾与真文件镜像测试

Status: implemented

[English](2026-09-26-w-round-r3-debt-closure.md) | 中文

## Problem

W 轮终验带债通过（88 分，5 Important + 6 Minor）：改 code 的 `nb_update` 补丁完全绕过 create 侧撞号守卫；守卫的 list→write 检查是未披露的 TOCTOU 且无数据库后盾；镜像测试用手抄字符串断言 preset 欢迎屏而不读发布文件；preset `description` 仍数十类；本地欢迎屏兜底四条对 preset 五条；R2 批次没有 Agent Note。

## Decision

**update 路径跑同一前置检查并带 `excludeId`。** `enforceCodeUniqueness` 增加可选 `excludeId`；查重读取至多五个占用者，任一非自身行持有该编号即以 create 侧同款四要素消息拒绝，重输自身编号合法。`nb_update` 在编辑锁检查后、写入前调用；不含守卫编号列的补丁不触发查重。

**TOCTOU 已披露且有后盾。** 守卫 JSDoc 与 write 模块头声明非原子窗口、缓解措施（串行写路径、fail-loud 重试）与根治指称。根治以 setup-nocobase 的 `stepUniqueDocIndexes` 落地：每个守卫列一个部分唯一索引（`WHERE <col> IS NOT NULL AND <col> <> ''`，与守卫的空号语义一致），前置重复检查以计数 fail-loud，先于任何 CREATE INDEX 撞约束错误。`all` 链与独立 `unique-indexes` 命令幂等执行（`IF NOT EXISTS`）；`verify` 断言六索引在位。回滚是 `DROP INDEX IF EXISTS`——不动数据、立即生效。

**镜像对真文件测试。** registry spec 从磁盘读 `preset.yml`（js-yaml 从根 manifest 解析——不是 ui-mobile 的依赖），断言第一条 capability 与 `registryCapabilityLine()` 派生逐字相等、`description` 按注册表顺序枚举十六个 biz name、`.dsh` 部署副本逐字节一致、本地兜底（无 wire 块时的 `welcomeOf`）与发布 capability 各行相等。兜底补上缺失的第五条（库存/补货/盘点），本地会话与发布 preset 现在说同样的五件事。

**配置错误自己报名字。** `NOCOBASE_TIMEOUT_MS` 在 import 时拒绝非整数、零与负值，报错为 `NOCOBASE_TIMEOUT_MS 必须为正整数毫秒，当前值 …（解析为 …）`。

## Consequences

重复编号现在三层拒绝（工具前置检查、数据库索引、REST 错误回显）；镜像漂移在 `pnpm vitest` 即失败而非部署时；update 侧门以与 create 一致的措辞关闭；W 轮 R2 批次有了自己的记录。

## Alternatives considered

- **NocoBase 字段级 `unique`** — 元数据路线在已安装部署上不可靠；SQL 部分索引直接、幂等且可逆。
- **`$ne` filter 实现 excludeId** — 依赖 mock 后端未实现的服务端操作符；JS 侧过滤五个占用者的读取精确且可测。
- **部署时镜像检查** — vitest 真读文件失败更快，且每个 PR 都被门禁而非只在部署。

## Verification

`r3-01..04` 证据：vitest 670/670（663 基线 + 3 个 update 守卫负例 + 4 个镜像测试）；`unique-indexes` 应用、幂等重跑、活体 REST 重复 → HTTP 400 且空号合法、DROP → 重复落库 → 重建 → 重复再拒的回滚闭环；`setup-nocobase.mts verify` OK 含新索引断言；typecheck 干净；staged oxlint 0 errors（2 个 unused-disable 警告早于本批）。
