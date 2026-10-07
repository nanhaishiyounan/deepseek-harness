# Agent Note: present_card 宽容叶子与中文路径化错误 — W21-R1 规范化步骤

Status: implemented

[English](2026-10-06-present-card-lenient-leaves-and-pathed-errors.md) | 中文

## 问题

W21-P3 确定性矩阵留下一个失败族：MiniMax-M3 在 id/value/数量类叶子上发裸数字（`"value": 13`、报告表格裸数字单元格 `15800.11`），或把整个 payload 传成 JSON 字符串（旧围栏会话上下文诱导的双重序列化形态）。九分支 oneOf schema 都正确拒绝了它们，但通用 schema 走查只报 `must match exactly one oneOf branch (matched 0)`——不含字段路径——模型盲改重试六七次，其中一次以占位「test」卡收尾。prompt 层强化已被 post-fix 抽样证伪（s3f 1/3），证明根因在机制面而非契约面。

## 决策

**在 execute 边界接受并规范化，所有可达拒绝都给中文字段路径。** payload schema 保留九个封闭分支作为模型的生成指引，但把 24 个 id/value/数量叶子位放宽为 `string | number`，并加第十个字符串分支（载荷的 JSON 字符串）。单一导出纯函数步骤 `resolvePresentCardPayload`（[tool-present-card/src/index.ts](../../../../packages/interaction/tool-present-card/src/index.ts)）承担规范化：字符串 payload 先 JSON.parse，`v`/`type` 判别带具名诊断，schema 驱动的走查把有限数字 coerce 为字符串并收集中文字段路径违规（`payload.options[2].value 应为字符串或数字（收到布尔值 true）`）——遵循 request/spec resolve 惯例，是校验前的显式步骤、绝不藏进 `run()`。coerce 后的规范化载荷与等价的全字符串载荷行为完全一致（回执、落库、渲染不变）；布尔、数组、对象及越位 null 仍拒绝。`execute` 先走 resolve，再走既有条数校验。

**双镜像同 PR 移动。** ui-mobile 协议校验器放宽同样的 24 位（`coercedText`；任意字符串语义的 `fields[].value` 保留空串语义并加数字 coerce），`parseDshPayloadObject` 在校验前解析字符串化 payload——围栏读路径与工具调用路径同口径 coerce，卡片无论走哪个通道渲染一致。九个新 fixtures（`*.numeric-values.valid`、`payload-string.*`、`ask-choice.boolean-value`、`report.title-number`）锁定共享样本。

两个机制坑随决策记录在案：

- **标量 oneOf 联合不能同时带 `number` 与 `integer` 分支**——整数两者都匹配，exact-one 规则以 `matched 2` 拒绝。单个 `number` 分支即覆盖所有有限数字。
- **通用 schema 走查仍保留一个残余面**：结构烂的对象载荷（缺必填字段、坏枚举）在 `execute` 能路径化之前就被无分支的 `matched 0` 拒绝。验证器 W21-R1 复跑实测命中——对象载荷枚举越位 `report.metrics[].kind:"id"`（session-c86a6a7e seq289）——「零观察」立场未保住。W21-R2 以 `type:'json'` 声明关闭该残余；见 [2026-10-06-present-card-nonintercept-payload-and-mirror-alignment](2026-10-06-present-card-nonintercept-payload-and-mirror-alignment.zh.md)。

## 备选方案

- **改 `packages/core/tools` 的通用 oneOf 错误** — 否决：计划禁触清单禁止为本需求碰工具底座；execute 侧 resolve 步骤在工具包内达成模型可见的目标。
- **把九分支 schema 降为 `type: 'json'`** — 当其时否决：schema 是经 function calling 发给模型的生成指引，且残余面尚零观察。W21-R2 在残余被实测命中、指引移入参数 description 表后翻案；见 R2 note。
- **放宽所有叶子（label/question/title 也放宽）** — 否决：叙述叶子必须仅字符串；放宽集合恰是业务语义为数字的位（id、值、数量、金额）。
- **更强的 persona 措辞** — 被证伪否决：P3 post-fix 抽样显示违规率不变、重试链更长。

## 后果

- 实测的 S3/R4 失败形态不可达：数字叶子静默 coerce 成功；字符串化 payload 可解析；剩余拒绝都带字段路径、一轮重试即中。
- 围栏读路径现在也 coerce：带数字叶子的历史围栏渲染而非降级（行为变化、镜像使然）；带数字行值的 `form_confirm` 围栏可解析而非降级，但用户动作载荷本就不从 assistant 消息渲染，两条路用户可见行为一致。
- `fieldRowOf` 保留空串 `value` 语义（「落库后生成」写法）——只加 coerce、不加严。
- persona 的「值一律字符串」纪律保留；宽容层是安全网、不是许可。

## 验证

- `pnpm vitest run packages/interaction/tool-present-card`（46 测：coerce/合法/非法/payload 字符串/中文路径化诊断）、`pnpm vitest run packages/client/ui-mobile`（809 测含镜像用例）、`pnpm run test:web -- mobile-assistant-toolcard`（4/4：golden 扩入数字叶子审批卡与字符串化计划卡——仅新增条目）。
- 活体复验矩阵见 [demos/acceptance-w21/](../../../../demos/acceptance-w21/)（`w21-r1-*` 证据）。
