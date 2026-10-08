# Agent Note: W23-B2 —— 审计清单剩余项清偿（P1×7 + P2×4 + 两项追查）

Status: implemented

[English](2026-10-08-w23-b2-remaining-clearance.md) | 中文

## 问题

- W23-B0 审计（`demos/acceptance-w23/audit.md`）在 B1 之后遗留十二条：P1-5 卡面术语泄漏（subtitle/rows 出现 snake_case 表名列名、RFC 4180、UTF-8 BOM）、P1-7 被拒折叠条机器话文案且 CSV 锁在折叠体内、P1-8 预警页引擎词汇文案、P1-9 首页「N 件事」合计数与台账卡「0 待处理」口径冲突、P1-10 单轮 9 条 nb_* 工具行堆叠、P1-11 无紧急度分区且同证照每个扫描日一行、P1-12 hero 展示字阶、P2-1 协议收 4 枚按钮第 4 枚不渲染、P2-4 send 文案机器味、P2-6 中英混杂、P2-8 桌面模式预设（标准/PTC/极简/创造模式）混入业务同事列表。
- 两项追查：新会话标题在 `session/title-llm-request` 事件已触发的情况下 ~100% 回落首轮截断 fallback；persona 0 值指标纪律需要三次实测记录。

## 决策

- **P1-5/P2-4/P2-6（persona）**：卡面人话纪律（title/subtitle/metrics label/rows label+hint/table 列名与单元格/actions label 禁表名、snake_case 字段、RFC 4180/UTF-8 BOM）、send text「用户自己会说的话」纪律（禁机器指令、禁字段罗列）、中文纯度纪律（专有名词除外）扩展到全部四个出卡 preset（business-advisor、mobile-form-assistant 补卡面行；enterprise-data-assistant B1 已有卡面行、补语言行；food-compliance-officer 补语言行）。不加渲染层强制：B1 的 view-route 校验是封闭可枚举集，术语是开放集——正则守卫会误伤合法英文（OTIF、GB 2760、P50），且只能整卡拒绝不能改写。
- **P1-7**：degraded 折叠条 summary 改为「这条消息未能按卡片正常显示，点开可查看原文」并加「复制原文」按钮（复用 `RichContent` 的 `copyCode` 通道，导出共享），被拒报告的 CSV 距剪贴板一次点击；`fold.ts` 两处说明文案去掉 校验/载荷/系统退回，换中性措辞。
- **P1-8**：预警页空态与脚注文案改为「认领后由你负责跟进」「四类预警」，去掉 路由责任人白名单/越态/四路规则。
- **P1-9**：hero 行引用台账卡自己的词汇——「今天：待处理 N 项 · 待确认 M 项 · 进行中 K 项」，0 值不列——不再出现第三个合计口径。
- **P1-10**：`clusterFlowUnits` + `ToolClusterRow`（`messages/chat/ToolClusterRow.tsx`）把 ≥2 条连续已结算工具行折叠为一条「已完成 N 步查询」摘要，夹在工具行之间的 assistant 过程叙述（换个思路类）进展开区；running 行断开聚簇，进行时反馈保持逐行。纯渲染层——fold 与各投影语义不变。
- **P1-11**：`AlertsView` 按 需尽快处理（critical/≤7 天/已逾期）、近期关注（≤30 天）、>30 天折叠「N 条远期提醒」三带分区；`groupAlerts` 同时合并规则相同且非空实体编码相同的相邻 open 行（同一证照跨扫描日），组头携带天数区间「72~73 天后到期」（`daysRangeOf`，仅全正天数）。
- **P1-12**：hero 标题降一档（display→title），快捷入口改统一四列栅格（CTA 与胶囊共享轨道宽）。
- **P2-1**：`orderedActionsOf` 渲染到协议上限——create-task 之外 3 枚次级、无 create-task 时 4 枚——基于本就换行的 flex 行；协议/服务端/persona 维持 4 枚。
- **P2-8**：`listAiEmployees` 从移动端 roster 剔除 system-trust 预设（桌面 composer 的交互模式），部署 default 是其中之一时保留该行保证可达。
- **标题 LLM 根因（已修）**：MiniMax-M3 始终内联思考（标题正文前 ~60–150 reasoning token）；base bundle 的 `session-title-first-prompt-llm` `maxOutputTokens: 64` 每次都在思考中途 `finish_reason: length`——`session-title-llm` 的 max-tokens 分支抛错、服务捕获后 fallback 顶着。wire 级复现（`finish:["length"]`、63/64 token 全是 reasoning）与 256/512 对照（`finish:["stop"]` 且出标题行）钉死根因；配置升到 512。修复后活体：两个探针会话 ~10s 落 provider 标题（2/2，修复前 0/N）。
- 不修，如实记录：harness 在任何入口（apps/boot/bundles）都没有注册 cordis logger exporter，`ctx.logger.warn` 只进 1000 条内存环——独立的可观测性缺口，本次追查被迫靠外部探针取证。

## 后果

- ui-mobile 873/873（新增：tool-cluster 拆分 5、alerts 分区/远期折叠/天数区间 1、roster trust 剔除 1、orderedActionsOf 重写 2、hero 词汇 1；更新：degraded 与工具行断言），tool-present-card + session-title 200/200，toolcard e2e 6/6，`pnpm run typecheck` 绿，`build:lib:client` + apps/web vite build 重跑，网关在 :3080 重启。
- 活体证据（`demos/acceptance-w23/b2-*`）：hero 20px + 快捷入口宽 78×4（极差 0）；admin 预警分区头 需尽快处理/近期关注、buyer 脚注人话；roster 模式预设 0 行；degraded 折叠条新 summary 带复制入口；审计 c2 会话渲染「已完成 8 步查询」展开 8 行；provider 标题 2/2；0 值三次实测（z1 结论化叙述「你名下目前没有待审批的单据」、z2 月报卡 0 值 0 条、z4 待办卡 0 值 0 条），卡面术语泄漏 0，send 文案全人话，英文残留为 buyer 用户名（专有名词级）。
- buyer 的活体预警集合没有 >30 天行（那些在召回通知里），远期折叠的活体证明是单测加 admin 的分区头；记为证据形态，不是行为缺口。

## 备选方案

- **`tool-present-card` 服务端术语校验**——开放集不可枚举；按 snake_case 正则拒卡会误伤合法 token，用偶发外观泄漏换整卡缺失。
- **在 `fold.ts` 里折叠工具行**——会改动 fold 的纯投影及其全部消费方（chips、预览）；渲染层拆分保持一个 fold、一个渲染决策。
- **远期带内按严重度重排**——wire 本就最新在前；按天数重排会破坏分组邻接。
- **提高 `timeoutMs` 而非 `maxOutputTokens`**——失败调用 6–8s 死于 `finish_reason: length` 而非 60s deadline；只有 token 上限是约束。
