# Agent Note: W 轮 R2 写入守卫 — 引擎侧撞号拒绝、脚本超时、沪日界与十六表单欢迎屏

Status: implemented

[English](2026-09-26-w-round-r2-write-guards.md) | 中文

## Problem

W 轮验证遗留四项缺陷：模型发出的单据编号可能与既有行撞号（纯提示词纪律已放行过一次——B5 #1）、kb-agent 脚本域的 `fetch` 遇到卡死的 NocoBase 或代理会永久挂起、`kpi-run` 按 UTC 分桶「今天」导致 20:00 UTC 起的回放把沪次日的数据写错日期、发布的欢迎屏仍宣传十类表单而注册表已有十六类。

## Decision

**撞号守卫在引擎侧 fail-loud。** dsh-tool-nocobase 的 `CODE_UNIQUENESS_COLUMNS` 命名六个守卫集合（五个 `code` 列加 `wms_receipts.receipt_no`）；`enforceCodeUniqueness` 在任何 create 写入前做一次过滤 list 读，编号已被他行占用即拒绝，错误消息带四要素（集合、列、编号、占用行 id）。列映射落地前对数据库核实过实际列名；只读 psql 扫描确认存量零重复，启用守卫不会困住脏表。

**脚本域 fetch 带逐请求超时。** nocobase-flow-page-lib 的 `call()` 为每个请求包 `AbortSignal.timeout`（默认 30s，`NOCOBASE_TIMEOUT_MS` 覆盖），超时报错点名方法、路径、预算与覆盖入口。

**KPI 日分桶用 `shanghaiDate()`。** kpi-run 三处 UTC「今天」读（PRESENT_ONLY 判定、回填起点、`--calc-kpi`）共用一个 UTC+8 格式化器；selftest 钉住 20:00 UTC（沪次日）、15:59（当日）、16:00（翻日）三个边界。

**欢迎屏镜像注册表。** preset.yml 的 `welcome.capabilities` 按注册表顺序列出全部十六个 biz name（花名册的 质检记录 名称纠正为注册表的 质检登记），`.dsh` 部署镜像逐字节一致。

## Consequences

重复单据编号现在在工具内部以业务可读消息拒绝，不再静默落库；卡死的后端以具名超时暴露，脚本不再挂死；90 天 KPI 回放按上海操作员的日期观分桶；移动端空态与发布 preset 对十六类表单口径一致。

## Alternatives considered

- **提示词侧编号纪律** — B5 #1 已证失败；引擎边界是所有调用方必经的唯一层。
- **全局 fetch agent 单一超时** — 比逐调用预算粗；混合廉价探针与重调用的脚本需要调用级控制。
- **服务端时区分桶** — KPI 分桶是客户端读 `calc_date`，不是服务端默认值；格式化器应放在读取处。

## Verification

`r2-01..04` 证据（方括号扫描前后、13 测试欢迎屏输出含 16 表单断言、六集合活体查重、挂死端口 223ms 超时）；`pnpm vitest run packages/client/ui-mobile packages/connector/tool-nocobase` 663/663；`setup-nocobase.mts verify` OK；note 门禁全绿。
