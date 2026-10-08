# Agent Note：W23-R4 —— 黑名单大小写归一 + 边界断言 + 文件页渲染接线 + 证据更正

状态：已实现

[English](2026-10-09-w23-r4-denylist-case-normalization.md) | 中文

## 问题

W23-R3 验证唯一 fail 维度 production-simulation 的根因族：R3 黑名单只匹配小写，泄漏以 `WFL_Approval_Todos` / `Ask_Field` / `NB_LIST` 形态到达时原样穿透两层清洗管道，且没有任何边界断言能抓住该缺口。伴生三项发现：`FilesView` 原样渲染 `artifact.title` / `artifact.subtitle`（R3 接线只覆盖聊天 report 分支）；AlertsView 分组键注释声称的「head 无关派生」并不被分组规则保证；两份验证报告携带错误的 hash 标注与计数。

## 决策

- **大小写归一**：`client/sanitize.ts` 的全部匹配器改为 `i` 标志构建，黑名单族的任意大小写变体都被剥。封闭清单导出为 `PROTOCOL_BLACKLIST`（无条件剥的前缀族 `wfl_*` / `ask_*`，加 `suggestions` 字段名）供共用与扩展；subtitle 层专用工具族保持私有数组 `SUBTITLE_BLACKLIST`。`suggestions` 同时是普通英文词，因此只在协议上下文剥——CJK 叙述，或同串还携带任一被剥 token 族（`CONTEXT_PROBE`，刻意不带 `g` 标志以免 `lastIndex` 跨调用泄漏）；英文正文保留该词。
- **边界断言**：新增 `sanitize-edge.client.spec.ts` 锁四项边界行为——>10KB 干净正文逐字通过、任意大小写变体被剥、更长 token（`wfl_approval_todos_inner`）整剥无部分残留、代码 fence 标记经两层管道完好（成功态协议载荷保持可渲染）——外加导出黑名单契约。既有渲染面 spec 补 DOM 级大小写断言（全 body 文本的 `/wfl_approval_todos/i`）。
- **FilesView 接线**：`renderRow` 走聊天 report 分支同款渲染面清洗——行标题（含 `打开 …` aria-label）用 `sanitizeBody`，行副题用 `sanitizeSubtitle` 并遵循空串等同省略（剥空的副题不渲染）。
- **AlertsView 键**：分组键只由 `band::ruleType::head.entityCode` 派生——title 回退分支移除，与 R3 报告声称的派生一致。注释改述真实契约：实体编码只为「按共享编码折叠的组」提供稳定身份；按 title 折叠的组以当下领头的成员为键，重排换首行即换键、展开态重置。
- **证据更正**：`r3-verify-report.md` 与 `b2-verify-report.md` 补实测 sha256——所标 "sha256 8c44276f…" 实为 SHA-1 摘要，"3340b0db…" 与任何证据文件的 sha1/sha256/md5/crc32 均不符（不可复现的记录值）；alerts 套件计数 11 更正为实测 7；R3 行的 head 无关声明按上述契约改述。

## 后果

- ui-mobile 套件携新断言全绿（sanitize-edge 6、sanitize 11 含 DOM 大小写用例、files-view 9 含接线探针、alerts 7）；typecheck 与 toolcard e2e 6/6 不变。
- 按 title 折叠的 alerts 组在重读换首行时丢失展开态——接受并在派生处记录；按实体编码折叠的组（远期带形态）保持该保证。
- 全英文且仅由 `suggestions` 构成的副题在无协议 token 共现时经 body 层存活——黑名单是协议上下文剥除，不是通用词禁。
- 渲染面清洗现存三处（FlowItem report 分支、FilesView 行、共享模块）；收敛为集中式文本管线是延后的后续工作，记录于此而非代码注释。

## 备选方案

- **匹配前把输入转小写**——黑名单将改写恰含族前缀边界的合法词的大小写；词边界大小写不敏感匹配让存活文本逐字节不变。
- **`i` 标志下无条件剥 `suggestions`**——最简归一，但会剥 "Here are our Suggestions for next quarter"；协议上下文探针以一次布尔检查的代价保住英文正文。
- **投影层集中式 `__text-pipeline`**——更多渲染面需要该管道时的正确长期归宿；今天两个消费方不值这份间接层。
- **分组键保留 title 回退**——只为「空实体码的 title 折叠组」恢复稳定性（活体数据不携带该形态）；去掉后的诚实派生与 R3 报告早已声称的一致。
