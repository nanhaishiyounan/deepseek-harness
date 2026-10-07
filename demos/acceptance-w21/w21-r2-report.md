# W21-R2 清偿批次报告（终验 FAIL 项修复：不拦截载荷声明 + widget/null 双端对齐 + R1 叙述真话债）

日期：2026-10-06 · 批次：W21 终验 FAIL 三项必做 + 随批清理
环境：live gateway :3080（真实 MiniMax-M3 全链），buyer/Buyer#2026；前置 persona 投影一致（cmp 字节相同）、build:lib:client 重建、gateway 重启 /mobile=200 后跑活体

## 一、三项必做

### 1. enum/判别字段越位无路径错误（num 腿 2/3 根因）——方案 A1 落地

- 根因实证：vfy num#2（session-c86a6a7e seq289/290）`report.metrics[3].kind:"id"` 对象载荷被框架 oneOf 以 `"payload" must match exactly one oneOf branch (matched 0)` 拒绝（无字段路径），模型盲改一轮侥幸通过。
- 决策：**A1 不拦截声明**——payload 参数声明 `type:'json'`（[index.ts:717](../../packages/interaction/tool-present-card/src/index.ts)），框架匹配器结构上不再拒绝任何载荷形态；九分支骨架保留为 resolve 走查权威，模型侧指引移入参数 description（各分支字段/枚举表）。exact-one oneOf 无法在九严格分支旁挂兜底分支（合法对象双匹配→matched 2，与 R1 number+integer 同坑），故 A2（只放宽枚举字面量，仍有缺必填/多字段 matched-0 残余）与方案 B（改 core/tools 共享底座）均否决。
- 单测覆盖：13 条枚举越位全覆盖表（variant/widget×2/tier/summary kind/metrics kind/metrics tone/rows level/columns kind/action/state/planType/outcome，逐一断言路径+合法候选值）+ seq289 复刻经 `ctx.tools.execute` 端到端断言（路径化文本、无 `matched`）+ 标量 payload 路径化错误 + schema 形态断言（payload 无 type/oneOf/enum 约束、description 含九类名）。
- 活体实证（enum#2，session-b4e663ab）：强诱导下模型发出 `columns[0].kind:"status"`/`columns[2].kind:"id"` → 返回 `payload.table.columns[0].kind 应为 "text"/"money"/"percent"/"count" 之一（收到字符串 "status"）; payload.table.columns[2].kind …（收到字符串 "id"）`——带路径与候选值、零 matched；模型 seq431 准确复述四个合法值并按 persona 契约③如实说明收尾（用户明确指示非法值时不擅自改值，行为正确）。「自发臆造一轮自纠」形态由单测 seq289 复刻锁定；enum#1/#3 活体均首发合法出卡（未触发越位，教学见效）。

### 2. widget 双端必填性对齐 + 宽容度分歧族裁决

- widget 服务端补 `required:true` ×2（ask_field.field.widget [index.ts:207](../../packages/interaction/tool-present-card/src/index.ts)、form_draft.fields[].widget [:250](../../packages/interaction/tool-present-card/src/index.ts)）——客户端口径胜出（卡片渲染必需）。fixtures 新增 `ask-field.missing-widget.invalid` / `form-draft.missing-widget.invalid`，双端同判拒绝（服务端 spec 断言 `payload.field.widget 缺失（必填字段）` 中文路径 + INVALID_ARGS；ui-mobile 镜像 spec 断言 undefined）。
- 分歧族逐项裁决：①可选集合 null（rows/table）——服务端走查新增「可选且无枚举/const 约束的叶子收 null 等同省略」（[index.ts:557,614](../../packages/interaction/tool-present-card/src/index.ts)），客户端 actions null 补齐同口径（[protocol.ts:615](../../packages/client/ui-mobile/src/client/protocol.ts)），fixture `report.null-optional-collections.valid` 双端同判接受且省略；②可选枚举叶 null（tone/columns kind）——双端同判拒绝（present-but-illegal）✓；③mode/variant/allowFreeText/suggestions 客户端缺省默认、create-task text 折叠、中文 state——**服务端为准、不强行对称**：客户端宽容仅服务旧围栏回放，工具路径不可达（服务端先拒），记入 README 局限首条。

### 3. R1 报告叙述真话债更正（更正非删记录，附证据指针）

- ①「零兜底/零 degraded/一轮自纠」→ s3#3 如实口径：errResults=2、DOM「零 degraded 折叠」断言 ok=false、截图实有 degraded 折叠与重复卡（[w21-r1-report.md:22,26](w21-r1-report.md)，指针：w21-r1-matrix-runs.jsonl s3#3 行 checks.domPass、w21-r1-s3-3.png）。
- ②撤回「框架层 matched-0 残余面零观察」：vfy num#2 seq289 实测反例 + 本批 A1 修复状态（[:51](w21-r1-report.md)）；num 结论行补验证器独立复验 2/3 口径（[:49](w21-r1-report.md)）。
- ③「24 个叶子位」→22 个 schema 放宽位点（summaryRow/approvalDoc 两处 schema 复用展开为 24 载荷位）（[:9](w21-r1-report.md)）。

## 二、复验矩阵（live，证据 w21-r2-*）

| 腿 | 结果 | 明细 |
|---|---|---|
| num 强化诱导 ×3 | **3/3 一次通过** | 数字叶子 [5,2,8]（前置断言 ≥2 全过）、零 error、零 matched-0、零重试；一次诱导下 payload 为字符串形态也被解析接受（payloadString=true 属机制内行为） |
| enum 越位 ×3 形态 | **机制实证成功** | #1/#3 首发合法（未触发）；#2 触发→路径化错误（含候选值、零 matched）→模型复述合法值并按契约收尾；「一轮自纠」在用户坚持非法值场景不适用（模型不擅自改值是正确行为），自发臆造自纠由单测 seq289 复刻端到端锁定 |
| widget 缺省 fixture 双端断言 | **双端同判拒绝** | 服务端 66 测试含中文路径断言；ui-mobile 815 测试含镜像断言 |
| 报告叙述抽查 | 三处更正逐条对照原始证据复核 | s3#3 jsonl 行 / vfy num#2 seq289 / 22 位点计数均与叙述一致 |

记录保全：enum#1 存在两条记录——首跑 PASS（session-e1cc5749）与一次 resume 过滤 bug 造成的重跑（session-bdb1f555，模型纯文本应答未出卡 ok=false）；两条均保留在案，bug 已修（已记录的失败默认跳过，R2_RERUN_FAILED=1 才重跑）。

### enum 腿台账如实披露（W21-R3 终验补录）

上表「机制实证成功」按错误文本断言（含字段路径与候选值、零 matched）与模型行为正确性判定，未同步披露该腿台账并非全断言通过：`w21-r2-matrix-summary.json` 记 enum pass=2/required=3、fail=2（attemptsRecorded=4）。其中 enum#2 记录 ok=false——「至少一次 present_card 成功出卡」「一轮自纠出卡（ok=0 err=1）」「结构化卡 DOM 渲染」（九类卡全零）「零 degraded 折叠（degraded=1）」四项断言失败：用户坚持非法值时模型按 persona 契约③复述合法值并如实收尾、未再出卡（行为正确，与矩阵断言的「自纠出卡」形态不兼容），且该腿截图实有一处 degraded 折叠；另一 fail 即上文 resume 过滤 bug 重跑。证据指针：`w21-r2-matrix-runs.jsonl` enum#2 行 checks.logPass/domPass、`w21-r2-enum-2.png`、`w21-r2-matrix-summary.json`。

## 三、回归门禁（实跑输出）

- `pnpm vitest run packages/interaction/tool-present-card`：**66/66 绿**（46→66：枚举全表 +13、seq289 复刻端到端 +2、widget 缺省 +2、null 集合 +1、schema 形态重写等）
- `pnpm vitest run packages/client/ui-mobile`：**815/815 绿**（809→815）
- `pnpm run test:web -- mobile-assistant-toolcard`：**4/4 绿**（无 golden 漂移，未 refresh）
- `pnpm run typecheck`：**0 错误**；`pnpm run build:lib` / `build:lib:client`：通过
- 本批文件 staged 口径 oxlint（.oxlintrc.staged.json）+ type-aware：**tool-present-card 包 0 警告 0 错误**（含 R1 遗留 5 项 type-aware 清偿：no-unnecessary-condition ×3、boolean-literal-compare、require-await）；protocol.ts/protocol.client.spec.ts 0 错误；ui-mobile 其余预存 type-aware 项为他批债务未扩面
- `pnpm run doc-sync`：**29 过 1 败**——唯一红为预存 `verify-export-jsdoc`（session-persistence-jsonl build 产物 `JsonlSessionPersistence.config`，R1 报告同款、零 W21-R2 变更，非本批引入）；translation pairing 经三组 --write 重录后 1233 对全绿
- `pnpm run verify-agent-note-format`：**780 全绿**；README/Note pairing 五组 --write 重录后校验通过

## 四、文档与 Agent Note

- 工具 README en/zh：payload 声明重述（json 型 + description 指引）、新增「Non-intercepting payload declaration (W21-R2)」段、Limitations 首条翻案为「框架层载荷拒绝：已无」+ 镜像不对称清单
- `docs/tool-catalog{,.zh.md}`：en 由 gen-tool-catalog 再生；zh 侧 code block #23 同步新 schema（schema 块语言中立）后重录配对
- 新 Agent Note 三件套：`2026-10-06-present-card-nonintercept-payload-and-mirror-alignment{,.zh.md,.i18n.yaml}`（问题/决策/备选否决/后果/验证）
- R1 note（lenient-leaves）残余面与「json 声明」备选两条按部分 supersession 更新并交叉链接 R2 note，保持 active；i18n 配对重录

## 五、随批清理

- persona 两句过时表述（[:115](../../examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml) 值类型纪律、[:131] ③重试纪律）改为与现行机制一致；`.dsh` 投影同步后 cmp 字节一致（矩阵 preflight 亦断言通过）
- fixture cwd 耦合：protocol.client.spec.ts 改为 `expect.getState().testPath` 从测试文件位置解析（jsdom 重写 import.meta.url 的既定约束下不依赖进程 cwd）
- R1 新源码 type-aware lint：本批+R1 面全部清零（见上）；全仓其余预存红不属本批范围
- 变更清单对账：见下

## 六、本批变更文件清单（git status/diff 对账生成）

修改：`packages/interaction/tool-present-card/src/index.ts`（A1 声明 :717、widget required :207/:250、null 省略 :557/:614、JSDoc :26-40、lint 清偿 :451/:512/:516/:619/:836）· `packages/client/ui-mobile/src/client/protocol.ts`（:615 actions null）· `packages/interaction/tool-present-card/tests/present-card.spec.ts`（schema 形态 :107-128、结构拒绝表 :69-81/:146-158、枚举全表 :358-425、seq289 复刻 :428-457）· `packages/client/ui-mobile/tests/protocol.client.spec.ts`（:20-30 cwd 解耦、:93-97/:100-104 fixture 列、:211-231 W21-R2 镜像）· `examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml`（:115/:131）· `demos/acceptance-w21/w21-r1-report.md`（:9/:22/:26/:49/:51）· `packages/interaction/tool-present-card/README{,.zh}.md` · `docs/tool-catalog{,.zh.md,.i18n.yaml}`
新增：fixtures ×3（ask-field.missing-widget.invalid / form-draft.missing-widget.invalid / report.null-optional-collections.valid）· Agent Note 三件套 ×1（nonintercept-payload-and-mirror-alignment）· `demos/acceptance-w21/w21-r2-{matrix.mjs,matrix-runs.jsonl,matrix-summary.json,matrix-console.log,preflight.json,num-1..3.png,enum-1..3.png}`
更新：R1 note 双语残余面/备选翻案 · `packages/interaction/tool-present-card/README.i18n.yaml` · 两个 note .i18n.yaml

## 七、结论（如实）

- 框架层 matched-0 在结构上不可达（单测断言 payload 无约束形态 + seq289 复刻 + 活体三形态零 matched）
- num 腿 3/3 达标（含数字叶子前置断言全过）
- enum「一轮自纠」活体仅在「用户坚持非法值」形态下被契约收尾替代（模型行为正确、错误可读性实证）；自发臆造自纠由单测与 R1 历史记录（s3#1 hint 一轮纠正）佐证
- 残余如实记录：模型首发质量依赖 description 表 + persona 教学（schema 骨架指引已让位）；doc-sync 的 export-jsdoc 预存红与本批无关；ui-mobile 其余 type-aware 预存项为他批债务
