# Agent Note: kb 工作台浏览器文件上传——kb.upload 网关通道

Status: implemented

[English](2026-09-02-kb-browser-upload.md) | 中文

## Problem

kb 工作台的入库向导只接受服务器路径（浏览 `host.listDirectory` 后手输文件名）与网页 URL。持有本地文档的浏览器用户无从入库：文件必须先由管理员放到服务器上，文件页签的提示也正是这么说的。产品目标——用户随时随地用自己的文件构建知识库——需要一条浏览器→网关的字节通道，并复用既有通道的租户/写门禁与入库管线。

## Decision

### Wire 形态：单一 unary JSON 方法、base64 字节、单文件单调用

`kb.upload` 是 kb 域的第五个 unary 路由：payload `{ filename, data, doc_kind?, title?, collected_at? }`，响应对共享的 `KbIngestView`。字节以规范 RFC-4648 base64 文本随标准 `application/json` POST 信封传输，一个文件一次调用——浏览器端对批量做循环。这与仓库唯一既有的浏览器→宿主字节先例（`session.prompt` 的 base64 图片分块经 `admitEncodedImages` 准入）一致，并保持 carrier 的跨站写围栏完整：fetch handler 只接受 JSON 媒体类型，使带副作用的 RPC 必须经过服务器永不应答的 CORS 预检；multipart 或 octet-stream 路由会为无功能收益在该围栏上凿开第二条内容类型通路。zod schema 钉死 base64 字母表（Node 解码器是宽容的，会静默丢弃非法字符），而字节大小上限保留为业务拒绝，客户端因此拿到结构化的 `kb-upload-too-large` 错误而非笼统的 bad-request。

多文件批量的数组 payload 被否决：逐文件调用让向导里的逐文件错误归因与进度行天然成立，无需在 wire 上发明部分失败语义，且 `session.prompt` 的逐图准入就是既定粒度。

### 落地目录：宿主 cwd 下的 workspace/data/uploads

网关解码 payload、净化文件名，把原始字节写入 `ApiProxyDefaults.cwd`（宿主进程 cwd，`kb.ingest` 路径解析的同一根）下的 `workspace/data/uploads/<name>`，再按文件通道完全相同的代码解析入库：`INGEST_EXTENSIONS` 门禁、`parseIngestDocKind`、md/txt 的 fatal-UTF-8 文本解码（对齐 `fs.readText` 的 FS_NOT_TEXT 拒绝而非存入替换字符）、二进制的 `extractPdfText`/`extractDocxText`，以及 `storeKbDocument` 以 `sourcePath: workspace/data/uploads/<name>` 落库——同名文件再次上传按 seam 的同路径语义替换先前文档。持久的落盘是刻意决定：上传的语料在磁盘上可审计、可重解析；kb-agent 示例中既有的 `workspace/data/*` 忽略规则（按语料目录白名单）已天然排除 `uploads/`（`.gitignore` 注释点名了该目录）。网关直接走 `node:fs/promises` 写入，因为 fs capability 的写面是文本+target 形态（`writeText` 需先 resolve 出 `FsTarget`），承载不了 pdf/docx 二进制字节。

### 安全门禁：共享写围栏加文件名净化

`kb.upload` 与 `kb.ingest`/`kb.ingestUrl` 跑在同一个 `ingestGates()` 之后——`kb-not-composed`、`kb-write-disabled`（部署侧 `kbWriteEnabled` 显式开启；其 JSDoc 与拒绝消息现已点名三个写方法）、config 绑定的 `kbTenant`；wire 永不携带租户。文件名归约到最后一个 `/` 或 `\` 分隔段，控制字符与点保留名被拒绝（`kb-invalid-filename`）：原始名里的目录穿越最多只能选中最后一段，归约为空的名字没有安全落地名。解码后的字节长度沿用文件通道的 `MAX_KB_INGEST_BYTES`（64 MiB）上限。`rpc.ts`/`rpc.schema.ts` 的 wire 表由 zod base64 正则与共享错误码词汇（`kb-upload-too-large`、`kb-invalid-filename`）补全。

### 工作台 UX：上传优先的向导

入库向导默认打开新增的"上传本地文件"页签：选择标签背后是一个 `multiple accept=".md,.txt,.pdf,.docx"` 的 `input[type=file]`；网页链接与服务器文件页签原样排在其后。每个选中的文件占一行（busy → 带片段数的 done → 分类后的失败），上传顺序执行，批次带序号令牌竞态守卫——重开对话框会丢弃被取代批次的迟到行更新，与浏览列表的 `browseSeq` 同一纪律。ui-kb 插件在客户端把 `File` 字节编码为 base64（`base64Of`，分块调用因为 `String.fromCharCode` 展开受参数上限约束），并与其他入库面一样把 `workspace/data/uploads/<name>` 的 sighting 与 receipt 一并记录。服务器文件页签的不可用文案改为引导使用上传/URL，而非仅"联系管理员"。

## Alternatives considered

**multipart/form-data 或 raw-body 上传路由。** 否决：它需要在 JSON-only 的 `/api/` POST 围栏（其存在意义正是让跨站写经过无应答的预检）之外开出第二条物理 carrier 通路，而最大现实 payload（64 MiB → 单个 JSON body 里约 85 MiB base64）远在本地部署的 fetch 预算内。attachment 图片先例已证明 base64-in-JSON 对浏览器字节足够。

**文件数组的 `kb.uploadBatch`。** 否决：逐文件调用把错误归因、重试与进度留在向导循环本地；批量 payload 需要在 wire 上发明部分失败语义，却拿不到循环给不了的任何东西。

**落地到临时目录并从内存入库。** 否决：不会留下可审计或可重解析的持久副本，且让重上传幂等的同路径替换语义失去了稳定的 `workspace/data/uploads/<name>` sourcePath 锚点。

**经 fs capability 的写面写入。** 否决：`writeText` 只支持文本且需 resolve target，承载不了 pdf/docx 字节；二进制上传会为一个调用方给 fs 增设第二种写方法。

## Consequences

网关多了一个由同一开关守卫的写面；未设置 `kbWriteEnabled` 的部署会在上传页签收到共享的只读拒绝，向导的失败分类将其渲染为通用入库失败行文案。base64-in-JSON 每次上传多付约 33% 的 wire 开销——在 64 MiB 上限内对工作台工具可接受，也是围栏安全替代方案的代价。uploads 目录是部署状态：examples/kb-agent 由既有 `workspace/data/*` 规则忽略，其他部署应显式将其排除出版本控制。向导默认页签从 URL 改为上传，假设打开即 URL 页签的测试与文档随行为一并更新。

## Testing

`packages/host/apiproxy/tests/kb-domain.spec.ts` 承载部署门禁与上传矩阵（门禁、落盘字节、pdf 解析、穿越净化、保留名、扩展名/doc_kind 拒绝、64 MiB 上限、非法 UTF-8）。`fetch-carrier.spec.ts` 经真实 handler+client wire 对往返全部 kb 方法，`client-handler.spec.ts` 的 stub 补了 `upload` 行。`packages/client/ui-kb` 覆盖向导上传页签（默认页签、逐行 busy/done/failed 与 too-large 分类、批次竞态守卫、空选择）与插件在脚本化 api 之上的 `uploadFile` 面。`apps/web/tests/kb-workbench.e2e.ts` 用真实 Chromium `setInputFiles` 跑往返（一个 md + 工具套件 sample pdf → 行、徽标、两者的带引用检索）。`examples/kb-agent/scripts/upload-real-key-smoke.mts` 在独立临时库上对真实 MiniMax embedder 运行该通道（带引用的 hybrid 检索）。
