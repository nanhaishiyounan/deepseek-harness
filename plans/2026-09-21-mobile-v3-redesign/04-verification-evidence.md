# 移动端 v3 重设计 · 真实实跑验证证据（04）

> 日期：2026-09-21 | 验证者：verify-executor | 方式：真实浏览器（Playwright chromium，390×844 移动视口 / 1680×1000 桌面视口）× 真实 API（MiniMax-M3 经 apiproxy 网关，`request/header` 实证 provider=minimax）× NocoBase PG 实查（psql）。全程零 mock：草稿、确认、落库、回执均由真实模型回合驱动；seed 重放仅出现在门禁 e2e。

## 0. 环境

- dev server：`node --import tsx/esm apps/cli/src/bin.ts web --patch examples/kb-agent/cordis.patch.yml --no-open`，验证前重跑 `pnpm run build:lib:client`（发现 `protocol.ts`/`form-draft.ts` 比旧 lib 新）并重启 3080 五次（每次 persona 修复后；模块图冻结为硬要求）。
- NocoBase 13000 / PG 5432 全程在跑。PG 基线：`hub_po_purchase_orders` max id=14（v2 遗留），`hub_po_suppliers` max id=6。
- 登录：demo 通道（任意手机号 + 任意 6 位验证码，`verifyCode` 见 [auth.ts](../../../packages/client/ui-mobile/src/client/auth.ts)）。
- 过程工件：`research/2026-09-21-mobile-v3/.shoot*-report.json`（各轮场景判定原始输出）。

## 1. 截图清单（390×844，除 12 为桌面视口）

| # | 场景 | 文件 | 实证点（01 文档编号） |
|---|------|------|------|
| 01 | 登录页（新视觉） | `01-login.png` | 手机号+验证码双输入卡 |
| 02 | 新会话欢迎屏 | `02-welcome.png` | A1/A2：AI 欢迎卡居左、输入框空置、无用户气泡；wire 实证 `user/message`=0 |
| 03 | `+` 底部弹层 | `03-plus-sheet.png` | 替代通讯录：AI 同事行（智能填表助手置顶 + 表单 chips）+ 最近会话 |
| 04 | ask_choice 交互选择 | `04-ask-choice.png` | D1/D2：指代之问（"新建鲜丰供应商 / 名字可能记错了"）单选卡带一行摘要 |
| 05 | 采购单三分层草稿卡 | `05-draft-po.png` | B1/B2：「需要你定」（供应商、采购明细 ≤3）/「请确认 · AI 推导」（日期·登记日=今天、状态·默认 draft、合计·200×32）/「系统生成（1）」折叠；status/order_date/po_number/total 均不在必答区 |
| 06 | 供应商登记草稿卡 | `06-draft-supplier.png` | B1 同构：必答=供应商名称/联系人/邮箱，状态推导"待审核" |
| 06b | 供应商登记回执卡 | `06b-receipt-supplier.png` | C3/D4：№=8 徽标 + 字段行 + 三步流程条（对话/确认/已落库），无 JSON |
| 07 | AI 回答富渲染 | `07-rich-answer.png` | C1：Markdown 加粗（strong×13）+ 列表（ul×4）+ 指标行；DOM 断言 `**` 星号已剥离 |
| 08 | 审核确认动作面 | `08-confirm-action.png` | E1：草稿卡「确认写入/驳回」结构化按钮（无协议文本） |
| 09 | 采购单提交回执 | `09-receipt-po.png` | C3/D4：№=15 + PO-2026-0047 单号 + ¥6,400 金额指标 + 宏发食品 |
| 10a/10b/10c | 暗色模式三屏 | `10a-dark-me.png` `10b-dark-chats.png` `10c-dark-receipt.png` | me/会话列表/回执卡暗色重放 |
| 11 | Profile | `11-profile.png` | 身份卡 + 本月台账指标 + 深色模式 Switch |
| 12 | PC iframe 预览 | `12-pc-iframe.png` | F2：1680×1000 桌面视口，PC 工作台「移动端预览」tab 内嵌 /mobile iframe，iframe 内完成登录落到消息 tab |
| 99-* | 过程失败证据 ×7 | `99-A/B*-failure.png` | 缺陷 V1–V4 的第一现场（降级 JSON 裸奔、无草稿中间态） |

## 2. 双表单全链落库实证（D4/D5）

### 场景 A：采购单（`hub_po_purchase_orders`）

链路（会话 `session-428410b2-d266-4a2b-a252-f7bbd8b2a8af`）：

1. 用户真实输入「帮我登记一下，刚和宏发食品谈好200箱冷链箱，单价32元」；
2. 模型匹配采购单（高置信直进，叙述回显"登记一张采购单"）→ `nb_list` 解析宏发食品 → `form_draft` 围栏；
3. 三分层草稿卡渲染（05）→ 点「确认写入」→ wire 出现 `form_confirm` 围栏动作（user/message, source.kind=user）；
4. `nb_create` 真实调用 → `submit_receipt` 围栏 rowId="15"。

PG 实查与回执互证：

```
 id | po_number     | status | total | order_date | supplier_id | createdAt
 15 | PO-2026-0047  | draft  |  6400 | 2026-05-14 |           6 | 2026-09-21
```

回执卡文本（09）：`已登记 · 采购单 / № 15 / PO-2026-0047 / 宏发食品 / ¥6,400`——№=15 与 PG 行 id 相等，金额 6400=200×32 与推导一致，supplier_id=6=宏发食品（nb_list 解析）。**注**：`order_date=2026-05-14` 与推导依据"登记日=今天"矛盾（缺陷 I1，见 §4）。

### 场景 B：供应商登记（`hub_po_suppliers`）

三轮迭代（99-B* 失败证据对应缺陷 V2–V4 修复过程），最终链（会话 `session-2150201c` 后重启再跑）：

1. 「帮鲜丰做个供应商登记，联系人张经理，邮箱 ops@xianfeng.example」→ `nb_collections` + `nb_list` 查重 → `form_draft`（必答三项齐、状态推导待审核、编号系统生成）；
2. 草稿卡（06）→「确认写入」→ **真实 `nb_create`**（工具结果："已在 hub_po_suppliers 创建第 8 行：id: 8"）→ `submit_receipt` rowId="8"（06b）。

PG 实查：

```
 id | name | contact_name |         email          | status
  7 | 鲜丰 | 张经理       | ops@xianfeng.example    | 待审核   <- B6 链（回执当时降级，见 V4）
  8 | 鲜丰 | 张经理       | ops@xianfeng.example    | 待审核   <- 最终链，№=8 与回执互证
```

id=7 链的 `nb_create` 同样真实（工具结果"创建第 7 行"），仅回执卡当时因 rowId 数字类型降级未渲染。两行均保留作证据。

### 非 seed 重放的证明

- 会话 durable log 里 `request/header.provider=minimax`、`assistant/message.usage` 逐轮递增、`tool/call`+`tool/result`（nb_create 带真实 PG 行号回执）——seed 会话不含这些事件；
- PG 新增行（15/7/8）在验证时刻实时产生，基线（14/6）来自验证前查询。

## 3. 逐组判定（01 §⑤ A–F）

| 组 | 判定 | 证据 |
|----|------|------|
| A 会话启动 | **PASS** | A1：三会话 wire `user/message`(source=user)=0（.shoot1/2-report）；A2：02 截图；A3：[NewChatSheet.tsx](../../../packages/client/ui-mobile/src/client/messages/NewChatSheet.tsx) `start()` 只 `createSession`+`navigate`，无 `promptSession` |
| B 最小输入 | **PASS** | B1/B2：05/06 卡文本（必答 ≤3、推导带依据、系统生成折叠）；B3：e2e golden（chat.expected.md 断言分区+无 key=value）+ A 链 realUserMsgs=2（无补槽文本） |
| C 富渲染分级 | **PASS（一处模型叙述违约，I2）** | C1：07（strong13/ul4）；C2：A/B 链 body 无 ```dsh/hub_/nb_create/确认推送；C3：06b/09 回执卡；C4：e2e golden aria |
| D 交互询问+双表单 | **PASS** | D1/D2：04（ask_choice 单选卡带摘要、点选零打字）；D3：点选 send 文本上 wire（e2e + B6 链 user 消息）；D4：§2 双互证；D5：鲜丰不存在→ask_choice 确认→点选与落库 collection 一致，无静默猜表 |
| E 附加逻辑 | **PASS（E4 未真实触发）** | E1：无"确认推送/nb_create"文本 + form_confirm 围栏 + 重开重放一致（06b/10c）；E2：KG 证据单行入口（e2e 'KG 证据入口'）；E3：标题=用户真实首句（session.list 实证五个不同标题）；E4：驳回→diff 重编辑由既有单测/e2e 覆盖，本轮真实链未走驳回分支 |
| F 回归底线 | **PASS** | F1：mobile-assistant e2e 5 例（四相位重放）+ cardState 单测；F2：mobile-shell 4 例 + mobile-preview-iframe 2 例全绿 |

## 4. 缺陷清单

### 已修复（本轮 persona 小修，[agent.cordis.yml](../../../examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml)，修后重启复验通过）

- **P1（Critical→修复）假回执**：V2 轮 form_confirm 后模型未调 `nb_create` 直接输出 `submit_receipt rowId=7`（PG 无行 7，当轮）。加"回执铁律"后最终链真实调用 `nb_create`（创建第 8 行）且回执 №=8 互证。**残余风险**：persona 约束非硬保证，前端无法验证 rowId 真实性；建议 harness 侧在 submit_receipt 前校验本会话存在成功的 nb_create 结果。
- **P2（Critical→修复）围栏当工具调用**：两轮 B 链把 `ask_field` 当工具调用（arguments 畸形 field=""），随后退化纯文本追问，违反"询问纪律"。加"围栏输出纪律（绝不作为工具调用）"后未再复现。
- **P3（Important→修复）system 字段 value=null 整卡拒绝**：模型给 `supplier_code/rating` 填 null，[protocol.ts:247](../../../packages/client/ui-mobile/src/client/protocol.ts) `value===null && tier!=='required'` 拒整份草稿 → 降级 JSON 裸奔（99-B3 现场）。persona 补"null 仅限 required；编号类草稿期填 \"\""。
- **P4（Important→修复）widget 自创枚举值**：模型输出 `widget:"id"`（合法枚举 text/number/date/select/relation 外），整卡拒绝（99-B5 现场，用 lib parser 逐字段复现 REJECT）。persona 补 widget 枚举钉死。
- **P5（Important→修复）rowId 裸数字**：`rowId:7`（数字）被 [protocol.ts:317](../../../packages/client/ui-mobile/src/client/protocol.ts) `requiredText` 拒 → 回执卡降级（B6 链落库真实但 UI 无回执）。persona 补"rowId 必须带引号字符串"。最终链 rowId="8" 渲染成功。

### 未修复（按级）

- **V1（Critical）协议校验失败 → 整份拒绝 → 原文 JSON 直出用户气泡**：fold 的降级路径（[fold.ts:113](../../../packages/client/ui-mobile/src/client/fold.ts)）把校验失败的围栏原文留在叙述里（99-B4-live：完整 `{"v":3,"type":"form_draft",...}` 裸奔）。P3/P4/P5 三类触发全部命中该路径——单一字段类型/枚举瑕疵的代价是整卡消失+协议垃圾进视野。建议：parse 层对无损变体 coerce（数字 rowId→字符串、未知 widget→text、system null→""），或降级时以"草稿生成失败，请重试"摘要替代原文直出。属生产代码改动，超出本轮授权。
- **I1（Important）无当前日期注入，日期推导失真**：模型以为"当前是 1 月"（C 场景 reasoning 原文）并落库 `order_date=2026-05-14`（依据却标"登记日=今天"，今天=2026-09-21）。system-prompt 无日期变量、runtime-context 无日期。建议注册 `{{date}}` prompt 变量或在 runtime-context 快照注入当日日期； persona 契约"日期=今天"在此之前不可靠。
- **I2（Important）模型工具间叙述裸用表名**：C 场景叙述"我看到有 hub_po_purchase_orders 采购单 collection"（C2 泄漏唯一来源；工具行本身已摘要为"查询业务记录"）。persona 正文纪律已有禁令，模型不稳定遵守；叙述文本前端不可区分，只能靠提示词或工具结果脱敏。
- **I3（Observation）模型行为方差**：同一 persona 下四轮 B 链四种形态（标准围栏 / 工具幻觉 / 纯文本 / 围栏半截自停——turn/end 均 completed，非 maxTokens（32768）截断）。围栏纪律修复后两轮全完整，但样本量小，留观察；长围栏建议模型侧少写字段（persona 已允许省略可选字段）。
- **O1（Observation）回执渲染时延**：确认写入→回执卡出现间隔轮询制偏长，两轮脚本 300–420s 窗口在边缘错过（业务后端已 completed）；流式/更密轮询是既有已知限制（v3 未改）。
- **O2（Observation）指定原话的分叉走向**：任务原话"刚和鲜丰谈好一批冷链箱"因鲜丰不在供应商表，模型按契约走"新建供应商 vs 名字记错"的 ask_choice（D1/D2 合规行为）；采购单全链需真实存在供应商（宏发食品）。属环境数据状态非缺陷。

## 5. 门禁复核（实际执行的命令与结果）

| 门禁 | 命令 | 结果 |
|------|------|------|
| ui-mobile 单测 | `npx vitest run packages/client/ui-mobile` | 17 files / 323 tests 全绿 |
| ui-mobile coverage | `npx vitest run packages/client/ui-mobile --coverage` | `ui-mobile/src`：Stmts/Branch/Funcs/Lines = 100/100/100/100 |
| e2e replay（含全量 build） | `pnpm run test:web -- mobile-assistant mobile-shell mobile-preview-iframe` | 3 files / 11 tests 全绿（含 golden aria 稳定） |
| typecheck 触面 | `npx tsc -b tsconfig.client.json` | exit 0 |
| lint 触面 | `npx tsx scripts/run-oxlint.ts packages/client/ui-mobile examples/kb-agent/agent-presets` | 0 warnings / 0 errors（54 files） |
| 文档门禁 | `pnpm run doc-sync` | 29 passed / 0 failed |
| PC 冒烟 | 12-pc-iframe 流程 + 全程 console/pageerror 监听 | 首屏可开、iframe 交互登录成功、pageErrors=[] |

## 6. 遗留

1. V1 协议宽容层（coerce/降级摘要）——建议下一个 PR，附 P3/P4/P5 三个真实触发样本（`/tmp/b5-fence.json` 已失效可从 99-B5 会话日志重取）。
2. I1 日期注入——建议 system-prompt 注册 `{{date}}`；落地前 `order_date` 推导值不可信（PG 行 15 的 2026-05-14 保留为缺陷证据，可按需清理）。
3. P1 残余：submit_receipt 与 nb_create 的 harness 侧一致性校验。
4. E4（驳回→diff 重编辑）真实链路未触发，仅有单测/e2e 覆盖。
5. 验证数据行：`hub_po_purchase_orders.id=15`、`hub_po_suppliers.id=7/8` 保留作互证证据。
