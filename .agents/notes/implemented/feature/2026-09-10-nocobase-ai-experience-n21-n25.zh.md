# Agent Note: NocoBase AI 体验 N21–N25 —— 附件代理、原生图片、Portal AI 员工、think 过滤

Status: implemented

[English](2026-09-10-nocobase-ai-experience-n21-n25.md) | 中文

## 问题

冻结的 NocoBase 2.2.6 OSS 快照上有三类用户诉求：AI 雇员对话里上传的附件（pdf/docx/xlsx/md）模型看不到、图片可见性未验证、Portal 的「AI 智能填表」入口不可用（硬编码的 `form-assistant` 员工从未存在，且一次性 45s 补全超时撑不过 MiniMax-M3 的 15–100s 推理）。第四个刺激点：M3 的回答内联 `<think>…</think>` 推理链直接呈现给最终用户。快照不可修改，所有修复只能落在运行时配置、REST、vendored Portal 源码或本地代理。

## 考虑过的替代方案

- 前端上传前解析注入（Portal 或 admin 组件）——否决：只覆盖被改过的入口；悬浮球、工作台、admin 弹窗、workflow LLM 节点全部绕开，且解析文本以普通消息污染会话历史。
- 改快照 provider 的附件分流——直接否决：违反快照冻结约束。
- 播种缺失的 `form_assistant` 员工救活 AiFillPanel——否决：用户要求的是换掉面板而非救活；员工存在也救不了 45s 超时对 M3 延迟的结构性不兼容。
- 九个雇员提示词追加「不要输出推理过程」——否决作为主修复：M3 照发 think 链，提示抑制是建议性的，wire 层剥离才是确定性的；且九行提示词要双语维护。
- 图片走 OCR 或视觉模型路由——在任何代码之前否决：MiniMax-M3 原生消费 `image_url` part（生产 API 实测 data URI），plugin-ai 已生成该格式。

## 决策

1. **探针先行（N21）。** 自清理 REST 探针（`examples/kb-agent/scripts/nocobase-n21-attachment-probe.mts`）经真实 wire（`aiFiles:create` + 带 `attachments` 的 `aiConversations:sendMessages`）逐格式测可见性：每格式文件内嵌唯一标记串、以模型逐字转述为判定、`finally` 里销毁会话与文件、起止双向零残留断言。NocoBase 不记录出站 LLM 请求体，wire 证据锚定在入站请求日志（mimetype/extname 决定解析分支）加直连 MiniMax 差分实验（OpenAI `file` part 被静默忽略、`<parsed_document>` 文本被消费）。矩阵翻转了一个假设：pdf 是唯一真不可见格式，docx/xlsx/md/图片本就可见。
2. **回环代理是唯一注入通道（N22）。** llmService「MiniMax」的 baseURL 指向 `http://127.0.0.1:13100/v1`（`examples/kb-agent/scripts/nocobase-n22-llm-proxy.mts`），代理只改写 OpenAI file part——base64 解码、unpdf 提取 PDF 文本层（与 `packages/kb/tool-kb` 的 `extractPdfText` 同通道，零新依赖）、替换为与上游 document-loader 对 docx/xlsx/md 相同包裹的 `{type:'text'}` part。llmService 的全部消费方（雇员对话、workflow LLM 节点、`ai:listModels`）一体覆盖。白名单风险以读快照源码收口：`checkUrlAgainstWhitelist` 只在设置了 `SERVER_REQUEST_WHITELIST` 时强制；未设置（本仓库的启动路径）告警放行，回环 baseURL 无需任何配置。回滚一行命令（`ai-proxy stop` 自动把 baseURL 回写直连；`ai-direct` 单独可用）。解析失败、非 PDF file-part MIME、无文本层 PDF 均以点名文件的显式 HTTP 错误失败——静默忽略附件正是代理要消除的失败模式。
3. **图片零改动（N21/N23）。** M3 原生消费 plugin-ai 既有 `image_url` data URI part；边界探针锁定单图 ≤10MB（JPEG/PNG/GIF/WEBP）、超大图在前端显式报错而非静默。无 OCR、无视觉路由、无重编码。
4. **Portal 表单入口是头像按钮加内嵌聊天（N24）。** 四个挂载点（CRM 商机/线索、Hub 报销/销售线索）以 `useAiEmployeeFill` 整体替换 AiFillPanel，只用 vendored 组件：抽屉底部按钮旁 dex 头像、表单内 ChatInline 面板、按既有 `ai-form.tsx` 范式做 form-registry 与 frontend-tool-registry 声明。流式输出天然消解「填充无反馈」债。两个上游行为在挂载侧中和而非改 vendored 共享组件：`FormFillerAutoApprover` 组件对本面板会话的 formFiller 中断直接放行（vendored provider 硬编码 `canAutoApproveToolCall` 为 false，而服务端把 formFiller 标记 auto 后中断等待——没有放行器，工具卡死锁在「运行中」）；`openingRef` 守卫做双击防抖，只开一个面板一个会话。
5. **think 链在响应 wire 上剥离（N25）。** 抓流证实 M3 把推理内联在 `choices[].delta.content`（该 wire 无独立 reasoning 字段），开闭标签与正文同帧。代理为每流每 choice 跑一个 `ThinkFilter` 状态机：跨 chunk 拆开的标签前缀扣留（≤6 字符）直到补全或证伪，finish 帧吸收 think 外的扣留文本（顺序保持正文先于 stop），SSE 帧经 StringDecoder 解码、内容未变的帧字节原样透传，无法解析的帧原样放行。非流式对 `choices[].message.content` 跑同一状态机；形状意外原字节返回。开关是 `N22_FILTER_THINK`（默认开；`0/false/off` 重启代理后恢复原样透传——回滚路径写入代理头部注释与 QUICKSTART.zh.md）。每流日志只含段数/字符数/帧数，不落回复正文。`examples/kb-agent/tests/n22-think-filter.spec.ts` keyless 锁定状态机（13 例，含 chunk 尺寸 1–40 穿过两个标签、以及真实流量从未切分的帧中段标签）。
6. **n18 孤儿按钮自愈、verify 按自有前缀计数（N25/N26）。** `flowModels:destroy` 级联删除表单子节点，而 `flowModels:save` 接受 dangling `parentId`——两条事实均由实测确立——孤儿按钮可由重放/uid 漂移持久化。`nocobase-n18-form-ai.mts` 销毁 uid 带 `n18ai-` 前缀但后缀匹配不到任何 CreateFormModel 行的按钮并明说；二跑报「无孤儿」。`setup-nocobase.mts verify` 按 `n18ai-` 前缀计数 AIEmployeeButtonModel（≥8 且全部带前缀），外来按钮既凑不了数也藏不住。

## 影响

代理是全部 AI 面单点，代价是自觉支付的：`/healthz` 与 baseURL 接线是 verify 断言且失败消息内嵌修复命令，`ai-proxy stop` 把 llmService 回写直连，面板降级为代理前状态（仅失去 PDF 可见）而非死端点。附件可见性、Portal 替换、think 过滤由 `examples/kb-agent/demos/nocobase-full-features/` 下的证据文档（`N21-attachment-visibility*.md`、`N22-attachment-proxy.md`、`N23-image-boundary.md`、`N24-portal-ai-employee.md`、`N25-think-filter-and-selfheal.md`）加 keyless 过滤单测钉住；附件、Portal 挂载点、边界与开关回滚的操作导览在 `examples/kb-agent/QUICKSTART.zh.md`。已知缺口保持可见：Hub 表单挂载点填充正常但本实例没有目标集合（提交显式报错）、M3 填充延迟 40~240s 波动（流式保住反馈）、纯图片 PDF 无文本层可提取（代理按名拒绝）。
