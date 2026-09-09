# Agent Note：NocoBase 无头消费面 —— apiproxy nocobase 域与 nb_* 业务工具

Status: implemented

[English](2026-09-06-nocobase-business-tools.md) | 中文

## Problem

plans/nocobase-native-integration 的 V2 批（03-batches.md）：agent 要能在会话里读写 NocoBase 业务数据——先理解业务（collections、行），再以对话内 diff 确认方式变更，不搞表单也不静默写。计划盲区 B 定论（PLAN.md B-6）固定了通道：V1–V4 用自建窄面 REST 工具复用 `NocoBaseClient`；MCP 通道是 V6 的对照评估批，不在本批。

## Decision

### 一个 client、三个消费方——共享面长在 client 包里

受限筛选词汇（扁平 `{field, op: eq|in|gt|lt, value}` 条件加单一 and/or 连接，由 `compileNbFilter` 编译）与 schema 发现调用（`listMeta`）落在 `dsh-connector-nocobase`，因为 agent 工具与 apiproxy 域都要消费。任意操作符树绝不跨消费方边界——模型只命名字段与操作数，永远摸不到这四个之外的原始 `$operators`。`NocoBaseClient.list` 增加可选 `sort`/`fields`/`appends`、`get` 增加可选 `appends`——纯增量 wire 参数，零既有调用方改动。

### 工具套件是新包（`tool-nocobase`），不是 tool-connector 加行

`tool-connector` 拥有的是数据集面（discover/fetch/transfer/order）；业务记录 CRUD 是另一个关注点，有自己的降级模式（凭据在加载期解析；缺失时工具照常注册，每次调用以结构化的无凭据拒绝失败）。五个工具：`nb_collections`（schema 发现；隐藏集合默认剔除）、`nb_list`（受限筛选、排序、投影、≤100 有界分页）、`nb_get`、`nb_create`（落地回执）、`nb_update`（先读行，回执带逐字段改前→改后对比与存储行）。每个工具拒绝 `tenant` 实参——服务账号即部署侧权限边界（tool-kb 先例）。

### 对话内确认 = 提示词指引 + 回执，不是工具状态

03-batches.md V2 钉死了确认语义：SKILL/persona 指引驱动流程，工具本身不带 UI 确认状态。每个写工具的 system-prompt 段写明契约（先呈现完整预览/改前→改后对比，获得明确同意后才调用；缺槽先追问、绝不编造业务取值；只改点名字段），回执（create 的落地 id、update 的 diff）让对话能复述实际落库的内容。`nb_update` 在一次调用内先 get 后 write，机械保证回执的 `before` 反映调用时刻的行。keyless 快照断言结构性事实——确认步骤之前只有读到达后端；with-NC e2e 断言落库合并并销毁测试行。

### apiproxy 域读路径先行

`nocobase.listMeta/list/get` 挂在 `nocobaseEnabled` 之后（未启用 = 每方法 `nocobase-not-composed`；启用但无可解析账号 = `nocobase-unavailable`；后端拒绝折叠为 `nocobase-request-failed`；wire 行为 null = `nocobase-row-missing`）。写绝不跨 wire 面——留在带确认契约的 agent 工具上，无鉴权网关永远不变更业务记录。凭据按网关惰性解析一次（缓存 promise），先走 credentials 缝再走环境；connection fake client 补了 `nocobase` 节，浏览器路径对 V6 的 ui-business 页保持类型完备。

## Alternatives considered

- **把工具加进 `tool-connector`** —— 否决：该包拥有数据集面（discover/fetch/transfer/order）；业务记录 CRUD 有自己的降级模式与确认契约，且计划文件清单已点名新包。
- **工具调用期 approval 门替代提示词承载的确认** —— 延后：03-batches.md V2 把语义钉死为对话内流、工具无 UI 状态；硬门留给未来批次按部署需要补。
- **筛选词汇放在工具包共享** —— 反转：词汇落在 `dsh-connector-nocobase`，因为 apiproxy 域同样消费（一个 client、三个消费方）。
- **apiproxy 直通写面** —— 否决：无鉴权网关永远不变更业务记录；写留在确认契约之后的 agent 工具上。

## Consequences

- `examples/kb-agent` persona 与 `enterprise-data-assistant` 预设带上业务分流句（业务记录→nb_*；文档→kb_search；统计→lakehouse_query）与确认式变更段；预设描述不再声称"仅检索类工具，无破坏性操作"。
- keyless 快照 `nocobase-tools.spec.ts` 在 mock resourcer 上锁定整条模型可见动线（schema → 筛选读 → 变更前读 → diff 更新 → 回读 → create 回执）；`DSH_SNAPSHOT=refresh` 再生。
- with-NC e2e `nocobase-business.e2e.ts` 在真实种子后端跑同一动线（读张红喜、UUID 标记 create、diff 更新、裸 client 回读、destroy 清理），凭据不可达时自跳过，与 `nocobase-track` 同构。
- 随计划延后：kg_* 工具（V4）、消费 `nocobase.listMeta` 的 ui-business 页（V6）、MCP 通道对照（V6 决策批）、webserver `/nocobase` 反代调试开关（计划内可选；暂无消费方）。
