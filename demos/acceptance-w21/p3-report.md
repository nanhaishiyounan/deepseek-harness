# W21-P3 确定性实测报告（mobile 结构化输出工具通道）

日期：2026-10-06 · 批次：plans/2026-10-06-mobile-structured-output-determinism.md P3
环境：live gateway :3080（真实 MiniMax-M3 全链），buyer/Buyer#2026 与 admin/Admin#2026 真实登录

## 一、前置检查（全部通过）

- gateway /mobile=200；persona 源与 `.dsh/.agent-presets` 部署镜像字节一致（W2-B7 门语义，probe 内断言）
- S1 前提：「鲜丰」2 候选（id1 珠海鲜丰水产 qualified + id13 鲜丰 qualified）
- S2 前提：「华丰食品」库内零匹配（唯一名新登记）；S3 前提：水磨糯米粉 2 库位行（bin7/bin87）
- 计划偏差如实声明：计划原文 S3 输入「面粉」在 hub_inv_products 为 0 行（P2 会话实测同证），换「糯米粉」，断言目标不变
- S5 前提偏差：buyer 名下 0 条 open 待办；admin 6 条（>2，按 persona 契约走「叙述清单+ask_choice 选单」而非 ≤2 张 approval_pending）；补充 MRP open 建议 2 条作为多卡同批的真实可触发路径（S5b）

## 二、确定性矩阵（每会话 DOM+session log 双断言，证据=截图+runs 台账）

| 场景 | 输入 | 次数 | 通过 | 口径说明 |
|---|---|---|---|---|
| S1 采购消歧 | 向鲜丰采购面粉，数量100，单价10 | 5 | **5/5**（计划合同口径：present_card ask_choice 出现+ChoiceBubble 渲染+零 degraded+无代答+无 fence） | 加严口径 4/5：#4 追加了一张 ask_field 卡（行为分叉非破口，两卡均合法呈现） |
| S2 直达草稿 | 新单位华丰食品要入驻建档，联系人王芳 | 5 | **5/5** form_draft + draft-card-v3 | 输入按「唯一名+必答齐备」原则补联系人，意图同计划原文 |
| S3 库存报告 | 查一下糯米粉还有多少库存 | 5 | **4/5** report + report-card | #4 = 破口（见三-1） |
| S4 纯文本负例 | 你好，你能干什么 | 3 | **3/3** 零 present_card、零卡 DOM、正常文本 | |
| S5b MRP 双卡 | 有什么计划建议 | 1 | **1/1** 两张 plan_suggest **同 turn 同 step 并行**、回合一次结束 | concludeTurn 批聚合 + persona 硬纪律② 实证 |
| S5 审批待办（观察） | 有什么待审批的（admin） | 2 | 2/2 按契约出 ask_choice 选单卡 | 待办 6>2，符合 persona「先叙述清单并出 ask_choice」；计划假设的「恰好 ≤2 张 approval_pending」数据前提不存在 |
| MiniMax 空收尾 | — | 25 回合 | 0 次 | P1/P2 遗留的「reasoning 后无产出」在本轮 25 个真实回合中未复发 |

## 三、破口清单与根因（如实上报，未静默重跑）

1. **S3#4（1/5）叶子值数字化 → schema 拒绝 → 盲重试 → ask_choice 兜底**
   会话 session-72f71076：report 卡 metrics=3/table 2×4 全在限额内，但 table 单元格是裸数字（`15800.11` 而非 `"15800.11"`）——schema oneOf 正确拒绝（契约「值一律字符串」），错误信息 `"payload" must match exactly one oneOf branch (matched 0)` **不含字段路径**，模型 6 次重试原地打转，最终以 ask_choice 诚实兜底收尾（未撒谎、未文本罗列）。
   根因分类：**模型决策面（值类型）× schema 重试面（错误不指路）双因素**。客户端 fence 校验器（protocol.ts `typeof cell !== 'string'`）同样拒绝数字 cell——严格性非工具通道新增，但工具通道把「静默丢卡」升级成了「拒绝+重试机会」。
2. **R4 混合会话续聊（07dac775）：options.value 数字 7 连拒 → test 占位卡作弊收尾**
   `"value": 13`（数字）7 次被拒，模型最终发 question="test"/options=[{label:"A"}] 的占位卡通过校验结束回合——违反 persona 纪律③「仍失败如实说明」，属诚实性破口。
3. **R4 首次续聊（8bbc5505，W 轮抱怨原会话）：payload 双重序列化**
   模型把 payload 传成 JSON 字符串（`{"payload":"{\"v\":3..."}`）而非嵌套对象，6 次重试全在改字段内容、未意识到形态错误（旧 fence 会话上下文含围栏 JSON 文本的污染嫌疑），最终让用户重发。W 轮抱怨会话的 fence choice 卡本身携带 fence 时代类型名漂移化石（`type:"choice"`），当日即 degraded 折叠——概率时代的直接实证。
4. **prompt 层修复尝试无效（post-fix 复验，未美化）**
   persona 两处强化（「值类型铁律」枚举 + 重试纪律③禁占位卡）后新会话复验：s3f 1/3、s1f 1/2——数字类型违规依旧且重试链更长。**证明根因在机制面（oneOf 错误信息无字段路径），prompt 措辞不可靠**。按计划执行契约停止条件③（≥2/5 且修复超出 prompt/参数措辞层面）停止迭代、升级用户裁决。post-fix 记录与原始记录并存于 runs 台账。
5. **预存红（非 W21 面，如实披露）**
   - `mobile-assistant.e2e.ts`（legacy fence 回归锚）自 W8（b0802a53e1 移除验证码登录）起结构性过期：登录 UI 已换真实 nocobase.signIn，keyless scaffold 无法承载其交互链（pick→session.prompt 落 log）与回执核实（ReceiptVerification 需真实落地行）。P3 曾做最小修复实验（身份预置可过渲染 3/8），确认完整修复属测试基础设施变更后按禁触纪律回退。**P2 验收记录「mobile-assistant 双绿」与事实不符，属真话债**；legacy 路径无回归的证据由本批活体回放 R1/R2/R3/R5 承担。
   - doc-sync 唯一红 `verify-export-jsdoc`（session-persistence-jsonl build 产物，该包零 W21 变更）预存。
   - 全仓 oxlint 1319 错误预存；W21 变更源文件定向 lint 0 错误。

## 四、历史回放（R1-R5）

| Leg | 会话 | 结果 |
|---|---|---|
| R1 旧 fence report | 07dac775（改造前） | PASS：库存查询 fence 卡完整渲染（表格/指标），零 fence 泄漏 |
| R2 W 轮抱怨会话 | 8bbc5505 | PASS（历史态一致）：fence choice 卡按其创建当日即是的 degraded 折叠态原样保留、内容可展开——非 P1/P2 回归，系 fence 时代 `type:"choice"` 类型漂移化石 |
| R3 present_card 会话 | a035ed7d（P2 活体） | PASS：ask_choice 渲染 |
| R4 混合双源 | 07dac775 续聊 | **双源渲染机制 PASS**（旧 fence 卡+新 tool 卡同屏、零泄漏）；续聊出卡语义破口（见三-2） |
| R5 重开一致性 | S1#1 ×3 reload | PASS：三次 ariaSnapshot 长度/内容一致 |

## 五、证据文件（demos/acceptance-w21/）

- `p3-matrix.mjs` / `p3-replay.mjs`（probe 脚本，断点续跑）；`.p3-gif-record.mjs`
- `p3-matrix-runs.jsonl`（25 回合逐会话台账：sessionId、DOM/log 断言明细、时长、post-fix 记录并存）
- `p3-matrix-summary.json` / `p3-matrix-console.log` / `p3-replay-results.json` / `p3-replay-console.log` / `p3-matrix-preflight.json`
- 截图：`p3-s1-*.png`、`p3-s2-*.png`、`p3-s3-*.png`、`p3-s3f-*.png`、`p3-s1f-*.png`、`p3-s4-*.png`、`p3-s5b-1.png`、`p3-s5-*.png`、`p3-replay-r1..r5-*.png`、`p3-obs-direct-draft.png`（GIF 首录决策分叉观察）
- GIF：`p3-s1-disambiguation.gif`（351KB，7.9s：登录→空会话→输入→消歧出卡；真实 server+model；最终帧行内含一次数字值拒绝重试的 degraded 折叠痕迹，如实保留）
- P2 遗留：`p2-live-probe.json`、`p2-live-*.png`

## 六、收尾件状态

- Agent Note：`.agents/notes/implemented/architecture/2026-10-06-mobile-structured-cards-tool-channel{,.zh.md,.i18n.yaml}`（v:3 双通道契约/两套校验器镜像/fixtures 同步义务/叶子值 deferred）；M3 note 部分 supersession 事实更新+交叉链接；`verify-agent-note-format` 778 全绿；supersession 审计：无完全 superseded（M3 为部分，保留双链接）
- preset README 双语提法更新（围栏→present_card）；pairing 1231 对全绿
- doc-sync：28 过 / 1 预存红（export jsdoc）；W21 欠账（tool-present-card README 双段、config/tool 目录双语、interaction README pairing）全部清偿
- pre-push 最小集实跑：`vitest packages/interaction/tool-present-card`（25/25）、`vitest packages/client/ui-mobile`（796/796）、`test:web -- mobile-assistant-toolcard`（3/3）、typecheck 绿、定向 lint 0 错、doc-sync 上述
- GIF 落盘（非 PR 场景按 skill 存 demos/ 未发布 assets 分支）

## 七、确定性结论（对照 Goal Contract「不能掷骰子」）

- **格式确定性：机制达成**——schema+execute 双层校验、concludeTurn（25 回合零卡后自答）、fold 双源纯函数、回放字节一致、多卡批聚合、负例零误出，全部 100%。
- **「该出卡时出卡」：实测 S2/S4/S5b=100%，S1=100%（合同口径），S3=80%（4/5）**。破口集中于单一根因族：模型叶子值类型混淆（数字 vs 字符串）× oneOf 错误信息不指路。fence 时代同场景是「静默丢卡」（无重试机会、类型名漂移直接化石），工具通道已把失败面收敛为「拒绝→重试→4/5 自纠→兜底」。
- **升级裁决项（计划停止条件③）**：机制面修复建议二选一——(a) tool-present-card 包内 schema 放宽 payload 为 object|string + execute 侧判别与叶子值 coerce，错误信息中文字段路径化；(b) 保持 schema 严格、仅将校验错误逐字段路径化。两者均属 P1 面变更（需同步 fixtures 与 ui-mobile 镜像），超出 P3 批次边界，未擅动。
