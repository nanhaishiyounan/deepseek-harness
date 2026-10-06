# Agent Note: W12——预制 tag 模板骨架与 QUICKSTART 八角色账号表

Status: implemented

[English](2026-10-06-w12-tag-template-starters.md) | 中文

## Problem

- 用户对预制 tag 的原始诉求是「预制 tag 不应该出现具体事项，应该是辅助输入，具体问题需要用户修改并发送」。W9-B1 交付了辅助输入的一半（点击填入草稿、聚焦输入框、光标落位、不自行发送），但部署侧的 tag 文案仍是具体事项：`examples/kb-agent/agent-presets/mobile-form-assistant/preset.yml` 的六个 starters 里三个是完整具体句——写死供应商/物料/数量/单价的采购句、逐字复述用户投诉的库存句、点名真实供应商的建档句。活体 DOM 探针证实 6 个 tag 中 3 个预填具体事项。
- `examples/kb-agent/QUICKSTART.zh.md` 336 行把读者指向「八角色见『换角色』节」查移动端业务账号，但该节没有任何账号信息——想在 `/mobile` 登录的读者拿到的是死指针。

## Decision

- **三个具体句改为占位模板骨架**——`向【供应商】采购【物料】，数量【数量】，单价【单价】`、`查一下【物料名】还有多少库存`、`给供应商【供应商名】登个档`——业务语义仍一键可达，同时显式留空待改。两份副本同步修改：git 跟踪的 `agent-presets/` 源与活体网关服务的 `examples/kb-agent/.dsh/.agent-presets/` 运行时副本（preset welcome 经 `agentPreset.list` 下发、按磁盘重读，无需重启网关）。
- **`fillDraft` 的聚焦通道认识占位段**（`ChatView.tsx`）：填入文本提交后，`TEMPLATE_PLACEHOLDER = /【[^【】]*】/u` 探测输入框；命中则以 `setSelectionRange` 选中第一个 `【…】` 段（含两侧括号），用户键入即整段替换、不残留括号；未命中维持 W9-B1 的文尾光标。整段选中而非只选内部文字的原因正在于此——只选 `物料名` 会把 `【` 和 `】` 留在用户输入两侧。
- **fixture**（`views.client.spec.tsx`）走真实部署的 wire 路径：`agentPreset.list` stub 一个 `welcome.starters` 携带三种改后形态的 preset，用例断言多占位骨架填入后 `【供应商】` 被选中（1..6）、单占位骨架 `【物料名】` 被选中（3..8）、无占位句维持文尾光标，且页面没有发出任何 `session.prompt` 调用。
- **QUICKSTART「换角色」节补齐八角色表**——buyer/planner/shop_lead/keeper/qc_inspector/sales_rep/finance/admin 的账号、密码、姓名·部门与角色面，并注明 NocoBase 平台后台用 `nocobase/admin123`。数据同源自有种子（`scripts/w5b8-closure.mts`，幂等重种）；排练密码明文沿用 W5-B8 先例。`QUICKSTART.zh.md` 是 zh-only 文件，未登记进任何 i18n pairing 清单，不触发翻译配对义务。

## Consequences

- ui-mobile 758/758（新增 1 用例）、`pnpm run typecheck` 绿、`build:lib:client` + apps/web `vite build` 重跑，:3080 活体探针 9/9（`.shoot-w12-tag.mjs`）：两个模板 tag 填入骨架并选中首占位段、聚焦落位、无用户气泡、无占位 tag 维持文尾光标。证据 PNG：`w12-tag-template-inventory-375.png` / `w12-tag-template-purchase-375.png`（均在探针侧一次性放开输入框高度拍摄，让整句骨架与原生选区高亮完整落进 375px 视口）与 `w12-tag-template-natural-375.png`（无干预的自然胶囊态）。
- 一个本批未改的显示事实：W11-B1 的输入框是单行 46px 胶囊，14 字骨架会溢出并由浏览器把选区滚入视口——任何长草稿本来就是这个滚动行为。光标/选区契约由 DOM 断言证明；放开高度的截图存在的原因是原生高亮否则会被裁掉。

## Alternatives considered

- **只改本地 fallback 表**（`colleagues.ts` 的 `registryStarters`）——对活体面无效：部署的 preset.yml welcome block 在 `agentPreset.list` 携带时覆盖本地表，且本地 starters（「帮我登记一条X」）本就不含具体事项。
- **只选占位段内部文字**——用户替换后括号残留两侧；整段选中才是让「修改后发送」一次连贯手势完成的形式。
