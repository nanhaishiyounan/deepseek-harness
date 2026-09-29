# Agent Note: W5-B0 审批流可视化设计器 MVP —— @xyflow/react 画布 + graph json 编辑态

Status: implemented

[English](2026-09-29-w5b0-approval-designer-mvp.md) | 中文

- 日期：2026-09-29
- 状态：已实现
- 范围：`examples/kb-agent/designer/`（新 SPA）、`examples/kb-agent/scripts/approval-engine.mts`（设计器端面）、`examples/kb-agent/scripts/nocobase-w3-approval-visual.mts`（配置中心嵌入）、`examples/kb-agent/scripts/nocobase-f3-hub-v2.mts`（BP-20）

## 问题

审批流配置中心的审批人映射与扩展配置靠 textarea 手写 JSON，W3-B4 的 SVG 状态图只读。选型调研（research/2026-09-29-approval-flow-visual-designer-selection.md）结论是拖拽画布。同时 verify 全链自 W4-R3 起被 nocobase-f3-hub-v2.mts:461 在 W4 终态上的 fail-loud 短路（BP-20）。

## 决策

**@xyflow/react 12 独立 SPA，唯一持久化是 `wfl_flow_configs.graph`（json）+ `graph_version`；本批引擎零改动。** graph 是编辑态事实源；states/transitions 仍是引擎读取的运行态事实源。发布期编译/派生及其 fail-loud 门禁属于 B1。

- SPA 位于 `examples/kb-agent/designer/`（React18 + antd5 + @xyflow/react 12，esbuild 单 bundle 提交在 `dist/` —— 新 clone 无需构建即可 serve `/designer`）。它**不在** pnpm workspace 内（workspace 通配止于 examples/package.json），platform/nocobase yarn1 子树与仓库构建均不触碰（`git status platform/` 保持干净）。
- 一期五类节点（start/approval/cc/condition/end；parallel/handler 留 B2）。属性面板是纯 antd5 表单 —— 审批人类型 Radio + 成员/角色/部门多选（选项来自 `GET /designer/meta`）、多人方式 Radio（依次/会签/或签）、空策略 Radio、条件行为字段/操作符/值三段式。设计器 DOM 内没有任何 textarea；配置中心的旧 textarea 编辑通道保留到 B1 发布链路就绪后退役。
- approval-engine `--serve` 持有端面：`GET /designer` + `/designer/designer.js|css`（白名单静态，来自 `../designer/dist/`）、`GET /designer/meta`（流程配置 + 用户/角色/部门选项）、`GET /flow-graph?doc_type=` 与 `POST /flow-graph`（结构校验 + graph_version 自增 + config_note 审计行）。token 鉴权复用 W3_TERMINAL_TOKEN 机制；`W5_DESIGNER_ENABLED=false` 摘除路由。
- `wfl_flow_configs` 在 serve 启动时幂等新增 `graph`（json interface）+ `graph_version`（integer）（`ensureGraphColumns` 走 `/api/fields:create`）；旧行 graph 保持 NULL，引擎不读这两列。
- 配置中心页通过平台 **IframeBlockModel**（`flowSurfaces:addBlock` type iframe，mode url，可用 W3_TERMINAL_BASE 重定位）挂载设计器 —— w3b6 终端页先例。

## 坑（已固化）

- **runjs JSBlock 通道会剥离 `ctx.render` HTML 中的 `<iframe>` 标签** —— 设计器嵌入必须走 IframeBlockModel；JSBlock 方案只渲染出外围 div。
- **`/designer` 无尾斜杠返回 HTML，index.html 里的相对 `./designer.js` 会按根目录解析**而 404、#root 为空。bundle 资源一律用绝对路径 `/designer/...`。
- **serve 分发器的路由顺序**：`/designer/meta` 必须在 `/designer/` 静态前缀分支之前匹配，否则被当成文件名吞掉。
- **BP-20 根因**：W4-B5 把供应商改名为维保服务商（spec 标题携带新名；`legacyTitles` 仍解析 v1/回滚时代的旧名）、W4-B4 退役了工作台+采购供应商（行缺失 ⇒ 跳过而非抛错；其它情况照旧 fail-loud）。hub-modules 重放重建 v1 行时升级合法发生 —— w4-heal-b4 的裁决会重新收敛终态。

## 后果

`--selftest` 与 `--check-consistency` 保持绿（引擎读取面未变）；`setup-nocobase.mts verify` 自 W4-R3 以来第一次跑通全链（f3 不再短路）。证据：`examples/kb-agent/demos/acceptance-w5/b0-01..08`（空画布、拖入、属性表单、真实 CDP 拖拽连线、保存 toast、刷新回显、条件行、配置中心 iframe）+ psql 往返对拍（pur_requests v1 / pur_rfqs v2，节点/边计数经 `CAST(graph AS jsonb)` 可再读）。

## R0 勘误与修复（同日，16 维验证 FAIL 79/100）

勘误（真话债）：graph 列类型是 `json` 而非 JSONB —— 标题与 serve 端注释已改正（note 里的 psql `CAST(graph AS jsonb)` 是对 json 列的真实 CAST，不是列型声明）。「DOM 里没有任何 textarea」夸大了替代关系 —— 配置中心 textarea 通道仍是现役编辑路径，直到 B1。notes 中不存在对 `.w5-b0-env-cleanup.mts` 文件的引用（grep 0 命中，无可撤回 —— serve 每请求读盘静态文件，本就不涉及清理机制）。

已交付修复：designer/src 纳入仓库 oxlint 门禁且零基线错误（总错误 109→26，26 为 tool-nocobase 等既有基线）；drop handler 直接把 `clientX/clientY` 传给 `screenToFlowPosition`（xyflow 12 自行扣减画布边界 —— 双重扣减曾把负坐标落进 PG，已就地清洗并双侧设闸：保存前 SPA clamp 负值，服务端拒绝负坐标）；supervisorChain 补上 `/designer/meta` roles 单选、formField 补上新 `meta.formFields` 词表的 AutoComplete（各单据集合可编辑字段名合并去重，排除系统列 —— 仍允许自由输入），`validateFlowGraph` 同时拒绝 assignees 为空或含空串的审批节点；designer 全部 fetch 经 `src/lib/auth.ts` 注入 `x-terminal-token`（W3 bootstrap：URL ?token= → localStorage `w3-terminal-token`，样式表 link 一并补 token —— designer/README.md 记录三通道）；`POST /flow-graph` 要求 `base_version`，基线过期返回 409（并发两保存一胜一败；保存按钮带 in-flight 锁，双击只发一次）；dirty 状态切换单据类型弹三选确认（放弃并切换 / 保存并切换 / 取消）；节点类型或 payload 结构校验不过的落库图渲染为灰色降级卡片（另有 App 级 ErrorBoundary）而非白屏；节点名称双侧设限 64 字符上限并拒绝尖括号。

R0 修复清单之外的坑：strict 档门禁同样覆盖 `designer.js` 本身，而普通 `<script src>` 无法自举 token —— `dist/index.html` 增加 W3 同款内联 loader，记住 URL token 后为 bundle 的 `src` 注入 `?token=`（W3 终端页全部内联 JS，这个洞是 designer 特有）。证据：`examples/kb-agent/demos/acceptance-w5/r0-01..09` —— 拖放点/节点位置 0px 对齐（修复前偏移 −221/−49）、supervisorChain 角色选项、formField AutoComplete 词表、尖括号名称拒绝 toast、保存成功 v6、并发保存 409 败者 toast、切换三选弹窗、形状非法节点降级卡片、strict 档页面经 URL token 完整加载。

## R1 修复（同日，16 维验证 FAIL 70/100）

R0 的乐观锁是「读→比对→写」：同刻两个 POST 都通过版本检查、都回 200，一侧的写入与审计行静默丢失（活体 curl 并发实证）。R1 把 POST /flow-graph 落为真原子 CAS：单条 psql UPDATE（w4-heal-b4 的 psqlRunner 模式，凭据读 platform/nocobase/.env）—— `WHERE id AND doc_type AND graph_version = base_version`，0 行命中即 409 —— 并对成功（v→v+1）、冲突（双方版本号）、意外异常（含 stack）三路径补结构化 serve 日志。

R1 首版走 NocoBase REST `:update?filter=`，取证运行抓到双写：repository.update 是「先 find 后按主键 update」的两步（packages/core/database/src/repository.ts 的 update()），两个同刻条件更新可能都 find 到基线版本、都回 200（取证第 3 轮：A=200 B=200，落库为后写者）——前两轮 PASS 纯属时序运气。REST filter 不是 CAS 原语；只有单条 SQL UPDATE 是（PG 行锁串行化竞争者、为第二个重新求值 WHERE）。早于 graph 列的旧行 graph_version 为 NULL（与任何基线都不相等，新行上两路并发会双双 409）；serve 启动经同一 psql 通道一次性回填 0（转移五表零改动）。

取证运行：`examples/kb-agent/scripts/w5r1-concurrent-cas.mts`（可重复执行）以 Promise.all 同刻打两个 POST，断言一 200 + 一 409、落库 graph 只含胜者的时间戳标题标记、graph_version = base+1、config_note 审计行差恰 +1 —— 共 7 轮：REST 版 2 轮 PASS（时序运气）、1 轮 FAIL 暴露 find→update 竞态、psql CAS 后连续 5 轮 PASS；截图在 `demos/acceptance-w5/r1-*`。

随批清偿的 R0 验证债：designer/README.md 补齐英中双语对（README.zh.md + 录制 sidecar —— 配对门禁此前在此 note 的 R0 追加段与本 README 上双失败）；`querySelectorAll<HTMLLinkElement>` 修掉 src/lib/auth.ts 的 4×TS2339，package.json 增 `typecheck` script（tsc --noEmit，现 0 错误）；/designer/meta 经 `resolveI18nTitle` 解析 `{{t("...")}}` 模板标题，角色下拉显示 Admin/Member/Root 而非裸模板（响应 0 命中 `{{t(`；空 title 部门行直接丢弃）；节点名称双侧 trim（SPA onChange 即时写回 trim 值、`titleFault` 拒纯空白、服务端对 trim 后空白的 `data.title` 回 400 且存库一律 trim —— 全角空格/tab 混合活体实证 400）；非有限坐标（Infinity/NaN）并入负坐标拒绝（1e999 活体实证 400）；loadFlow/切流 abort 在途保存（AbortController + AbortError 静默），画布换流后归来的保存响应不再回写状态（docTypeRef 镜像 —— B 的版本状态不再被 A 的迟到保存污染）；选择器变化同步 `?doc_type=` 回 URL；readBody 超限报错与 401 响应体改带中文/token 引导文案。

## 备选与否决

- NocoBase plugin-workflow 画布 / 商业审批插件 —— 否决：树状非自由画布、会签或签锁在闭源 Professional+ 插件、与 wfl 形成双引擎（选型报告 §3.2）。
- LogicFlow / AntV X6 / bpmn.js —— 选型矩阵否决（维护间歇 / 22 个月发版空窗 / 水印 + BPMN XML 与 wfl 行模型错配）。
- 经由 NocoBase 页面块而非引擎 HTTP 端面持久化画布 —— 否决：配置中心 runjs 白名单无 fetch；iframe 让页面编排保持静态，graph 读写归引擎。
