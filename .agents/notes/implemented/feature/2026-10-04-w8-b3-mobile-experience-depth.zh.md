# Agent Note: W8-B3 — 移动端体验纵深（游标轮询、工作数据随账号漫游、会话过期优雅处理）

Status: implemented

[English](2026-10-04-w8-b3-mobile-experience-depth.md) | 中文

W8 审计的 B3 批次（蓝图 §4-B3）：聊天新鲜度模型从全量窗口轮询改为 `afterSeq` 游标增量（按蓝图裁决不做 SSE），工作存储获得 NocoBase 上的按账号服务端投影（P0「数据随账号漫游而非随设备」债），失效的登录会话从静默报错改为优雅降级。fold/protocol/cardState 回放语义不动——轮询窗口变窄，事件回放方式不变。

## 问题

三项 P0 差距带入 B3：聊天每次轮询都重拉整个 200 条消息窗口并整体重折叠（running 态 1.2s 一轮，一轮对话要付出几十次全量传输）；工作项只活在 `dsh-mobile-work` localStorage——换设备或清浏览器数据即丢失，审计的硬验收「清 localStorage 后工作项存活」当时没有可存活的服务端；网关会话在服务端过期后只表现为逐调用的报错文案，从没有一条保留本地数据回到登录门的路。

## 决策

- **afterSeq 游标（B3-1）**：`session.history` 增加 `afterSeq`（与 `beforeSeq` 互斥，schema 强制）——前向读只返回严格新于游标的事件，不分页、`hasMore: false`、不带 projections 基线（持游标者已有基线）。presenter 视图仍按完整切口解析，新 tool-result 引用游标前的 call 时呈现与尾页一致。客户端（`messages/chat/historyFeed.ts`）在 ref 里累积窗口：首拉全量，后续读增量页（按 seq 去重）追加，fold 仍跑完整累积数组——回放语义与轮询模型自身完全一致。两道重校准护栏不依赖网关知道 compaction：单页超过 40 事件或累计 30 轮强制下次全量；页面恢复可见也重校准（`usePageVisible`）。running 窗口 1.2s→800ms。`usePoll` 的 `active` 门在 ChatView 与壳层常驻 Tab（`tabAwake`；`hidden` 只管布局，恢复不闪烁）接可见性。
- **工作投影（B3-2）**：`wfl_mobile_work`（每账号每客户端 `client_id` 一行，`(user, client_id)` 唯一索引）。读走通用 `nocobase.list`——网关把派生用户名压入行过滤（匿名拒绝），复刻 wfl_alerts 行级 scope 先例，客户端伪造他人过滤无法放宽；`nocobase.get` 取行后校验归属。写走两个专用入口——`nocobase.mobileWorkSave`（按 clientId upsert；账号从 token 派生并强制写入行）与 `nocobase.mobileWorkDelete`（用户限定的查找；他人行不可见故删除幂等成功）——wfl_「状态机拥有单一入口」姿态（alertAct）的第二次应用；`nocobaseWflWriteScopes` 不加行。`workSync.ts` 拥有 WorkItem↔行映射：store 写操作通知注册的 sink（单向依赖——workStore 不 import 同步层），操作按 id 合并、串行 drain，失败落入 `dsh-mobile-work-outbox` 持久队列退避重试，`syncWorkFromServer()`（壳挂载/重登）合并服务端行（updatedAt 新者胜）并上传本地新增。未登录或离线时保持纯本地演示形态。
- **过期优雅（B3-3）**：wire 错误保留 `code`（`RpcFailure`），`rpc()` 把 `nocobase-unauthorized` 路由进 `handleSessionExpired()`——清 token、提示一次、通知订阅者（App 根落回登录门）；工作项、草稿与两个 outbox 全保留，重登后回灌并 `kickOutboxFlush()`。登出清两个 outbox（离场账号的操作不得在下次登录下落地）；过期刻意不清。
- **B2 移交清偿**：`wfl_alerts.created_at` 在真实表上从未存在（机会主义读取永远 undefined）。`w8b3-mobile-work.mts` 以 `timestamptz NOT NULL DEFAULT now()` 落列（扫描器 INSERT 未改动即开始盖章；存量行回填）并注册字段元数据，预警时间戳从此渲染真实数据。

## 证据

- 新 spec：`session-history-after-seq.spec.ts`（游标语义 + schema 互斥）与 `nocobase-mobile-work.spec.ts`（行级读、强制归属保存、幂等删除）——6/6；`work-sync.client.spec.ts`（feed 累积器、映射、回灌、过期分流、afterSeq payload）——6/6。
- 活体验收 `demos/acceptance-w8/w8-b3-probe.log`——新代码网关实例（:13800，拷贝 DSH_HOME）上 **11/11**：首拉全量/后续带游标；增量应答约为全量基线的 12%（267KB→31KB）；登录 seed 的真实写入落库服务端；清空 localStorage 重登后回灌；keeper 看不到 buyer 任何行（泄漏=0）；毒化 token 回到登录门且工作数据保留，重登恢复。截图 `w8-b3-01..04-*.png`（375px）。
- `w8b3-mobile-work.mts --assert`：schema/索引/回填 + create→list→destroy 往返，全部对活体 :13000 通过。
- typecheck 干净；`build:lib:client` + `apps/web` vite build 绿；w7-b6 暗轨矩阵与 w8-b1 light probe 复跑通过。

## 复盘中浮现的修复

- 首版活体探针想点聊天列表行进入会话，但拷贝的 DSH_HOME 没有历史行——探针改为直接走 `session.create` 建会话。
- mobile-work spec 的 stub 表跨测试泄漏（模块级数组）；mock 改为每测重播种，list stub 补上了此前忽略的 `client_id` 条件——三处归属断言自此才有意义。
- `type: 'bool'` 不是 NocoBase 字段类型；建表脚本改声明 `boolean`。

## 已知残留与移交

- `wfl_mobile_work` 冲突解决按客户端 `updated_at` last-write-wins（按账号 UI 状态，非审计单据）；双设备并发编辑收敛到后落库的写入。
- 投影读单页 100 行；账号超过约 100 项时回灌静默截断（本地行不受影响仍在）。
- demo seed 每次清空首跑重铸新 id，探针多轮跑会在服务端累积 `demo: true` 行；验收清理腿删除它们（真实使用登录从干净开始）。
- #⑪（wire 级未读数、Tab 徽标）按蓝图裁决继续 deferred——游标工作未改变其任何前提。
- 蓝图 §8 的条件承诺（动 rpc.ts 时顺带加 `AbortSignal.timeout`）未兑现：B3 为过期路由改了 rpc.ts 但未加——未实现，rpc 面当前依赖网关自身超时。
- fixture 的 `session.history` 忽略 `afterSeq`（只读 `beforeSeq`），fixture/离线退化模式下每轮轮询重读全量窗口；客户端按 seq 去重保住累积窗口的正确性——浪费传输，不是回放错误。

## 备选方案

- **SSE/mux 流替代游标轮询**——蓝图已裁掉（网关 events 通道成本 vs 增量轮询收益）；游标拿到负载削减而无需通道。
- **增量 fold（只 fold 新事件）**——否决：此规模折叠累积窗口是微秒级，保持 fold 输入完整即原样保留回放契约（红线）。
- **写路径走通用 `nocobase.create/update`**——wire 没有 create，且限定 scope 的 `nocobase.update` 表达不了行归属；专用入口保持单一入口姿态并把归属校验放在服务端。
- **新表进 `nocobaseCollectionScopes`**——wfl_ 表族走引擎表读面 + 网关行级 scope（wfl_alerts 先例）；scope 表只管业务集合，`wfl_mobile_work` 不是 docs 深链对象（无需 docsCatalog 镜像）。

## 后果

- `session.history` 有两种读模式；新的 wire 消费者必须保持 `beforeSeq` 与 `afterSeq` 互斥（schema 强制）。
- 移动工作项成为登录账号下的多设备状态；假设设备本地性的功能（如按设备的演示清理）本地仍可用，但会经投影传播。
- 未来的 wfl_ 族表落地都面临本文的同一三选一：集合门读面 + 网关行级 scope，或专用写入口——永远不给裸列白名单行。
