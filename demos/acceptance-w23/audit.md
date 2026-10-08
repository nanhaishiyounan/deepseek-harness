# W23-B0 全面审计清单（只审计不修复）

- 日期：2026-10-08（周四，晚）
- 网关：http://127.0.0.1:3080/mobile（运行中）
- 账号：buyer/Buyer#2026（主视角）+ admin（对照）
- 方法：真实模型对话 ×5 场景（c1 月报 / c2 采购订单 / c3 库存 / c4 审批 / c5 闲聊）+ 全页面浏览器走查（11 路由 × light/dark × 375px）+ actions 四类 kind 端到端点击实测 + 代码层排查（字号 grep + computed style 实测 + persona prompt 比对）+ VLM 视觉审查 2 张关键图
- 证据索引：本目录 44 个文件（22 张页面截图、5 张对话截图、4 张专项证据截图、w23-pages-probe.json、w23-interact-probe.json、w23-chat-runs.jsonl、w23-report-payloads.json、4 个审计脚本）
- 统计：**P0 ×5，P1 ×12，P2 ×9，合计 26 条**

标记说明：【点名】= 用户点名问题（含顺藤摸瓜同类）；【主动】= 主动排查发现。

---

## P0 功能断裂

### P0-1 view 按钮跳转模型自造的不存在路由 →「该工作不存在或已删除」死胡同【点名②】
- 现象：报告卡按钮「查看全部采购订单」（kind=view，route=`#/work/business/pur_orders`）点击后跳到工作详情页，显示「该工作不存在或已删除」。无回退、无提示。第二轮卡「查看采购订单视图」生成完全相同的死路由。
- 复现：buyer 登录 → 打开会话 `session-821a6a23`（「查看我最近30天的采购订单」）→ 点报告卡「查看全部采购订单」按钮。
- 证据：`w23-evidence-view-deadroute.png`；`w23-report-payloads.json` c2 actions（route 字段原文）。
- 代码定位：
  - 模型侧 route 生成无枚举约束：`examples/kb-agent/agent-presets/enterprise-data-assistant/agent.cordis.yml` 全文无 view 路由白名单、无报告纪律段（对比 business-advisor 有 `agent.cordis.yml:36`）。
  - 客户端只校验 head：`packages/client/ui-mobile/src/client/actions.ts:104-109`（`isProductRoute` 只查首段，`work` 合法即放行，`/business/pur_orders` 作为 work-item id 查无此物）。
  - 路由实际面：`packages/client/ui-mobile/src/client/router.ts:20`（12 个路由名，`work/:id` 语义是工作项详情，不是单据列表）。
  - 三方不一致：persona 白名单 5 个（business-advisor:36）vs ROUTE_HEADS 9 个（actions.ts:75-77）vs router 12 个。
- 修复方向：① persona 报告纪律下沉为所有出卡 preset 共享段，view 白名单改为真实可跳路由枚举（含 `#/docs/:collection`，docs 页本就支持采购订单目录 drill-down，w23-docs-rows.png 已验证有数据）；② `dispatchReportAction` 的 view 分支对带参数路由做可达性预判（如 `work/:id` 前查 workStore），不可达时 Toast 并留在原页。

### P0-2 「查看待办」按钮实际弹出「创建处理任务」弹窗（kind 语义错位）【点名②】
- 现象：同上会话报告卡按钮「查看待办」kind=create-task、title="buyer 待办"，点击后弹出 TaskFormModal（创建任务表单），预填标题「buyer 待办」。用户意图是查看，得到的是建任务。
- 复现：同 P0-1 会话 → 点「查看待办」。
- 证据：`w23-evidence-taskformmodal.png`（弹窗内容「来自：buyer 待办」）；`w23-report-payloads.json` c2 actions。
- 代码定位：模型选择 kind 无语义约束（enterprise-data-assistant 无纪律段）；`actions.ts:111-114` create-task 直接开弹窗。
- 修复方向：persona 纪律明确「导航类意图（查看/打开/去XX页）一律 view+合法路由，禁止用 create-task」；产品侧给 todos/tasks 提供合法 view 目标（当前白名单有 `#/tasks`，模型没用是因为不知道）。

### P0-3 「复制 CSV 文本」按钮把整个 CSV 重发给模型，无复制行为、无反馈【点名②】
- 现象：第二轮报告卡（导出清单）按钮「复制 CSV 文本」kind=send、text=完整 CSV 全文（15 行），点击后 CSV 作为用户消息重新发给模型触发新一轮查询；无「已复制」toast，剪贴板未被写入。
- 复现：同 P0-1 会话 → 点「导出本次清单」（send 追问）→ 等模型出第二张卡 → 点「复制 CSV 文本」。
- 证据：`w23-report-payloads.json` c2 第二卡 actions（text 为 CSV 原文）；MCP 实测点击后无 toast、页面出现新 turn。
- 代码定位：协议只有 view/create-task/send/link 四 kind（`protocol.ts:163-170`），无 copy；模型只能硬选 send。UI 侧代码块本就有「复制」能力（`RichContent.tsx:38,78-82`），模型不知道。
- 修复方向：① 协议加 copy kind（或 send 的 text 超 N 行时客户端降级为复制+toast）；② persona 告知「CSV 放代码块自带复制按钮，不要做成 action」。

### P0-4 预警页 50 条通知仅 21 条唯一，同一证照通知重复渲染 3-5 次【主动·B数据链】
- 现象：buyer「我的预警」页 recall-notice 50 条，其中 NST-2026-A03817 ×4、DW-CL-2025-118 ×5、SC11137070000013 ×4 等，同证照不同扫描日各一条全部堆叠，无去重无分组无分页。
- 复现：buyer 登录 → `#/alerts`。
- 证据：`w23-pg-alerts-light/dark.png`；探针 JSON（recalls 50 / unique 21）。
- 代码定位：通知列表按扫描批次逐行入列未按证照聚合（数据源每扫描日一行）。
- 修复方向：按证照聚合取最近一次通知 + 到期日排序 + 远期（>30 天）折叠。

### P0-5 admin 预警页空态与首页 badge 矛盾（数据断链）【主动·B数据链】
- 现象：admin 首页「今天有 114 件事等你」（0 待处理/118 进行中/114 待确认/8 已完成），但 `#/alerts` 显示「当前没有路由给你的预警」空态；buyer 同页却有 3 条紧急资质预警。114 件事与预警/待办页面对不上。
- 复现：admin 登录 → `#/alerts` 对照首页。
- 证据：`w23-pg-me-light.png`（admin 会话截图 via MCP）；MCP snapshot 文本「当前没有路由给你的预警」。
- 代码定位：alerts 数据按「路由责任人」过滤（AlertsView），admin 不在任何路由责任人白名单内——超管反而看不到全局预警，口径与首页 badge 脱节。
- 修复方向：admin/管理角色豁免路由过滤或提供「全部预警」视图；首页「N 件事」口径与 alerts/todos 页拉齐。

---

## P1 体验损伤

### P1-1 按钮字号体系失衡：large=44px、small=20px，控件字阶被展示字阶顶替【点名①】
- 现象：TaskFormModal「取消/创建任务」computed fontSize=44px/高44px（W22-R2 点名未修）；ProfileView 退出登录 44px；全部报告卡按钮（size=small）20px/高40px。VLM 判读文字/按钮高度比≈85%（正常 40-55%）。44px 字号意味着两个字宽≈88px 几乎撑满按钮。
- 复现：任一报告卡 create-task 打开弹窗；`#/me` 看退出登录。
- 证据：`w23-evidence-taskformmodal.png`；`w23-pages-probe.json` logoutProbe/modalProbe（fontSize:"44px"）；`w23-interact-probe.json` chatCardButtons（fontSize:"20px"×5）；VLM 分析记录。
- 代码定位：
  - `packages/client/ui-mobile/src/client/tokens.css:218-227`：`--adm-font-size-10:44px`（antd 默认 22px 量级）、`--adm-font-size-7:20px`（antd 默认 17px）、`--adm-font-size-9: var(--dshm-fs-display)`（medium 按钮直接吃 display 档）。
  - antd-mobile `button.css`：`.adm-button-large{font-size:var(--adm-font-size-10)}`、`.adm-button-small{font-size:var(--adm-font-size-7)}`、默认档 `font-size:var(--adm-font-size-9)`。
  - size="large" 使用点全仓仅 3 处：`work/TaskFormModal.tsx:250,253`、`profile/ProfileView.tsx:327`。
- 定级建议（按「卡片内/弹窗级/页面级 CTA」三档）：
  | 场景 | 现状 | 建议 |
  |---|---|---|
  | 卡片内按钮（报告卡/任务卡） | small=20px/40px | 14px/高36px（caption-strong） |
  | 弹窗级 CTA（TaskFormModal） | large=44px/44px | 16px semibold/高48px |
  | 页面级 CTA（退出登录/登录） | large=44px；登录 medium=display | 16px/高48px |
  - 根修：tokens.css 的 `--adm-font-size-*` 恢复控件字阶语义（7→15px、9→16px、10→17px），展示字号用 `--dshm-fs-*` 独立通道，两套刻度不再互相顶替。
- 证据：`w23-pages-probe.json`（每页按钮 font/height 分布）。

### P1-2 报告标题模板化「本月经营概览」——persona 示例直接教模板【点名③】
- 现象：c1 月报场景模型输出 title「本月经营概览」（数据其实查到了：收入 ¥280,920、毛利率 -2.18%，卡有内容）；c4 标题「采购员·蔡俊的待审批单」+副题重复同一句话；c2 标题 39 字塞入表名「（pur_orders 主流程）」。
- 根因：`examples/kb-agent/agent-presets/business-advisor/agent.cordis.yml:30` 报告围栏模板的 title 占位符示例就写着「如 本月经营概览」——模型照抄示例；demo 种子也用同名（`demoSeed.ts:33,81`「本月经营概览」），全链路强化。
- 修复方向：① persona 示例改为「<具体主题+时点，如 9月经营概览（毛利率转负）>」并加一条「title 必须含本次数据的关键结论词，禁止裸用『本月』开头」；② title 长度上限（≤16 字）+ 禁表名；③ subtitle 与 title 不得重复。
- 证据：`w23-report-payloads.json`；`w23-chat-c1.png`。

### P1-3 会话标题全部缺失，fallback 为首轮消息硬截断（中文截半词）【点名③同类】
- 现象：5/5 新会话 `session.list` 的 projections.title=null；UI 显示「查看我最近30天的采购订单」「今天寒露，这个节气有什么讲」（「讲究」被截成「讲」）、「这个月经营情况怎么样？给我」。
- 证据：`w23-chat-runs.jsonl`（title 全 null）；`w23-chats-titles.png`；`w23-interact-probe.json` chatTitles。
- 代码定位：标题生成器未对新会话触发（server 侧 projections 无 title 时客户端走 `sessionsService.ts:225-233` fallback：blank?'新会话':'未命名会话'——但 UI 实际显示的是首轮截断，说明还有一层 firstPrompt fallback 在列表投影里）。
- 修复方向：接入首轮后的异步 LLM 标题（或模板「主题·时间」）；截断按词边界（中文 14 字→含标点整句截断+省略号）。

### P1-4 files 页 9 条重复的「本月经营概览示例」文件 +「示例」占位词直达用户【点名③同类】
- 现象：「最近文件」列表同一条「报AI 本月经营概览示例 截至今天·数据来自湖仓指标 10/08 查看报告」重复 9 次。
- 证据：`w23-files-buyer.png`；`w23-interact-probe.json` files.rows。
- 代码定位：demo 种子（`demoSeed.ts:33`）+ 文件列表未按报告 id 去重（或 AI 生成文件每次会话重复落档）。
- 修复方向：demo 种子去重；文件列表按 title+日期分组；「示例」改「演示」或打 demo 徽标。

### P1-5 报告卡副题/正文泄漏工程术语：approved_at、srm_suppliers.name、RFC 4180、UTF-8 BOM、pur_orders【点名③同类·F对话流】
- 现象：c2 subtitle「口径：approved_at ∈ [2026-09-08, 2026-10-08]」；导出卡 rows「字段来源 po_number=code；supplier=srm_suppliers.name」「保存方式：下方 CSV 文本已按 RFC 4180 转义，复制后另存为 .csv（UTF-8 BOM…）」；c3 subtitle 列出 4 张表名。
- 代码定位：business-advisor 的「正文纪律」只管围栏外正文（yml:37），subtitle/rows 无术语纪律；enterprise-data-assistant 整段缺失。
- 修复方向：纪律扩展到全部卡内字段（title/subtitle/rows/hint/table 列名）；技术口径挪到可展开的「数据说明」折叠。

### P1-6 审批场景卡：0 值指标堆出「没内容」体感 +「催办 admin/quality_lead」内部账号名进按钮【点名③+②同类】
- 现象：c4 报告卡 metrics「0 我名下的待办审批 / 7 我已提交待上级审批」——两个数字把「没有」说成报告主体；按钮「催办 admin/quality_lead」直接暴露内部用户 id。
- 证据：`w23-chat-c4.png`；`w23-report-payloads.json` c4。
- 修复方向：0 值结论化（叙述「你名下暂无待办」而非指标 0）；催办按钮文案用姓名（蔡俊/陈立群），send 文本里才用 id。

### P1-7 被拒折叠提示用户不可理解，且 CSV 正文藏在折叠条里【点名F】
- 现象：导出场景第一次围栏超限被折叠，显示「结构化消息（格式异常，已折叠）」（FlowItem.tsx:202）与「present_card 载荷未通过校验，已折叠；如需该内容请让助手重新呈现」（fold.ts:475）；模型重试成功后还说「下方 CSV 文本」——但 CSV 在被折叠的第一次尝试里，用户要自己展开失败条目找数据。
- 证据：MCP snapshot（DisclosureTriangle「结构化消息（格式异常，已折叠）」）；c2 会话。
- 修复方向：折叠条文案人话化（「这条消息太长没能完整显示，AI 已自动重试」）；模型自纠成功后把关键数据带进新卡（persona 已有自查清单，补「重试卡必须自包含」）。

### P1-8 预警页文案暴露内部概念【主动·C文案】
- 现象：「行内『认领』把预警认到本人名下…引擎按路由责任人白名单与状态流校验，越权或越态操作会被拒绝并提示原因」「效期/资质/账期/质量四路规则的扫描结果会出现在这里」——「路由责任人白名单」「越态」「四路规则」是引擎术语。
- 证据：buyer alerts 探针 mainHead。
- 代码定位：AlertsView 页面说明文案（alerts 模块）。
- 修复方向：改用户语言：「认领后由你负责跟进」「效期、资质、账期、质量四类预警」。

### P1-9 首页 badge 口径混乱：「今天有 35 件事等你」vs「0 项待处理」【主动·B/C】
- 现象：buyer 首页 hero「今天有 35 件事等你」，下方台账四卡「0 待处理/34 进行中/35 待确认/34 已完成」——「35 件事」与「0 待处理」并列出现，语义打架；admin 同型（114 件事/0 待处理）。
- 证据：`w23-pg-home-light.png`；两账号 mainHead 文本。
- 修复方向：hero 数字改为「N 项待确认 · M 项进行中」引用同一口径，或四卡改三卡合并。

### P1-10 查询过程思维链全量直出：8 条「查询业务记录」工具行 + 调试语句【点名F对话流】
- 现象：c2 一轮内 9 个 nb_list 工具行（含「属于关系的字段没法直接用 eq 过滤，我换个思路」这类内部调试叙述），页面滚动很长才见到卡。
- 证据：`w23-chat-c2.png`；runs JSONL toolCalls 序列。
- 修复方向：工具行折叠为单条「查询了 8 次业务表」摘要（可展开）；中间叙述（换思路类）不进 bubble。

### P1-11 远期到期通知淹没紧急预警（无分级）【主动·A/E】
- 现象：alerts 页 50 条通知里大量「72 天后到期」「363 天后到期」的【关注】级，与「已过期 29 天」【紧急】混排。
- 证据：alerts 探针 recalls 序列。
- 修复方向：紧急（≤7 天/已过期）置顶分区，>30 天折叠为「N 条远期提醒」。

### P1-12 首页 hero 视觉主次颠倒（VLM 复核）【主动·D】
- 现象：VLM 判读 home：欢迎语字号过大压过数据看板、AI 同事图标行第 4 个截断感、CTA 与胶囊按钮边距不齐、节气徽章与日期对齐脱节。
- 证据：VLM 分析（w23-pg-home-light.png）；部分结论需人工复核（fullPage 截图的截断判读可能失真）。
- 修复方向：hero 降一档字阶；快捷区四按钮统一栅格；AI 同事横向滚动或 2×2。

---

## P2 打磨

### P2-1 报告卡 actions 协议收 4 枚、渲染只显 3 枚，第 4 枚静默丢弃【主动】
- `protocol.ts:668-669` 允许 ≤4；`ReportCard.tsx:86-93` orderedActionsOf 最多渲染 3（others slice(0,2)+create-task）；persona:31 说「actions 最多 4 枚」。三方数字不一致，4 枚时一枚不可见且无提示。修复：三方统一 3，或渲染区允许 2+2 换行。

### P2-2 ROUTE_HEADS 注释「十个路由」实际 9 个【主动】
- `actions.ts:74-77`：注释「ten in-product route heads」列了 9 个；且与 router 12 路由脱节（todos/docs/alerts 不在校验集）。文档漂移+校验面窄。

### P2-3 返回按钮 aria 树重复（两个「返回」节点）【主动·A】
- work/tasks/chat 详情页 snapshot 中 `button "返回"` 出现两次（图标+透明命中区双节点）。无障碍读屏会读两遍。修复：命中区 aria-hidden。

### P2-4 send 按钮发出的「用户消息」是机器话【主动·C】
- 「导出本次清单」send 的 text 是英文 snake_case 字段列表，出现在用户气泡位。修复：send text 要求人话（「把这 15 单导出成 CSV」），字段细节留在模型侧。

### P2-5 预警行日期自相矛盾：「6 天后到期」vs「周日」【点名E同类·主动】
- QS-SC-2023-88 行显示「6 天后到期」+ weekday「周日」，但 2026-10-08（周四）+6 天 = 10-14（周三）。两个日期口径（天数差与 weekday）来源不一致，至少一个算错。证据：alerts 探针 rowSample。修复：统一按本地时区日历日计算。

### P2-6 闲聊中英夹杂「蔬菜、 fruit、优质蛋白」【主动·C】
- c5 模型输出混入英文单词「fruit」。persona 无语言纯度要求。修复：语言段加「除专有名词外全中文」。

### P2-7 docs 行点击疑似回目录层（drill-down 第三层待复核）【主动·A】
- 探针 docsDetailHead 显示目录内容而非行详情。`w23-docs-detail.png` 需人工复核（可能点击目标是 collection 卡而非行）。修复方向待复核后定。

### P2-8 模式预设（标准/PTC/极简/创造）混入「AI 同事」列表【主动·C IA】
- home/agents 页 30+ 条目里「找 标准模式/PTC 模式/极简模式/创造模式」与业务同事并列，语义类别不同。修复：分「模式」小节或移到设置。

### P2-9 会话跨账号可读（admin 能打开 buyer 会话页）【主动·E】
- MCP（admin）直接打开 buyer 的 `#/chat/<sid>` 正常渲染。若为产品设定（管理层可见）需在 UI 标注归属；否则应收紧 session.read 权限。

---

## 用户三点问题根因初判汇总

1. **按钮字体太大**：tokens.css 把 antd-mobile 字号刻度映射到展示字阶（font-size-10=44px、font-size-7=20px、medium 档=display），全仓 size="large" 3 处（TaskFormModal×2、退出登录）叠加放大，实测 44px/44px 与 20px/40px。是「设计令牌映射错位」而非个别组件没改。
2. **卡片按钮点击无反应/无数据**：主根因是模型侧 route/kind 生成无枚举约束（enterprise-data-assistant 等 preset 缺报告纪律段），客户端 ROUTE_HEADS 只校验首段放行死路由；「查看待办」被做成 create-task、「复制 CSV」被做成 send。产品侧也没有「单据列表」合法 view 目标（docs 页有数据但不在白名单）。
3. **月报没内容+标题「本月xxx」**：本轮实测月报卡数据链是通的（kpi_snapshots 查询→metrics 有值），“没内容”体感来自三处：0 值指标堆叠（c4）、标题/副题模板化空洞（persona 示例「本月经营概览」直接教模板）、文件列表 9 条重复「示例」文件。会话标题则是生成器未触发+中文硬截断。

## 证据文件索引

| 文件 | 内容 |
|---|---|
| w23-pg-{route}-{light,dark}.png ×22 | 11 路由双主题全页截图 |
| w23-chat-c1..c5.png | 5 场景对话全页截图 |
| w23-evidence-c1-report.png / -view-deadroute.png / -taskformmodal.png | 用户点名问题专项证据 |
| w23-files-buyer.png / w23-chats-titles.png / w23-composer-plus.png / w23-docs-{rows,detail}.png / w23-home-dark-check.png | 交互探针截图 |
| w23-pages-probe.json | 每页 headings/按钮字号分布/空态/溢出 + logout/modal 字号铁证 |
| w23-interact-probe.json | 登录按钮/docs钻取/files/plus面板/暗色对比/下拉刷新/会话标题 |
| w23-chat-runs.jsonl | 5 场景完整事件（工具链/卡片/文本/标题） |
| w23-report-payloads.json | 4 张报告卡完整 payload（title/actions/metrics/rows/table） |
| w23-pages.mjs / w23-chat.mjs / w23-interact.mjs / w23-evidence.mjs | 审计脚本（可复跑） |
