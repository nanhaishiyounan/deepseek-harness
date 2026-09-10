# 实施计划：AI 体验升级——附件理解 / 图片支持 / Portal AI 员工（2026-09-10）

面向 Loop 编排器逐批委派实施。三项用户诉求：R1 Portal 表单 AI 入口替换为「AI 智能员工」、R2 AI 雇员对话附件（pdf/docx/xlsx/md 等）模型可见、R3 图片模型可见；同期清偿 handoff §6/§9 四项体验债。批次编号 N21 起（N19/N20 已被会话内市场快照修复占用，见 [handoff-2026-09-10.zh.md](handoff-2026-09-10.zh.md) §7）。调研底稿：四路并行调研（Portal 现状 / plugin-ai 附件机制 / 解析件与 verify 链 / MiniMax 多模态实跑），MiniMax 部分已落盘 [research/2026-09-10-minimax-multimodal-vision.md](../research/2026-09-10-minimax-multimodal-vision.md)。

## 1. 目标摘要

| 诉求 | 一句话目标 | 预期改动面 |
|---|---|---|
| R2 附件 | pdf/docx/xlsx/md 等附件内容注入模型请求，模型能复述/引用附件内容 | 本地附件代理（新脚本）+ llmService baseURL 指向代理 |
| R3 图片 | 图片经 M3 原生 image_url 多模态输入，模型能描述图片 | 预期零改动（M3 实测已支持），探针确认 + 边界处理 |
| R1 Portal | Portal 表单页「AI 智能填表」全部替换为「AI 智能员工」按钮（表单按钮旁）+ 内嵌聊天 + formFiller 回写 + 落库，对齐 N18 | Portal vendored 源码（快照外，可改）×2 份 + 重建部署 |
| 体验债 | think 链不回显最终用户 / 双击防抖 / 填充流式反馈 / n18ai- formUid 自愈 | 代理过滤 + Portal 挂载侧守卫 +（R1 替换自动消解填充无反馈）|

硬约束：`platform/nocobase/` 快照源码不可修改（NocoBase 侧全部走运行时配置/REST/代理）；改动脚本全部幂等、fail-loud；新能力进 `verify` 断言；MiniMax 端点可直连（查文档/装依赖才需代理）。

## 2. 调研结论（证据锚点）

### 2.1 Portal「AI 智能填表」为何不可用

- 面板 [`ai-fill-panel.tsx`](../platform/nocobase-portals/demo-portal-crm/src/components/ai-fill/ai-fill-panel.tsx:69) 仅挂在 4 个表单：CRM [`deals/form.tsx`](../platform/nocobase-portals/demo-portal-crm/src/pages/crm/deals/form.tsx:125)（`/pipeline/create` 报障点）与 [`leads/form.tsx`](../platform/nocobase-portals/demo-portal-crm/src/pages/crm/leads/form.tsx:524)，Hub [`finance/expenses/form.tsx`](../platform/nocobase-portals/demo-portal-hub/src/pages/finance/expenses/form.tsx:158) 与 [`sales/leads/form.tsx`](../platform/nocobase-portals/demo-portal-hub/src/pages/sales/leads/form.tsx:110)。
- **主根因**：Portal 默认员工硬编码 `form-assistant`（连字符，[`use-ai-fill.ts`](../platform/nocobase-portals/demo-portal-crm/src/components/ai-fill/use-ai-fill.ts:81)），实例不存在 → server [`aiConversations.ts`](../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/resource/aiConversations.ts:196) 精确查库 400 `AI employee not found`；错误文案「AI 助手当前不可用…」与用户报障逐字一致（[`zh-CN.ts`](../platform/nocobase-portals/demo-portal-crm/src/locales/zh-CN.ts:1032)）。上游模板员工 username 实为 `form_assistant`（下划线，[`form-assistant.ts`](../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/ai-employees/templates/form-assistant.ts:13)）且从未播种——两种拼写都查无此人。
- **叠加根因**：一次性非流式补全 45s 超时（[`ai-fill-client.ts`](../platform/nocobase-portals/demo-portal-crm/src/components/ai-fill/ai-fill-client.ts:87)）对 MiniMax-M3 15~100s 推理延迟结构性无解。
- 静默失效第二入口：页面级快捷按钮 [`ai-assistant.tsx`](../platform/nocobase-portals/demo-portal-crm/src/pages/crm/ai-assistant.tsx:18) 硬编码 `crm-assistant` 同样不存在；[`AIEmployeeShortcut`](../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client-v2/ai-employees/AIEmployeeShortcut.tsx) 查不到即静默 return。
- **替换的全部装配件已 vendored 在 Portal 内**（零新依赖）：聊天面板 [`chat-inline.tsx`](../platform/nocobase-portals/demo-portal-crm/src/extensions/nocobase-ai/components/surfaces/chat-inline.tsx) / [`chat-dialog.tsx`](../platform/nocobase-portals/demo-portal-crm/src/extensions/nocobase-ai/components/surfaces/chat-dialog.tsx)、流式通道 [`chat-transport.ts`](../platform/nocobase-portals/demo-portal-crm/src/extensions/nocobase-ai/providers/chat-transport.ts:68)、表单注册表 [`form-registry.tsx`](../platform/nocobase-portals/demo-portal-crm/src/extensions/nocobase-ai/providers/form-registry.tsx:41)、前端工具桥 [`frontend-tool-registry.tsx`](../platform/nocobase-portals/demo-portal-crm/src/extensions/nocobase-ai/providers/frontend-tool-registry.tsx:54)（formFiller 等价物，多处引用 [`ai-form.tsx`](../platform/nocobase-portals/demo-portal-crm/src/extensions/nocobase-ai/components/page-elements/ai-form.tsx)）、附件钩子 [`use-chat-attachments.ts`](../platform/nocobase-portals/demo-portal-crm/src/extensions/nocobase-ai/providers/use-chat-attachments.ts)。
- Hub 与 CRM 完全同构、代码独立（两份 vendored 拷贝）——任何 Portal 侧改动两份各改一遍。
- Portal 登录态经 portal-sdk `Bearer + X-Authenticator + X-Timezone(+08:00 数字偏移)` 调用同源 `/api/...`，plugin-ai 全资源要求登录（匿名 403）。

### 2.2 plugin-ai 附件 wire 全景与真实缺口

链路（全程存在，运行日志实锤）：

1. 上传：Sender 回形针/拖拽/粘贴（[`Sender.tsx`](../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client-v2/ai-employees/chatbox/components/Sender.tsx:443)）→ [`useUploadFiles.ts`](../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client-v2/ai-employees/chatbox/hooks/useUploadFiles.ts:124) → `POST /api/aiFiles:create` 落 storage（实测 200，PDF 168KB 落库落盘）。
2. 消息：`aiConversations:sendMessages` body 携带 `attachments:[{id,source}]`；落库 `aiMessages.attachments jsonb`（[`ai-messages.ts`](../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/collections/ai-messages.ts:36)）。
3. 归一化：[`normalizeMessageAttachments`](../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/ai-employees/ai-employee.ts:1270) 按 source 回查 `aiFiles`；查不到静默丢弃（:1293）。
4. **分流（缺口所在）**：[`provider.parseAttachment`](../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/llm-providers/provider.ts:236)：
   - `image/*` → `{type:'image_url', image_url:{url:'data:...'}}`（通用格式）；
   - `application/pdf` → 被 `isApiSupportedAttachment`（:259）优先拦截 → OpenAI 专有 `{type:'file', file:{file_data:'<base64>'}}` part（LangChain [`completions.js`](../platform/nocobase/node_modules/@langchain/openai/dist/converters/completions.js:374)）——**MiniMax 不消费且静默忽略**；
   - 其余文档扩展名（[`SUPPORTED_DOCUMENT_EXTNAMES`](../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/document-loader/constants.ts:12)：.pdf/.pptx/.doc/.docx/.xls/.xlsx/.xlsm/.txt/.md/.json/.csv）→ worker 解析（[`loader.worker.ts`](../platform/nocobase/packages/core/ai/src/document-loader/loader.worker.ts:63)：PDFLoader/DocxLoader/自研 xlsx/TextLoader）→ `<parsed_document>` 系统提示注入（理论可见，**本机无 docx/xlsx/md 上传记录，未实测**）。
5. 运行时实锤（`platform/nocobase/storage/logs/main/request_2026-09-10.log`）：当日仅两次 PDF 上传，用户均未打字（`content:{type:'text',content:''}`）→ 模型收到近乎空的 user 消息 →「根本看不到」。

**缺口矩阵**：PDF = 确定不可见（file part 被忽略）；docx/xlsx/md/txt/csv = 理论可见待实测；图片 = `image_url` part 格式正确且 **M3 实测支持**（见 2.3），预期已可见待实测。

### 2.3 MiniMax M3 多模态实锤（Task D，生产 key 实跑）

- **M3 支持 `image_url`**：官方文档明确「支持图片、视频理解」；`https://api.minimaxi.com/v1/chat/completions` 实跑验证公网 URL、base64 data URI、多图 + `detail=low` 全部成功。单图 ≤10MB、请求体 ≤64MB、JPEG/PNG/GIF/WEBP。图像按 token 计费。
- MiniMax-VL-01 已退役（400 unknown model）；M2.x 全系纯文本；M3 上下文 1M，>512k token 单价翻倍。无 pdf/docx 文档理解 API（Files API purpose 无此项）——文档仍走文本注入。
- 结论：图片方案 = 复用 plugin-ai 既有 `image_url` data URI 路径 + M3 原生能力，预期零代码改动。

### 2.4 仓库既有解析件（代理兜底用）

pdf=[`extractPdfText`](../packages/kb/tool-kb/src/extract.ts:94)（unpdf）、docx=[`extractDocxText`](../packages/kb/tool-kb/src/extract.ts:114)（mammoth）、fixtures=[`tests/fixtures/docs/`](../packages/kb/tool-kb/tests/fixtures/docs)（sample.pdf/sample.docx）；xlsx 无纯文本通道但 exceljs ^4.4.0 已在工作区两处（[`connector`](../packages/connector/connector/package.json:43)、[`apiproxy`](../packages/host/apiproxy/package.json:83)），新脚本依赖落 [`examples/package.json`](../examples/package.json)（有 unpdf/pdf-lib 先例）；md/txt 直读 UTF-8（fatal decode 惯例）。

### 2.5 llmService 注入点与 verify/部署模式

- [`ensureLlmService`](../examples/kb-agent/scripts/setup-nocobase.mts:496) 幂等键只有 title（:498 查到即 kept）——**baseURL 变更不会更新已有行**，需升级为「存在则比对 `options.baseURL`，不一致即 `POST /api/llmServices:update?filterByTk=<id>`」。
- 请求出口：provider 每次实时读 `serviceOptions.baseURL`（[`provider.ts`](../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/llm-providers/provider.ts:438)），经 `checkUrlAgainstWhitelist`（:69）——**对 localhost 的默认策略未证实，N22 第一步核实**（若拦，配 env 白名单也是配置层）。
- llmService 消费方全覆盖清单：AI 雇员 chat、workflow LLM 节点、`ai:listModels`、embedding 链（未配 embedding 模型，不受影响）——改 baseURL 全部生效（正是覆盖度目标，也是单点风险）。
- verify 断言模式：[`stepVerify`](../examples/kb-agent/scripts/setup-nocobase.mts:546) 纯探测零写入、failures 收集、失败消息内嵌修复动作、`process.exitCode=1` fail-loud；all 链子命令注册在 `main()` switch（:694）。
- Portal 部署链：[`nocobase-portal-deploy.mts`](../examples/kb-agent/scripts/nocobase-portal-deploy.mts) pnpm build → dist 整目录替换 `platform/nocobase/storage/dist-client/<name>/`；改 Portal 源码后重跑即生效（首次构建需网络代理装依赖）。

## 3. 方案选型与理由

### 3.1 注入通道：本地附件代理（候选 a 胜出）

| 候选 | 覆盖面 | 快照侵入 | 评价 |
|---|---|---|---|
| **(a) llmService baseURL → 本地代理** | 全部 AI 面（悬浮球/工作台/弹窗/workflow LLM 节点/Portal） | 零 | **选定**。唯一全覆盖通道；回滚 = baseURL 改回直连一行 update；同时承载 think 帧过滤 |
| (b) Portal/前端侧上传前解析注入文本消息 | 仅改过的入口 | 零（Portal）| 覆盖不全（admin 端 8 页弹窗/悬浮球/工作台全漏）；消息被拆散污染会话历史 |
| (c) 改快照 provider 分流逻辑（PDF 走 document-loader） | 全部 | **违反快照不可改约束** | 否决 |

代理职责（最小集）：拦截 `POST <proxy>/chat/completions`，把请求体中 content 数组里的 `{type:'file'}` part（PDF）base64 解码 → unpdf 解析 → 替换为 `{type:'text', text:'<parsed_document filename="…">…</parsed_document>'}`（与 NocoBase 原生注入格式对齐）→ 转发 `https://api.minimaxi.com/v1/chat/completions`；SSE 流式/非流式两态透传；可选过滤 SSE `reasoning` 帧（N25）。解析失败注入明确占位文本（「附件 X 解析失败」），绝不静默——防模型幻觉编造附件内容。

### 3.2 图片：零改动预期 + 探针确认

M3 实测支持 `image_url` data URI 且 plugin-ai 已生成该格式——不引入新组件、不加 OCR、不换模型。N21 探针实测确认；仅边界（>10MB、非常规格式）在 N23 明确行为。

### 3.3 Portal 替换：现成组件装配 + 员工复用 dex

- 员工：**复用 dex**（已存在、已中文化、about 明示支持填表、root 经 `listByUser` 可见、与 N18 官方 demo 同款）——不播种 `form_assistant`（用户诉求是「换掉」而非「救活」旧面板）。
- 形态：AiFillPanel 整体移除 → 表单按钮旁（如 [`RouteDrawerFooter`](../platform/nocobase-portals/demo-portal-crm/src/pages/crm/deals/form.tsx:175)）「AI 智能员工」头像按钮 + 内嵌 [`chat-inline.tsx`](../platform/nocobase-portals/demo-portal-crm/src/extensions/nocobase-ai/components/surfaces/chat-inline.tsx) 聊天面板；表单经 [`form-registry.tsx`](../platform/nocobase-portals/demo-portal-crm/src/extensions/nocobase-ai/providers/form-registry.tsx:41) 注册、formFiller 经 [`frontend-tool-registry.tsx`](../platform/nocobase-portals/demo-portal-crm/src/extensions/nocobase-ai/providers/frontend-tool-registry.tsx:54) 声明（既有范式见 [`use-ai-fill.ts`](../platform/nocobase-portals/demo-portal-crm/src/components/ai-fill/use-ai-fill.ts:218)）。
- 聊天式 SSE 流式输出天然解决「填充 15~100s 无反馈」体验债——这是替换优于修补的核心理由。
- 范围：先替换既有 4 个挂载点（CRM 2 + Hub 2）+ `crm-assistant` 快捷按钮指向 dex；扩展到更多 Hub 表单页列为可选后续（N24 附注）。

### 3.4 think 链治理：代理过滤优先、prompt 抑制备选

admin 端 chatbox 在快照内不可改；代理过滤 SSE `reasoning` 帧一处改动全 AI 面生效（Portal 端亦可顺手在渲染层过滤，双保险）。备选（代理未落地时）：9 雇员系统提示词追加「不要输出推理过程」。

## 4. 批次划分（N21 → N26）

顺序论证：调研显示真实缺口矩阵与用户感知不同（docx/xlsx/md/图片可能已可见，PDF 是唯一确定缺口）——**N21 探针先行**防止过度建设；代理（N22）是新增基础设施，风险最高放前；R1（N24）纯前端+配置独立推进；体验债随依赖就位收口（N25）；verify/文档总收尾（N26）。与用户建议序（R2→R3→R1→债→收口）一致，仅插入探针前置批。

### N21 附件与图片可见性探针（定后续范围）

- **目标**：实测三类路径真实可见性，产出格式×可见性矩阵，锁定 N22/N23 实际范围。
- **改动**：新脚本 [`examples/kb-agent/scripts/nocobase-n21-attachment-probe.mts`](../examples/kb-agent/scripts/nocobase-n21-attachment-probe.mts)（探针，非幂等但自清理）：登录 → 对每种格式（pdf/docx/xlsx/md/图片）执行 `aiFiles:create` 上传 + `aiConversations:sendMessages`（带明确文字提问，如「附件第一页的标题是什么」）→ 校验模型回复含期望关键词 → 会话 destroy 清理。fixtures：sample.pdf/sample.docx 复用 [`tool-kb/tests/fixtures/docs/`](../packages/kb/tool-kb/tests/fixtures/docs)，xlsx/md 小样本新建于 `examples/kb-agent/scripts/fixtures/`（不入产品包）；图片用同目录小 PNG。等待窗口按 150s（对齐 n18-capture，M3 推理延迟）；串行执行（同用户 streaming 并发 >2 会 400）。
- **验收**：矩阵落盘本计划追加节（格式 × 可见/不可见 × 模型回复摘录 × 日志锚点）；每格有证据；探针二跑不残留会话。
- **回滚**：纯读+自清理，无回滚面。

### N22 本地附件代理（R2 落地）

- **目标**：PDF（及 N21 实测不可见的格式）内容注入模型请求，全 AI 面生效。
- **改动**：
  1. 前置核实 `checkUrlAgainstWhitelist` 对 localhost 策略（读快照源码即可，不改）；若拦，确认 env 白名单配置法（快照的 env 配置面）。
  2. 新脚本 [`examples/kb-agent/scripts/nocobase-n22-llm-proxy.mts`](../examples/kb-agent/scripts/nocobase-n22-llm-proxy.mts)：Node http server（tsx ESM，对齐脚本惯例），监听 `127.0.0.1:13100`（端口可配）；`POST /v1/chat/completions` 请求体改写（file part → 解析文本 part；pdf=unpdf、docx=mammoth、xlsx=exceljs 行列渲染、md/txt 直读；惰性 import；解析失败注入占位文本）；`GET /healthz` 健康端点；apiKey 校验（与 .env MINIMAX_API_KEY 一致才转发）；SSE/非 SSE 双态透传；结构化单行日志。超长截断（如 >200k 字符截断加标记，规避 M3 >512k 翻倍档）。依赖加 [`examples/package.json`](../examples/package.json)。
  3. [`ensureLlmService`](../examples/kb-agent/scripts/setup-nocobase.mts:496) 升级：存在行 `options.baseURL != 期望值` 时 `llmServices:update`（幂等 upsert；期望值可由开关决定——`ai` 子命令带 `--proxy` 则指代理，默认直连？**决策：默认指向代理**，QUICKSTART 写清回滚命令）。
  4. 代理生命周期：`setup-nocobase.mts` 新子命令 `ai-proxy:start|stop`（后台 spawn + pid 落盘 `examples/kb-agent/.dsh/` 或 scripts 同级运行时目录）；`all` 链 `ai` 步骤前确保代理在跑（幂等探测 /healthz）；verify 前置探测（不设则 AI 断言组跳过并提示，还是 fail？**fail-loud**：与「PG 未跑」同级别提示启动命令）。
- **验收**：N21 探针 PDF 格式从不可见翻转为可见（模型能复述 sample.pdf 首页内容关键词）；纯文本对话回归无损（既有对话行为不变）；流式对话正常逐字输出（代理不破坏 SSE）；`verify` 新断言（/healthz 200 + llmServices baseURL == 代理地址）通过；代理 kill 后重启链路可恢复。
- **回滚**：`ensureLlmService` 直连值回写（一行 update）即恢复原状；代理进程独立于 NocoBase，删除脚本无残留。
- **风险**：SSE 透传正确性（chunk 边界/背压）——用既有真实对话回归；whitelist 拦截——N22.1 核实；代理单点——QUICKSTART 故障排查节（含一键回直连）。

### N23 图片支持确认与边界（R3）

- **目标**：图片模型可见，边界行为明确。（若 N21 实测已可见，本批缩为确认+边界+文档；若不可见，代理扩展处理 image part 格式修正。）
- **改动**：探针扩展图片边界组（多图、~8MB 大图、GIF/WEBP）；不可见时的修复落在代理（image_url part 格式对齐 M3 要求，base64 重新编码或降级文本描述并明示）；QUICKSTART 图片支持说明（格式/大小限制）。
- **验收**：图片+提问 → 模型正确描述内容（探针断言）；>10MB 上传/发送的行为有明确用户可见结果（拒绝或占位提示，不静默）；矩阵图片格全部翻绿。
- **回滚**：零改动路径无回滚面；代理扩展路径回滚同 N22。

### N24 Portal 表单 AI 员工替换（R1）

- **目标**：4 个挂载点的「AI 智能填表」全部替换为「AI 智能员工」（表单按钮旁头像按钮 + 内嵌聊天 + formFiller 回写 → 提交落库），对齐 N18 体验；顺带解决填充无反馈债（流式）与 Portal 端双击防抖。
- **改动**：
  1. 前置实测：Portal 登录态 `aiEmployees:listByUser` 确认 dex 可见（非 root 需 `rolesAiEmployees` 绑定——实测后按需在 n17 脚本补绑定，REST 幂等）。
  2. CRM：[`deals/form.tsx`](../platform/nocobase-portals/demo-portal-crm/src/pages/crm/deals/form.tsx) / [`leads/form.tsx`](../platform/nocobase-portals/demo-portal-crm/src/pages/crm/leads/form.tsx) 移除 AiFillPanel，新薄组件（如 `src/components/ai-employee-fill/`）：员工头像按钮（RouteDrawerFooter 按钮旁）+ ChatInline 面板 + form-registry 注册（fields 清单沿用现有 `aiFields` 常量）+ formFiller 工具声明（frontend-tool-registry，既有范式）+ 员工 dex；发送按钮 busy 守卫防双击。
  3. Hub：expenses / sales/leads 对称复制。
  4. [`ai-assistant.tsx`](../platform/nocobase-portals/demo-portal-crm/src/pages/crm/ai-assistant.tsx:18) `crm-assistant` → `dex`。
  5. 中文文案（「AI 智能员工」）进各自 locales；重建部署 `nocobase-portal-deploy.mts`（构建需网络代理环境）。
- **验收**：浏览器实录（Playwright 截图脚本，对齐 n18-capture 模式落 `demos/nocobase-full-features/N24-*.png`）：`/pipeline/create` 表单按钮旁 AI 员工按钮 → 中文意图（如「漯河一家调味品企业，名叫卫味轩食品，50 万金额，预计月底成交」）→ 流式回复 + formFiller 填充 deals 字段 → 提交落库 `crm_deals` 新行（验收后 destroy 清理，try/finally 保证）；Hub expenses 同理；双击发送不再开 2× 窗口；`verify` portal 探测仍绿。
- **回滚**：Portal 部署目录替换式回滚（重建部署旧源码）；表单页改动 git revert vendored 目录即可。
- **风险**：Portal formFiller 工具的 workContext 声明细节与 admin v2 不同（`{type:'flow-model'}` vs form-registry 机制）——以 Portal 既有 `ai-form.tsx`/`page-context.tsx` 范式为准，实施时先读；构建环境（pnpm/代理）不稳——构建一次成功后产物可反复部署。

### N25 think 链治理 + 体验债收尾

- **目标**：最终用户看不到 `<think>` 推理链；n18ai- formUid 孤儿自愈（可选）。
- **改动**：代理 SSE `reasoning` 帧过滤（默认开、可配关）；（备选/补充）n17 脚本 9 雇员系统提示词追加「直接给结论，不要输出推理过程」（幂等 upsert，注意保留既有中文指令）；[`nocobase-n18-form-ai.mts`](../examples/kb-agent/scripts/nocobase-n18-form-ai.mts) 挂载前 formUid 存在性校验（孤儿跳过+日志）；admin 端 Sender 双击为上游行为，标注维持（快照不可改，代理无法拦前端行为）。
- **验收**：多面抽查（悬浮球/工作台/弹窗/Portal）模型回复不含 think 链文本；n18 二跑幂等不回退；既有对话质量不受 prompt 追加影响（抽测 3 轮）。
- **回滚**：代理过滤开关关闭即恢复；prompt 追加可幂等摘除（n17 脚本反向 upsert）。

### N26 verify 断言、文档与 Agent Note 收口

- **目标**：新能力全部进验证链与文档，符合仓库规范。
- **改动**：`verify` 断言组补齐（/healthz、llmService baseURL、附件探针可否纳入——探针耗 key/15~100s，**不进 verify**，verify 只断言代理与健康与配置形态；`AIEmployeeButtonModel` 计数断言强化为 `n18ai-` 前缀式，防凑数）；QUICKSTART.zh.md 三节（AI 附件与图片使用导览：上传→模型可见；Portal AI 智能员工操作导览；代理启停/回滚/故障排查）；Agent Note（implemented/feature：代理架构决策 + Portal 替换机制，按 [`.agents/notes/README.md`](../.agents/notes/README.md) 规范）；01-batches.md 或本文件追加实施记录段。
- **验收**：`node --env-file=.env --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts verify` 全绿（含新断言组）；`pnpm run typecheck` EXIT=0；`pnpm run doc-sync` 全绿；`pnpm vitest run examples/kb-agent/tests/` 分区全绿；三服务探测 200；浏览器抽查 R1/R2/R3 各一条主路径（供最终汇报截图）。
- **回滚**：文档与断言纯增益，无回滚面。

## 5. 技术决策（含理由）

1. **本地代理为唯一注入通道**：全 AI 面覆盖（含 workflow LLM 节点与 8 个 admin 弹窗，前端方案够不着）；零快照修改；回滚一行 update。代价是常驻进程与单点风险，用 verify 探测 + QUICKSTART 一键回直连对冲。
2. **`<parsed_document>` 文本注入格式对齐 NocoBase 原生**（系统提示注入同款包裹）：模型行为与上游 docx/xlsx/md 路径一致，降低差异面。
3. **图片走 M3 原生 `image_url`**：Task D 实跑铁证（data URI 成功、单图 10MB）；不引入 OCR/视觉模型路由/VL-01（已退役）。
4. **Portal 复用 dex 不播种 form_assistant**：与 N18/官方 demo 同款；避免「救活旧面板」与新诉求（换成聊天式）方向冲突。
5. **解析失败注入占位文本而非透传原 part**：MiniMax 静默忽略 file part 会诱发幻觉；明确占位让模型能如实告知用户。
6. **探针不进 verify**：verify 必须廉价幂等 keyless（现状）；探针耗真实 key 且 15~100s，独立脚本按需跑。
7. **新依赖落 `examples/package.json`**（unpdf 已有先例、exceljs/mammoth 视探针结果最小集）；遵循[依赖优先于手搓政策](../.agents/notes/implemented/process/2026-07-26-dependencies-over-hand-rolling.md)。

## 6. 风险与约束

| 风险 | 影响 | 缓解 |
|---|---|---|
| 代理单点（挂了全 AI 面 400/超时） | 高 | /healthz 探测进 verify；QUICKSTART「一键回直连」命令；代理无状态可随时重启 |
| `checkUrlAgainstWhitelist` 拦 localhost | 中（阻断 N22） | N22 第一步核实；拦截则走快照 env 配置白名单（仍零源码修改）；无解则降级 B 方案（Portal+弹窗前端注入，范围收窄并明示） |
| SSE 透传破坏流式（chunk 切割/压缩） | 中 | 只改写请求体不动响应体（过滤 reasoning 帧除外，按行解析 SSE 有既有范式 [`stream-parser.ts`](../platform/nocobase-portals/demo-portal-crm/src/extensions/nocobase-ai/providers/stream-parser.ts:18)）；真实对话回归 |
| M3 推理延迟 15~100s | 中（探针/验收等待） | 探针等待窗口 150s 对齐 n18-capture 先例；聊天式流式已消解用户感知 |
| 长文档 token 成本（>512k 翻倍档） | 低（演示量级） | 截断上限 + 截断标记；QUICKSTART 说明 |
| Portal 用户角色不可见 dex | 低 | N24 前置 listByUser 实测；必要时 n17 补 rolesAiEmployees 绑定 |
| Portal 构建环境（pnpm/网络代理） | 低 | 产物目录替换可反复；构建成功一次即可 |
| 快照不可改 | 硬约束 | 全部 NocoBase 侧改动 = REST 运行时配置；admin Sender 双击维持上游行为并标注 |

## 7. 回归基线（每批收口必跑，分区不跑全量）

`setup-nocobase.mts verify`（--env-file=.env）、`pnpm run typecheck`、`pnpm run doc-sync`、`pnpm vitest run examples/kb-agent/tests/`、三服务探测（:5432/:13000/:3080）；N24 后加 portal 双入口探测与浏览器实录截图。证据落 `examples/kb-agent/demos/nocobase-full-features/N2x-*.png`（对齐 N17/N18 惯例）。
