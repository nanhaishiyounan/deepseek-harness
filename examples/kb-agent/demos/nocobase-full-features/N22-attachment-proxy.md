# N22 本地附件代理证据（PDF 可见性修复落地）

> 部署时间 2026-09-10 16:36–17:08 | 代理脚本 [nocobase-n22-llm-proxy.mts](../../scripts/nocobase-n22-llm-proxy.mts) | 生命周期与断言 [setup-nocobase.mts](../../scripts/setup-nocobase.mts)（`ai-proxy start|stop` / `ai` / `ai-direct` / `verify`）| llmService "MiniMax" baseURL `https://api.minimaxi.com/v1 → http://127.0.0.1:13100/v1`

架构：NocoBase llmService baseURL 指向本地回环代理（127.0.0.1:13100，仅本机可达），代理拦截 `POST …/chat/completions`，把请求体 content 数组里的 OpenAI 专有 `{type:'file', file:{file_data:'data:application/pdf;base64,…'}}` part 解码后经 unpdf（与 packages/kb/tool-kb `extractPdfText` 同通道，零新依赖）提取文本，替换为 `{type:'text', text:'<parsed_document filename="…">…</parsed_document>'}`——与上游 document-loader 对 docx/xlsx/md 的注入格式一致；请求体是唯一被改写的请求向字节段，响应在 think 过滤开启（默认，N25 起）时经 SSE 逐帧/非流式单遍过滤（见 [N25-think-filter-and-selfheal.md](N25-think-filter-and-selfheal.md)），过滤关闭时逐字节透传。解析失败、非 PDF MIME、无文本层均以显式 HTTP 错误返回（400/502），不静默丢弃；单文档超 200,000 字符截断并加标记。

## 1. 白名单前置核实（N22 第一步）

[checkUrlAgainstWhitelist](../../../../platform/nocobase/packages/core/utils/src/server-request.ts)（`SERVER_REQUEST_WHITELIST` 未设置时）对私有/回环地址仅调用 `warnIfSsrfRiskTarget` 后放行（server-request.ts:226-229：`if (!whitelist || !whitelist.trim()) { warnIfSsrfRiskTarget(host); return; }`）；仅当该 env 被设置且 host 不匹配条目时才抛错拦截。本仓库 NocoBase 由 `setup-nocobase.mts start` 拉起，环境不设置 `SERVER_REQUEST_WHITELIST`，故 baseURL 指向 `127.0.0.1:13100` 全程放行——实测代理日志收到全部转发请求即运行时证据（见 §3）。若部署环境设置了该 env，需将 `127.0.0.1` 加入白名单条目（快照认可的 env 配置面，零源码修改）。

## 2. PDF 翻转：直连基线 × 代理复测矩阵

数据源：直连基线 [N21-attachment-visibility.direct-baseline.md](N21-attachment-visibility.direct-baseline.md)（2026-09-10 16:11）× 代理复测 [N21-attachment-visibility.md](N21-attachment-visibility.md)（2026-09-10 17:07，脚本与基线同一探针、同一标记串体系）。两轮代理复测（16:55 / 17:07）结果一致。

| 格式 | 直连基线 | 代理复测 | 验收 |
|---|---|---|---|
| pdf | ❌ 不可见（file part 被 MiniMax 静默忽略） | ✅ 可见（模型逐字复述 `N21PROBE-PDF-7Q4Z`） | ✅ 翻转达成 |
| docx | ✅ 可见 | ✅ 可见 | ✅ 不回退 |
| xlsx | ✅ 可见 | ✅ 可见 | ✅ 不回退 |
| md | ✅ 可见 | ✅ 可见 | ✅ 不回退 |
| png | ✅ 可见 | ✅ 可见 | ✅ 不回退 |

代理改写日志锚点（/tmp/nocobase-dsh-ai-proxy.log，`ai-proxy start` 起全量留存）：

```text
{"ts":"2026-09-10T08:54:06.536Z","event":"rewrite","file":"n21-probe-gmdmvi.pdf","bytesIn":1167,"textChars":143,"truncated":false,"partsBefore":3,"partsAfter":3}
{"ts":"2026-09-10T08:54:17.615Z","event":"forward","model":"MiniMax-M3","stream":true,"upstreamStatus":200,"ms":11078,"rewrites":1}
```

差分实验（N21 探针内置，直连 api.minimaxi.com 对照）在代理部署前后各跑一轮，结论不变：file part ❌ / `<parsed_document>` 文本 ✅——翻转由代理改写实现，因果链闭合。

## 3. 纯文本回归（SSE 透传无损）

经 NocoBase（llmService 指代理）向 dex 发送无附件中文消息「你好，请用一句话介绍你能帮助用户做什么。」：

- 回复正常：`你好！我是 Dex，作为业务数据整理员，我可以帮你从杂乱的数据源中提取、清洗和组织信息……`（2.8s）
- 代理日志对应 `{"event":"forward","model":"MiniMax-M3","stream":true,"upstreamStatus":200,"rewrites":0}`——零改写透传，SSE 流式逐字输出未受破坏（探针按 `type:"content"` 帧累积全文成功即透传完好的直接证据）

## 4. kill/恢复与错误显式性

- `kill -9 <proxy-pid>` 后发消息：`aiConversations:sendMessages` SSE 返回显式错误帧 `SSE error event: Connection error.`——用户可见错误，非静默
- `setup-nocobase.mts ai-proxy start` 重启：代理拉起 + healthz 通过 + baseURL 幂等 kept；随后的中文消息恢复正常（5.0s）
- `ai-proxy stop` 全链路：停止代理并自动回切 baseURL 至 `https://api.minimaxi.com/v1`（本命令选定行为，写入帮助文本；NocoBase 不可达时打印 `ai-direct` 手动回切指令）

## 5. verify 全绿与幂等

- `setup-nocobase.mts verify` 连续两轮 OK（EXIT=0），新增断言生效：代理 `/healthz` 可达 + llmService "MiniMax" `options.baseURL == http://127.0.0.1:13100/v1`（failures 列表为空即两条断言同时通过；探测不到时失败消息内嵌 `ai-proxy start` 修复命令）
- `ai-proxy start` 二跑 no-op：`ai-proxy already healthy at 127.0.0.1:13100 (kept)` + `llmService "MiniMax" exists (kept, baseURL http://127.0.0.1:13100/v1)`
- N21/N23 探针运行开始与结束残留断言均为 0 会话 / 0 文件（自清理幂等）

## 6. 实施要点（长效事实）

- llmServices 集合主键是 `name`（string，`autoGenId: false`），无自增 id 列：`llmServices:update?filterByTk=` 必须用 name；用不存在的数字 id 匹配 0 行仍返回 200（静默 no-op），verify 的 baseURL 断言能拦住这类失效。
- llmService 消费链路（AI 雇员 chat / workflow LLM 节点 / ai:listModels）每次请求从 DB 实时 findOne 后构造 provider 实例——baseURL 更新即时生效，无需重启 NocoBase。
- 代理上游地址取 `MINIMAX_BASE_URL`（默认 https://api.minimaxi.com/v1），api key 透传 `Authorization: Bearer` 并与仓库 .env `MINIMAX_API_KEY` 校验（不匹配 401）；key 不落日志。
- pid 落 `examples/kb-agent/.dsh/ai-proxy.pid`（.gitignore 已覆盖 `.dsh/`）；代理日志 `/tmp/nocobase-dsh-ai-proxy.log`。

## 7. 回滚

一行命令恢复直连：`node --env-file=.env --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts ai-direct`（或 `ai-proxy stop`，停止代理并自动回切）。代理进程独立于 NocoBase，删除脚本无残留。
