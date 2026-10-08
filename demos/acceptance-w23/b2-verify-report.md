# W23-B2 清偿批次验证记录

- 日期：2026-10-08（深夜）～10-09（凌晨）
- 网关：http://127.0.0.1:3080/mobile（`build:lib:client` + apps/web vite build 后重启，日志 /tmp/w23-gateway.log）
- 账号：buyer/Buyer#2026 + admin/Admin#2026
- 证据：本目录 `b2-*`（7 张截图 + 4 个探针/结果 JSON + 5 个可复跑脚本）

> **W23-R3 更正（2026-10-09）**：本报告与 B2 commit message 声称「b2 活体证据 17 文件」，实际本目录 `b2-*` 文件为 19 个（7 截图 + 4 探针 JSON/脚本组 b2-live/b2-live2 + 3 个 b2-title 文件 + 4 个 b2-zero-metrics 文件 + 1 报告）；且 `b2-08-buyer-hero-line.png` 与 `b2-01-home-hero-grid.png` 为同一帧（W23-R4 更正：原文标 sha256 的 8c44276f… 实为 SHA-1 摘要，实测 sha256 均 ea42ec63…，两脚本先后截同一 home 视口所致）。独立重拍帧见 `r3/r3-b2-08-retake-buyer-hero-line.png`（W23-R4 更正：原文记 sha256 3340b0db… 无对应算法，实测 sha256 80299dc5…，hero 行「10月9日 周五 · 3 项预警待看」）。P1-9 的断言依据（hero 行文案）在两帧中一致，结论不受影响。

## 逐条处置表

| # | 项 | 处置 | 证据 |
|---|---|---|---|
| P1-5 | 卡面术语纪律 | **已修（persona）**：卡面人话纪律扩展到 business-advisor 与 mobile-form-assistant（enterprise-data-assistant B1 已有），覆盖 title/subtitle/metrics label/rows hint/table/actions label，点名禁表名、snake_case、RFC 4180/UTF-8 BOM；渲染层兜底**评估后不加**（开放集不可枚举，正则误伤 OTIF/GB 2760 等合法 token，且只能拒卡不能改写——与 B1 view-route 封闭集校验不同类）；活体 3 卡面术语泄漏 0 | yml diff + b2-zero-metrics.json `terminologyLeaks: []`×3 |
| P1-7 | 折叠条文案 + 原文可达 | **已修**：summary「这条消息未能按卡片正常显示，点开可查看原文」+ 展开区「复制原文」按钮（复用 copyCode 通道）；fold.ts 两处说明文案去机器词（校验/载荷/系统退回） | b2-05-degraded-notice-copy.png（copyEntry=1）+ 单测 fold/views |
| P1-8 | 预警页文案 | **已修**：空态「效期、资质、账期、质量四类预警会出现在这里」；脚注「『认领』后由你负责跟进，处理完点『关闭』归档；他人名下的预警不可代操作」 | b2-02/b2-live-probe.json footNotes |
| P1-9 | hero 口径 | **已修**：hero 行改引台账卡同词——「今天：待处理 N 项 · 待确认 M 项 · 进行中 K 项」（0 值不列），预警优先分支保留；「N 件事等你」措辞删除 | b2-08-buyer-hero-line.png（「· 3 项预警待看」分支）+ 单测（待处理 2 项 + 旧文案 null 断言） |
| P1-10 | 工具行折叠 | **已修**：≥2 条连续已结算工具行折叠为「已完成 N 步查询」可展开摘要；夹在工具间的过程叙述并入展开区；running 行断开聚簇。审计 c2 会话实测「已完成 8 步查询」展开 8 行 | b2-06-tool-cluster.png + tool-cluster 单测 5 用例 |
| P1-11 | 远期分区 + 跨天数聚合 | **已修**：三带分区（需尽快处理/近期关注/远期折叠「N 条远期提醒」）+ 分组键扩展（同规则 + 非空实体编码）+ 组头天数区间「72~73 天后到期」；buyer 活体数据无 >30 天行（在召回通知里），远期折叠由单测覆盖，admin 活体验证分区头（需尽快处理/近期关注两带头俱在） | b2-02-alerts-bands.png / b2-07-admin-alerts-far.png + alerts 单测新用例 |
| P1-12 | hero 视觉 | **已修（审计三点取二）**：hero 标题 display→title（实测 30px→20px）；快捷入口统一四列栅格（实测 78×4、极差 0）；AI 同事横滚保持现状（rosterScroller 本就 overflow-x + 渐隐 mask，审计自注 fullPage 判读可能失真，VLM 未识别出 mask 即滚动暗示） | b2-01-home-hero-grid.png + probe |
| P2-1 | actions 3/4 枚 | **定位=渲染上限**（数据未丢）：`orderedActionsOf` others slice(0,2)+create-task / slice(0,3)；**已修为渲染满 4 枚**（create-task 时 3+1、无则 4），协议/服务端/persona 维持 4，三方一致；flex 行本就 wrap | report-card 单测 2 用例重写 |
| P2-4 | send 机器话 | **已修（persona）**：send text 改「用户自己会说的话」纪律（禁机器指令、禁字段罗列/英文参数）；活体 5 条 send 全人话（「拉 6 月到 9 月每月毛利率走势」「打开味之源的合规档案」…） | b2-zero-metrics.json sendTexts |
| P2-6 | 语言纯度 | **已修（persona）**：四个 preset 统一「中文（专有名词除外）」；活体 z1/z2 英文残留 0，z4 仅 buyer 用户名（专有名词级，如实记录为可接受残留） | b2-zero-metrics.json englishWords |
| P2-8 | 模式预设混入 | **已修**：listAiEmployees 剔除 system-trust 预设（default 除外保留可达）；活体 roster 模式行 0、业务同事正常（智能填表助手/经营参谋/30 场景） | b2-04-agents-roster-cut.png（modeRowCount=0）+ services 单测 |

## 追查两项结论

### 1. 标题 LLM 成功率 —— 根因已定位并修复

- **根因**：MiniMax-M3 始终内联思考（`<think>` ~60–150 reasoning token 先于标题正文）；base bundle `session-title-first-prompt-llm` 的 `maxOutputTokens: 64` 让每次调用在思考中途 `finish_reason: "length"`，`session-title-llm` 的 max-tokens 分支抛错 → 服务捕获回落 fallback。**不是超时**（失败在 6–8s，60s deadline 未到）、**不是 MiniMax 并发拒绝**（直连 API 双流并发 200 OK 实测）。
- **取证链**：① 网关→MiniMax TCP 观察（主回合 running 时 2 条 ESTABLISHED——title 请求确实发出，~6s 关闭后无 title 落地）；② wire 级复刻（同 endpoint 同形状）：`max_tokens=64 → finish:["length"]、63/64 全 reasoning、正文空`，`max_tokens=256/512 → finish:["stop"] + 标题正文`；③ 存量 log 唯一成功案例（session-b1989d49，26s 落「糯米粉库存及风险查询」）恰是思考极短的偶然通过。
- **修复**：`packages/bundle/base/cordis.patch.yml` `maxOutputTokens: 64 → 512`（覆盖思考峰值 148 + 标题行）。
- **活体验证**：重启后 2/2 新会话 ~10s 落 provider 标题（「查询最近30天采购订单」「糯米粉库存及风险查询」）；修复前同探针 0/5。
- **如实记录（不修）**：harness 全仓无任何 cordis logger exporter（`ctx.logger.warn` 只进 1000 条内存环，stdout 永远看不到），失败静默是本次追查只能靠外部探针的原因——独立可观测性缺口，超出本批范围，已记入 Agent Note。

### 2. 0 值指标遵从 —— ×3 实测通过（本轮）

| 场景 | 形态 | 0 值指标 | 结论 |
|---|---|---|---|
| z1 待审批（buyer token） | 无卡，结论化叙述「你名下目前没有待审批的单据，共 0 条」 | 0 | 遵从（0 值结论化，未堆指标） |
| z2 月报（business-advisor） | 1 张 report 卡（title「9月经营月报：毛利率转负 -2.2%，应付余额偏高」） | 0 | 遵从（B1 残留未复现） |
| z4 待办（enterprise-data-assistant） | 2 张 report 卡 | 0 | 遵从（B1 的「0 条审批流待办」残留未复现） |

结论：persona 0 值纪律在 B2 三次实测中 3/3 遵从。单次抽样有随机性（B1 时 2/5 场景有残留），模型行为面遵从率明显改善但纪律仍以 prompt 约束承载——如实记录为「实测通过、非机制保证」。

## 回归门禁

- `npx vitest run packages/client/ui-mobile`：**55 文件 / 873 用例全绿**（新增 tool-cluster 5、alerts 分区 1、roster trust 1、orderedActionsOf 重写 2、hero 词汇 1；同步更新 degraded/工具行断言）
- `npx vitest run packages/interaction/tool-present-card packages/session/session-title`：**12 文件 / 200 用例全绿**
- `pnpm run test:web apps/web/tests/mobile-assistant-toolcard.e2e.ts`：**6/6**
- `pnpm run typecheck`：通过（exit 0）
- staged lint：commit 时 lefthook 执行（见 commit）
- persona 四份 agent.cordis.yml 投影已同步 `examples/kb-agent/.dsh/.agent-presets/`；`build:lib:client` + `build:web` 后网关按原命令行重启（/tmp/w23-gateway.log）
