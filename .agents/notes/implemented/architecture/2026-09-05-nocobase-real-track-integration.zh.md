# Agent Note：NocoBase 真实轨道——来自 2.2.6 实例的 wire 纠偏、审批 workflow 与附件交付

Status: implemented

[English](2026-09-05-nocobase-real-track-integration.md) | 中文

## 问题

N3–N5 批次对话的 mock NocoBase 按调研报告的 REST 摘要（v1 时代形态）建模。N6 要让同一份 DSH 代码跑在真实 NocoBase 2.2.6 上：可复现地拉起后端、在其上落专家数据集 collections 与张会长种子、经 workflow 引擎接通订单审批并用 request 节点回调 DSH 的 `orders.fulfill` RPC 入口、把每份交付 PDF 作为真实附件挂回订单行。mock 的 wire 假设从未被真实服务器检验过。

## 决策

**以真实实例为唯一 wire 权威；mock 跟随。** 拉起源码仓（postgres、`yarn nocobase install`、`dev-server`）并逐一探测端点后，发现五处与 v1 形态假设的分歧，现已全部编码进 `NocoBaseClient` 并由 mock 镜像：(1) POST body 顶层即 action 的 values——`{values: {...}}` 包装会存出一个字面 `values` 字段；(2) 每个 JSON 响应都有 `{data, ...}` 包装，必须解包；(3) list 返回 `{data: rows, meta: {count, ...}}` 而非 `{count, rows}`；(4) 缺失行返回 200 + `{data: null}` 而非 404，因此 `get` 解析为 `undefined`；(5) 行更新经 `POST /api/<collection>:update?filterByTk=<id>` 寻址——v1 式 `/<index>:update` 路径根本未注册（404）。workflow 引擎的纠偏更深：collection 触发器的 config 取 `mode` 位图（`CREATE: 1`）而非 `event` 字符串；经 REST 创建并 `enabled: true` 的 workflow 落库时没有挂 db hook——一次 off/on toggle 循环才挂上；processor 的作用域按节点 **key**（`$jobsMapByNodeKey.<uid>._`）索引 job 结果而非节点 id；collection 触发器的 `$context` 是 `{data: <row>}`，行 id 在 `$context.data.id`；request 节点的 `contentType` 会原样变成 Content-Type 头，必须写 `application/json`（网关的写防护对其他值回 415）；关联加载用裸 `?appends=deliverable` 而非 JSON 对象。`setup-nocobase.mts` 编码了以上全部；其 `verify` 步骤断言最终状态。

**审批 workflow 四节点，manual 的两个动作都是 RESOLVED，主链显式链接。** collection 触发器（orders，mode CREATE）→ `manual`（assignees `[1]`，表单 `f1` 带动作 `resolve`/`reject`，两者 status 1）→ `condition`（`{{$jobsMapByNodeKey.<manual key>._}} == "resolve"`，`rejectOnFalse: false`）→ 真分支：`request` 节点以 `{{$context.data.id}}` 变量向 `/api/orders.fulfill` POST 网关的 client-request 信封；假分支：`update` 节点写 `status: failed, error: 审批驳回`。manual 两个动作都取 RESOLVED，是因为 REJECTED 的 job 状态会在任何分支运行前终止 execution——按所选动作 key 分支才能让驳回路径可达。manual→condition 主链还需显式写 `downstreamId`：只声明 `upstreamId` 会让 execution 停在 manual 节点（分支子节点按 `upstreamId` + `branchIndex` 挂接，主链兄弟节点不是）。DSH 的 fulfill 管道本身已在真源回写全部状态，通过分支无需额外 update 节点。

**附件交付是 fulfill 的一部分，本地文件是缓存副本。** PDF 落盘 `workspace/deliverables` 后，管道经 `attachments:upload`（multipart，字段 `file`）流式上传，并把返回的附件 id 挂到订单行的 `deliverable` 附件字段（`belongsToMany` + `interface: attachment`，由 setup 脚本随普通列一同创建）。存储相对 url（2.2.6 上为 `/files/...`）存为 `deliverableUrl`，经 orders API 与订单工具投影；上传或挂载被拒使整次运行落入既有 failed-带-原因 补偿——真源上没有附件的"已交付"订单等于错误报表。

**collection 定义避开时间戳列。** NocoBase collection 自带 `createdAt`/`updatedAt` 系统 DATE 列；用 string 字段重声明任一同名会替换列类型，使 Sequelize 拒绝自己的自动时间戳写入（`string violation`）。五个种子 collection 只声明业务字段；种子里的 ISO 字符串仍可写入系统 DATE 列。数值列用 `float`（`number` 不是字段类型）。

**幂等是逐工件先探测后创建；reset 即删库。** collections、种子、workflow 各自检查存在即保留；API key 每次 init 重新签发（先吊销同名 key，保证 `.env` 里的凭据是唯一存活的）。`reset` 删除数据库并重跑 install + init——唯一保证干净的路径。

## 后果

真实轨道 e2e（`nocobase-track.e2e.ts`）在真实后端上跑完整旅程——真实 collections 上的发现、真实订单行、经 workflow-tasks API 解决的 manual 任务、request 节点对 DSH 侧 `orders.fulfill` RPC 语义端点的回调、PDF 落盘、以及本地交付物与 NocoBase 附件的字节一致比对——后端或凭据不可达时自跳过并留说明测试。它把 workflow 的 request 节点重定向到自己的回调端口（3080 空闲则用之，否则随机端口），结束后恢复配置的 url，因此测试不依赖长驻 `dsh web`。mock 及其测试随修正后的 wire 迁移，keyless 轨道与真实轨道现在检验同一份 client 行为。`NocoBaseClient.get` 返回 `undefined`（而非抛 404）简化了订单缝的缺行处理。发现把查询翻译为 `$includes` 子串过滤，整句查询什么都匹配不到——调用方（与 e2e）用确实出现在种子字段里的词查询。

## 考虑过的替代方案

- **保留 mock 的 v1 形态 wire 并在 client 里翻译**——一个后端两套词汇；每个新端点都要记一条翻译规则。真实 wire 是更便宜的唯一真相。
- **仅界面配置 workflow + 校验脚本**（计划的 MVP 回退）——REST payload 事实上可以从插件源码完全推出，且脚本化 workflow 能在数据库重置后存活，程序化路径胜出。
- **REJECTED 状态的驳回动作**——读起来自然，但 execution 死在 manual 节点，驳回分支（状态回写）永远不跑；两个动作都 RESOLVED、按 `result._` 分支是与 UI 兼容的模式。
- **后端用 sqlite**——sequelize 的 sqlite 方言需要源码仓不随附的 `sqlite3` 原生包；本地 postgres（brew）加官方安装路径才是受支持路线。
