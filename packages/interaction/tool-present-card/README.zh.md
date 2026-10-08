# @deepseek-ai/dsh-tool-present-card

[English](README.md) | 中文

面向模型的 `present_card` 工具：移动端智能填表助手的确定性结构化卡片通道。结构化卡片（选择追问、字段追问、表单草稿、落库回执、报告、审批卡、计划卡）改走经校验的工具调用，取代概率性的 ```dsh 文本围栏；四类用户动作载荷（`form_confirm` / `reject_flow` / `approval_confirm` / `plan_confirm`）仍由客户端按钮构造围栏，刻意不在本工具范围内。

## 工具

`present_card` 接受一个必填参数：

- `payload` — 不拦截的 `json` 型声明（W21-R2）：任何无损 JSON 值都能通过框架匹配器；以 `type` 判别的封闭九分支契约（`ask_choice` / `ask_field` / `form_draft` / `submit_receipt` / `report` / `approval_pending` / `approval_result` / `plan_suggest` / `plan_result`，每个分支固定 `v: 3`）由 execute 侧 resolve 走查执行、错误带中文字段路径；各分支字段与枚举表随参数 description 提供给模型。分支与 `@deepseek-ai/dsh-client-ui-mobile` 协议模块中 assistant 侧 `DshPayload` 接口同形。

### 宽容接受与路径化错误（W21-R1）

P3 确定性矩阵捕获了一个失败族：模型在 id/value/数量类叶子上发裸数字（`"value": 13`、报告表格裸数字单元格），或把 payload 传成 JSON 字符串，而 oneOf 的 `matched 0` 错误不含字段路径，重试空转无法自纠。机制面修复（两侧校验器同步）：

- id/value/数量类叶子位（各 id、选项/建议值、字段值、摘要值、指标值、表格单元格、`qty` 等）接受 `string | number`；`execute` 以显式的 `resolvePresentCardPayload` 步骤把有限数字规范化为字符串后再走结构校验。coerce 后的规范化载荷与等价的全字符串载荷行为完全一致——回执、落库、渲染均不变。布尔值、数组、对象及越位的 null 仍拒绝。
- 必填标量叶子拒绝空串，错误带字段路径（`payload.options[0].label 不能为空字符串`，W21-R3）——双端同判，关闭「服务端收下 `""` 并结束回合、客户端折叠成 degraded」的分歧。两处空串是合法语义、与客户端逐字一致：form_draft 字段 `value` 的 `""` 保留「落库后生成」语义，报告表格空白单元格保留为空单元格。
- 字符串 `payload` 先 JSON.parse（解析失败与非对象结果仍拒绝）。
- execute 侧每条结构违规都给出中文字段路径与期望类型（`payload.options[2].value 应为字符串或数字（收到布尔值 true）`），一轮重试即可命中。

### 不拦截的载荷声明（W21-R2）

验证器 num 腿复证推翻了 W21-R1 的残余面表述（「零观察」）：对象形态载荷的枚举越位（`report.metrics[].kind: "id"`，会话 seq289）仍先被框架 oneOf 走查以无路径的 `matched 0` 拒绝、到不了 execute 的路径化层，模型盲改一轮才侥幸通过。修复：`payload` 声明为 `type: 'json'`，框架匹配器不再拒绝任何载荷形态——包括枚举与判别字段越位在内的一切违规都进入 `resolvePresentCardPayload`，带字段路径与合法候选值返回。exact-one 的 `oneOf` 无法在九个严格分支旁再挂兜底分支（合法对象会双匹配被拒），因此九分支骨架保留为走查的权威、其模型侧指引移入参数 description。同批：`widget` 双端改为必填；无枚举/const 约束的可选叶子收到显式 null 按「留空」省略（与客户端解析器一致），可选枚举叶子收到 null 仍拒绝。

结构约束进 schema；schema DSL 表达不了的条数上限（无 `minItems`/`maxItems`）在 `execute` 里手工校验：ask_choice options ≥1；form_draft fields ≥1、revision ≥1、`value: null` 仅允许 `required` 层字段；submit_receipt 与 approval_pending summary ≥1；report metrics 1–6、rows ≤8、table ≤5 列 ≤10 行且每行宽度=列数、actions ≤4。违规抛 `ToolArgsError`，错误信息带参数路径，模型据此在同一回合内修正重试。

### 回滚 runbook（W22）

回滚 W22 确定性栈须两 commit 连带 revert：R1（`bed1a834a3`，widget 判定器 + 表单契约）留下的 `form-contract.ts` 引用了一个只有 R2（`b092a00b31`）才补上 `@deepseek-ai/schemastery` 依赖声明的包，单 revert R1 无法构建——按 `git revert b092a00b31 bed1a834a3` 的顺序连带回滚。

### actions 宽容（W21-R8）

一次供应链实活会话连续 4 次折叠同一 actions 嵌套错误、最终靠删按钮才出卡。原始捕获显示两种写法：包装键（`{"view":{"label":…,"route":…}}`——旧参数描述的紧凑联合记法正是这么读的）与缺 `kind` 判别字段的扁平对象；4 次错误一字不差、只列四个 kind 值，模型始终学不到「扁平判别字段」这一合法形态。修复（客户端解析器镜像同步）：resolve 解包包装键；`kind` 缺失且恰好一个分支的其余必填字段齐备时补上判别值（显式非法 `kind` 绝不被覆盖；`{label,route,title}` 这类歧义签名仍拒绝）；单个 actions 对象提升为单元素数组；判别失败错误追加四枚具体 JSON 骨架（`{"kind":"view","label":"…","route":"…"}/…`）让一轮重试命中；参数描述改为扁平形状+可照抄示例。persona few-shot 补 view 形态与「kind 是同级字段、不是包装键」规则。

### 确定性 widget 与表单契约（W22-R1）

W22 验证的十连复读抓到模型在机械可判定事实上掷骰子：`widget` 命中率仅 50%（`quantity` 声明成 `text`）、pur_orders 必答字段集 3/10 次整缺（品名/数量/单价不上卡）、一次漂移到未注册集合（`hub_inv_products`）。三项机制收回这些决策面。其一，widget 判定器：结构校验通过后，`form_draft` 字段与 `ask_field` 字段过 `src/widget.ts` 的字段名/label 分类（`quantity`/`qty`/`unit_price`/`amount` 等数量金额族 → `number`，`need_date`/`received_at` 等日期族 → `date`，非空 `options` → `select`；note 族字段名与 备注/说明 label 词先于金额/日期片段钉住声明——W22-R2）。session log 与模型上下文保持模型声明（模型可见⟺logged），渲染控件跟随分类结果——移动端客户端在渲染折叠层镜像同一条规则（`dsh-client-ui-mobile` 的 `src/client/widget.ts`；purity 门禁禁止跨插件值导入，规则表以镜像对交付、共享 fixtures 双端钉死）。其二，可选的 `formCollections` 配置（`src/form-contract.ts`）：键即集合白名单（未注册的 `form.collection` 整卡拒绝并列出合法候选），每集合的 `requiredFields` 声明字段下限——字段必须出现在卡上让用户可改，值可以预填或留 null；每组列出同义列名（`quantity`/`qty`）与错误引用的业务名。顶层配置键拼错在启动即报错（否则 `formCollections` 拼错会被读成「未配置」而静默跳过约束）。两条报错路径都返回模型一轮可修正的中文字段路径错误；配置为空或不配置则不做任何约束，通用部署保持无契约行为。

成功调用执行 `exec.concludeTurn()` 并返回 `{ presented: true }` 与固定回执文案：卡片即回合收尾物，用户的点选或确认作为下一条普通用户消息到达，且明确禁止模型替用户作答。Fire-and-forget：工具从不等待用户输入——与既有围栏 UX 逐位等价。

## 角色

本包是在 `ctx.tools` 上注册一个工具的 Consumer 型插件。不渲染 UI、不读服务：呈现由移动端客户端折叠 `tool/call` 事件完成（P2），桌面 web 端显示通用工具行。Render intent 为 `generic`——输出是固定文本块，工具结果的纯函数。

## 协议镜像义务

`tests/fixtures/` 是双侧共享的黄金样本：工具 schema 与客户端 args 级校验器（P2）必须接受/拒绝同一批 envelope。任何协议变更须在一个 PR 内同改两个包与这些 fixtures。

## 模型体验

### 工具 schema

#### 模型看到什么

模型看到生成的 [`present_card` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-present-card)：单一 `payload` 参数（json 型；各分支字段与枚举表随参数 description 提供）。校验失败返回带中文字段路径的错误结果，期望模型修正后重试（persona 契约约定最多两次，之后用业务语言如实收尾）。

#### Token 开销

工具可见的每个请求承担固定 schema 成本——九分支联合是「一条确定性卡片通道」替代「围栏散文格式」的代价。

#### KV Cache 影响

schema 随组合静态不变，工具定义前缀跨请求完全一致、保持缓存友好；payload 实参本身逐次调用而变。

## 已知局限与延后工作

- **框架层载荷拒绝：已无（W21-R2 关闭 W21-R1 残余面）** — 声明的 `payload` 接受任何无损 JSON 值，无路径的 `matched 0` 诊断在结构上不可达；一切载荷违规都在 execute 侧带字段路径返回。刻意保留的镜像不对称：客户端围栏解析器对省略的呈现提示（`mode`/`variant`/`allowFreeText`）仍取默认值、折叠实测捕获的 `create-task` `text` 别名、并把中文审批状态词（`草稿`/`待审批`/…）归一为英文枚举——仅服务于旧围栏会话回放；工具路径不会触达（服务端先拒绝这些形态，客户端无从渲染）。W21-R4 反向关闭了一处不对称：省略的 `field.suggestions` 在客户端与服务端 schema 同判拒绝。可选文本叶子仍不对称但渲染等效：服务端保留空串（W21-R3 合法性），客户端围栏解析器把它等同省略。
- **「最多重试两次」是契约约束而非机制约束** — agent loop 没有 per-tool 重试上限；上限与如实收尾规则由 persona 契约承担。
- **桌面 web 呈现为通用工具行** — 尚无 `presentCall` 专属呈现（Fast-Follow）。
- **四类用户动作载荷未工具化** — 设计上保持客户端构造围栏；对称工具化是记录在案的未来选项，不是缺口。
