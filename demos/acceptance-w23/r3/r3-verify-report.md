# W23-R3 清偿批次验证记录（B2 验证 FAIL85 的 3 Important + 4 Minor）

- 日期：2026-10-09（凌晨）
- 网关：http://127.0.0.1:3080/mobile.html（R3 版：`build:lib:client` + apps/web vite build 后按原命令行重启，PID 见 /tmp/w23-gateway.log）
- 账号：buyer/Buyer#2026
- 证据：本目录 `r3-*`（4 截图 + 2 探针 JSON + 2 可复跑脚本）

## F1 被拒卡「复制原文」＝原始 payload（活体 PASS）

- 会话：z4 `session-f2df1566`（「查看我的待办」，2 张被拒 present_card 折叠条）
- 探针：`r3-live.mjs` → `r3-live-probe.json`；截图 `r3-f1-rejected-copy-payload.png`
- 事实：展开折叠条后 pre 内容 = `{"payload":{"v":3,"type":"report","id":"buyer-todos-001",…}`（452 字符，原始 wire 载荷，非 27 字硬编码说明）；点击「复制原文」后剪贴板双捕获臂（`clipboard.writeText` spy + copy 事件 selection）写入值 `equalsPre: true` ×2 —— 剪贴板内容与 pre 逐字节相等，即原始 payload。
- 单测：fold spec 3 处断言改写 + 新增 2 用例（verbatim 用例 `rawArguments='面粉 100 单价 10'` → `item.text` 等值；真空 wire（缺 arguments / 空白串）→ 人话兜底两条各自命中）。

## F2 subtitle 层清洗兜底（活体 ×3 场景零泄漏 PASS）

- 修复面：共享 `client/sanitize.ts`（`sanitizeBody`/`sanitizeSubtitle`，封闭协议 token 黑名单 wfl_*/ask_*/suggestions + subtitle 层工具名族）+ FlowItem report 分支接线 + ReportCard 空串等同省略 + persona 三 preset 补 `wfl_approval_todos` 点名示例（源与投影双同步）。
- 场景 ①（存量泄漏重放）：z2 `session-453ee9d6` 的 5 张卡——含 B2 实测泄漏的 turn2/turn3 两张——subtitle 全部渲染为「实时查询 · 待办表 已清空…」（`wfl_approval_todos` 被剥），`subtitleTokenLeaks: []`（`r3-live-probe.json` + `r3-f2-z2-leak-cards-clean.png`）。
- 场景 ②（z4 重放）：subtitle 面无存活卡（其卡全被拒为折叠条，由 F1 主证覆盖）。
- 场景 ③（新 turn 复跑 ×2）：在 z2 会话真实发送「再查一遍我名下的待审批明细，出一张卡」两轮，新产出第 6/7 张卡（「实时查询 · 待办表 已清空 · 质检/回款 pending 项责任人均非 buyer」「实时查询 · 第四次刷新结果一致 · 待办表 已清空」），`subtitleTokenLeaks: []`（`r3-f2-replay-probe.json` + `r3-f2-fresh-replay-clean.png`）。
- 如实记录（W23-R5 更正口径）：z2 存量正文叙述含 4 处小写协议 token 泄漏（B2 时代 durable log 产物，正文渲染层不在本批修复面——B2 评估维持开放集不枚举决策）；R3 双捕获两轮新 turn 正文新增泄漏 1 处（`r3-f2-replay-probe.json` `newBodyLeakTail: 1`——原文「零新增泄漏」与该探针自相矛盾，此处按实测改口），新产物仍由 persona 补丁约束。
- DOM 级测试：`sanitize.client.spec.tsx` 10 用例（含「渲染后 DOM 全文不含 wfl_approval_todos」「剥空 subtitle 按省略渲染」「OTIF/GB 2760 原样通过」）。

## F3 protocol 行契约（单测 + 接线证明）

- `fold.ts` 导出 `isProtocolToolRow`（`ChatToolRow & { protocol: true }` 谓词）；FlowItem 中性行分支与 ToolClusterRow `isSettledTool` 同源消费（两文件 import 同一导出）。
- 单测：`tool-cluster.client.spec.tsx` 新增「never clusters a protocol-marked row, even a failed one」——两条 error 态 protocol 行穿透为独立中性行，仅普通工具成簇。

## Minor 处置

- **聚簇 key 稳定化**：cluster key = 成员 `seq::name` 排序派生；单测「重排后同 key」+「3 calls→重排→展开态存活（aria-expanded=true 保持）」；活体：c2 会话「已完成 8 步查询」展开 8 行（`r3-cluster-expanded.png`）。
- **AlertsView groupKey**：`${band}::${ruleType}::${entityCode}`（`::` 分隔，取组首行实体编码）。W23-R4 更正：原文「组内共享实体派生」「分组规则本就保证 head 无关」「11 用例绿」三处不实——分组规则允许按共享 title 折叠（成员实体编码互不相同或为空，key 取首行编码，重排换首行即换 key、展开态不保证存活；R4 已去 key 的 title 回退分支并收窄代码注释），活体 title/编码不含 `::`，alerts 套件实测 7 用例绿。
- **CSS interleave 注释**：`chat.module.css` 注释改为描述实际渲染顺序（全部 settled 行在前、楔入叙述在后，非交错）——CSS-only 小改，未动实现。
- **b2-08 同帧 + 计数口径**：独立重拍帧 `r3-b2-08-retake-buyer-hero-line.png`（W23-R5 实测复核：原文记 sha256 3340b0db… 实为该重拍帧的 SHA-1 摘要（3340b0dbc090…）；R4 所记「与 sha1/sha256/md5/crc32 实测均不符」及「实测 sha256 80299dc5…」均不可复现——实测重拍帧 sha256 f5584a1b52be…，b2-01/b2-08 同帧 sha256 ea42ec63…（SHA-1 8c44276f…，即原文误标为 sha256 的摘要）；hero 行「10月9日 周五 · 3 项预警待看」与原断言一致）；`b2-verify-report.md` 头部已加 W23-R3 更正段（同帧事实 + 17≠19 计数更正），结论不受影响。

## 回归门禁

- `npx vitest run packages/client/ui-mobile`：56 文件 / 888 用例全绿（B2 为 55/873；新增 sanitize spec 1 文件 10 用例、fold 2、tool-cluster 3）
- `npx vitest run packages/interaction/tool-present-card packages/session/session-title`：12 文件 / 200 用例全绿
- `pnpm run test:web apps/web/tests/mobile-assistant-toolcard.e2e.ts`：6/6
- `pnpm run typecheck`：exit 0
- staged lint：commit 时 lefthook 执行
- persona 四份 agent.cordis.yml 源已同步 `examples/kb-agent/.dsh/.agent-presets/`（三份含 wfl 点名的 preset 双侧一致）；`build:lib:client` + apps/web build 后网关按原命令行重启

## Agent Note

`.agents/notes/implemented/bug-fix/2026-10-08-w23-r3-copy-source-subtitle-denylist-protocol-row.md`（+zh + i18n.yaml pairing 已记录）
