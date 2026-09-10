# N25 证据：think 回显过滤 + n18 formUid 自愈（2026-09-10）

批次 N25（plans/nocobase-ai-experience-2026-09-10.zh.md §4 N25）。代理 [nocobase-n22-llm-proxy.mts](../../scripts/nocobase-n22-llm-proxy.mts) 扩展响应侧 `<think>…</think>` 过滤（开关 `N22_FILTER_THINK`，默认开）；[nocobase-n18-form-ai.mts](../../scripts/nocobase-n18-form-ai.mts) 增加孤儿按钮自愈。均为运行时改动，零快照侵入；本轮（N25+N26）未新增 `platform/` 变更——工作树中 `platform/nocobase-portals/` 的 17 个已跟踪变更路径与两个未跟踪 `ai-employee-fill/` 新组件目录全部归属 N24 前批交付物（`git status --porcelain -- platform/` 可核）。verify 断言强化与回归见 N26 收口。

## 1. wire 形态确认（过滤设计的输入）

对过滤开启前的代理抓一条真实流式回复（`POST /chat/completions`，`stream:true`，问题诱导思考）：

- `<think>` 开标签内联在 `choices[0].delta.content` 首个内容帧（`"<think>The user wants…"`），闭合标签与正文同帧（`"</think>\n\n复"`）；
- 整条流 `reasoning` 字段 grep 计数为 0——MiniMax-M3 在此 wire 上没有独立 reasoning 通道，过滤目标是且仅是 content 内联标签；
- 末帧为 `finish_reason:"stop"`、无 `[DONE]` 哨兵，帧边界 `\n\n`。

## 2. 状态机（跨 chunk 标签剥离）

每流每 choice 一个 `ThinkFilter`：`push(delta)` 时把上一帧扣留的疑似标签前缀（如 `<th`）与新内容拼接后线性扫描——命中完整标签即切换进出状态并计数；未命中则只发出确定安全的前缀（扣除仍是标签前缀的最长后缀并扣留，最多 6 字符），下一帧继续判定；`</think>` 与正文同帧时正文照常透传。`finish_reason` 帧执行 `flush()`：think 外的扣留文本并入该帧发出（顺序保持 content-before-stop），think 内的扣留视为推理丢弃并计 `unterminatedThink`；上游截断致流结束仍无 finish 帧时，流结束清理对每 choice 同样执行 `flush()`——think 外扣留以一个合成 delta 帧补发（正文不丢失），think 内扣留丢弃并计数。SSE 帧经 `StringDecoder` 解码（多字节 UTF-8 不因 socket chunk 切割损坏）、按 `\n\n` 重组；内容未变的帧字节原样透传，无法解析的帧（如 `[DONE]`）原样透传（fail-open 只对形状，不丢正文）。非流式走同一状态机单遍过滤 `choices[].message.content`，解析/形状意外原字节返回。

keyless 单测 `examples/kb-agent/tests/n22-think-filter.spec.ts` 20 例锁定：跨帧标签分割（chunk size 1/2/3/7/40 全遍历）、形似前缀的普通文本、未闭合 think、finish 帧扣留冲刷、非 data 帧透传、非流式 fail-open、空段与悬空 `</think>` 字面量、EOF 无 finish 帧时的扣留归宿（think 外合成帧补发、think 内丢弃计数）、多 choice 状态隔离。单测曾抓到真实流未暴露的缺陷（帧中段命中开标签时标签前正文被丢弃），修复后全绿。

## 3. 两态实测（REST 真实会话，n21 探针同款 sendMessages SSE 通道）

问题固定为「请先在心里简短思考，然后用一句话向食品企业的老板解释什么是复利。」，员工 dex，每态独立会话、验后销毁：

| 态 | healthz | 回复含 `<think>` | 正文 | 代理统计日志 |
|---|---|---|---|---|
| 过滤开（默认） | `filterThink:true` | ❌ 无 | ✅「复利就是让利润再生利润……」完整回答（3.5s） | `segments:1, charsStripped:234, framesRewritten:11/24` |
| 过滤关（`N22_FILTER_THINK=0` 重启代理） | `filterThink:false` | ✅ 重现（英文推理链完整可见） | ✅ 正文同在（3.9s） | 无 think-filter 事件（透传态） |
| 再开（去变量重启） | `filterThink:true` | ❌ 无 | ✅ 完整回答（4.3s） | `segments:1, charsStripped:340, framesRewritten:5/8` |

非流式（`stream:false` 直调代理）：回复无 `<think>`、正文完整，日志 `{"event":"think-filter","stream":false,"segments":1,"charsStripped":1011}`。统计日志只含段数/字符数/帧数，不落回复正文。开关关闭即回到原样透传（回滚路径写入代理头部注释与 QUICKSTART.zh.md）。

## 4. n18 formUid 孤儿自愈实测

前置事实（本轮实测确立）：

- `flowModels:destroy` 对 CreateFormModel **级联删除** actions 子节点——「删表单留按钮」在正常操作下不产生孤儿；
- `flowModels:save` **接受** dangling `parentId`——孤儿按钮可被持久化（历史配置重放、uid 变更等路径的残留形态）。

自愈场景（`/tmp` 一次性脚本构造，全程可重复）：save 一个 `n18ai-n18orphan-ghost-does-not-exist` 按钮指向不存在的表单 uid → 确认持久化（`buttonAlive=true`）→ 跑 `nocobase-n18-form-ai.mts`：

```text
nocobase-n18: orphaned form AI button n18ai-n18orphan-ghost-does-not-exist removed (its CreateFormModel no longer exists)
nocobase-n18: form AI buttons already in place on dex (kept) across 8 popup forms, 1 orphaned removed
```

二跑：`already in place on dex (kept) across 8 popup forms`——无孤儿行、不重复报（幂等）。判定规则：uid 带 `n18ai-` 前缀且后缀不在任何现存 CreateFormModel 的 uid 集合中即孤儿，`flowModels:destroy` 删除（与 N13 孤儿清理同一 API 形态）。

## 5. n21 探针过滤态复跑（附件链路无损 + 回复无 think）

过滤开启 + 代理重启（含类型修复版代码）后重跑 `nocobase-n21-attachment-probe.mts` 两轮：矩阵 pdf/docx/xlsx/md/png 全 visible（PDF 经代理改写仍可见，其余四格式不回退），每流代理日志均有 think-filter 事件（剥离 290~1355 字符不等），探针按 `type:"content"` 帧累积回复成功即流式透传完好，回复无 `<think>` 残留。第一轮 png 单格曾判 invisible——模型回复原文为 `N21PROBE-PNG-T5W`（真值 `T5CN`），即模型看到了图但把位图标记末两字符误读（C/N 像素易混 W），属 MiniMax-M3 视觉转述字符级波动，与 think 过滤无关；第二轮同探针恢复 visible（证据文档以末轮为准自动重生成）。差分实验结论不变：file part ❌ / `<parsed_document>` 文本 ✅。

## 6. verify 断言强化（N26）

`setup-nocobase.mts verify` 的 N18 断言由计数式 `AIEmployeeButtonModel ≥8` 强化为：`n18ai-` 前缀计数 ≥8 **且** 全部 AIEmployeeButtonModel 行都带前缀（外来挂载凑数既过不了下限也触发独立失败行）。Portal 双入口探活（`/dist/crm/`、`/dist/hub/` 200）确认已在 verify 内。强化后连续二跑 EXIT=0（`verify: OK — … n18ai- form AI buttons + portals + ai-proxy + API key all verified`）。
