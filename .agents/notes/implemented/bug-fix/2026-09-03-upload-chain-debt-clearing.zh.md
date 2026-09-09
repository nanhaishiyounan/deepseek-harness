# Agent Note: 上传链路债务清偿——栈安全 base64、行身份、替换事实呈报、fetch 钉址

Status: implemented

[English](2026-09-03-upload-chain-debt-clearing.md) | 中文

## Problem

kb 上传与 URL 采集链路上有四项缺陷，均登记为食品 KB 计划的债务（plans/food-kb-agent-plan.md §十一.5 #1 与 plans/connector-lakehouse-nocobase/02-batches.md 的 N0 批次）。其一，`kb.upload` 的 wire 门用单条整串 canonical RFC-4648 正则校验浏览器 base64 体；该模式在约 3.5 MB 输入起即触发 V8 回溯栈 `RangeError: Maximum call stack size exceeded`，而通道的业务上限是 64 MiB——数 MB 级上传永远过不了这道门。其二，入库向导按 `row.name === file.name && row.status === 'busy'` 把上传完成匹配回行，同批选入两个同名文件时，首个完成会点亮所有同名 busy 行。其三，同名重传静默替换旧文档（seam 的同路径语义），wire 与 UI 均无任何信号。其四，`kb_ingest_url` 的 SSRF 门解析主机并准入后，只把 URL 交给 fetch provider，后者再次解析——两次解析之间的 DNS rebinding 可触达门从未见过的地址（债务 #1 的 TOCTOU）。

## Decision

四项修复，均在 N0 范围内（apiproxy kb 域 + ui-kb + web fetch 路径）：

1. **栈安全 canonical base64**（`packages/host/apiproxy/src/api/kb.schema.ts`）：`data` 字段改为「长度模 4 门 + 末四字符前全文按 4 KiB 分片字母表扫描 + 末四字符单独校验 `=` 填充形态」。有界分片让正则引擎的栈在任何字节上限内都保持平坦；拒绝语义不变——Node 宽松解码器会静默误解码的形态（缺填充、空白、URL-safe 字母表、填充后追加四字符组）仍在解码前被拒。`kb.ingestUrl` 没有同型的兆级字段，无需同类改动。
2. **行身份**（`packages/client/ui-kb/src/client/workbench/KbIngestDialog.tsx`）：每个上传行携带选择时铸造的单调递增 id；完成与失败按 id 匹配行，React key 即该 id。同批两个同名文件的行状态从此各自独立推进。
3. **替换事实呈报**：`kb.upload` 返回 `KbUploadView`——入库摘要加 `replaced: boolean`，在写入覆盖之前对上传落盘目标（`workspace/data/uploads/<sanitized>`）采样得出。上传落盘文件是单租户工作台在该通道的持久身份，既有落盘即 seam 同路径重摄入所替换的事实。ui-kb 的 `uploadFile` 把该标志折入回执，工作台 toast 呈现「已替换同名文档」（`ingest.doneReplaced`）而非普通入库文案。
4. **fetch 钉址**（债务 #1）：`WebFetchRequest` 增加 `pinnedAddresses?: readonly string[]`；`packages/kb/tool-kb/src/url-policy.ts` 的 `resolveAdmittedAddresses`（由 `assertPublicUrl` 更名）解析主机、未获显式 opt-in 时拒绝私网解析、返回准入集合——`kb_ingest_url` 与工作台 `kb.ingestUrl` 都把它随请求下发。`dsh-web-fetch-http` 以 `node:http`/`node:https` 直连钉定地址，保留 URL 自身的 Host 头与 TLS `servername`，连接被拒时尝试下一个地址、绝不查 DNS；同源重定向留在钉定主机上，空集合或缺省则照常解析（不可解析名以空集保持准入）。内网 opt-in 路径同样钉址。

## Alternatives considered

**`Buffer.from(data, 'base64')` round-trip 比对替代分片校验。** 否决：round-trip 只能以再编码相等间接证明 canonical 性，每个请求都要全量解码加再编码，且把 canonical 规则埋进隐含性质而非显式检查。

**尾部形态正则加一条整串字母表正则。** 否决：数十 MB 上的整串 `^[A-Za-z0-9+/]+$` 恰是引发本次修复的无界输入模式。

**`replaced` 从 store 层取（`putDocument` 上报删除计数）。** 本批否决：那要改 kb Service Definition 与全部 store 实现，而 N0 文件清单把 `replaced` 检测限定在网关；落盘文件采样对上传通道的身份域是精确的。若 `replaced` 日后需覆盖多租户查询，store 层仍是正确归属。

**只钉首个解析地址而非准入清单。** 否决：多 A 记录公网主机将新增单点故障；按序尝试每个准入地址在保持不查 DNS 的同时保留 fetch() 的可达性。

**fetch provider 内部重校验（每请求先解析再检查）。** 否决：那把 SSRF 策略搬进一个模块契约明确把准入留给调用方的 provider，且除非 provider 同时钉址，同一 TOCTOU 只是下移一层。

## Consequences

- 20 MB canonical 体毫秒级通过 wire 门；此前约 3.5 MB 起即抛错。直到 64 MiB 业务上限的文件重新只受该上限约束，而非校验器约束。
- 同批两个同名行保持各自独立的 busy/done/failed 状态；行 key 在完成重写间稳定。
- 工作台让替换可见：wire 携带 `replaced`、回执携带、toast 言明。覆盖本身仍是无条件的——`replaced` 只呈报、不设门。一个比失败摄入活得久的落盘（文件已落、解析被拒）会让下一次同名上传报 `replaced: true`，即便并无文档行存在；该边缘被接受，不在本批引入失败路径的文件清理。
- 门与连接之间的 DNS rebinding 无法再让 `kb_ingest_url` 或工作台 URL 采集改道：连接遵守准入集合，Host 与 SNI 保持原主机名，证书校验保持真实。公共面上 `assertPublicUrl` 已移除，导出为 `resolveAdmittedAddresses`。
- 钉址路径在 `dsh-web-fetch-http` 内于 `fetch()` 之外新增一条 `node:http(s)` 请求路由；响应包成同一 `Response` 形态，上限、解码与重定向处理共享。

## Testing

`packages/host/apiproxy/tests/kb-domain.spec.ts` 承载 schema 矩阵（20 MB canonical 接受；宽松解码拒绝形态；含空体在内的 canonical 四字符形态）、替换事实（首传 `replaced: false`、同名重传 `replaced: true`）与工作台 URL 采集的钉址透传。`packages/client/ui-kb/tests/kbworkbench.client.spec.tsx` 证明两个同名行各自随自身完成推进、替换回执呈现替换 toast；`apply.client.spec.tsx` 证明回执携带 wire 标志。`packages/kb/tool-kb/tests/ingest-url.spec.ts` 覆盖 `resolveAdmittedAddresses`（字面公网主机、opt-in 钉址、私网拒绝、不可解析以空集准入）与工具把准入集合随 fetch 请求下发。`packages/web/web-fetch-http/tests/fetch-http.spec.ts` 向一个任何地方都解析不到的 `.test` 主机名钉址（只有钉定地址可达服务器、Host 头保持原主机）、被拒后重试下一地址、全部钉址被拒时以传输错误失败、钉定下跟随同源重定向、包裹无主体 304、并在自签名 fixture 的 https 钉定尝试上观测到 URL 主机名作为 TLS SNI。真实浏览器 lane `apps/web/tests/kb-workbench.e2e.ts` 以 12 MiB markdown 选择驱动真实 wire 门、并在同名重选时 toast 替换事实；`examples/kb-agent/scripts/upload-real-key-smoke.mts` 在真实服务端路径上落盘 12 MiB 纯文本上传与同名重传。
