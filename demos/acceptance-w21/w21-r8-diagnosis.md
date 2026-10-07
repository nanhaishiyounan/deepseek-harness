# W21-R8 诊断：present_card actions 嵌套结构自纠失败（先取证）

## 会话定位

- 会话：`~/.dsh/sessions/--Users-mac-Documents-github-deepseek-harness--/session-270d0b42-171f-48b3-ae17-cff11bfeeb1c/session.jsonl.zstd`
- header：`agentPreset: enterprise-data-assistant`，cwd 仓库根，createdAt 1791394689967（2026-10-07 17:38 UTC ≈ 用户所述 17:00 前后）
- 入口：gateway 127.0.0.1:3080/mobile → AI 同事（企业数据助手，/mobile 同事卡上的 Database 图标入口）
- 用户消息：「供应链数据里有什么值得关注的」；turn 1 内 5 次 present_card 调用（step 3–7），前 4 次失败、第 5 次成功

## 4 次失败逐次取证（payload.actions 摘录 + 服务端错误文本）

4 次失败的错误文本**逐字相同**（ToolArgsError / INVALID_ARGS）：

> Error: invalid arguments: payload.actions[0..3] 应为 "view"/"create-task"/"send"/"link" 之一（判别字段缺失或无法识别，收到对象）

| # | step / callId | 模型所传 actions[0]（4 枚同构） | 形态判定 |
|---|---|---|---|
| 1 | step3 `call_01a11772…122` | `{"view":{"label":"查看采购订单","route":"business"}}` | **包装键形态**：判别值 view 当外层键，内层包 {label,route}；route 取值 business/market/kb/kg |
| 2 | step4 `call_01a11772…82` | 同上（payload 以带空格 JSON 字符串重发） | 包装键形态，未变 |
| 3 | step5 `call_01a11772…f9` | 同上 | 包装键形态，未变 |
| 4 | step6 `call_01a11772…36` | `{"label":"查看采购订单","route":"business"}` | **扁平缺 kind 形态**：键按字母序重排，kind 判别字段整体缺失 |
| 5 | step7 `call_01a11772…d9` | （actions 字段删除） | **成功**：presented=true、concludesTurn；速览卡渲染但无按钮（功能性损失绕过） |

模型自纠叙述（assistant/message 原文）与用户报告一致：「我整理一下供应链里值得关注的几个信号…」→「修一下 actions 的结构。」→「actions 的嵌套格式再调整一下。」→「我用对象形式直接传一遍，看嵌套结构能不能保留。」→「actions字段引起解析问题，去掉它重发。」

## 机制面核验

- 违规均被拒绝并作为 tool error 回给模型（无静默吞卡）；错误对模型可见（4 轮重试证明）；第 5 次去 actions 后正常出卡 —— 机制面正常，破口在「错误信息可操作性」与「常见畸形宽容度」。
- 用户侧折叠文案来自 ui-mobile [`fold.ts:446`](packages/client/ui-mobile/src/client/fold.ts:446)（`foldPresentCard` 用客户端镜像校验器复验 tool/call 原始参数，不过则折叠）——即折叠是客户端镜像校验拒绝，与 server ToolArgsError 同源。
- gateway 日志 12 次 `presenter failed for tool/call … SyntaxError at position 24`：api-proxy 表现层对（分片/嵌套转义的）arguments 做 `JSON.parse` 的软回退（[`api-proxy.ts:1197`](packages/host/apiproxy/src/api-proxy.ts:1197)），与本批校验破口无关、不影响卡片渲染（第 5 次成功卡正常渲染即为证），不在本批修复范围。

## 根因分类（按任务给定 A/B/C）

- **A（主因，成立）——错误信息不含期望形状**：[`index.ts:601-605`](packages/interaction/tool-present-card/src/index.ts:601) 的非标量 oneOf 判别失败分支只打印四个 kind 值（`应为 "view"/…之一`），既不说判别字段名叫 `kind`，也不给 `{"kind":"view","label":"…","route":"…"}` 的可照抄示例。模型 4 轮猜测（包装键 ×3、扁平缺 kind ×1）从未命中「扁平 kind 字段」这一唯一合法形态——错误信息里没有任何线索指向它。
- **B（成立，且比任务预设更广）——教学缺位**：
  - B1：实际出事会话挂载的 persona 是 `enterprise-data-assistant`（[`agent.cordis.yml`](examples/kb-agent/agent-presets/enterprise-data-assistant/agent.cordis.yml)），其对 present_card 的教学为 **0**（grep 0 命中）——工具纪律全靠工具自身 description/参数描述。
  - B2：[`mobile-form-assistant/agent.cordis.yml:113-118`](examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml:113) 的 report few-shot 虽含 actions，但只示例 create-task 一种形态，view 形态无具体示例（本会话未挂载该 persona，但同一缺口存在）。
  - B3（放大器）：工具参数描述 [`index.ts:748`](packages/interaction/tool-present-card/src/index.ts:748) 用紧凑记法 `actions?[≤4]{view{label,route}|create-task{…}|send{…}|link{…}}`——读起来正是「键为 view 的对象包 {label,route}」，模型第 1–3 轮的包装键形态就是这段记法的字面直译。
- **C（成立）——resolve 对常见畸形不宽容**：包装键形态 `{"view":{label,route}}` 语义无损（可确定解包为 `{kind:"view",label,route}`）；扁平 `{label,route}` 的 route 字段为 view 分支独有，可唯一推断 kind=view。当前 [`resolvePresentCardPayload`](packages/interaction/tool-present-card/src/index.ts:694) 全部拒绝。客户端镜像 [`parseReportAction`](packages/client/ui-mobile/src/client/protocol.ts:546) 已有 create-task `text→title` 折叠先例，服务端做同源 coerce 有镜像基础。

## 修复方向（依据诊断）

1. A → 判别失败错误文本追加由 schema 生成的四枚 JSON 骨架（`{"kind":"view","label":"…","route":"…"}/…`）。
2. B3 → 参数描述 actions 段改为显式扁平形态+具体示例；B2 → mobile-form-assistant persona few-shot 补 view 形态与「kind 是同级判别字段，不是包装键」规则。
3. C → server resolve 增加：包装键解包、缺 kind 唯一推断（显式非法 kind 不覆盖）、actions 单对象提升；客户端 [`protocol.ts`](packages/client/ui-mobile/src/client/protocol.ts) 同步镜像 + fixtures 双端扩 4 例（3 valid + 1 ambiguous invalid）。
