# P0 根因诊断报告：mobile 对话新建供应商在 NocoBase 平台不可见

> 诊断日期：2026-09-25 | 方法：代码路径追踪（文件:行号）+ 3080 RPC 只读实查 + git 取证 | 委派：project-research 子任务，主任务汇入归档

## 一、五项排查定论

### 1. V6 mobile「对话新建供应商档案」的数据去向 —— **真实落库，无本地循环** ✅

**定论**：供应商档案走真实 `nb_create` 调用落到 NocoBase PG 的 `hub_po_suppliers` 表，**不是** workStore/localStorage demo 循环。

完整调用链（文件:行号）：

1. 对话触发：[`formRegistry.ts:72-92`](../../packages/client/ui-mobile/src/client/formRegistry.ts:72) 注册「供应商登记」表单（`collection: 'hub_po_suppliers'`，意图词「供应商/登记供应商/建档/新单位/入驻」）；8 个 AI 同事目录 [`colleagues.ts`](../../packages/client/ui-mobile/src/client/colleagues.ts) 只是静态展示元数据，**不是对话脚本引擎**
2. 草稿确认：[`ChatView.tsx:319-325`](../../packages/client/ui-mobile/src/client/messages/ChatView.tsx:319) `onConfirmV3` → `buildConfirmMessage`（v3 `form_confirm` 围栏）；v2 路径 [`ChatView.tsx:337-344`](../../packages/client/ui-mobile/src/client/messages/ChatView.tsx:337) 直接发「确认推送：…调用 nb_create…」——两条路径**都可达**
3. 发送：[`ChatView.tsx:187-193`](../../packages/client/ui-mobile/src/client/messages/ChatView.tsx:187) `send()` → [`promptSession()`（sessionsService.ts:134-141）](../../packages/client/ui-mobile/src/client/sessionsService.ts:134) → [`rpc.ts:49`](../../packages/client/ui-mobile/src/client/rpc.ts:49) 同源 `POST /api/session.prompt`
4. 真实执行：`mobile-form-assistant` preset（[`agent.cordis.yml:59-60`](../../examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml:59) 挂载 tool-nocobase）按 persona 契约 [`agent.cordis.yml:22`](../../examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml:22)（供应商登记→`hub_po_suppliers`，`status=待审核`）调 [`nb_create`](../../packages/connector/tool-nocobase/src/write.ts:187) → NocoBase API
5. 回执回读：[`task-cards.tsx:261-277`](../../packages/client/ui-mobile/src/client/forms/task-cards.tsx:261) ReceiptCard 用 `nocobase.list` 回读真实行（"the persisted record, not the agent's claim"）

**运行时实证**（curl 3080 只读 RPC）：`hub_po_suppliers` 现有 id=7「鲜丰」、id=8「鲜丰」、id=9「三味食品」、id=10「李贺」，全部 `status=待审核`（preset 推导值）——种子数据止于 id=6，id≥7 全是 mobile 对话真实落库的行。workStore 只存工作台任务卡，与供应商数据无关。

### 2. runMode（live/demo）现状 —— **默认已从 demo 变为「探测默认 live」，且 demo 不拦截对话提交**

**定论**：当前部署默认 live；runMode 不影响供应商落库链路。

- 默认值逻辑：[`runMode.ts:56-64`](../../packages/client/ui-mobile/src/client/runMode.ts:56)——显式开关优先，否则一次 `llm.models` 探测（目录有可用模型→live，失败/空→demo）。实测当前网关返回 minimax 1 + deepseek-official 3 个模型 → **默认 live**（V5「登录默认 demo」已改变，探测机制系 V5 引入，V6 保留）
- 存储：localStorage key [`dsh-mobile-runmode`](../../packages/client/ui-mobile/src/client/runMode.ts:17)
- 切换入口：[`ProfileView.tsx:240-246`](../../packages/client/ui-mobile/src/client/profile/ProfileView.tsx:240)「真实模式」Switch
- demo 态路径：只影响 ① 打字动画 [`ChatView.tsx:196-223`](../../packages/client/ui-mobile/src/client/messages/ChatView.tsx:196)（render-only）② 工作执行时间线 [`demoTimeline()`（workTimeline.ts:146）](../../packages/client/ui-mobile/src/client/work/workTimeline.ts:146)（纯内存）③ [`startWorkExecution()`（actions.ts:164-166）](../../packages/client/ui-mobile/src/client/actions.ts:164) 本地翻转工作项状态。**对话消息在 demo 态也真实发给后端**——runMode 不是本次根因。

### 3. 集合错位 —— **实锤，这是根因**

**定论**：mobile 写 `hub_po_suppliers`，但 NocoBase 平台上**所有**「供应商」页面读的是另外两张表，且 `hub_po_suppliers` 在整个平台**没有任何页面**。

| 页面 | 构建脚本 | 读取集合 | 过滤器 |
|---|---|---|---|
| 资产管理·供应商（菜单页） | [`nocobase-hub-modules.mts:907`](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:907) | `hub_as_vendors`（5 行种子，无新增） | 无 |
| SRM·供应商档案 | [`nocobase-h4-srm.mts:212`](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:212) | `srm_suppliers`（12 行种子，无新增） | 无 |
| SRM·供应商准入（同表第二视图） | [`nocobase-h4-srm.mts:219`](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:219) | `srm_suppliers` | 无 |
| v2 flowPage（N17 升级页） | [`nocobase-n17-alignment.mts:284-405`](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:284) | crm_*/hub_tk/hub_as/hub_hr | 无 |
| **mobile 写入处** | — | **`hub_po_suppliers`** | **无任何页面展示** |

过滤器假设不成立（上述页面均无 status filter，工作台页才有 filter）；真实原因是**整表无读视图**。次级词汇错位：preset 写 `status=待审核`（[agent.cordis.yml:22](../../examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml:22)），而集合 status 枚举仅 `active/inactive`（[nocobase-hub-modules.mts:348](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:348)、[fieldControls.ts:36-37](../../packages/client/ui-mobile/src/client/fieldControls.ts:36)）——即便补建页面，状态筛选/标签也对不上。

### 4. 环境/实例错位 —— **不存在，单实例单库**

- mobile 前端：同源 `/api/<method>`（[`rpc.ts:49`](../../packages/client/ui-mobile/src/client/rpc.ts:49)），由 3080 网关进程自己服务
- 网关 nocobase 域（nocobase.list 等读接口）与 nb_create 工具**同源解析** `NOCOBASE_BASE_URL`：[`api-proxy.ts:375-377`](../../packages/host/apiproxy/src/api-proxy.ts:375)、[`tool-nocobase/src/index.ts:134-137`](../../packages/connector/tool-nocobase/src/index.ts:134)
- 实际值：[根 .env:3-4](../../.env) `NOCOBASE_BASE_URL=http://127.0.0.1:13000` + root API key（凭据齐全，非「no-credentials refusal」场景；往轮记忆中的 13100 是历史 PDF 代理端口，与本轮无关）
- NocoBase → PG：[platform/nocobase/.env:48-55](../../platform/nocobase/.env) `localhost:5432/nocobase`
- 3080 web 的 `/nocobase` 嵌入代理同一 origin（[`cordis.patch.yml:360`](../../examples/kb-agent/cordis.patch.yml:360)）
- 三表数据经 3080 RPC 实测均从同一 PG 读出，证明读写同库。

### 5. V5→V6 回归检查 —— **无回归，提交链路完整可达**

- V5 验收硬约束 S4「v3 表单闭环与 nb_create 真库落库」在 V6 完整保留：V6 验收文档 [research/2026-09-23-mobile-v6-uidesign/vfy-r1e-walkthrough.md:14](../2026-09-23-mobile-v6-uidesign/vfy-r1e-walkthrough.md) 记录「已登记·采购单…已落库三步全绿」
- 数据侧：V5/R/D 轮写入的 id=9/10 与 V6 新增 id=7/8 同在 `hub_po_suppliers` 同列结构——表与列契约未变
- 前端 wire 无写方法的红线未破（[`rpc.ts:14-30`](../../packages/client/ui-mobile/src/client/rpc.ts:14) 方法清单无写方法，nb_create 仅存在于 agent 工具面）
- V6 确认消息协议从 v2「确认推送」扩展出 v3 `form_confirm`，**两条路径并存可达**

## 二、最终根因判定（按置信度排序）

1. **【高置信·主因】平台侧展示缺口（写入表 vs 展示页错位）**：mobile 真实落库 `hub_po_suppliers`，NocoBase 平台的「供应商」页面全部读 `hub_as_vendors`/`srm_suppliers`，`hub_po_suppliers` 零页面。数据没有丢，是**读视图缺位**。
2. **【中置信·体验次因】状态词汇错位**：落库 `status=待审核` 不在集合枚举 `active/inactive` 内，即使补页面默认筛选也对不上。
3. **【低置信·非因素】runMode demo 默认态**：已排除——当前默认 live，且 demo 态也不拦截对话提交。

## 三、mobile 端数据流现状图

```
用户对话「给供应商三味食品登个档」
  ↓ ChatView send() ──→ POST /api/session.prompt（真实会话，demo/live 都走这）
  ↓ mobile-form-assistant preset（persona 契约 + tool-nocobase）
  ↓ 字段推导 status=待审核 → form_draft 草稿卡 → 用户确认 form_confirm
  ↓ nb_create → http://127.0.0.1:13000/api/hub_po_suppliers:create
  ↓ PG localhost:5432/nocobase → 表 hub_po_suppliers（id=7~10 已实证）
  ↓ submit_receipt 围栏 → ReceiptCard 回读真实行
────── 以下均为「断头路」：无任何 NocoBase 页面消费 hub_po_suppliers ──────
  ✗ 资产管理·供应商页 → hub_as_vendors（另一张表）
  ✗ SRM 供应商档案/准入页 → srm_suppliers（另一张表）
  本地 workStore/localStorage：只存任务卡与草稿编辑态，从不存供应商档案
```

## 四、NocoBase 平台供应商相关页面/集合现状

见第 3 项表格；补充：WMS（[`nocobase-h5-wms.mts:111/139`](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:111)）的批次/入库单 supplier 外键也指向 `srm_suppliers`；种子脚本 [`setup-nocobase.mts:826/1051`](../../examples/kb-agent/scripts/setup-nocobase.mts:826) 给 `srm_suppliers` 下限 9 行、`hub_po_suppliers` 下限 3 行，两表并存且语义不同（SRM 准入档案 vs 采购域供应商）。

## 五、修复建议候选切入文件

**方向 A（最小改动，补读视图）——B0 采纳**：

- [`nocobase-hub-modules.mts`](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:891)：`PAGE_BLOCKS` 增加 `hub_po_suppliers` 表格块（columns: name/contact_name/email/rating/status）+ [`MENU:372-401`](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:372) 挂菜单（如「基础数据/采购供应商」）
- 同时对齐状态词汇二选一：集合枚举加「待审核」选项（[`nocobase-hub-modules.mts:348`](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:348)），或 preset 改写 `status=active`
- 注意镜像同步：[`agent-presets/mobile-form-assistant/agent.cordis.yml:22`](../../examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml:22) ↔ [`formRegistry.ts:72-92`](../../packages/client/ui-mobile/src/client/formRegistry.ts:72)（两处注释明确要求 keep in sync）↔ [`fieldControls.ts:36-37`](../../packages/client/ui-mobile/src/client/fieldControls.ts:36)（select 控件枚举）
- `.dsh/.agent-presets/mobile-form-assistant/agent.cordis.yml:22` 是部署侧拷贝，改后需同步或重启

**方向 B（改写目标表，让 mobile 对话直接进 SRM 准入池）——B2 采纳（根本归一）**：迁移 persona 契约（supplier_code→code/uscc、status→lifecycle_status）、formRegistry、[`systemFields.ts`](../../packages/client/ui-mobile/src/client/systemFields.ts)（编号生成）、[`rich.ts:172`](../../packages/client/ui-mobile/src/client/messages/rich.ts:172)（表名中文标签），并利用 SRM 准入工作流（[`nocobase-h4-srm.mts:709-749`](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:709) 挂在 srm_suppliers 的 collection 触发器）让 mobile 新建行自动进入准入审批队列。

**附注**：验证口令——打开 NocoBase 任意有「数据表」权限的界面查 `hub_po_suppliers`，或 curl 3080 `/api/nocobase.list`（collection=hub_po_suppliers），新行（待审核）即在那里。
