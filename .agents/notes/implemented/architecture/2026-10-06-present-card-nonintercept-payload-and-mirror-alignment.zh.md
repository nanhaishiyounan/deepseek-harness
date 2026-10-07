# Agent Note: present_card 不拦截载荷声明与 widget/null 双端对齐 — W21-R2

Status: implemented

[English](2026-10-06-present-card-nonintercept-payload-and-mirror-alignment.md) | 中文

## 问题

W21-R1 验证器复跑给出两个发现：

1. **框架层 matched-0 残余是真实的，不是理论面。** 验证器 num 腿（session-c86a6a7e，seq289）发出对象载荷，其 `report.metrics[].kind` 是臆造值 `"id"`；框架 oneOf 走查以 `must match exactly one oneOf branch (matched 0)` 拒绝——不含字段路径——模型盲改一轮后侥幸通过。该腿 2/3 收场，证伪了 R1 note 的「零观察」立场与本批 3/3 的结论口径。
2. **`widget` 必填性双端分歧。** 服务端 schema 在两个位置（`ask_field.field.widget`、`form_draft.fields[].widget`）声明为可选，ui-mobile 解析器却必填——服务端合法的载荷可以 concludeTurn 成功、客户端折叠 degraded，正是端到端断链形态。

同一审计还暴露一族宽容度分歧：可选集合 `null`（rows/table 客户端按省略、服务端拒绝；actions 双端都拒但规则不同）、客户端对省略呈现提示的默认值（`mode`/`variant`/`allowFreeText`/`suggestions`）、实测捕获的 `create-task` `text` 别名折叠、审批 state 的中文拼写——都是客户端宽容、服务端拒绝的形态。

## 决策

**`payload` 声明为 `type: 'json'`，框架匹配器不再拒绝任何载荷形态；一切违规由 execute 侧 resolve 走查带中文字段路径与合法候选值返回。** exact-one 的 `oneOf` 无法在九个严格分支旁挂兜底分支——合法对象会双匹配以 `matched 2` 被拒（与 R1 的 `number`+`integer` 标量联合同坑）——因此九分支骨架保留为走查的权威，模型侧指引移入参数 description（各分支字段/枚举表）加 persona 的成例。seq289 形态现在返回 `payload.metrics[1].kind 应为 "count"/"money"/"percent"/"text" 之一（收到字符串 "id"）`。

**双端对齐，逐项裁决。** `widget` 服务端两个位置补 `required: true`（客户端本就严格；卡片缺它无法渲染——客户端口径胜出）。无枚举/const 约束的可选叶子收到显式 null 按「留空」省略；服务端走查新增该规则，客户端 `report.actions` 与 rows/table 统一——三个可选集合双端行为一致。可选枚举叶子收到 null 仍拒绝（present-but-illegal），与客户端一致。客户端围栏路径的宽容（呈现提示默认值、`text` 别名折叠、中文 state）为旧围栏会话回放刻意保留，工具路径不可达（服务端先拒绝这些形态）——记入工具 README，不强行对称。

persona 两句过时表述（「数字会整卡被拒」「payload 必须是对象」）按现行机制改写，`.dsh` preset 投影字节一致重新同步。

## 备选方案

- **只放宽声明 schema 中的枚举/判别字面量** — 否决：框架 oneOf 仍会无路径拒绝缺必填、多字段的对象载荷；残余面缩小而非关闭，「零 matched-0」的口径又要靠运气背书。
- **改 `packages/core/tools` 的 oneOf 失败路径化** — 再次否决：共享底座；为一个消费方的诊断把全部工具的匹配器语义与测试拖进影响面。

## 后果

- 框架层载荷拒绝在结构上不可达：任何无损 JSON 值都进入 `resolvePresentCardPayload`，模型总能拿到带路径的修正目标。
- schema 承载的生成指引被有意移除；首发命中率现在依靠参数 description 表与 persona。R1 note 对该形态的否决在此凭实证证据翻案，非偏好反转。
- `PresentCardPayload` 两处 `widget` 类型化为必填；缺它的 fixture 会挂——现有 fixture 均不缺。
- 双端在一切无字面量约束的可选叶子上对 null 语义一致；其余不对称项已枚举、限定围栏回放范围并记档。

## 验证

- `pnpm vitest run packages/interaction/tool-present-card`（66 测试：13 条枚举越位全覆盖表、经 `ctx.tools.execute` 的 seq289 复刻断言路径化文本且无 `matched`、双端 widget 缺省拒绝、null 集合规范化）、`pnpm vitest run packages/client/ui-mobile`（815 测试含镜像语料）、e2e `mobile-assistant-toolcard` 4/4。
- [demos/acceptance-w21/](../../../../demos/acceptance-w21/) 下的活体复验（`w21-r2-*` 证据）：num ×3 强化诱导、枚举越位活体 ×1。
