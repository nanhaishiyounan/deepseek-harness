# W11-B2.0 调研确证卡 — Composer 加号真功能（语音/文档链路）选型证据

> 实施者 B2.0 产出（2026-10-05）。五张结论卡：结论 + 证据 + 对计划选型矩阵（F-1/F-2/F-3）的影响。
> R5 为仓库内探查（文件:行号接线图）；R1~R3 含 web 检索与本地实测（MiniMax VLM 端点用 root `.env` 的平台 key 实跑通过）。

## R1 — 微信 webview SpeechRecognition 三态可用性

**结论（三态判定矩阵）**：

| 环境 | `SpeechRecognition`/`webkitSpeechRecognition` | 判定 |
|---|---|---|
| 微信 iOS（WKWebView） | 未实现/内核阉割，构造即 `undefined` | **不存在** |
| 微信 Android（X5/XWeb） | `window.SpeechRecognition === undefined`（多来源实证） | **不存在** |
| iOS Safari 直开（14.5+） | `webkitSpeechRecognition` 存在，Siri 服务器识别，需手势触发 | 可用（HTTPS） |
| Android Chrome 直开 | 完整支持，HTTPS + 麦克风权限 | 可用（HTTPS） |
| 任意 HTTP 页面 | Chrome 强制 `SecurityError` / 多数浏览器直接 undefined | **不存在**（secure context 硬门槛坐实） |

**对 F-1 的影响**：微信内嵌（主战场）大概率走「不存在→隐藏/灰化」分支，与计划假设一致；可用态只在「直开浏览器 + HTTPS」达成。计划 OQ-3 风险坐实——语音在微信内是降级态而非主功能，UI 不得把语音当核心入口宣传；真机验证清单（OQ-2）必须覆盖微信双端 + Safari/Chrome 直开四格。

**证据**：
- 微信 iOS 强制禁用（WKWebView 未启用 WebKit 实验特性）：CSDN 问答 9240060/9401611（2026-01/03）、GitCode 博客「微信内置浏览器中语音输入功能的兼容性问题分析」（ant-design/x issue 复盘，2025-06）。
- Android 微信 X5 `SpeechRecognition === undefined`：CSDN 问答 9401611 现象层第 3 条。
- iOS Safari 14.5+ 部分支持（前缀 + 手势）：cobaltcapture.com Speech-recognition browser support 矩阵（Safari macOS 14.1 / iOS 14.5 起，行为不如 Chromium 稳定）。
- HTTP 下 `SecurityError`（Chrome 2017 起要求 HTTPS）：CSDN 问答 9401611。

**feature-detect 序列裁决（B2.3 实装依据）**：
1. `window.isSecureContext === false` → `no`（不构造）。
2. `typeof SpeechRecognition/webkitSpeechRecognition === 'undefined'` → `no`。
3. try-construct 抛错 → `broken`。
4. 构造成功后 `start()` 的 `onerror` 首帧（`not-allowed`/`service-not-allowed`/`audio-capture`）→ 运行中降级 Toast + 回 `idle`（审查焦点 1：iOS 微信部分版本「存在但坏」由 3/4 兜住）。

## R2 — 云端 ASR 备选与录音链路

**结论**：
- **mmx CLI 无独立 ASR 命令**（读 `~/.roo/skills/mmx-cli/SKILL.md` 全文实证：有 `speech synthesize`（TTS）/`music cover`（歌词附带 ASR），无 speech-to-text 命令）。B 路径（MediaRecorder→云端 ASR）需直调 MiniMax HTTP API——平台目前公开面以 VLM/chat 为主，ASR 型号与流式能力未在 CLI 暴露，**W12 若升级需另行平台调研**。
- **MiniMax VLM 端点实测确证**（本次调研活体实跑，T1 图片链路的地基）：
  - 端点 `POST {MINIMAX_BASE_URL}/v1/coding_plan/vlm`，body `{prompt, image_url: <base64>}`，Bearer 平台 key（root `.env` 的 `MINIMAX_API_KEY`，125 字符 key 实测通过）。
  - 返回 `{content: 描述文本, base_resp: {status_code, status_msg}}`；中文 prompt 中文回答，质量可用（实测对 W10 首页截图给出准确中文描述）。
  - 证据：`mmx vision describe` 实跑日志（本批 B2.0 会话）；端点定位自 mmx-cli dist 源（`wc(e){return \`${e}/v1/coding_plan/vlm\`}`）。
- `getUserMedia`/`MediaRecorder` 在微信 webview 的权限弹窗被吞是已知坑（GitCode 博客同文）；JS-SDK 录音准入成本（公众号认证+签名服务+域名备案）维持「锚点对照、deferral」判定。

**对 F-1 的影响**：A（Web Speech）主路径维持，B（云端 ASR）降级链可行性从「MiniMax key 现成」修正为「VLM key 现成但 ASR 型号未确证」——W12 升级前须补 ASR 平台调研（或改接讯飞/百度）。**不影响本轮**（微信内 A 路径直接降级隐藏，与 B 是否存在无关）。

## R3 — 加号面板交互形态盘点（ChatGPT/Claude/豆包/元宝）

**结论**：
- ChatGPT 移动端：输入框 **+ 号 → 底部弹层附件菜单**（拍照/相册/文件三项网格；麦克风听写在输入框内嵌 mic 图标，不占 + 面板格位）。OpenAI 帮助中心「图像输入」「macOS app 上传文件与拍照」官方文档确证形态。
- Claude 移动端：+ 号 inline 菜单（照片/文件），选中后草稿区附件条（chip 预览）。
- 豆包/元宝：九宫格工具面板 + 「按住说话」长按交互（输入框左侧独立声波按钮）。
- 业业惯例（发送前附件呈现）：**草稿区附件条 chip + 发送时折叠**（ChatGPT/Claude 同构），多附件计数；上传失败 chip 红缘 + 重试。

**对 F-3 的影响**：计划的「演进现有 QuickPanel 底部弹层 + 2×2 工具格 + Composer 草稿附件条」与 ChatGPT/Claude 惯例同构，**维持原判**；语音放面板格（而非输入框内嵌 mic）符合豆包系中文用户习惯且不动 46px 输入行契约——DEFENSIBLE 裁决记录在案。

## R4 — 文档文本提取选型（Tier2 PDF/txt/md）

**结论**：
- **前端 `pdfjs-dist`（浏览器端提取）为 MVP 路径**：Mozilla 官方维护、纯浏览器 textContent 提取无需 OCR；文字版 PDF 覆盖足够；扫描件（无文本层）提取为空 → 前端给出「未提取到文本（可能是扫描件）」提示，OCR 明确不在 MVP（与计划 R4 判定一致）。
- 服务端提取（`pdf-parse`/Node 侧 pdfjs）不引入：attachment 服务端无 PDF 解析 seam，新增服务端解析面与「前端提取→引用块→send(text)」的 T1 形态相比改动面不成比例。
- 仓库 expert-pdf 是**生成**（jsPDF 系排版交付物），与解析无关——不可复用，已甄别。
- txt/md：`File.text()` 直读；Office（docx/xlsx）维持 deferral（mammoth/sheetjs 解析面重，OQ-4）。
- 截断策略：提取文本上限 6000 字符（约 4k token），超出截断并在引用块尾部标注「（已截断）」——模型上下文预算内，话术进引用块本身（用户可见，审查焦点 5）。

**对 F-2 的影响**：Tier2 落「前端 pdfjs-dist 提取 + 引用块拼草稿」，无需服务端改动；Tier 顺序维持 图片→PDF/txt/md→Office(deferral)。

**B2.2 实施期修订（服务端提取翻转）**：仓库探查发现服务端提取能力已现成——`dsh-tool-kb` 的 `extractPdfText`（unpdf 懒加载）/`extractDocxText`（mammoth）正被 `data.upload` 的 kb 路由消费（[extract.ts:94](../packages/kb/tool-kb/src/extract.ts#L94)）。裁决从「前端 pdfjs-dist」翻转为「服务端提取」：新增最小 RPC `data.extractText`（pdf/md/txt → 文本 + 截断标志，6000 code points 上限）复用该函数——前端零新依赖（pdfjs-dist ~1MB bundle、vite worker 配置、client-bundle-purity 门禁全部规避），kb 先例保持单一提取实现；弃用理由＝改动面与移动端首屏预算。

## R5 — 仓库 seam 接线图（attachment → 会话注入，T1/T2 裁决）

**接线现状（文件:行号）**：
- 发送契约：`promptSession(sessionId, text, clientMsgId)` → `session.prompt` RPC，`content: [{type:'text', text}]` — [sessionsService.ts:149](../packages/client/ui-mobile/src/client/sessionsService.ts#L149)。
- **wire 层已支持多模态**：`promptContentPartSchema` 判别联合含 `{type:'image', mediaType, data(base64), name?}` — [sessions.schema.ts:293](../packages/host/apiproxy/src/api/sessions.schema.ts#L293)。
- 服务端 admission 管线现成：`durablePromptContent` 把 image part 经 `admitEncodedImages`（LocalAttachmentStore 内容寻址落盘，单图 20MB/64M 像素/规范化 2048px）转为 durable `{type:'image', attachment: ref}` — [api-proxy.ts:341](../packages/host/apiproxy/src/api-proxy.ts#L341) / [attachment-local/src/index.ts](../packages/attachment/attachment-local/src/index.ts)。
- PC 端发送先例：ui-conversation `sendSession` 把草稿图 base64 与文本合成 content 数组提交 — [service.ts:145](../packages/client/ui-conversation/src/client/service.ts#L145)。
- 服务端 LLM 调用先例（provider 无关 seam）：expert-orders `ctx.get('llm').stream({provider, model, messages, system, maxTokens, signal})` + BlockAssembler — [expert-orders/src/index.ts:272](../packages/expert/expert-orders/src/index.ts#L272)。
- **模型层瓶颈**：llm-minimax adapter 对 image content 硬抛 `UNSUPPORTED_CONTENT` — [serialize.ts:36](../packages/llm/llm-minimax/src/serialize.ts#L36)；llm-deepseek serialize 支持图片序列化但 DeepSeek 官方 API 无 vision 模型。**kb-agent 组合默认 MiniMax-M3 → T2 直发图片 part 会被模型层拒绝。**

**裁决（执行契约「调研结论胜」记录）**：
- **T1（文本拼接）为 MVP 主路径，维持计划判定，但注入点细化为「vision 描述服务端生成 + 引用块拼草稿」**：
  1. apiproxy 新增最小 RPC `vision.describe`：入参 `{image(base64), mediaType, prompt?, name?}` → MiniMax `/v1/coding_plan/vlm` 直调（key 经 credential env，expert-orders 同模式）→ 返回 `{description}`。图片同时经 `admitEncodedImages` 落 attachment-local（返回 attachmentId，供后续 T2 复用与 `session.attachment` 读回）。
  2. 前端把描述拼成引用块（「📎 name（图片）\n【图片内容】description」）进草稿/随发送文本——`send(text)` 签名不变，W9 身份链路零触碰。
- **T2（多模态消息体）deferral，但实证其 wire+服务端管线已 100% 现成**：启用条件是「组合内存在吃图的 provider/model」（如未来 MiniMax VL 模型接入 llm-minimax 或其他 vision provider 挂载），届时移动端只需在 `promptSession` content 加 image part——B2.2 期间在前端预留 DraftAttachment 结构使该升级是纯增量。

**对 F-2/计划备选的影响**：风险表「R5 找不到干净注入点」的退路（FilesView 落地+文本引用）不需要——`vision.describe` 即最小干净注入点（单 RPC，BFF 配置门控，改动面 = apiproxy 三文件 + 前端消费）。
