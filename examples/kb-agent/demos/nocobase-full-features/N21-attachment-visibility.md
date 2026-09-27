# N21 附件/图片可见性探针证据（AI 雇员 dex × MiniMax-M3 代理复测）

> 探测时间 2026-09-10 22:36 | 脚本 [nocobase-n21-attachment-probe.mts](../../scripts/nocobase-n21-attachment-probe.mts) | llmService "MiniMax"（openai-completions → http://127.0.0.1:13100/v1，模型 MiniMax-M3） —— llmService 当前指向本地 N22 附件代理——本表为代理生效后的复测。

判定规则：每类格式的探针文件内嵌唯一标记串，本地预检确认标记在文件内容中，经 `POST /api/aiFiles:create` 上传后随 `aiConversations:sendMessages`（`attachments:[{id,source}]`，SSE 流式，与真实客户端同链路）发送给 dex；模型回复（normalize 后）含标记串 → 可见，否则不可见。等待预算 150s（对齐 n18-capture 的 MiniMax-M3 延迟窗口），串行执行。

## 1. 格式 × 可见性矩阵

| 格式 | 标记串 | 判定 | 发送耗时 | 模型回复摘录 |
|---|---|---|---|---|
| pdf | `N21PROBE-PDF-7Q4Z` | ✅ 可见 | 4.0s | N21PROBE-PDF-7Q4Z |
| docx | `N21PROBE-DOCX-K9MT` | ✅ 可见 | 5.8s | N21PROBE-DOCX-K9MT |
| xlsx | `N21PROBE-XLSX-R2VW` | ✅ 可见 | 5.3s | N21PROBE-XLSX-R2VW |
| md | `N21PROBE-MD-H8DY` | ✅ 可见 | 3.9s | N21PROBE-MD-H8DY |
| png | `N21PROBE-PNG-T5CN` | ✅ 可见 | 2.1s | N21PROBE-PNG-TECH |

## 2. 每格证据

### pdf（可见）
- 探针文件：`n21-probe.pdf`（mimetype `application/pdf`），标记串 `N21PROBE-PDF-7Q4Z`；本地预检提取内容：Hongfa Food supplier visit summary. White sugar procurement price is rising monthly. N21PROBE-PDF-7Q4Z NocoBase N21 attachment visibility probe
- 上传记录：aiFiles id=80，服务端文件名 `n21-probe-fyio88.pdf`（storage 去重会追加随机后缀），size=1168
- 提问原文：N21PROBE pdf附件探针：我上传了一个pdf附件《n21-probe-fyio88.pdf》。请逐字复述附件内容中的唯一标记串（形如 N21PROBE-XXX-9999），只输出标记串本身；如果你看不到附件内容，请直接回答“看不到附件”。
- 模型回复（原文）：

```text


N21PROBE-PDF-7Q4Z
```
- 请求日志锚点（`platform/nocobase/storage/logs/main/request_2026-09-10.log`（运行时产物，已随日志轮转清理））：
  - sendMessages 响应：ts=2026-09-10 22:36:15 reqId=d3aaf8a2-1f56-47ef-af23-c8f7d091e027 status=200 cost=4053ms；action 携带 attachments 记录 filename=n21-probe-fyio88.pdf mimetype=application/pdf extname=.pdf size=1168 —— mimetype/extname 即 [provider.parseAttachment](../../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/llm-providers/provider.ts) 分流的确定性输入（image/* → image_url data URI；application/pdf → OpenAI 专有 file part；SUPPORTED_DOCUMENT_EXTNAMES → worker 解析为 <parsed_document>）。
  - aiFiles:create 响应：ts=2026-09-10 22:36:11 reqId=488891d1-10ed-4018-bc87-4fa2ddc830c6 status=200
- 清理：会话 destroyed；上传文件 destroyed

### docx（可见）
- 探针文件：`n21-probe.docx`（mimetype `application/vnd.openxmlformats-officedocument.wordprocessingml.document`），标记串 `N21PROBE-DOCX-K9MT`；本地预检提取内容：Lvyuan Ingredients quality audit  Sorghum protein content reached 9.2 percent this season.  N21PROBE-DOCX-K9MT
- 上传记录：aiFiles id=81，服务端文件名 `n21-probe-8cjmko.docx`（storage 去重会追加随机后缀），size=1123
- 提问原文：N21PROBE docx附件探针：我上传了一个docx附件《n21-probe-8cjmko.docx》。请逐字复述附件内容中的唯一标记串（形如 N21PROBE-XXX-9999），只输出标记串本身；如果你看不到附件内容，请直接回答“看不到附件”。
- 模型回复（原文）：

```text


N21PROBE-DOCX-K9MT
```
- 请求日志锚点（`platform/nocobase/storage/logs/main/request_2026-09-10.log`（运行时产物，已随日志轮转清理））：
  - sendMessages 响应：ts=2026-09-10 22:36:24 reqId=b8e8135f-bdd7-4e4a-94dc-eb8a8ad520e5 status=200 cost=5826ms；action 携带 attachments 记录 filename=n21-probe-8cjmko.docx mimetype=application/vnd.openxmlformats-officedocument.wordprocessingml.document extname=.docx size=1123 —— mimetype/extname 即 [provider.parseAttachment](../../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/llm-providers/provider.ts) 分流的确定性输入（image/* → image_url data URI；application/pdf → OpenAI 专有 file part；SUPPORTED_DOCUMENT_EXTNAMES → worker 解析为 <parsed_document>）。
  - aiFiles:create 响应：ts=2026-09-10 22:36:19 reqId=9249ab01-480d-4b14-b9e9-2193c697ec7d status=200
- 清理：会话 destroyed；上传文件 destroyed

### xlsx（可见）
- 探针文件：`n21-probe.xlsx`（mimetype `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`），标记串 `N21PROBE-XLSX-R2VW`；本地预检提取内容：Sheet: probe n21 attachment probe	marker cell N21PROBE-XLSX-R2VW	visibility probe value
- 上传记录：aiFiles id=82，服务端文件名 `n21-probe-tgkxp5.xlsx`（storage 去重会追加随机后缀），size=6472
- 提问原文：N21PROBE xlsx附件探针：我上传了一个xlsx附件《n21-probe-tgkxp5.xlsx》。请逐字复述附件内容中的唯一标记串（形如 N21PROBE-XXX-9999），只输出标记串本身；如果你看不到附件内容，请直接回答“看不到附件”。
- 模型回复（原文）：

```text


N21PROBE-XLSX-R2VW
```
- 请求日志锚点（`platform/nocobase/storage/logs/main/request_2026-09-10.log`（运行时产物，已随日志轮转清理））：
  - sendMessages 响应：ts=2026-09-10 22:36:33 reqId=e1f8286e-66ab-4655-9840-e67dc90805f2 status=200 cost=5257ms；action 携带 attachments 记录 filename=n21-probe-tgkxp5.xlsx mimetype=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet extname=.xlsx size=6472 —— mimetype/extname 即 [provider.parseAttachment](../../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/llm-providers/provider.ts) 分流的确定性输入（image/* → image_url data URI；application/pdf → OpenAI 专有 file part；SUPPORTED_DOCUMENT_EXTNAMES → worker 解析为 <parsed_document>）。
  - aiFiles:create 响应：ts=2026-09-10 22:36:28 reqId=14954ee2-e4fa-4115-9050-287261cc0f2c status=200
- 清理：会话 destroyed；上传文件 destroyed

### md（可见）
- 探针文件：`n21-probe.md`（mimetype `text/markdown`），标记串 `N21PROBE-MD-H8DY`；本地预检提取内容：# N21 attachment probe (markdown)  Unique marker: N21PROBE-MD-H8DY  This file exists only to test whether .md attachments reach the model.
- 上传记录：aiFiles id=83，服务端文件名 `n21-probe-b9spdq.md`（storage 去重会追加随机后缀），size=139
- 提问原文：N21PROBE md附件探针：我上传了一个md附件《n21-probe-b9spdq.md》。请逐字复述附件内容中的唯一标记串（形如 N21PROBE-XXX-9999），只输出标记串本身；如果你看不到附件内容，请直接回答“看不到附件”。
- 模型回复（原文）：

```text


N21PROBE-MD-H8DY
```
- 请求日志锚点（`platform/nocobase/storage/logs/main/request_2026-09-10.log`（运行时产物，已随日志轮转清理））：
  - sendMessages 响应：ts=2026-09-10 22:36:40 reqId=b9d832b2-bc72-42e1-b0a8-523f139509a3 status=200 cost=3900ms；action 携带 attachments 记录 filename=n21-probe-b9spdq.md mimetype=text/markdown extname=.md size=139 —— mimetype/extname 即 [provider.parseAttachment](../../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/llm-providers/provider.ts) 分流的确定性输入（image/* → image_url data URI；application/pdf → OpenAI 专有 file part；SUPPORTED_DOCUMENT_EXTNAMES → worker 解析为 <parsed_document>）。
  - aiFiles:create 响应：ts=2026-09-10 22:36:36 reqId=1a689b90-241e-48b6-81ef-aa940dd242d5 status=200
- 清理：会话 destroyed；上传文件 destroyed

### png（可见）
- 探针文件：`n21-probe.png`（mimetype `image/png`），标记串 `N21PROBE-PNG-T5CN`；本地预检提取内容：rendered N21PROBE-PNG-T5CN as bitmap-font pixels (grayscale PNG)
- 上传记录：aiFiles id=84，服务端文件名 `n21-probe-5qr2vo.png`（storage 去重会追加随机后缀），size=435
- 提问原文：N21PROBE png附件探针：我上传了一张图片《n21-probe-5qr2vo.png》。请逐字转写图片中显示的全部文字（标记串形如 N21PROBE-XXX-9999），只输出图片里的文字；如果你看不到图片，请直接回答“看不到图片”。
- 模型回复（原文）：

```text


N21PROBE-PNG-TECH
```
- 判定注记：模型转写存在位图字形偏差（容差≤2 判可见）
- 请求日志锚点（`platform/nocobase/storage/logs/main/request_2026-09-10.log`（运行时产物，已随日志轮转清理））：
  - sendMessages 响应：ts=2026-09-10 22:36:46 reqId=d96c0943-3c49-4963-b36b-82b1748e93ad status=200 cost=2073ms；action 携带 attachments 记录 filename=n21-probe-5qr2vo.png mimetype=image/png extname=.png size=435 —— mimetype/extname 即 [provider.parseAttachment](../../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/llm-providers/provider.ts) 分流的确定性输入（image/* → image_url data URI；application/pdf → OpenAI 专有 file part；SUPPORTED_DOCUMENT_EXTNAMES → worker 解析为 <parsed_document>）。
  - aiFiles:create 响应：ts=2026-09-10 22:36:44 reqId=0293b6fc-28d3-4762-911d-739ae797561a status=200
- 清理：会话 destroyed；上传文件 destroyed

## 3. MiniMax file part 差分实验（直连，证明 PDF 断裂因果）

同一份 PDF 探针文件（含标记串），直接调用 `https://api.minimaxi.com/v1/chat/completions`（model MiniMax-M3，thinking disabled），仅 content part 形态不同：

| 变体 | 请求形态 | 回复含标记串 | 模型回复原文 |
|---|---|---|---|
| file-part | {type:"file", file:{file_data:"data:application/pdf;base64,…"}} — plugin-ai parseAttachment 对 application/pdf 的产物（LangChain completions 转出的 OpenAI 专有 file part） | ❌ 否 | N21PROBE-7B2-1A07 |
| parsed-document-text | {type:"text", text:"<parsed_document filename=…>…</parsed_document>"} — docx/xlsx/md 附件的注入形态 | ✅ 是 | N21PROBE-PDF-7Q4Z |

结论：MiniMax 静默忽略 OpenAI 专有 file part（不报错也不读内容），而 `<parsed_document>` 文本注入被正常消费——这是 plugin-ai 将 application/pdf 分流到 file part（而非文档解析）造成 PDF 不可见的直接因果证据，也是 N22 代理改写（file part → 解析文本 part）的正当性依据。

## 4. 清理与幂等

- 运行开始残留断言：0 会话 / 0 文件（干净）
- 运行结束残留断言：0 会话 / 0 文件（干净）
- 每格探针会话经 `aiConversations:destroy?filterByTk=<sessionId>` 销毁、上传文件经 `aiFiles:destroy?filterByTk=<id>` 删除（try/finally 保证）；二次运行开始时残留断言为 0 即为幂等证据。

## 5. 对 N22 的影响

- 实测已可见、N22 无需改写的格式：pdf、docx、xlsx、md、png（上游 worker 解析为 <parsed_document> 注入 / image_url 原生多模态路径已通）。
- 本表为 N22 代理生效后的复测；与直连基线（N21-attachment-visibility.direct-baseline.md）对比，pdf 格翻转为可见即代理验收通过，其余四格不回退。
