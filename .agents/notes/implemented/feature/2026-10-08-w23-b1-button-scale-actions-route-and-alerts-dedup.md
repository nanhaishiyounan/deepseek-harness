# Agent Note: W23-B1 button scale root fix, view-route contract, report and alerts data repairs

Status: implemented

## Problem

W23-B0 审计（26 条，`demos/acceptance-w23/audit.md` P0×5 + 用户点名三项）定位三个用户点名根因与两条数据断链：① `tokens.css` 把 antd-mobile 字号刻度映射到展示字阶（`--adm-font-size-10:44px`、`-7:20px`、`-9=display`），large 按钮 44px/44px、small 卡片按钮 20px/40px；② 报告卡 actions 的 view route 由模型自由生成（`#/work/business/pur_orders` 死路由）、「查看待办」做成 create-task、「复制 CSV」做成 send 全文重发；③ 报告标题模板化（persona 示例直接教「本月经营概览」）、0 值指标堆叠、files 页 9 条重复 demo 报告、会话标题 fallback 中文按 UTF-8 字节截断截半词；④ 预警页 50 条通知仅 21 唯一（每扫描日一行堆叠）。

## Decision

1. **控件字阶与展示字阶分离（根修而非三处补丁）**：`tokens.css` 的 `--adm-font-size-7/8/9/10` 回到控件刻度（14/15/16/17px），展示字号只走 `--dshm-fs-*`。卡片内动作按钮（报告卡/工作卡/草稿/审批/计划/回执/预警行/待办行）统一 14px/36px（`--dshm-fs-body` 显式声明，防 antd small 档特异性反超）；弹窗 CTA（TaskFormModal 取消/创建）与页面 CTA（退出登录）16px/48px（字号用 `--dshm-fs-input`，与 iOS 防 zoom 下限同因同值）。`--adm-font-size-10` 同时喂 NavBar/Dialog 标题，17px 对标题合理且 PageNav 标题本就自绘 `--dshm-fs-heading`，W9 设计语言不受影响。
2. **view-route 形状契约双端镜像**：服务端 `tool-present-card` 在 `resolvePresentCardPayload` 结构校验后追加 route 形状校验（head ∈ 路由名 + 每头参数数上限：docs≤2、chat≤1、其余 0——`work/:id` 键是客户端本地工作项 id，模型不可知，两段 work 链即死路由形状），violation 携带合法候选列表（模型一次重试命中）；客户端 `actions.ts` 的 `isProductRoute` 重写为同表镜像，非法 route Toast「不支持的目标」不跳转。工具参数描述同步补 route 枚举与四类 kind 语义（延续 R8「参数描述防线 + persona 教学」双保险）。
3. **persona 双 preset 补纪律**：business-advisor 的 actions 段重写为四类各归其位（view=导航、create-task=登记、send=简短指令、link=外链；复制类不做成按钮）；title 教学改「期间+主题+关键结论」并明令禁止「本月经营概览」模板与表名；新增 0 值指标不进 metrics 纪律。enterprise-data-assistant 原无报告纪律段，补最小段（同语义）。
4. **fallback 标题词安全截断**：`fallbackSessionTitle` 超字节预算时按句段（空格或 CJK 标点）整段保留 + 省略号，替代裸 code-point 截断（「讲究」→「讲」）；预算装不下一个完整字符时退回原全预算 code-point 截断（不带省略号）。LLM 标题生成器（base bundle `session-title-first-prompt-llm`）本就挂载，本批不动其配置。
5. **demo 种子跨设备幂等**：`seedDemoData` 在 store 已有任何 demo 行时只闩 flag；`MobileShell` 把 seed 移到 `syncWorkFromServer` 之后（匿名/离线时 sync 即 no-op，seed 照跑）；`fileProjections` 对 demo 行按 title 保最新折叠（纵深防御）。demo 报告 title 改动态月+事实（「10月经营概览：按期交付 96%」），切断「本月」模板的 demo 语料强化。
6. **预警通知按 title 聚合**：`listMyRecallNotices` 折叠同 title 行为最新一条 + `count`，AlertsView 标题后缀「×N」。聚合放数据层（ledgerService）而非视图层，召回/催收 segment 计数随之自然去重。

不做的事（B2 留存）：P1-5 卡面工程术语纪律扩展（subtitle/rows/table 列名）、P1-7 折叠条文案人话化、P1-8 预警页文案、P1-9 hero「N件事」与四卡口径文案重排、P1-10 工具行折叠、P1-11 远期预警分区、P1-12 hero 视觉、P2-1 actions 3/4 枚不一致、P2-4 send 机器话、P2-6 语言纯度、P2-8 模式预设混入同事列表。admin 预警空态（P0-5）：活体复核 admin `#/alerts` 非空（87 行 + 19 notice），网关 admin 全量放行行为正确；审计时空态是当时 admin 会话 token 失效/未登录态的表现（`resolveBusinessSession` → undefined → 空 rows），非数据断链，不改代码。

## Alternatives considered

- **字阶三处补丁 vs tokens 根修**：逐按钮局部覆盖会在下一个 antd 控件上复发；控件刻度/展示字阶分离一次性切断映射根因，代价是 NavBar/Dialog 标题随之降到 17px（对标题合理，PageNav 标题本就自绘展示字阶）。
- **route 只做服务端校验 vs 双端镜像**：仅服务端 violation 重试依赖模型一次命中；仅客户端 Toast 则坏 route 仍进持久工件。双端同表镜像让非法 route 在生成侧被拒、消费侧兜底，代价是两张表需同步演进（route 枚举变更双端同改）。
- **route 之外加服务端 collection 名校验**：`tool-present-card` 是通用协议包，业务 collection 白名单归 persona 教学与 docs 页深链守卫，不在协议层枚举业务名。
- **预警聚合放视图层 vs 数据层**：视图层折叠只修 AlertsView 一处表面；ledgerService 层折叠让召回/催收 segment 计数一并去重。

## Consequences

- 代价：`--adm-*` 字号全局回落使所有 antd 控件随控件刻度渲染（依赖 antd small 档的旧观感不复存在）；route 形状表成为双端共享契约，新增路由头需双端同步；「本月经营概览」类模板标题被明令禁止后，标题质量依赖 persona 教学。
- 买到：按钮尺寸从 44px/20px 异态回到 14–16px 控件刻度（与 W9 展示字阶不再互相污染）；view 死路由在生成侧被拒、消费侧不跳转；files 页 demo 重复与会话标题截半词消除；预警 50→21 唯一聚合 + 计数后缀。
- 回滚：tokens 刻度、route 校验、聚合折叠各自独立可回退；回退 route 校验即恢复模型自由生成（死路由回归）。
