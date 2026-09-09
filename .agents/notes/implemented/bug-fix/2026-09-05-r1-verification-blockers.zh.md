# Agent Note：终验阻断修复——keyless 挂死、审批流 lease、起草预算与模型 JSON 容错

Status: implemented

[English](2026-09-05-r1-verification-blockers.md) | 中文

## Problem

终验（production readiness verification，总分 77、code-review mandatory 58 FAIL）列出的 Go-live 阻断项集中在四处。其一（F-2）：`demo-full-journey.mts` 与两个 e2e 的 teardown 写了 `await new Promise(resolve => server?.close(resolve))`——可选链在 server 从未启动（keyless 全 SKIP 路径）时短路，promise 永不 settle，进程永久挂死，2/2 复现。其二（F-3）：`expert-order-e2e.cordis.yml` 与生产 `cordis.patch.yml` 的 expert-orders 段漏配 `draftMaxTokens`/`draftTimeoutMs`，seam 默认 4096 token 使真实 MiniMax-M3 起草的 DraftSpec JSON 中途截断（finish=max-tokens），订单落 failed——demo 与 nocobase-track 两份组合早已配 16384/120000，三处配置漂移。其三（F-4）：真实审批轨道上暂停生产 workflow 的 toggle 无 ok 校验，teardown 恢复时 `.catch(() => undefined)` 静默吞错，且 demo 的恢复条件是「clone 建成才恢复生产」——clone 创建半途失败时生产审批流被永久禁用。其四（D-1）：`parseDraftResponse` 对模型输出零容错，真实轨道上模型偶发的 JSON 噪声（前后缀说明文字、尾随逗号、截断）直接把订单打进 failed，是 nocobase-track e2e 6/6 失败的直接根因。

## Decision

### WorkflowLease：暂停→操作→无论成败恢复（examples/kb-agent/scripts/nocobase-workflow.ts）

demo 与 e2e 逐字重复的 NocoBase workflow 操作（暂停生产、搭四节点私有 clone、清滞留审批、解析 manual 任务）提取为共享模块，核心是 `WorkflowLease`：`pause()` toggle 生产 workflow 并只在 HTTP 应答确认 ok 后置 `paused` 布尔（toggle 是翻转语义，未经确认的暂停绝不被恢复性再翻转——失败的暂停直接抛错，不反向操作生产流）；`setClone()` 登记 clone id；`restore()` 先销毁 clone 再恢复生产，两个动作都执行（一个失败不阻止另一个），失败聚合抛出、绝不静默，成功后清空 lease 状态，二次调用不再翻转。demo 的顶层 teardown 以 try/catch 包住 `lease.restore()`，恢复失败作为一条 FAIL 场景记入结果表（退出码非零、实录仍落盘）；e2e 的 afterAll 记录恢复失败后继续执行其余清理。`closeHttpServer(server | undefined)` 以显式 `if (server === undefined) return` 替换可选链 close 陷阱，四份文件的 teardown 共用。`resolveEnv` 同步提取（demo/e2e 三处 ~150 行重复收敛为 `scripts/resolve-env.ts` 一个函数）。审批任务解析在 30 秒内等不到任务时返回 false（原语义 break），submit 失败抛错。

### 起草双防线：解析修复层 + 携错重试一次（packages/expert/expert-orders/src/draft.ts + index.ts）

第一层在 `parseDraftResponse` 内：严格 parse 失败后先走 `repairDraftJson`——单趟字符扫描（跟踪字符串字面量与转义），剥掉 JSON 前的说明文字、删除字符串外的尾随逗号、为「完整值之后的截断」补齐缺失闭合括号；修不好保持原错误大声失败。第二层在 `draftSpec` 运行时：解析失败（修复层也救不回时）携带上一次的解析错误重新请求一次起草（重试 prompt 明示「上一次输出不是合法 JSON（<err>）」），每次尝试独立 deadline；两次都失败按既有 failed 补偿语义落库。`finish !== 'stop'`（max-tokens 截断）与网络错误不重试——前者重试大概率再截断（根治靠 F-3 预算），后者是瞬时故障域。订单号随机尾从 4-hex 扩到 8-hex（同日碰撞空间 2¹⁶→2³²），keyless 快照的订单号归一化正则同步。

## Alternatives considered

**demo 场景 body 内 try/finally 恢复生产 workflow。** 否决：demo 的场景框架已捕获断言异常，teardown 顶层顺序执行同样覆盖早退路径；把恢复塞进 body 的 finally 会让「teardown 兜底」语义分叉成两处。

**repair 用正则删尾随逗号（`,\s*[}\]]`）。** 否决：正则分不清字符串字面量内的 `,]`（段落文本可含），误删会破坏内容；单趟扫描的成本与正则同阶。

**重试也覆盖 finish=max-tokens。** 否决：截断是预算问题不是抽样噪声，重试大概率再截断还白付一次 120s deadline；预算修复（16384）才是根治，截断保持大声失败进入故障排查文档。

**在 e2e 内联修 ?.close 而不提取 helper。** 否决：demo 与 e2e 的恢复条件已经分叉出一次生产禁用风险，再各修各的会把同一语义复制成第三份；共享模块让「暂停→操作→恢复」只有一个实现。

## Consequences

- keyless 环境（无 MINIMAX_API_KEY、无 NocoBase）跑 demo-full-journey：三场景自跳过并说明原因，进程 4 秒正常退出（退出码 0），实录落盘——缺少 `closeHttpServer` 的显式 undefined 守卫时，同一路径会永久挂死。
- 生产组合（cordis.patch.yml）与 e2e fixture 的起草预算对齐 demo/nocobase-track 样板（16384/120000），DraftSpec 在配置的起草预算内完整生成。
- 真实审批轨道上，clone 半途失败也必然恢复生产 workflow；恢复失败大声留痕——demo 记 FAIL 场景行，e2e 在 teardown 记日志后继续清理——二次 `restore()` 不会再翻转。
- 模型 JSON 噪声中「前缀文字/尾随逗号/截断补括号」三类被无重试吸收；其余解析失败消耗一次携错重试；两次失败仍按 failed 落库，不假装成功。nocobase-track e2e 实测复跑一次全绿（6/6，78s 全链路）。
- 所有 NocoBase workflow 动作（toggle/create/destroy/submit）与读路径（任务列表、任务状态）都校验 HTTP ok；NocoBase 侧任何非 2xx 都大声失败。
- plans/connector-lakehouse-nocobase/02-batches.md 的 N7 质量门矩阵如实呈报 hygiene 豁免计数：`./src/*` exports 模式豁免约 235 处，对既有基线约 225 处（含本工作线新增 10 包）。六项后续债登记于同文件遗留节：订单状态机三缺口、默认预设 connector 工具决策、kb_search 文件名检索通道、lakehouse 工具标题本地化、工作线 per-file coverage 缺口、connector_discover 关键词引导。
- QUICKSTART.zh.md 的检索阈值表述对齐实配 0.015，常见问题新增三条实测条目：起草 max-tokens 预算、模型 JSON 修复/重试路径、keyless demo 的 SKIP 语义。
- 订单号尾段 8-hex；`order_create` 快照经归一化（`ORD-<date>-<no>`）不受影响。

## Testing

`packages/expert/expert-orders/tests/draft.spec.ts` 以真实观察到的噪声形态锁定修复层（前缀说明文字、字符串内外逗号区分、转义引号与字符串内括号、截断补闭合、纯文本仍拒）；`tests/orders.spec.ts` 的 FakeLlm 扩展为脚本化序列（记录每次 prompt、可注入 finish/max-tokens 与流延迟），新增：噪声一次吸收不耗重试、携错重试一次收敛 delivered、两次失败落 failed（error 含 JSON）、deadline 超时落 failed、finish=max-tokens 落 failed。keyless 验证：移走根 `.env` 后 demo-full-journey 以 `env -u MINIMAX_API_KEY -u NOCOBASE_BASE_URL -u NOCOBASE_API_KEY` 运行，EXIT=0、4 秒退出、实录 `demos/full-journey-20260905-224146.md`。真实轨道复跑（NocoBase dev-server + 真实 MiniMax-M3）：`expert-order.e2e.ts` 17.2s 全绿；`nocobase-track.e2e.ts` 78s 全链路全绿（lease 暂停/恢复经真实后端校验）。typecheck/lint/doc-sync 全绿；expert-orders 单测 32/32；test:snapshot 118/128 过（8 失败全数落在既有基线豁免的 prebuilt dist 快照文件，与 kb 工作线零交集）。
