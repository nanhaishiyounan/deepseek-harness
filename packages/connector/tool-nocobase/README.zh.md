# @deepseek-ai/dsh-tool-nocobase

[English](README.md) | 中文

面向模型的 NocoBase 业务工具：`nb_collections`（schema 发现）、`nb_list`/`nb_get`（行读取）、`nb_create`/`nb_update`（确认式写入）与 `nb_approve`（通用审批引擎驱动），全部构建在共享的 [`NocoBaseClient`](../connector-nocobase/README.zh.md) 之上。

## 工具面

- **`nb_collections`** — 列出每个可见集合及其字段（名称、类型、关系目标）；`include_hidden: true` 才包含隐藏集合。每个业务问题的第一步。
- **`nb_list`** — 按受限筛选词汇（`{field, op: eq|in|gt|lt, value}` 条件，`match: and|or` 连接）查询一个集合的行，支持排序（`-` 前缀 = 降序）、字段投影与有界分页（`page_size` ≤ 100）。
- **`nb_get`** — 按 collection + id 读单行；确认流程要求的变更前读取。
- **`nb_create`** — 落一行新记录；回执带服务端分配的 id 与存储行。
- **`nb_update`** — 先读当前行，只改点名字段，回执带逐字段改前→改后对比与存储行。挂激活审批流的单据在锁定态（审批中/二级审批中/已生效/已作废）拒绝直接编辑。
- **`nb_approve`** — 驱动一张单据走审批引擎（submit / approve / reject / void；对已驳回单据 submit 即重提，轮次+1；供应商准入流走生命周期词表 potential → reviewing → qualified）。回执回显状态转移、锚点对、轮次与是否生效。`nb_create` 先跑下游卡口：doc_status 卡口拒绝引用未 `approved` 上游单据的行（「未生效」），生命周期卡口（供应商 AVL 规则）拒绝向 `lifecycle_status` 不在配置集合（qualified,preferred）内的供应商下采购单（「未准入/不合格供方」），全部 fail-loud。

## 确认式变更契约

对话内确认承载在系统提示指引里，而非工具状态：agent 必须先呈现拟变更（nb_create 的完整新行；nb_update 基于 `nb_get` 的逐字段改前→改后对比；nb_approve 的单据摘要与拟执行动作），获得用户明确同意后才调用写工具。工具本身不带 UI 确认状态——由 persona 驱动 预览 → 同意 → 回执 的流程，回执让对话能复述实际落库的内容。

审批规则（状态词表、doc_status 锚点、含金额阈值路由的转移表、卡口拒绝文案）全部在 [`src/approval-rules.ts`](src/approval-rules.ts)——脚本引擎（`examples/kb-agent/scripts/approval-engine.mts`，NocoBase workflow 回调入口）与本工具共用的唯一代码真源，两个入口在规则上不可能漂移。每次动作向 `wfl_approval_records` 追加一行（谁/何时/动作/意见/轮次 五要素）；未建 `wfl_*` 集合的部署保持引擎接入前的写行为（卡口与锁探测对 404 视为空）。 W2-B5 起两级金额阈值走流配置行的 extras（`amount_threshold`，由 `thresholdOf` 解析、缺键回退 `DEFAULT_AMOUNT_THRESHOLD`），approver_map 的角色值可写多用户（或签，每人一行待办）。

## 配置

```yaml
- id: tool-nocobase
  name: '@deepseek-ai/dsh-tool-nocobase'
  config:
    baseUrl: http://127.0.0.1:13000   # or NOCOBASE_BASE_URL
    apiKeyEnv: NOCOBASE_API_KEY       # credential reference, defaults to this name
    readTimeoutMs: 10000               # nb_collections/nb_list/nb_get budgets
    writeTimeoutMs: 60000              # nb_create/nb_update budgets (update runs get+write)
    approvals: true                    # register nb_approve (default true)
```

凭据先走 credentials 缝，再走受信任的启动环境。凭据缺失时工具照常注册——每次调用以结构化的无凭据拒绝失败（本套件文档化的降级模式），而不是让组合失败。租户绝不是模型输入：每个工具拒绝 `tenant` 实参；客户端所用服务账号即权限边界。

## 模型体验

### System prompt

#### What the model sees

工具启用期间有五段指引常驻系统提示，逐字如下。

##### nb-collections 指引

```markdown
Use the nb_collections tool before any other nb_* call when the conversation names a business record type you have not seen: it lists every visible collection with its fields (name, type, relation targets). Ground collection and field names in this listing instead of guessing.
```

##### nb-list 指引

```markdown
Use the nb_list tool to answer questions over business records: name the collection from nb_collections, filter with the restricted conditions (field, op eq/in/gt/lt, value; joined by match and/or), sort with leading `-` for descending, and page when count exceeds page_size. Answer from the returned rows and name the collection.
```

##### nb-get 指引

```markdown
Use the nb_get tool to read one business record by collection and id — the current values you need before proposing any change (the nb_update confirmation diff) and the follow-up read after a write.
```

##### nb-create 指引

```markdown
Use the nb_create tool only AFTER the user explicitly confirmed the new record: draft the full row first (fields grounded in nb_collections), show it as a preview in the conversation, and ask for the go-ahead. Fill missing slots by asking — never invent business values. One call lands the row and returns the receipt with the server-assigned id.
```

##### nb-update 指引

```markdown
Use the nb_update tool only AFTER the user explicitly confirmed the change: nb_get the row first, show the field-by-field before→after diff in the conversation, and ask for the go-ahead. Update just the fields the user asked to change. The call answers the same diff as its receipt, plus the stored row.
```

#### Token effect

五段固定成本指引（合计约 230 token），每个组合注册一次。

#### KV Cache effect

按节名键控的静态文本；跨会话相同，位于每个缓存前缀的头部。

### Tool schemas

#### What the model sees

模型看到生成的 [`nb_collections`、`nb_list`、`nb_get`、`nb_create`、`nb_update` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-nocobase)。`nb_collections` 声明可选 `include_hidden` 布尔；`nb_list` 声明必填 `collection` 加可选 `filter`（封闭 eq/in/gt/lt 条件）、`match`、`page`、`page_size`、`sort`、`fields`；`nb_get` 声明必填 `collection` 与 `id`；`nb_create` 声明必填 `collection` 与 `values`；`nb_update` 追加必填 `id`。都不声明 `tenant`。

#### Token effect

五个 schema 合计约 200 token。

#### KV Cache effect

静态 schema 文本；缓存稳定。

### Tool results

#### What the model sees

schema 发现按集合渲染小节，含字段（展示名与关系目标）；行读取渲染分页头加每行一行 JSON；nb_create 渲染落地回执（分配的 id 与存储行字段）；nb_update 渲染逐字段改前→改后对比及存储行。

#### Token effect

`nb_collections` 随集合数线性（每字段行约 10 token）；`nb_list` 受 `page_size` 约束（默认 20、上限 100）；写回执固定且小。

#### KV Cache effect

工具结果是每轮内容；绝不进入缓存前缀。

## 已知限制与延后工作

- 读写都走部署侧服务账号；不按用户模拟 NocoBase 角色。
- 筛选词汇是封闭集（eq/in/gt/lt 加单一 and/or 连接）；任意操作符树在设计上就不支持。
- 确认契约承载于提示词指引；后续批次可为需要硬 UI 拦截的部署补工具调用期的 approval 门（interaction 缝）。
