# B2 · 独立验收（真实浏览器 + 真实 API + 门禁）

> 上游：[01-design-and-impl.md](01-design-and-impl.md)（B1 完成）| 执行：verifier 视角独立验收（不修代码，只产 findings）| 产出：`research/2026-09-22-mobile-v5-aiworkmate/acceptance-report.md` + `verify-*.png` 补充证据

## 1. 批次目标

以独立验收者身份对 B1 交付做全路由真实走查、闭环剧本真实 API 验证、硬约束逐条复核、门禁全量复跑；产出分级 findings 报告（P0 阻断 / P1 应修 / P2 可留待记录）。**本批不修任何代码**——修复全部进 B3 一次性清尾（防振荡配方）。

## 2. 验收维度与用例

### 2.1 全路由截图走查（chrome-devtools，375×812 与 390×844 双视口抽查）

| # | 路由 | 验收点 |
|---|---|---|
| A1 | `#/`（登录后首页） | 今日工作统计与 workStore 一致、AI 同事列表、最近对话 3 条、快捷任务；空态（无任务无会话）不塌陷 |
| A2 | `#/chats` | v4 资产零回归：投影摘要/未读/置顶 SwipeAction/筛选 CapsuleTabs |
| A3 | `#/chat/:id` | v3 卡片族（ask/draft/receipt）+ 新 ReportCard 混排；NavBar 返回；composer 正常 |
| A4 | `#/work` | 四态 Tab 切换、任务卡信息、Empty 态 |
| A5 | `#/work/:id` | 上下文回链、执行时间线、结果卡、操作区 |
| A6 | `#/tasks` | 我的/团队分组 |
| A7 | `#/files` | 三分区（AI 生成/最近/收藏） |
| A8 | `#/agents` | 角色卡、发起对话直达 |
| A9 | `#/me` | 工作空间/AI 偏好/通知/设置；暗色开关 |
| A10 | `#/login` | 登录视觉与 demo 通道如实描述 |
| A11 | 深色双轨 | 关键页（首页/聊天/工作/详情）暗轨截图 |
| A12 | PC iframe 预览 | ui-mobile-preview 内 4 Tab + 深链（#/work/:id 直开）正常 |
| A13 | 转场与动效 | 二级页 slide-in、Tab fade、reduced-motion 降级 |

### 2.2 真实 API 闭环剧本（需 DEEPSEEK/MiniMax key，经 13100 代理环境）

1. 首页快捷任务/最近对话进入聊天 → 问「帮我整理一下今天项目风险」→ 真实 AI 回复含 report 围栏 → ReportCard 渲染（metrics + 风险条目 + actions）。
2. 点 [创建处理任务] → Modal 表单（AI 建议区有内容）→ 提交 → Toast + 跳 `#/work/:id`，工作项出现在「进行中」。
3. WorkDetailView 执行时间线推进（真实工作会话投影）→ 完成 → 状态翻「待确认」。
4. 确认完成 → 「回到聊天」→ 源会话内工作完成事件已进 durable log 且 AI 真实收尾回复。
5. 刷新页面 → workStore 持久化、四态、回执不丢失（重放一致）。
6. 对照回归：同会话再走一次 v3 表单流程（登记采购单 → 草稿 → 确认 → nb_create 落库回执 №）——**真库落库不回退**。

### 2.3 硬约束复核（PLAN.md §3.4 六条逐条）

真实 LLM 链路在新 IA 可用 / v3 表单流程完整 / wire 无写方法（grep rpc.ts 无新增写方法）/ PC 预览零回归 / 两态切换实现为数据源分支而非双实现 / 模拟不进 durable log（检查演示态会话事件）。

### 2.4 协议与纪律抽查

- e2e 负断言仍在且通过：无 ```dsh 围栏、无 hub_* 表名、无 nb_create 字样、无 `{"v":3`/`{"v":5` 裸 JSON、welcome 零冒名。
- 围栏损坏样本降级不崩聊天流（fold 降级路径）。
- 展示层无 snake_case 直出、无裸 FK id（v4 清洗规则延续到新视图）。

### 2.5 门禁复跑（CI 同口径）

```sh
pnpm run test:coverage     # per-file 100% 全量
pnpm run typecheck && pnpm run lint
pnpm run test:web -- mobile
```

### 2.6 文档抽查

README 双语 IA 段与实况一致；QUICKSTART 四 Tab 漂移已清；mobile.ts/LoginView 注释已修；Agent Note 存在且分类正确。

## 3. 产出物

- `acceptance-report.md`：每维度 PASS/FAIL + P0/P1/P2 findings（含复现步骤与截图锚点）+ 硬约束六条复核表。
- 补充截图：验收过程发现问题的现场证据（命名 verify-a<N>-*.png 或 issue-*.png）。

## 4. 批次验收标准（B2 Done）

1. 13 项走查 + 6 步闭环剧本 + 硬约束六条全部有明确判定（不允许「未验证」遗留，验不了要写原因）。
2. findings 分级清单产出，P0 数量为 0 或已有明确 B3 修复指令。
3. 门禁三条命令输出记录在案。
4. 报告落盘 research/2026-09-22-mobile-v5-aiworkmate/acceptance-report.md。
