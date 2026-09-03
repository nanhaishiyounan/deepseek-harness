# Agent Note：kb 工具的 PDF/docx/网页采集通道

Status: implemented

[English](2026-08-30-kb-ingest-channels.md) | 中文

## 问题

P0 只入库工作区 `.md`/`.txt`。真实食品行业素材是 PDF（法规、审计报告）、Word 文档（走访整理）与网页（标准公告）——P1-1 数据面批次要求三者都走既有 chunker+入库管线并保持同路径幂等替换语义，且网页通道不得让知识库变成内网探针（[`plans/food-kb-agent-plan.md`](../../../../plans/food-kb-agent-plan.md)，P1-4）。

## 决策

**解析库选型（维护良好依赖优先政策）**：`unpdf` 做 PDF 文本抽取（pdf.js 的 serverless 构建，纯 JS 零原生依赖——与排除 sqlite-vec 同一条跨平台 CI 约束），`mammoth` 做 docx→HTML（事实标准转换器；HTML 投影保留标题层级），`node-html-parser` 做 HTML 解析（零依赖、维护中；手搓标签/边界/实体处理要拥有政策规定不该拥有的约 100 行解析器代码）。三者都是 `tool-kb/src/extract.ts` 内的惰性 `import()`，从不入库二进制的组合不会加载 pdf.js。HTML→文本是一个自有纯函数（`htmlToStructuredText`）：标题变 `#` 前缀行、列表项变 `- ` 行，seam 的结构感知 chunker 仍能看到文档大纲；script/style 子树与 doctype 剥离；`<`/`>` 实体在解析期间停入私有区（node-html-parser 会把它们重新当标签解析）。`kb_ingest` 白名单扩到 `.pdf`/`.docx`，二进制经 `ctx.fs.readBytes` 读取（64 MiB 上限）；网页的引用身份是 URL，文件是路径——都保持 `(tenantId, sourcePath)` 替换语义。

**网页通道**：第四个工具 `kb_ingest_url` 经**可选**的 `ctx.web` 服务抓取（`ctx.get('web')`，app-boot 的可选服务模式——vendored Cordis 没有 `'web?'` inject 语法，必需 inject 会破坏纯文件组合）。无 web 服务时工具保持可见、执行时抛结构化错误，与 store 可用性惯例一致。非 2xx 响应与 provider 截断的 body 一律拒绝（把错误页或残缺语料入库会污染引用）。

**SSRF 姿态**：`tool-kb/src/url-policy.ts` 强制仅 http(s)、无内嵌凭据、长度有界的 URL，然后解析主机名（`node:dns` `lookup` 且 `all: true`），任一解析地址落在环回、RFC1918、链路本地、CGNAT、未指定、唯一本地或链路本地 IPv6（IPv4 映射 IPv6 先解包）即拒绝抓取。`web-fetch-http` 自身策略已覆盖协议/凭据/同源重定向但明确推迟私网拦截（其包 Agent Note 有载），因此 kb 通道自己拥有这道门。`Config.allowPrivateNetworks`（默认 `false`）是 fixture 与内网部署的显式开关——部署可变选择是受校验的配置字段而非硬编码开关。此处解析失败的主机名保持放行：fetch provider 自己的解析才是权威，解析不了的名字到不了任何地址。

## 备选方案

- **手搓 PDF/docx 解析** —— 直接拒绝：两者都是容器格式（对象流、OOXML zip），政策的"真正删掉自有代码"检验 decisively 不通过。
- **独立 extract 包或 provider 缝** —— 拒绝：解析没有多后端选择需求（无 YAGNI 消费方）；工具拥有自己的输入格式。
- **`mammoth.extractRawText()`** —— 拒绝：丢失 chunker 依赖的标题大纲；`convertToHtml()` 加共享 HTML→文本路径让所有 HTML 来源保留结构。
- **把 SSRF 检查做进 `web-fetch-http`** —— 其 Agent Note 拥有该推迟项；改共享 provider 的姿态是波及整个 web 工具链的独立决策。kb 通道现在就要这个保证，自己拥有这道门。
- **拦截解析失败的主机名** —— 拒绝：会让气隙测试环境死在 DNS 而非 fetch 本身，且不增加保护。

## 后果

- `tool-kb` 新增三个运行时依赖（unpdf、mammoth、node-html-parser——MIT/BSD-2/Apache-2.0），登记进 `THIRD_PARTY_NOTICES.md`；惰性导入使它们不进纯文本组合的加载路径。
- DNS rebinding 是残余风险：本门每次入库解析一次，fetch provider 会再解析；控制 DNS 的攻击者可能过检后在 fetch 的解析里命中私网地址。缓解需要把解析出的 IP 钉进 fetch，而 `ctx.web` 请求类型不携带——记为本姿态的已知边界。
- fixtures 是确定性生成文件（精确 xref 偏移的手写 PDF、系统 `zip` 打包的最小 OOXML、带 script/style 噪声的静态 HTML）；URL 测试对本地 `node:http` server 跑并开 `allowPrivateNetworks: true`，绝不依赖外网。

## 验证

- `packages/kb/tool-kb/tests/extract.spec.ts` —— fixtures 上的 PDF/docx 抽取、标题/列表/实体/doctype 处理、非 PDF/非 docx 字节 fail-loud。
- `packages/kb/tool-kb/tests/ingest-url.spec.ts` —— 私地址分类表（环回/RFC1918/链路本地/CGNAT/ULA/映射）、URL 准入规则、本地 server 端到端入库+检索、URL 替换语义、纯文本 body 路径、无开关时私网拒绝、404 与截断拒绝、无 web 服务或无 fetch provider 时的结构化错误。
- `packages/kb/tool-kb/tests/ingest.spec.ts` —— `.pdf`/`.docx` 经真实 seam 端到端入库且可按内容检索。
- 真实 key 冒烟：PDF、docx 与 `https://example.com/` 均带 MiniMax 嵌入入库；两通道 hybrid 检索命中且引用身份正确；`http://127.0.0.1` 被 SSRF 门拒绝。
