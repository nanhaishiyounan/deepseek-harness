# 批次 2：填表审核闭环 + 提交落库（移动端完成 PC 端没有的"提交"）

> 前置：[01-shell-chat.md](01-shell-chat.md) | 产出：对话补槽 → 草稿卡（可编辑+选择判断控件）→ 提交确认卡（人审）→ 落库回执 → 驳回重填 全闭环

## 1. 范围

- 草稿卡升级：字段按 collection 字段类型映射为可编辑控件（Input/Picker/DatePicker/Switch/Stepper，m2o 下拉经 nocobase.list 拉选项）；
- 提交确认卡（人审）：字段锁定 + 用户改动 diff 高亮 + 「确认提交/驳回」双按钮；
- 确认/驳回动作走会话消息（M3 契约）→ agent `nb_create` → `parsePushReceipt` → `nocobase.list` 实查回显；
- 驳回重填闭环（rejected → draft）；
- draft 编辑值 localStorage 暂存（刷新不丢）；
- 三个新 AI 同事预设（采购助理/品控助手/经营参谋）；
- 暗色模式打磨（双轨变量）+ PC 预览 golden 重录 + mobile-assistant e2e 重录 + PG 实查验收。

**不做**：WS 推送；`nocobase.create` wire 方法；NocoBase workflow 审批流接入（hub_po 域零审批流，人审在卡上完成即满足需求）；aiEmployees 元数据通道（后续可选 Spike）。

## 2. 文件清单

| 文件 | 动作 |
|---|---|
| `packages/client/ui-mobile/src/client/forms/DraftCard.tsx`（新，自 TaskCardView 演化） | 草稿卡：白底卡 label:value + 字段编辑控件；卡头（collection 类型标签 + 状态 Badge）；底部「提交审核」主按钮 |
| `packages/client/ui-mobile/src/client/forms/ReviewCard.tsx`（新） | 提交确认卡：字段锁定展示 + 改动值高亮 + 「确认提交（主）/驳回（ghost）」；确认弹 Dialog 二次确认 |
| `packages/client/ui-mobile/src/client/forms/ReceiptCard.tsx`（新） | 回执卡：已提交态 + 行锚点 + `nocobase.list` 实查按钮/自动回显 + Steps 状态条 |
| `packages/client/ui-mobile/src/client/forms/fieldControls.ts`（新） | 字段 interface → 控件映射（nocobase.listMeta fields 驱动）；m2o 选项拉取缓存 |
| `packages/client/ui-mobile/src/client/form-draft.ts` | 保留解析；若 persona 措辞调整则同步（默认不改） |
| `packages/client/ui-mobile/src/client/draftStore.ts`（新） | localStorage 暂存（sessionId+草稿序号 → 编辑值），确认/驳回后清理 |
| `packages/client/ui-mobile/src/client/messages/ChatView.tsx` | 卡片三态接入聊天流（draft/pending/submitted/rejected 视觉映射） |
| `examples/kb-agent/agent-presets/purchase-assistant/{preset.yml, agent.cordis.yml}`（新） | 采购助理：hub_po 域 persona（以 mobile-form-assistant 6 步契约为模板，声明可填 collection 清单） |
| `examples/kb-agent/agent-presets/quality-assistant/{preset.yml, agent.cordis.yml}`（新） | 品控助手：srm_audit_checklists/srm_capas |
| `examples/kb-agent/agent-presets/business-advisor/{preset.yml, agent.cordis.yml}`（新） | 经营参谋：只读洞察（lakehouse/kg 工具行，无 nb_* 写工具） |
| `packages/client/ui-mobile/src/client/colleagues.ts` | 补三个新同事的色相/图标/职责/可填表单元数据 |
| `packages/client/ui-mobile/tests/` | draft/review/receipt 组件与 draftStore/fieldControls 用例；views 用例更新 |
| `apps/web/tests/mobile-assistant.e2e.ts` + `apps/web/tests/snapshots/mobile-assistant/` | 重录：种子会话（seed.jsonl 含草稿事件）→ 草稿卡编辑（Picker/Switch）→ 提交审核 → 确认 → 回执实查；驳回分支 |
| `apps/web/tests/mobile-preview-iframe.e2e.ts` | golden 重录（新卡片视觉） |

## 3. 闭环契约（与 M3 兼容）

1. **草稿产出**：AI 同事对话补槽 → assistant 消息围栏 JSON（`{"collection","title","fields"}`）→ `parseFormDrafts` 每草稿一张卡。
2. **提交审核**（纯前端态切换 + localStorage 锁存）：draft → pending，字段只读。
3. **确认提交**：发会话消息「确认推送：请按以下最终字段值调用 nb_create：`<最终 fields JSON>`」→ agent nb_create（内置预览→go-ahead→回执确认流）→ 回执消息「业务表 `<collection>` 行 id=`<n>` 已创建」→ `parsePushReceipt` → 卡片转 submitted + `nocobase.list filter id` 实查行回显。
4. **驳回**：发作废消息 → 卡片转 rejected；「重新编辑」回到 draft（编辑值保留）。
5. 状态派生：fold 重放会话事件流重建卡片状态；draft 编辑值经 draftStore 恢复。

## 4. 验收标准

1. **真实链路截图**（390×844，`examples/kb-agent/demos/mobile-v2/02-form-loop/`）：与"采购助理"对话描述一张采购单（对齐 M3 场景：供应商/数量/单价）→ 补槽追问 → 草稿卡 → Picker 改 status、Switch 改布尔字段 → 提交审核 → 确认提交 → 回执实查卡，全程 ≥6 张 + GIF。
2. **PG 实查**：`PGPASSWORD=nocobase psql -h localhost -U nocobase -d nocobase` 断言 `hub_po_purchase_orders`（及关联 suppliers/items，视旅程）新增行与卡片最终字段一致（含用户改过的值）；行 id 与回执一致；驳回分支断言零新增行。对照先例行 `PO-M3-20260918-01`。
3. **e2e**：`pnpm run test:web -- mobile-assistant`（含驳回分支）+ `mobile-preview-iframe` 全绿，golden 重录。
4. **单测**：draft/review/receipt/draftStore/fieldControls per-file 100%；`pnpm run build` + hygiene 通过。
5. 三个新同事在通讯录可见、各自可发起对应旅程（采购填表/品控填表/经营问答只读）。
6. 暗色开关可用（我的页），聊天流与卡片在暗色下可读（截图各 1 张）。
7. 刷新页面：会话与卡片状态恢复、draft 编辑值不丢（截图或 e2e 断言）。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| nb_create 确认流在真实模型上多轮往返不稳 | M3 已实证（PO-M3-20260918-01 落库行）；persona 措辞不动，降低回归面；e2e 用 seed 免模型，实跑验收用真实 API |
| 字段类型映射不全（listMeta interface 长尾） | 覆盖 input/number/select/date/bool/m2o 五类+fallback 只读展示；长尾记债务 |
| localStorage 与会话重放的卡片序号错位 | 键含草稿 JSON 内容摘要哈希，内容变即弃 |
| 新 persona 与 roster 发现（broken 检测） | 沿用 preset.yml/agent.cordis.yml 既有校验；agentPreset.list 冒烟 |
| 暗色与 antd-mobile 实验性暗色冲突 | 双轨：库变量走 data-prefers-color-scheme，自绘走 .dshm-root 前缀变量；截图验收兜底 |
