# Agent Note：移动端 v2 —— 微信式 AI 员工入口与填表提交闭环

Status: implemented

[English](2026-09-20-mobile-v2-ai-colleagues.md) | 中文

## 问题

v1 的 `/mobile`（M3）交付的是"DSH 手机壳"：四个 Tab 照搬 PC 工作台，AI 填表只辅助、不提交。用户否定了这个方向：手机上要的是 **NocoBase 业务系统的 AI 员工入口**——微信式聊天（对端全是 AI 同事），加上 PC 端刻意没有的"填表+提交"闭环（人可编辑的草稿卡 → 人来判断的审核卡 → 写入业务表 → 回执），并且 UI 要有真实的设计感（明确授权引入开源组件库）。

## 决策

只重写 UI 树；v1 的管线原样保留（rpc.ts、sessionsService.ts、fold.ts、mobile.html 托管链、预览 iframe、预设契约）。已评审计划的八项裁决（[plans/2026-09-20-mobile-v2-ai-colleagues/PLAN.md](../../../../plans/2026-09-20-mobile-v2-ai-colleagues/PLAN.md)）按此落地。

**两 Tab 信息架构（消息/我的）。** v1 的工作台/数据 Tab 删除，问数职责并入只读的「经营参谋」同事。v1 的 hash 头（messages/workbench/data/profile/kg）在 router 里重定向到新 Tab——旧深链（含 PC 预览 iframe）继续可用。已登录态下的 `#/login` 落到 chats（v2 验收首轮发现的坑：壳渲染了空 body）。

**填表提交闭环走会话，不走 wire。** 确认与驳回是普通用户消息（`确认推送：…最终字段 JSON…` / `驳回：…`）；写经 agent 的 `nb_create` 确认契约执行，durable log 保持"人到底确认了什么"的唯一审计。`nocobase.create` 按设计仍不在 wire 上。卡片相位由**重放派生**（cardState.ts）：confirm-push 按集合认领最早的未 submitted 卡，回执 settle 该集合最新的 pending 卡，驳回作废最近的 draft 卡——重载与 PC 预览看到一致的卡片状态。「提交审核」（本地 pending 锁）到确认消息落日志之间是本地 overlay 加 localStorage 编辑值（键含 AI 草稿的内容哈希，草稿一变即弃）。

**antd-mobile v5 控件 + 自绘聊天面。** 库：TabBar/SafeArea/Input/TextArea/Picker/DatePicker/Switch/Stepper/Button/Dialog/Steps。Picker/DatePicker/Relation 字段通过函数式 children 的 `actions.open` 绑定在渲染出的 span 上打开弹层（antd-mobile v5 选择器弹层的既定契约）。自绘（CSS Modules）：六要素会话行、气泡（AI 左/用户右，16px 圆角+4px 小角）、消息流、输入条、四态卡外壳（草稿/确认/驳回/回执）。主题走 `.dshm-root`（`--adm-*` 与 `--dshm-*` 双变量轨；暗色是 `data-theme='dark'` 第二轨，我的页开关）。v1 的 tokens.css 从未把 `.dshm-root` 挂到 DOM——变量整包失效——v2 由 App 根容器携带该类。两个库事实：antd-mobile v5 没有 Search 组件（自绘）；TabBar 渲染 div 而非 `role=tab`（e2e 按文本断言）。

**字段控件按 schema 映射。** `nocobase.listMeta` 的 field.type（实测 string/integer/float/bigInt/dateOnly/boolean/belongsTo/text）映射 Input/Stepper/DatePicker/Switch/Picker；select 词表（status 列）为本地实测维护（wire 不投影 options）；`belongsTo users` 只读文本，业务关联做目标表 Picker。

**真实模型验收发现的三个契约修正**（v1 从未走到这些路径）：

1. `nb_create` 关联字段要目标行的**数字 id**，不是名称——填名称得到 HTTP 500。同事 persona 现在在出草稿前把名称解析成 id；关联 Picker 的 value 是 id、label 是名称，确认卡 diff 把 id 反显为行名称。
2. 模型会在围栏 JSON 草稿里插 `//` 注释（"supplier=6 对应宏发食品"），整块 `JSON.parse` 失败。解析器剥离 `//` 行（模型输出容错），persona 同时禁止块内注释。
3. 见上文 `#/login`。

**依赖（maintained-dependencies 约定）。** antd-mobile@5.43（MIT）与 lucide-react@1.47（ISC）作为 `dsh-client-ui-mobile` 的 runtime `dependencies` 引入——ui-primitives 模式（shiki/katex）：staticLinked bundle 保持 bare specifier external，由 apps/web 的 Vite 按需打包。实测：mobile chunk 220.6 kB（gzip 76.8 kB）+ css 47.7 kB（gzip 9.1 kB）；包内 lib/index.js 63.7 → 89.8 kB。选型报告择 antd-mobile 弃 tdesign-mobile-react（次选）与 `@ant-design/x`（peer 强制完整 antd，+445 KB gzip）。

**三个新同事**（examples/kb-agent/agent-presets/）：`purchase-assistant`（hub_po 域）、`quality-assistant`（srm_audit_checklists/srm_capas）、`business-advisor`（只读：kb + lakehouse + nocobase reads，`writes: false`）。persona 沿用 mobile-form-assistant 六步契约（围栏草稿 → 停等 → 确认推送 → nb_create → 回执 `业务表 X 行 id=N 已创建`）；花名册自动发现（`agentPreset.list` 冒烟已验，无一 broken）。本地视觉表（colleagues.ts）承载各同事的渐变、缩写、职责、可填表单与开场白。

## 后果

- 移动端拥有了 PC 没有的提交通道：同一条会话日志承载补槽回答、人确认的最终字段与 agent 回执——每张已提交行一条可回放审计链，两个表面一致。驳回分支可证明零写库（验收断言零新增行）。
- v1 的 WorkbenchView/DataView/TaskCardView 删除；KG 证据卡留在聊天流，去掉了指向已删数据 Tab 的跳转按钮。
- 未读点与「待审核」会话筛选是本地派生（localStorage 已读水位/pending 标记），因为 wire 既无未读计数也无审核态——重载保留日志重放的卡片相位但重置本地标记，README 已如实声明。
- 枚举词表与关联 id 约定成为 persona 面向的契约：未来起草业务行的同事必须把关联名称解析成 id、枚举限定在实测词表内，否则草稿退化为纯文本字段。

## 备选方案

- **保留四 Tab 壳、只加提交按钮。** 否决：四 Tab 正是被否定的"PC 镜像"立场；两 Tab 聊天 IA 才是产品。
- **为提交新增 `nocobase.create` wire 方法。** 否决（计划 D4）：reads-first 是有意设计；agent 的 `nb_create` 确认流已把人确认的精确字段审计进 durable log，wire 写会绕过这份审计。
- **WebSocket 推送（events.mux）替代轮询。** 后置（计划 D5）：mux 流没有 `since` 续传，UI 重写与通道替换两个风险叠加不划算；轮询已被 M3 验证。
- **tdesign-mobile-react 作控件库。** 选型报告次选（React 无关内核、CSS 变量主题）；antd-mobile 以组件覆盖（18/18）、周下载与纯 `--adm-*` 变量面胜出。
- **卡片相位存服务端表。** 否决（计划 D6）：重放会话日志免费派生相位并保持 PC 预览一致；只有未提交编辑需要 localStorage。

## 验收证据

390×844 真实浏览器存证（18 张截图+全链 GIF）在 `examples/kb-agent/demos/mobile-v2/`；真实模型采购轮次落库 `hub_po_purchase_orders` id=8（PO-V2-714542 / draft / 3600.5 / 2026-09-20 / supplier_id=6）经 psql 实查；驳回分支断言 `hub_po_suppliers` 零新增；ui-mobile 单测 164/164 且 src 全树 per-file 100%（16 条带理由的 `v8 ignore` 标记，锁定基线 875 净增 8、total 883，`pnpm tsx scripts/v8-ignore-budget.ts` 可复现）；mobile-shell / mobile-assistant / mobile-preview-iframe e2e golden 重录。

终验（2026-09-20 收口轮）：

- Verified by: CI=1 pnpm vitest run --coverage --coverage.include='packages/client/ui-mobile/src/**' packages/client/ui-mobile → "Tests 164 passed (164)"、per-file 阈值零报错（2026-09-20T18:49+08:00）
- Verified by: 390×844 真实浏览器实走采购助理草稿卡——Picker（status draft→received）、DatePicker（2026-09-21→2026-09-23）、relation Picker（supplier 6 宏发食品→4 速达冷链设备）均经 actions.open 弹出，确定后回填草稿卡，编辑经 localStorage 重载存活（存证 vfy-00…vfy-06 于 examples/kb-agent/demos/mobile-v2/，2026-09-20T18:37+08:00）
- Verified by: pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/mobile-shell.e2e.ts apps/web/tests/mobile-assistant.e2e.ts apps/web/tests/mobile-preview-iframe.e2e.ts → "Test Files 3 passed (3); Tests 9 passed (9)"，无需重录 golden（2026-09-20T18:56+08:00）
- Verified by: pnpm run lint → "Found 0 warnings and 0 errors"；pnpm run typecheck → exit 0（2026-09-20T18:52–18:54+08:00）
- Verified by: pnpm run doc-sync → "run-gates: 29 passed, 0 failed, 0 skipped in 234.01s"（含 v8 ignore budget gate，2026-09-20T19:08+08:00）
- Verified by: 清障轮（关联显示名）——CI=1 pnpm vitest run --coverage --coverage.include='packages/client/ui-mobile/src/**' packages/client/ui-mobile → "Tests 166 passed (166)"、per-file 阈值零报错；390×844 真实浏览器采购轮——草稿卡 supplier 字段显示供应商名称（AI 预填 id 4 → 速达冷链设备）、关联弹层选择回填名称（宏发食品）、确认卡 diff 双名称而确认推送保持 `"supplier": "6"`、回执实查行 id=10 且 supplier_id=6（存证 vfy2-01/vfy2-02 于 examples/kb-agent/demos/mobile-v2/，2026-09-20T20:37+08:00）
- Verified by: 收口轮（R8 标题映射）——回执/确认卡标题括号内的供应商名改为按最终提交值经 `relationLabelColumn` 同款 `nocobase.list` 读解析（草稿无 relation 字段、值非数字或读未解析时沿 draft.title 原文），PO 号等其余标题成分与 `"supplier": "<id>"` 提交契约不变；CI=1 pnpm vitest run --coverage --coverage.include='packages/client/ui-mobile/src/**' packages/client/ui-mobile → "Tests 169 passed (169)"（166 + 新增 3 例：改选后标题随提交值显示新名、无 relation 字段标题原样、finals 缺键回退草稿预填）、per-file 阈值零报错；pnpm run typecheck、pnpm run lint、v8-ignore-budget（净增 1 条 ChatView 不可达回退臂）均绿；390×844 真实浏览器采购轮——弹层改选 supplier（速达冷链设备→宏发食品）确认提交后，回执卡标题「PO-VFY3-001 采购单头（宏发食品） · 已落库」与实查行 id=11/supplier_id=6 一致，确认推送保持 `"supplier": "6"`，同一状态并经全新 headless 浏览器从 durable log 重放复现（存证 vfy3-01-receipt-title-mapped.png 于 examples/kb-agent/demos/mobile-v2/，2026-09-20T21:26+08:00）
- Verified by: 清尾轮（relation-label 失败路径）——`useRelationLabel` 抽到 forms/relation-label.ts 成为唯一共享读（标题槽、确认 diff、编辑态未命中 id 的回落）：失败读 300ms 后重试一次、二次失败降级裸 id（绝不把 AI 预填名当作已验证展示），解析 miss（空页/空 label 单元）清 label state，`titleWithRelationName` 一切未解析态都显示 `#id` 占位而非草稿原文；tsconfig.base.json paths 补 `@deepseek-ai/dsh-client-ui-mobile-preview` 映射（`pnpm run verify-cordis-config` 绿），单 slot 标题启发式债记为 plans/2026-09-17-kg-mobile-ux/04-debt-ledger.md 的 D12；pnpm vitest run packages/client/ui-mobile → "Tests 176 passed (176)"（169 + 新增 7 例：双拒绝占位、重试自愈、降级稳定、重试延迟期/重试结算期两卸载臂、编辑态未命中 id 解析、双读失败裸 id），DSH_COVERAGE_PARTITIONS=4 pnpm run test:coverage:partitioned → 阈值零报错且零 uncovered（其四个分区 flake——typert 超时与 ui-trajectory/ui-workspace/subagent 并发负载——逐个单独复跑均绿），pnpm run typecheck / pnpm run lint / pnpm run doc-sync（29 gates）绿；web 进程重启后 390×844 真实浏览器走查——回执卡标题正确、双端 200、草稿卡 supplier 字段显示所选供应商名（存证 final-clearout-mobile-regression.png 于 examples/kb-agent/demos/mobile-v2/，2026-09-21T09:45+08:00）
