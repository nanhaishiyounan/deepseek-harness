# Agent Note: W8-B2 — 移动端页面级拆分、预警聚合与表单闸门

Status: implemented

[English](2026-10-04-w8-b2-mobile-pages-split-form-gate.md) | 中文

W8 审计 B2 批次（blueprint §4-B2）：最大单体面折分为模块，预警列表以聚合换密度，home 裁掉重复快捷入口，v3 草稿卡补上必填闸门。仅渲染决策搬移——```dsh``` 协议渲染、cardState 回放与 fold 折叠语义原样搬走。

## 问题

`ChatView.tsx` 已长到 1000 行（折叠渲染、composer、快捷面板、审批回读、发送通道同住一个模块）；预警列表对同规则行平铺（一次扫描的三条 CCP 偏离 = 三张全高卡，且处处无时间戳）；home 的七个快捷 chip 中三个与屏上入口重复（查看工作 = work Tab、找 AI 同事 = agents Tab 与同事 rail、问经营 = rail 首卡）；v3 草稿卡的空必填字段可以乘 确认写入 直达发送通道。

## 决策

- **ChatView 拆分**到 `messages/chat/`：`FlowItem.tsx`（单行渲染决策表 + `renderKeyOf`）、`QuickPanel.tsx`（起始指令 + 占位工具）、`Composer.tsx`（chip 行 + 输入条 + 发送/停止 + 错误 toast）、`chips.ts`（`contextChipsOf`）、`useApprovalReadback.ts`（G2 轮询），以及 400 行预算下机械抽出的两个 hook——`useDemoTyping`（2.5s 演示指示器单元）与 `useDraftValues`（hydration + 生成系统号 + 编辑汇）——和 `confirm.ts`/`meta.ts`（载荷构造与 listMeta 读取）。`ChatView.tsx` 保留编排（发送通道、回调、头/流树、托管弹层），389 行，并 re-export `contextChipsOf` 保住 `views.client.spec.tsx` 的导入面。
- **预警聚合**：`groupAlerts` 把*相邻*的仍开放未认领、同 `ruleType` + `title` 行折进一张可折叠组卡（组头：严重度封条 + 规则名 + ×计数 + 最新 `relativeTimeOf`；展开态按规则+标题本地记忆，默认折叠）。已认领/关闭行与单行组渲染普通行卡——每条明细行保留 `data-testid="alert-row"`，W6 验收脚本的锚点不动。`AlertRow.createdAt` 只映射 wire 既有 `created_at`（epoch 或 ISO；缺失则不显示该格）——读现有投影，不新增 wire 方法。
- **home chips 7→4**，按审计 content-priority 定稿行：登记一条单据（唯一 primary）、我的预警、我的待办、看单据。三个重复项直接退出，不留「更多」桶——各自已有更强的屏上入口。随之孤立的 home `NewChatSheet` 挂载移除（chats 层加号与同事 rail 仍可达该 sheet）。
- **v3 必填闸门**：确认写入 先校验「需要你定」档；空字段保留点击（禁用按钮无法承载焦点移交），在字段下渲染就近的 `role="alert"` 此项必填，并聚焦首个空控件。空白补齐即解锁（对合并值实时复验）。v3 卡数值件带 `inputMode="decimal"`；按 §8 裁决不加 * 号（「需要你定」档即必填语义）。驳回 永不拦截。
- **移交项与小修**：askButton 文字换 `--dshm-link`（暗轨 2.38:1 → 4.5:1）；PageNav 标题渲染为页面唯一 `h1`（MessagesView 撤掉自带包裹）；v3 档头 h4 降为 div；markdown 图片懒加载、限气泡宽、alt 缺省时自命名；ReportCard 指标值补纯数字千分位兜底；快捷面板开向动画对齐 220ms。

## 证据

- `wc -l`：ChatView.tsx 389；chat/ 单元 43/121/32/342/24/87/49/69/93。
- `pnpm exec vitest run packages/client/ui-mobile --no-file-parallelism` 674/674（并发全量的单例 view-spec 失败为资源时序 flake——单文件复跑绿，见修复记录）；typecheck 干净；`build:lib:client` + `apps/web` vite build 绿；w7-b6 暗轨矩阵与 w8-b1 light 探针在改动后复跑通过。
- R1 事后附注（2026-10-04）：alerts/todos 渲染用例在 B2 时点的通过是时序运气——页面当时仍带着 identity 闭包无限 refetch 缺陷（HEAD 既有），R1 修复后串行复验 680/680；上文 389/674 为 B2 时点数字。
- `demos/acceptance-w8/w8-b2-01..05-*.png`（375px，qc_inspector 真实登录）：home 4 chips、拆分后聊天流、拦截态错误态、预警组折叠 + 展开（在真实 :3080 构建上以 route 桩替换 history/alerts 读数；探针日志行随脚本输出）。

## 复盘中浮出的修复

- 并发全量两度在 `rejects from the review card…` 的 `findByTestId('review-card')` 上失败（满载 12 线程 worker 池下 1s 默认超时，日志带 V8 分配栈迹）；串行 `--no-file-parallelism` 与单文件复跑皆绿——记为已知资源时序 flake，非回归。
- 首版截图脚本用固定 `rpcId` 桩；移动端 rpc 客户端会拒绝错配 id（rpc.ts），拦截器改为回显请求 id。
- 仅走 `--dshm-*`：未引入新的 antd-mobile 选择器覆盖（组卡与字段错误均为裸元素）；tokens.css 既有 Picker/Toast 先例仍是 `--adm-*` 通道加两处已文档化的同特异度覆盖的全部。

## 已知残留 / 移交 B3

- 聚合机会主义读 `created_at`：引擎行缺该列时时间戳格（与组头「最新」）隐藏而非伪造；在真实投影上核验该列归属 B3-2 服务端投影批次。
- `research/2026-10-04-w8-mobile/b2-notes.md` 记录未做的评估：列表虚拟化（分页窗口在此规模是正确形态）、z-index 清点（全部弹层走 antd portal 通道）、TaskFormModal 草稿覆盖面复核（维持 destroy-on-close；轻量草稿若 B3-2 创建通道落地则随之）。

## 备选方案

- 禁用确认钮 vs 点击闸门——禁用给不出「聚焦首个空字段」（无点击可挂）；点击闸门同时满足探针断言（确认零发送）与焦点移交。
- home 的 NewChatSheet 留在第五个 chip 上——该 sheet 已有两个更强入口（chats 加号、同事 rail），且审计的四 chip 行未列 sheet 入口。

## 后果

- 聊天面新工作落 `messages/chat/` 单元；ChatView 保持编排缝，其 re-export 使 `contextChipsOf` 在历史路径可导入（spec 可顺势迁往 `./chat/chips.ts`）。
- 预警聚合改变列表 DOM 形态（组包裹 + 可折叠体）；以 `alert-row` 为键的行级消费不受影响，但假设平铺卡序列的消费方须读组。
