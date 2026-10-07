# W21-R1 清偿批次报告（机制面修复：叶子值宽容 + 中文路径化错误）

日期：2026-10-06 · 批次：用户裁决 W21-R1（P3 升级裁决方案 (a)+(b) 组合）
环境：live gateway :3080（真实 MiniMax-M3 全链），buyer/Buyer#2026；前置 persona 投影一致性 PASS、gateway 重启加载新工具代码（/mobile=200）

## 一、改动面（机制修复）

1. **(a) 放宽接受 + execute 规范化（主修）** — [`tool-present-card/src/index.ts`](../../packages/interaction/tool-present-card/src/index.ts)
   - payload schema：九分支骨架保留（模型生成指引），**22 个 id/value/数量类叶子位点放宽为 `string|number`**，顶层新增第十个字符串分支（双重序列化兜底）。（W21-R2 更正：原表述「24 个叶子位」按 schema 放宽位点实为 22——summaryRow 与 approvalDoc 两处 schema 复用使载荷位展开为 24。）
   - 新增导出纯函数 `resolvePresentCardPayload`：字符串 payload 先 JSON.parse → v/type 判别 → schema 驱动走查（数字叶子 coerce 为字符串 + 结构校验），是显式 resolve 步骤（request/spec 惯例），不藏在 execute 里；coerce 后载荷与等价全字符串载荷行为完全一致（回执/落库/渲染不变）；boolean/数组/对象/null 越位仍拒绝
   - **exact-one 坑记录**：标量 oneOf 不能同时带 `number` 与 `integer` 分支（整数双匹配 → `matched 2` 被拒）——单个 `number` 分支即覆盖全部有限数字（实测踩中后修复）
2. **(b) 错误信息中文字段路径化** — resolve 走查产出全中文路径错误（如 `payload.hint 不是声明字段（本卡类型不允许额外属性）`、`payload.options[2].value 应为字符串或数字（收到布尔值 true）`、`payload 应为九类卡片载荷对象或其 JSON 字符串，收到的字符串无法解析为 JSON（前32字：…）`），一轮自纠即可命中
3. **客户端镜像同口径** — [`ui-mobile protocol.ts`](../../packages/client/ui-mobile/src/client/protocol.ts)：同样 22 位放宽（W21-R2 更正计数口径，`coercedText` helper；`fields[].value` 保留空串语义+数字 coerce）、`parseDshPayloadObject` 入口解析字符串 payload（fence 路径与 tool 路径同口径 coerce）
4. **fixtures 新增 9 个**（合法5/非法4，双端镜像测试引用）：`ask-choice.numeric-values.valid`、`report.numeric-cells.valid`、`form-draft.numeric-values.valid`、`payload-string.ask-choice.valid`、`payload-string.numeric-values.valid`、`ask-choice.boolean-value`、`report.title-number`、`payload-string.not-json`、`payload-string.bad-type`
5. **e2e golden 扩条目**（只新增不改既有）：种子追加 turn5（数字叶子 approval_pending）+ turn6（字符串载荷 plan_suggest），golden refresh 重录（既有3 断言 it 未动、全过）

## 二、复验矩阵（每腿 DOM+log 双断言，证据 w21-r1-*，无静默重跑）

| 腿 | 输入 | 次数 | 结果 | 明细 |
|---|---|---|---|---|
| num 数字诱导 | 报表请求/数字 id/数量汇总（3 种诱导） | 3 | **3/3 PASS** | 一次通过出 report 卡、零 error、零 degraded、无 INVALID_ARGS 循环 |
| S3 库存报告（P3 原样） | 查一下糯米粉还有多少库存 | 5 | **3/5 PASS**（P3 为 4/5） | 两失败最终均出卡、零占位卡，但「零 degraded/一轮自纠」口径不实（W21-R2 更正）：#1 errResults=1，顶层臆造 `hint` 字段被中文路径错误一轮纠正；#3 errResults=2 且 DOM「零 degraded 折叠」断言 ok=false、截图实有 degraded 折叠与重复卡（`w21-r1-matrix-runs.jsonl` s3#3 行 checks.domPass、`w21-r1-s3-3.png`）。**数字族失败为零** |
| S1 采购消歧（P3 原样回归） | 向鲜丰采购面粉，数量100，单价10 | 3 | **3/3 PASS** | coerce 未误伤干净字符串路径 |
| R4 旧 fence 会话续聊 | 07dac775（含 P3 时代 10 次历史拒绝与 degraded 化石）续聊 ×2 | 2 | **2/2 PASS** | 本轮 report 出卡、零 error、零新增 degraded、无占位卡；历史 degraded 化石按当日既成事实保留（同 W 轮 type:"choice" 化石惯例） |

**S3 残余（如实上报，W21-R2 口径更正）**：2/5 未达一次通过，根因族为模型输出形态漂移——(1) report 顶层臆造 `hint` 字段（schema `additionalProperties:false` 正确拒绝，中文路径一轮自纠）；(2) 一次性截断 JSON 字符串 payload（resolve 中文错误纠正，#3 实况为两轮错误：errResults=2，invalidArgsLoop=true）。两轮首调均为字符串形态 payload（`string:report`）——判断为新 description 教学「payload 也可传其 JSON 字符串」的偶发诱导副作用（2/8 概率），收益（R4 被动字符串场景稳定吸收）大于代价（偶发重试）。与 P3 的破口本质不同：P3 是「盲改 6 次无法自纠→兜底」；本轮 #1 一轮自纠、#3 两轮自纠，最终都出卡、零占位卡，但 #3 的 DOM 残留 degraded 折叠与重复卡（`w21-r1-s3-3.png`；jsonl s3#3 行「零 degraded 折叠」ok=false）——原「零 degraded/一轮自纠」总述与证据不符，按实况改写。

**probe 口径修正记录（非美化）**：初版 r4 断言把 P3 时代历史错误/化石计入本轮（errs=10 全为历史 seq、历史 degraded/fence 在屏）——修正为本轮事件限定（minSeq）+ degraded 增量对比后重跑；s3 的 2 个失败记录从未被重跑覆盖。

## 三、回归门禁（实跑输出）

- `pnpm vitest run packages/interaction/tool-present-card`：**46/46 绿**（新增 coerce 输出 deep-equal、payload 字符串、中文路径化 11 用例）
- `pnpm vitest run packages/client/ui-mobile`：**809/809 绿**（原 796 + 镜像 13；既有「form_confirm 数字 value/table 数字 cell 拒绝」两负例按行为变化更新为 boolean 变体，数字→coerce 已由新用例正向锁定）
- `pnpm run test:web apps/web/tests/mobile-assistant-toolcard.e2e.ts`：**4/4 绿**（原 3 + W21-R1 新 it；golden refresh 后 replay 一致）
- `pnpm run typecheck`：**0 错误**
- 本批次 6 个源文件 oxlint（.oxlintrc.staged.json）：**0 警告 0 错误**
- `pnpm run doc-sync`：**仅预存红 export-jsdoc**（session-persistence-jsonl build 产物，P3 报告同款、零 W21-R1 变更）；tool-catalog 因 description 更新已 `gen-tool-catalog` 再生成
- `pnpm run verify-agent-note-format`：**779 全绿**；README/Note pairing 三组 `--write` 重录后校验通过

## 四、文档与 Agent Note

- 工具 README（en/zh）：Tool 段新增「宽容接受与路径化错误（W21-R1）」；Limitations 首条翻案（原 deferred「oneOf 校验错误不含字段路径」→ 已实现，残余面改述为「结构烂对象载荷仍走无分支 matched 0」并标注零观察）
- 新 Agent Note：`2026-10-06-present-card-lenient-leaves-and-pathed-errors{,.zh.md,.i18n.yaml}`（机制决策 + exact-one 坑 + 残余面 + 备选否决理由）
- 原 note `2026-10-06-mobile-structured-cards-tool-channel` 的「叶子值容忍 deferred」条目按部分 supersession 处理：改述为已实现 + 交叉链接新 note（note 保持 active，其余决策仍具未来价值）
- `docs/tool-catalog{,.zh.md}` 再生成（新 description 投影）

## 五、结论

- **「模型把叶子值数字化」破口（S3/R4 主根因族）：清零**——num 3/3 一次通过零循环（`w21-r1-matrix-runs.jsonl` num#1-3 三行 errResults=0）；验证器独立复验为 2/3，失败腿是枚举越位 `kind:"id"` 走框架 matched-0（`vfy-w21r1-ho-matrix-runs.jsonl` num#2，session-c86a6a7e seq289/290），非数字族——数字型拒绝在两轮实跑中均为零；全部 13 个新会话/续聊回合零数字型拒绝；P3 时代的 6-7 次盲改循环形态未再出现（s3 的重试全部为其它形态：#1 一轮、#3 两轮自纠）
- **「payload 双重序列化」破口：清零**——R4 续聊 2/2（旧 fence 污染上下文中出卡零循环）；被动字符串形态被机制解析接受
- 残余（非本批根因族、如实记录）：模型臆造字段/截断 JSON 的一次性重试（中文路径化错误保证一至两轮自纠），S3 一次通过率 3/5；根因在模型生成质量与 description 教学副作用——但「框架层 matched 0 残余面维持零观察」被证伪（W21-R2 撤回）：对象形态载荷的枚举越位仍会在框架 oneOf 被无路径拒绝（`"payload" must match exactly one oneOf branch (matched 0)`），验证器 num#2 seq289 `metrics[3].kind:"id"` 即实测反例，其模型盲改一轮后侥幸通过（vfy num 腿 2/3）。该残余面已由 W21-R2 修复：payload 参数声明改为不拦截形态（`type:'json'`），全部校验下沉 resolve 走查、枚举越位带路径与候选值

## 六、证据文件（demos/acceptance-w21/，前缀 w21-r1-）

- `w21-r1-matrix.mjs`（probe，断点续跑）、`w21-r1-matrix-runs.jsonl`（逐回合台账）、`w21-r1-matrix-summary.json`、`w21-r1-matrix-console.log`、`w21-r1-preflight.json`
- 截图：`w21-r1-num-*.png`、`w21-r1-s3-*.png`、`w21-r1-s1-*.png`、`w21-r1-r4-*.png`
