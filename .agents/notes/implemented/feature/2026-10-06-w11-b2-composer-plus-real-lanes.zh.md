# Agent Note: W11-B2 — Composer 加号面板成为真功能（describe/extract 双 RPC、语音三态契约、X20）

Status: implemented

[English](2026-10-06-w11-b2-composer-plus-real-lanes.md) | 中文

伴随笔记：Composer 胶囊的 46px wrapper 盒契约在 [2026-10-05-w11-b1-composer-capsule-contract.zh.md](2026-10-05-w11-b1-composer-capsule-contract.zh.md)；本笔记覆盖落在其上的 B2 三条真功能车道。

## 问题

加号面板的三个工具入口原是占位 toast。做成真功能需要一个「附件 → 会话」的注入 seam，仓库给出两条：wire 层已有多模态 `promptContentPartSchema`（base64 图片 part），但 kb-agent 组合默认走 MiniMax-M3（`llm-minimax`），其序列化器对图片 content 硬抛 `UNSUPPORTED_CONTENT`——T2（多模态消息体）直发会在模型层被拒。语音车道是另一种形状：微信 webview（产品主战场）从不暴露 `SpeechRecognition`，桌面 Safari/Chrome 在 HTTPS 下可用，纯 HTTP 过不了 secure-context 门槛——一个格子不能只有一张脸。

## 决策

- **T1（引用块）是 MVP 注入 seam；T2 deferral 但启用路径已实证。** apiproxy 两个最小 RPC：`data.describeImage`（图片经共享 attachment 准入——与 `session.prompt` 图片 part 同一套 20MB/64M 像素/2048px 规范化——再经部署配置的 VLM 端点出描述，返回可持久 `attachmentId`）与 `data.extractText`（pdf/md/txt 文本层，6000 码点 wire 上限，复用 `dsh-tool-kb` 的 `extractPdfText` 保持仓库单一提取实现；不落盘）。移动端把返回的描述/文本以可见可删的引用块拼进草稿；`send(text)` 保持纯文本契约，W9 身份链路零触碰。T2 将来启用是纯增量：wire schema、`admitEncodedImages` 持久管线、前端 `DraftAttachment` 行都已就位——缺的只是组合内出现吃图的 provider/model。
- **语音车道是三态契约，最便宜的拒绝最先判**（[useVoiceInput.ts](../../../../packages/client/ui-mobile/src/client/messages/chat/useVoiceInput.ts)）：`window.isSecureContext === false` 或构造器缺失落 `no`（面板渲染三格无语音——微信 webview 与 HTTP 部署的预期面），构造抛错落 `broken`（格子惰性 + 提示 toast），运行中 `onerror`（`not-allowed`/`service-not-allowed`/`audio-capture`/`network`）降级为人话 toast 并退场聆听卡——绝不留卡死态。识别文本只经回调流出；hook 不碰草稿存储。
- **X20（连续工具行折叠 flow 间隙）：** `.toolRow + .toolRow { margin-top: -5px }` 把消息流的 10px 间隙折成一个状态组，由 `composer-skin.client.spec.ts` 钉住。
- **antd-mobile TextArea 把 `aria-label` 放在 wrapper 而非元素上**——活体探针实证：`.adm-text-area[aria-label="消息输入"]` 命中，`textarea[aria-label]` 不命中。原生 `<textarea>` 自身无可访问名；探针与 a11y 锚点必须指 wrapper（或用 placeholder）。

## 影响

- 模型回合只能经由用户发送前可见可删的引用块读到附件内容——引用整段天然对用户可见；提取失败落在 chip 上（`data-extract-failed` → 扫描件提示话术）而不是静默发空。
- 语音探测判定是面板消费的 prop（`voiceSupported: 'yes' | 'no' | 'broken'`）；jsdom spec 钉隐藏分支与三条 picker 车道，真机裁定归清单（[w11-b3-voice-realdevice.md](../../../../demos/acceptance-w11/w11-b3-voice-realdevice.md)，OQ-2 用户回填）。
- 微信内预期：工具区三格、无语音格——这个「不在」就是契约在工作，不是回归。
- Office 文件（docx/xlsx）、微信 JS-SDK 麦克风车道、端侧 ASR（sherpa-onnx）、多模态 T2 进 W12 池（deferral 记录在 [demos/acceptance-w11/INDEX.md](../../../../demos/acceptance-w11/INDEX.md)）。

## 备选方案

- 前端 pdfjs-dist 提取——实施期翻转为服务端：仓库 `dsh-tool-kb` 已持有 `extractPdfText`（unpdf 懒加载），前端 pdfjs 要加 ~1MB bundle、vite worker 配置和 client-bundle-purity 门禁面，却无新能力。
- T2（图片走 wire content part）作为 MVP——wire schema 与持久准入管线都是真的，但 `llm-minimax` 序列化器对图片 content 抛 `UNSUPPORTED_CONTENT`、DeepSeek 无 vision 模型，直发会在模型层被拒；T1 今天就交付用户价值，T2 保持纯增量。
- 云 ASR 车道（MediaRecorder → 云端语音）作语音兜底——MiniMax CLI 无 ASR 命令、平台 ASR 型号未确证；Web Speech 三态契约把降级做诚实。
- `no` 态语音渲染灰格而非隐藏——微信 webview 里该格永远不可用，常驻死格等于宣传一个页面交付不了的能力；三个活格是诚实的网格。
