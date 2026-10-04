# Agent Note: W6-R1：mobile 同步修复 —— acted_at 投影、单据深链守卫、发件箱幂等、统一登录会话

Status: implemented

[English](2026-10-01-w6-r1-mobile-sync-fixes.md) | 中文

- Date: 2026-10-01
- Status: implemented
- Area: feature
- Scope: `packages/client/ui-mobile`（台账/单据/待办/发件箱/对话/我的/根组件）、`packages/host/apiproxy`（登录会话、scope 表、prompt 幂等）、`packages/connector/tool-nocobase`（匿名审批门禁）、`examples/kb-agent`（列名防复发断言腿、QUICKSTART 夜间运维）
- Evidence: `demos/acceptance-w6/w6-r1-01…`（live：engine+gateway+NocoBase，psql 对账）、`demos/acceptance-w6/gates-r1.log`

## Problem

B0/B1 验证轮点名的 mobile 债：深链守卫放进外来路由，草稿重提可双发。

## 改了什么

1. **P0-1（G3 live 全静默失败的列名）**——月度投影与单据审批轨迹过滤用了 `created_at`，而 `wfl_approval_records` 表没有该列（实为 `acted_at`）：每次读取静默匹配零行。`myMonthlyRegistrations` 改按 `acted_at` 过滤，月边界取客户端本地月初的完整 ISO 时刻（UTC 日期切片会把本地月初前几小时切进上月）；轨迹读 `acted_at`。「我的」页两腿台账独立落定（`Promise.allSettled`）：服务端投影失败显示 读取失败 并留 `client_error` 痕，不再拖垮本地最近回执。`w6b1-sync.mts --assert` 新增列名防复发腿：live schema 必含 `acted_at`（且不含 `created_at`）、两处源码用到的过滤/轨迹列必须都在 schema 中、`acted_at` 全表非空、G3 月度投影 NocoBase API 与 psql 对账一致。
2. **P0-2（单据深链越权 IDOR）**——两层：`#/docs/*` 路由复验角色白名单（`collectionAllowedFor`；已配置角色越权集合弹回目录并提示，未配置账号对主管类用户保持 fail-open）；网关服务端同表强制——api-gateway 配置 `nocobaseCollectionScopes` 按用户名映射集合，登录用户越集合访问以 `nocobase-collection-forbidden` 拒绝（buyer 深链 `qm_inspections` 在 wire 层读零行）。客户端目录是 UX；配置表才是边界。
3. **P0-3（发件箱双发窗口）**——每条外发消息携带 `clientMsgId`；`session.prompt` 按会话记住已接受 id（128 环），重复到达直接答 accepted 不再派发——离线重试与响应丢失双发都在服务端收敛。发件箱升到 v2 形态：条目带幂等键、多标签页经 `BroadcastChannel` 同步（外加 `storage` 事件兜底）、flush 跳过本页已发送成功的 id（`outbox.dedup_hit`）、仅传输层 TypeError 重排队——服务端拒绝只上报、绝不重发。
4. **P0-4（登出身份漂移）**——登出清空发件箱（`clearOutbox`：行加进行中的重试计时器，一条 `outbox.dropped` 痕）；离场账号的暂存消息不再可能以下一个登录身份发出。`nb_approve` 对匿名会话直接拒绝——审计链必须有登录行为人（原先匿名直通回落 admin）。
5. **P1-1（PC/mobile 统一用户体系）**——`nocobase.signIn` 签发网关会话 token（12h、进程内注册表）：prompt 的行为身份由 token（`authToken`）派生，绝不采信客户端叙述的 `loginUser`；`nocobase.list/get/update` 携带 token（读走 scope 表，`nocobase.update` 无有效 token 直接拒——PC 内联写路径）。伪造 `loginUser` 绑定不了任何身份，匿名会话的 `nb_approve` 拒绝；匿名浏览保持开放（PC 读面）。
6. **P1-3/P1-6（文案+可观测）**——单据列表五十行封顶时明示；传输失败统一中文 网络连接失败（不再裸 "Failed to fetch"）；对话审批翻转按集合自身状态列（`doc_status`/`status`/`lifecycle_status`）读取，过账类集合也能落 他端已处理；台账/单据/待办读失败留结构化 `client_error` 痕并渲染错误卡，绝不静默画杠；详情页用 schema 中文标题替代 snake_case 列名。
7. **P1-5（真话债）**——B1 gates log 的 16/16→14/14、389→388 行与 assert log 一致；B1 note 的 tool-nocobase 数与当轮记录一致（48/48）；「mobile 动作绕不开审计链」改述实态（审批走 acting-user 闸门；匿名单据浏览存在）。

## 为什么选这些 seam

- 登录 token 放网关（不放 NocoBase）：网关是 nb_* 工具所依赖的 acting-user 注册表的策略点，网关重启注销全部会话与该注册表同一立场。
- scope 表是部署配置（`nocobaseCollectionScopes`）而非代码：角色表是按站点的业务数据，mobile 目录只是镜像，不应两边都是代码。
- prompt 幂等环是进程内存：发件箱重试窗口是秒到分钟级，远小于任何重启；重启同时也清掉了双发风险。

## 值得守住的不变量

- 身份只在服务端派生：prompt 或 nocobase 调用只绑定网关签发 token 解析出的身份；单凭 `loginUser` 绑定不了任何东西。
- 发件箱只在传输失败时重试；服务端拒绝的消息绝不重排队（重复可能双执行）。
- 列名防复发断言腿读 live schema 而非 fixture：引擎改列名时先在断言腿失败，而不是 mobile 再度静默空读。

## 验证

- `pnpm run typecheck`（0 error）；vitest：ui-mobile 663/663（新增 ledger-service/docs-view/todos-view 三套 + outbox v2 例 + views todos/docs 路由引用）、tool-nocobase 49/49（新增匿名拒绝例；mock-world 用例绑定行为人）、apiproxy 467/467（新登录会话套件：签发、scope 拒绝、update 门禁、prompt 盖章、clientMsgId 去重）；oxlint staged 改动文件 0 error。
- `w6b1-sync.mts --assert` 21/21 含新列名防复发腿。
- live 证据 `w6-r1-01…08`：buyer 本月条数对 psql、深链弹回+wire 层零行、双标签页+响应丢失 psql count=1、登出清箱、伪造 loginUser 被拒、截断/文案/错误态截图。

## 后续

- 登录会话注册表是进程内的；多进程网关部署横向扩展前需要共享存储（当前单站点）。
- 推送通道仍是待办/单据轮询的最终替代（与 B1 立场一致）。

## Alternatives considered

- **mobile 端逐页防护 vs 网关/引擎统一守卫**——选统一守卫：单一执行点，负例可重放。

## Consequences

成本：守卫逻辑落在网关。买到：深链/幂等/越权三类负例可从断言腿重放。
