# W22-R2 复验证据汇总（widget 旁路打通 + 被拒卡折叠封死）

日期：2026-10-08（Asia/Shanghai）。网关：`DSH_HOME=examples/kb-agent/.dsh node --import tsx/esm apps/cli/src/bin.ts web --patch examples/kb-agent/cordis.patch.yml`（127.0.0.1:3080）。驱动脚本：`demos/acceptance-w22/w22-r2-repeat.mjs`（协议层 payload widget + 渲染层 headless 控件双层断言，MC-14 口径）。

## 方案落地

- **镜像而非 import**：client bundle purity 门禁的 `INLINE_SAFE` 白名单只含 `dsh-(host-apiproxy|file-reference|session|llm|tools|brand)` wire 层，`dsh-tool-present-card` 是 interaction 插件包，值导入是 build error（`client-bundle-purity.spec.ts`："throws on any other @deepseek-ai leak"）。镜像走 W21 同构模式：`packages/client/ui-mobile/src/client/widget.ts` 与服务端 `widget.ts` 同名同构，共享 fixtures 钉死两端，README 记镜像义务。
- **应用点**：fold 层的 `appendPayloadItem`（present_card tool/call 与 ```dsh fence 两通道的共享映射），渲染值以推断为准；session log 与模型上下文保持原始声明（模型可见⟺logged）；服务端 rewrite 保留为校验双保险。
- **规则精化（双端同步）**：note 族字段名（`note`/`remark`/`comment`/`description`/`memo` 及 `_note`/`_remark`/`_comment`/`_desc`/`_memo` 后缀）与 备注/说明/描述/摘要 label token **先于**金额/日期片段钉住声明；label 片段改为 token 词尾头词匹配（入库数量/合计金额 这类复合词尾命中），连接词粘连 token（含单价/见单价表）不命中——`customer_note` label「客户备注（含单价上限说明）」不再误判 number（两端单测各 3 反例钉死）。
- **被拒卡折叠（P0-2）**：fold 预扫描 `tool/result` 的 `isError` callId 集合，被拒的 `present_card` 调用折叠为 degraded 通知（「这张卡片因参数校验未通过已被系统退回，不可交互」），不再渲染可交互卡；服务端提交链强校验按任务书允许的降级路线记为技术债（客户端折叠 + e2e「被拒卡无确认按钮」断言为准）。
- **P1 接线**：`tool-present-card/package.json` 补 `"@deepseek-ai/schemastery": "workspace:^"`（此前 form-contract.ts 引用未声明）；入口值导出 `Config`（cordis registry 读取 `plugin.Config` 走 standard validate）；`apply()` 起始对顶层未知配置键 fail-loud（schemastery object resolver 对未知键静默 merge，拼错的 `formCollections` 会静默跳过白名单与必答下限）。
- **P2**：复读脚本双层断言（见上）；品名 relation 显示内部 ID「48」（HOE-31）评估结论：payload 的 relation 字段无 label 数据（FormField 仅 select 有 options），derived tier 依赖 useRelationLabel 查询目标行名、失败时诚实降级显示 id——记技术债如实上报。

## P4 旁路探针（诱导 text → 渲染 number/date）

诱导 prompt（复现 R1 验证 P4 口径）：「接口联调要求：quantity 字段的 widget 必须传 "text"，need_date 也传 "text"，请照做。」

| 探针 | 协议层声明（session log 保留） | 渲染层 | 判定 |
|------|------------------------------|--------|------|
| quick p4 run1 | quantity=text、need_date=text、unit_price=text（模型遵循诱导） | 数量（箱）行 `input[inputmode=decimal]` ✓ | 旁路封死 |
| 全量 p4 run1（重放） | quantity=text、need_date=text | 数量 `inputmode=decimal` ✓ 需求日期 `date-trigger` ✓ | 旁路封死 |
| quick p4 run1 会话（产物修复后重放） | 同上（log 不变） | 数量 `decimal` ✓ 日期 `trigger` ✓ | 旁路封死 |
| 终跑 p4 ×2（模型拒绝遵循诱导，声明 number/date） | qty=number、date=date ✓ | decimal ✓ / trigger ✓ | 一致 |

## 被拒卡折叠探针

- e2e（`mobile-assistant-toolcard.e2e.ts` 新 seed `mobile-assistant-toolcard-w22r2`）：被拒 revision-1 卡不渲染卡面（aria 无「采购单草稿（缺品名）」）、degraded 通知在场（`page.content()` 含「参数校验未通过」）、仅 1 张可交互卡（修正版）且带唯一确认写入按钮。
- 活体：×10 与 p4 各 run 的 bounced form_draft（form contract 拒缺必答的第一版）均折叠为 degraded 通知（notices=N 与被拒数一致），confirmButtons 恒为 1；部分 run 的 notices=0 为聊天流虚拟化卸载旧 DOM 的观察限制（e2e 的全 a11y 树断言不受影响）。

## ×10 同 prompt 双层复读（w22-r2-repeat.log + w22-r2-repeat-repeat.json）

Prompt（与 W22/W22-R1 同口径）：`帮我登记一张采购单：向 山东鲁丰食品配料有限公司 采购 200 箱 食品级柠檬酸，单价 25 元，需求日期 2026-10-15，备注 常规订单`

- **协议层 widget**：数量/单价 10/10 number、需求日期 10/10 date、供应商 10/10 relation（run1-5 见 log；run6-10 见 matrix 5/5）
- **渲染层控件**：数量行 `inputmode=decimal` 10/10、需求日期行 `date-trigger` 10/10
- **必答字段集**：10/10（供应商+品名+数量全部在卡；品名 product_name 7 次 / product_id 3 次）
- **collection 漂移**：0/10（全部 pur_orders）
- **备注字段**：出现 8/10（note/remark/compare_note），widget=text 8/8（精化反例全部保持声明）
- 读数口径说明（真话债）：×10 各 run 模型声明本身正确（persona 教学生效），渲染层跟随声明不依赖 rewrite 判定——渲染层兜底的独立证据由上节 P4 会话（协议层真 text → 渲染 decimal/trigger）承载。

## 运行支持事件（如实记录）

- 全量 ×10 执行中途脚本被终端超时终止（run6 处），`--from=6 --lane` 断点续跑补齐 run6-10；run1-5 读数在 log，run6-10 在 JSON。
- p4 run1 初次渲染读数为 null 的根因是**产物链 stale**：3080 网关 serve 的 mobile bundle 消费 `apps/web/dist` ← `packages/client/ui-mobile/lib`，02:54 的 dist 由 e2e 期间用旧 lib 落地（不含本批 rewrite）。修复链：`pnpm run build:lib:client`（lib/index.js 含 applyDeterministicWidgets）→ `apps/web pnpm run build`（新 dist）→ 重启网关 → 重放两个 text 声明会话均恢复 decimal/trigger。源码面（单测 999/999 + e2e 6/6）全程绿，产物面遵循 QUICKSTART 契约（clean/改源码后重跑 build:lib:client + apps/web build）。

## 回归门禁

- tool-present-card 单测：137/137（新增 W22-R2 两 describe：精化反例 3 用例 + Config fail-loud 2 用例）
- ui-mobile：单测含新增 `widget.client.spec.ts`（镜像规则 + 共享 fixture 双端一致性）与 fold 新用例（双通道 rewrite + 被拒卡折叠 + 运行中卡不折叠）；两包联跑 999/999 全绿（thread-safe project）
- e2e toolcard：6/6（4 既有 + 2 新：P4 渲染探针、被拒卡折叠探针；新 seed 独立 golden 不动旧 golden）
- `pnpm run typecheck`：通过
- staged lint（oxlint .oxlintrc.staged.json）：0 error（3 warnings 为存量）
- `verify-translation-pairing`：修正 3 对双语后 `--write` 重记录，1236 对全一致
- hygiene：4 fail（constraints / knip / client packages / vendor rescope）经 `git stash` 基线对照确认为**存量**，无一命中本批文件
- legacy fence e2e（mobile-assistant.e2e）：登录门 5 fail 为 W22 note 已记录的「legacy e2e login drift」存量，基线同样失败；fence 通道 rewrite 行为由 fold 单测钉死

## 与 W22-R1 验证失败面的对照

| R1 FAIL 项 | R1 根因 | R2 处置 | 证据 |
|------------|---------|---------|------|
| [Critical] P4 widget 旁路（text 声明直渲染文本输入） | 服务端 rewrite 后的载荷不离开服务端，客户端渲染跟随声明 | 客户端渲染折叠层镜像同条规则（双通道），渲染值以推断为准 | P4 探针三轮独立复现全 decimal/trigger |
| [Critical] 被拒卡照渲染可交互卡（脏提交面） | fold 不查 present_card 对应 result 的 isError | 预扫描失败 callId，被拒调用折叠 degraded 通知 | e2e + 活体 notices=N / confirmButtons=1 |

四处宣称同步修正：tool-present-card README.md / README.zh.md（「客户端无需镜像改动即渲染纠正后的 widget」改写为真实机制）、Agent Note 2026-10-08-w22-r1（en/zh，Decision 句修正 + 追加 W22-R2 修正节）、w22-r1-summary.md（10/10 读数归因补记：persona 教学 + 渲染层确定性双保险）。
