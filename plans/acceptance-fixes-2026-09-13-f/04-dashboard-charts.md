# 批次 F4：仪表盘图表增强（裁决批）——Chart 区块试点 + AI 生成图表示范 + 可选行级 AI 动作

> 隶属 [PLAN.md](PLAN.md)。前置：F2（两仪表盘页已 v2 表格化）。本批是**增强批不是升级批**：给「客户仪表盘/销售仪表盘」叠加 ChartBlockModel 让页名名副其实，并示范 2.2.6 可用的 AI 生成图表链路。**有明确降级出口**：图表程序化不可行时页面保持 F2 终态不受损，仅文档记录。

## 依据（调研实证）

- ChartBlockModel 三面俱全：客户端注册（[plugin-data-visualization client-v2](../../../platform/nocobase/packages/plugins/@nocobase/plugin-data-visualization/src/client-v2/plugin.tsx:51)）+ server 白名单（node-use-sets STATIC 组）+ 官方矩阵 createSupported=true（[support-matrix.ts:214](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/support-matrix.ts:214)）；插件实机已启用（data-visualization + echarts，亲证 pm:list）。
- 官方 fixture 为**骨架态**：[`chart-block-live.canonical.json`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/__tests__/flow-surfaces-fixtures/chart-block-live.canonical.json) 仅含 `chartSettings.configure{query:{mode:'builder'}, chart:{option:{mode:'basic'}}}`——真实图表的 query（聚合维度/度量）与 chart option（图类型/系列）配置不在 fixture 里，需从 [`chart-config.ts`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/chart-config.ts) 的 CHART_QUERY_MODES/CHART_VISUAL_MODES 枚举与 chart 读写测试（`flow-surfaces.chart-write.test.ts`）反推。
- AI 面：chatbox 的 `chart-config` workContext（[plugin-ai client-v2/plugin.tsx](../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client-v2/plugin.tsx:133)）+ ChartGeneratorCard 工具卡 = 对话中 AI 生成图表配置——2.2.6 可用（B 路报告 §4）。

## 改动面

### 0. 第 0 步探查（决定本批走全量还是降级）

| # | 探查项 | 方法 | 产出 |
|---|---|---|---|
| 0-1 | Chart 完整配置的程序化形态：真实 query（collection/measure/dimension/filter）与 chart option（type/series/axes）在 flowModels props/stepParams 的落点 | 读 chart-write 测试内嵌 payload + `chart-config.ts` 全文 + data-visualization 的 chart 配置 schema（server collections `charts` 表是否为后端真源——v1 图表体系存 `charts` collection，v2 ChartBlockModel 引用其 id 还是内嵌配置需实证） | 直发 payload 模板（1 个真实图的完整 JSON） |
| 0-2 | ChartBlockModel 与 TableBlock 并列（仪表盘页 = 已有 TableBlock + 新 ChartBlock） | F3 工作台双块先例（若成）直接复用；否则同款探查 | 双块页 spec |
| 0-3 | 行级 AI 动作（AIEmployeeActionModel）props 形态与挂载点 | [AIEmployeeActionModel.tsx](../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client-v2/models/ai-employees/AIEmployeeActionModel.tsx:96) createModelOptions 官方默认 props + RecordActionGroupModel 挂载示例 | 试点 spec（可选任务） |

### 1. 图表种子（若 0-1 成功）

在 F2 脚本追加或新段：

- 客户仪表盘页 BlockGrid 追加 2 个 ChartBlockModel：客户按行业分布（维度=industry，度量=count）、客户按来源（source）分布——具体维度以 crm_customers 实际字段为准；
- 销售仪表盘页追加 2 个：回款按状态/按月（crm_payments 实际字段定）；
- 图表配置幂等：确定性 uid `n17f4chart-<页>-<序号>`，已存在即 kept；
- **不破坏 F2 脊柱**：图表追加后 v2TreeComplete 校验项不变（TableBlock 三件套照旧，Chart 为增量）。

### 2. AI 增强示范（低代码量）

- QUICKSTART 增「AI 生成图表」一段：在任意 v2 页悬浮球对话里让 AI 员工生成图表（chart-config workContext + ChartGeneratorCard），配 1 张实拍截图；
- （可选任务）0-3 成功则在「客户仪表盘」表格挂 1 个行级 AIEmployeeActionModel 试点——失败/超时则跳过，不阻塞本批。

### 3. QUICKSTART 更新

两仪表盘页定位说明（表格视角 + 图表视角）；AI 生成图表用法；若降级则记 UI 手工配置路径（admin → 仪表盘页 → 添加区块 → Chart，官方 UI 可配——createSupported=true 保证）。

## 实施步骤

1. 0-1~0-3 探查 → **裁决点**：payload 可程序化 → 继续；不可行 → 降级路径（仅 §2/§3，半小时收尾）；
2. 图表种子 + 幂等；
3. 浏览器验收（图表渲染真实数据、悬浮球对话生成图表演示）；
4. （可选）行级 AI 试点。

## 验收断言（真实浏览器）

**成功路径**：
1. 客户仪表盘/销售仪表盘页各渲染 ≥2 个图表，数据与表格行数对账（如行业分布总和=20 客户）；
2. 页面既有 TableBlock 与 Add new 不回退（F2 断言复跑）；
3. 悬浮球对话中 AI 生成 1 个图表（截图，对话含图表渲染）；
4. 幂等二跑图表 kept；
5. （可选试点成）行级 AI 动作出现且可发起。

**降级路径**（探查失败时）：
1. 两页保持 F2 终态（回归断言全绿）；
2. QUICKSTART 记录：程序化不可行实证（0-1 探查输出存档 `demos/acceptance-f4/probe-chart.md`）+ UI 手工配置路径指引；
3. AI 生成图表示范照做（不依赖程序化图表，悬浮球链路独立可用）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| Chart 真实配置程序化不可行（fixture 骨架态暗示复杂度） | **中高** | 明确降级出口（本批设计即含）；探查成本上限半天 |
| ChartBlock 渲染空块/报错（echarts 依赖链） | 中 | 单图试点先行；失败即走降级，不留半成品 |
| 图表种子破坏 F2 页 kept 判定 | 低 | Chart 追加不改脊柱校验项；二跑断言 kept |
| AI 生成图表链路依赖 chatbox 前端工具注册（ChartGeneratorCard） | 低 | 独立于图表种子；失败仅少一个演示截图，不阻塞 |

**回滚**：图表节点按 uid destroy（幂等种子自带 kept/destroy 对称）；两页回 F2 终态即完整回滚。
