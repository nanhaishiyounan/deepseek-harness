# N24 证据：Portal 表单 AI 入口替换为 AI 智能员工（2026-09-10）

批次 N24（plans/nocobase-ai-experience-2026-09-10.zh.md §4 N24）。两个 Portal 的 4 个表单挂载点由失败的 AiFillPanel（硬编码 `form-assistant` 员工 + 45s 一次性补全超时）整体替换为「AI 智能员工」头像按钮 + 内嵌聊天面板（员工 dex，流式输出，formFiller 前端工具回写），对齐 N18 原生弹窗填充体验。

## 挂载点清单（4/4 改造）

| Portal | 挂载点 | 表单文件 | formId |
|---|---|---|---|
| CRM | /pipeline/create（商机新建抽屉，即报障点） | `platform/nocobase-portals/demo-portal-crm/src/pages/crm/deals/form.tsx` | `crm-deal-create` |
| CRM | 线索新建抽屉 | `platform/nocobase-portals/demo-portal-crm/src/pages/crm/leads/form.tsx` | `crm-lead-create` |
| Hub | /expenses/create（报销新建抽屉） | `platform/nocobase-portals/demo-portal-hub/src/pages/finance/expenses/form.tsx` | `hub-expense-create` |
| Hub | 销售线索新建抽屉 | `platform/nocobase-portals/demo-portal-hub/src/pages/sales/leads/form.tsx` | `hub-sales-lead-create` |

## 改造文件清单

新增（两个 portal 各一份，内容一致）：

- `platform/nocobase-portals/demo-portal-crm/src/components/ai-employee-fill/ai-employee-fill.tsx` + `index.ts`
- `platform/nocobase-portals/demo-portal-hub/src/components/ai-employee-fill/ai-employee-fill.tsx` + `index.ts`

`useAiEmployeeFill(options)` 返回 `{ trigger, panel }` 两个渲染节点：trigger 是抽屉底部（取消/提交按钮旁）的 dex 头像按钮；panel 是表单内容区顶部的内嵌 ChatInline 聊天面板。装配关系（全部复用 vendored 组件，零新依赖）：

- **表单注册**：`useAIFormRegistry().register(...)` 注册 formFiller 目标；`useAIPageElement({ kind: "form", getContext })` 注册页面元素，发送前每次重新解析（模型总能看到表单当前值），getContext 内置 formFiller 使用说明并追加各表单的领域 instructions（沿用原 aiFields 常量与 instructions）。
- **聊天面板**：`AIChatProvider controller defaultEmployee="dex"` + `AIChatWindow`（vendored 流式渲染：Thinking… 推理面板逐字输出 + Form Filler 工具卡片，填充过程全程可见——原「填充 15~100s 无反馈」债就此消解）。
- **触发**：点击头像 → 本地 `AIChatController.triggerTask({ aiEmployee: "dex", context: [表单引用] })` → 打开面板并以表单为工作上下文开新会话（`getAIWorkContextRequiredTools` 自动声明 formFiller 工具）。
- **超时**：流式通道（`client.stream`）无客户端超时；原 45s 超时随 AiFillPanel 一并删除，M3 推理 15~100s 不再结构性失败。
- **双击防抖**：挂载侧守卫 `openingRef + controller.getSnapshot().open`（500ms 窗口 + open 状态检查），双击只开 1× 面板/会话；未改任何 vendored 共享组件。
- **formFiller 自动放行**：vendored `AIChatProvider` 对 formFiller 拒绝自动放行（`canAutoApproveToolCall` 硬编码 false），而服务端以其 defaultPermission=ALLOW 标记 auto=true 并中断等待前端执行——实测中断后审批卡片不浮现、工具卡停在「运行中」死锁。panel 内挂载侧 `FormFillerAutoApprover` 组件对本面板会话中的 formFiller 中断调用直接 approve（与 N18 原生弹窗自动执行行为对齐），其他工具仍走正常审批。

移除与改写：

- `platform/nocobase-portals/demo-portal-crm/src/components/ai-fill/`（ai-fill-panel.tsx / use-ai-fill.ts / ai-fill-client.ts / index.ts，两个 portal 各一份）——硬编码 `form-assistant` 员工与 45s 超时的失败实现整体删除。
- `demo-portal-crm/src/pages/crm/ai-assistant.tsx` 的 `CRM_AI_EMPLOYEE` 由不存在的 `crm-assistant` 改为 `dex`（页面级快捷按钮随之生效）。

文案：`ai.employeeFill.open/close/placeholder` 三键加入两个 portal 的 `src/locales/en-US.ts` 与 `zh-CN.ts`（「AI 智能员工 / 收起 AI 面板 / 用中文描述这条记录…」）。

## 构建部署

`node --import tsx/esm examples/kb-agent/scripts/nocobase-portal-deploy.mts`（两 portal `pnpm build` → dist 整目录替换 `platform/nocobase/storage/dist-client/<name>/`）。部署后探活：`/dist/crm/` 200、`/dist/hub/` 200；`aiEmployees:listByUser`（admin 登录态）可见 dex（9 内置员工全量可见，无需补 rolesAiEmployees 绑定）。

## 浏览器实录结论（n24-capture.mjs，2026-09-10 终跑全绿）

脚本：`examples/kb-agent/demos/nocobase-full-features/n24-capture.mjs`（Playwright，zh-CN locale，登录 admin@nocobase.com；`/dist/*/.../create` 深链无 SPA 回退，故从 portal 根进入后用合成 popstate 驱动路由到 `/dist/crm/pipeline/create` 与 `/dist/hub/expenses/create`）。等待窗口 240s（M3 推理 15~100s，实测波动大：有轮次 40s 内完成，也有轮次超 150s，见遗留问题）。

CRM /pipeline/create 端到端：

1. 抽屉底部按钮旁出现「AI 智能员工」dex 头像按钮（N24-01）。
2. **双击防抖**：dblclick 后 `[data-ai-employee-fill] .ai-chat-window` 计数 = 1（N24-02）——仅 1× 面板/会话窗口。
3. 中文意图「漯河一家中型调味品企业，名叫N24验收购销合同，金额18.6万，目前还在询价阶段，备注：N24实录创建」→ 流式回复（think 链 + Form Filler 工具卡）→ formFiller 回写：title=「N24验收购销合同」、amount=186000、notes=「N24实录创建」（3 个文本字段 + stage 下拉=询价 inquiry，共 4 字段，N24-03）。
4. 人工补选必填客户「漯河宏发食品有限公司」（客户为关系选择器，不在 AI 字段清单内，N24-04）→ 提交。
5. 落库核对（API）：`crm_deals` 新行 id=17，amount=186000、stage=inquiry、customer_id=1（N24-05）。
6. **清理（try/finally 保证，全流程包裹）**：crm_deals:destroy:200 + 两个验收会话 aiConversations:destroy:200；复核 crm_deals 验收行=0、aiConversations N24 会话=0。二跑不残留。

Hub /expenses/create 挂载点：头像（N24-06）→ 面板（N24-07）→ 中文意图「N24验收差旅费，郑州到广州客户现场支持，2026年8月12日，金额2680元，状态待审核」→ formFiller 回写 title=「N24验收差旅费」、amount=2680（N24-08）。本实例无 `hub_fin_expenses` 集合（全部 hub_fin_*/hub_sales_* 表不存在，先于 N24 的实例侧缺口），提交必 404，故 Hub 验收止于填充演示后取消抽屉——与任务书「Hub 至少 1 个挂载点同样走通一轮」一致。

截图（`examples/kb-agent/demos/nocobase-full-features/`）：N24-01 头像按钮旁置、N24-02 双击防抖+面板打开、N24-03 中文填充、N24-04 客户补选、N24-05 落库行、N24-06/07/08 Hub 三步。

## 遗留问题

1. **M3 填充延迟波动**：同一意图实测 40s~240s+ 不等，个别轮次 240s 窗口内未完成填充（未调用 formFiller 即到时）。属 MiniMax-M3 推理非确定性，非本批代码缺陷；聊天式流式已消解用户侧无反馈问题。
2. **实例 schema 与 Portal 模板存在先于 N24 的错位**：`crm_deals` 集合无 `title`/`notes` 列（模板期望有；现表列为 `name`），提交可成功但这两个字段被服务端丢弃——落库断言以 amount+stage 为准，title/notes 值见 N24-03 截图。`crm_contacts.name` 列缺失导致客户选择后联系人查询 500（不影响交易创建）。Hub 侧 `hub_fin_*`/`hub_sales_*` 集合整体缺失。如需完整落库，可后续批次经 REST 增补列/集合（不在 N24 范围）。
3. formFiller 审批卡片不浮现的死锁为 vendored 运行时缺陷（auto=true 的前端工具中断后，共享审批 UI 依赖的 requiresApproval 翻转未发生）；本批以挂载侧自动放行绕开，未改共享组件。全局聊天面板（悬浮球入口）若模型主动调用 formFiller 仍会停在「运行中」。
