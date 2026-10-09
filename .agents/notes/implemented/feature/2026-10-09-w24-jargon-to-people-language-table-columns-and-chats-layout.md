# Agent Note: W24 card jargon fallback, table column widths, and chats list layout

Status: implemented

## Problem

用户以会话「供应链数据关注要点」的报告卡实例点名：rows hint 直接写 `supplier 4 · 物料 product 1 与 product 8 各涉及 · AQL 抽样 d≥Re 拒收`，metrics label 出现 `连续拒收 streak≥3`、`味之源 reject_streak=5`、`product 11 当前 ATP=0`——底层标识符与统计记号直达用户。同时点名会话内 md 表格 5 列在 375px 全部挤压、chats 会话列表行错位换行，并要求全页视觉走查。durable 会话日志复核确认 `receiving_status=none` 推导语法以模型叙述与工具 JSON 两种形态直达显示面（session-f6f67643 等 20+ 个 session，zstdcat 实存）。

## Decision

1. **卡面 sanitize 从 title/subtitle 扩到全部显示字符串叶（W24 起步，W24-R1 改为对象图遍历）**：`sanitizeReportPayload` 不再逐字段枚举——W24 的枚举漏掉了 `metrics.value` 与 `actions.label`（W24 验证 FAIL83 点名）——改为遍历 payload 对象图重写每个显示字符串叶（统一走 subtitle 档最严格闭集剥离；卡面自身设计即「协议名不出现在任何面」，一元化删掉一档/多行双档枚举这个漏字段温床）。闭集 verbatim 键（`v/type/id/tone/level/kind/route/url`——派发执行器消费的字节，如 `/pur_orders/12` 导航路径）原样通过；存储工件保持 verbatim 字节（copy 路径与持久日志永不见 sanitize 后文本）。存量会话的报告卡渲染时即时生效。
2. **`sanitizeBizText` 词族与枚举单一事实源（W24 引入，W24-R1 派生化）**：供应商生命周期枚举词条从 fieldControls 导出的八态值域常量（`SUPPLIER_LIFECYCLE_STATES`）派生，译名复用 docsCatalog 的 zh 投影（`SUPPLIER_STATE_WORDS`）——`qualified` 在渲染侧/目录/解析词表三处一致为「合格」，删除渲染侧同义词「档案合格」与八态之外的死词条 `probation`。全部泄漏族正则经 `buildCiRegex` 工厂统一 `i` 标志（W24 的 AQL/streak 匹配器小写盲，`D≥RE`、全小写 `aql抽样` 穿透）。实体引用容忍复数滑笔（`suppliers 4`→「某供应商 4 号」）；streak 折叠吞掉尾部「·次/次」单位记号；`receiving=none`/`receiving_status=none`（任意大小写）整对映射「尚未收货」且先于 snake pass 跑（未来若加 `receiving_status` 词条不会遮蔽整对映射）。`frozen`/`qualified` 两个词典词态加 CJK 叙述上下文门（英文散文保词，`frozen goods` 类短语不再误伤——与 sanitize.ts 的 `suggestions` 上下文规则同式），整叶即枚举值的裸叶（metric value、action label）例外直映。实体 id 引用→人话回退、AQL 判定记号→判定句、streak 折叠的人话映射族见 sanitize spec。
3. **表格列宽契约（W24，两处同修）**：报告卡 `.reportTable` 根因是 `table-layout: fixed` 忽略单元格内容宽度——5 列被均分 ~56px 后内容互撞。改为 `table-layout: auto` + `min-width: max-content`（宽表溢出卡片、在既有 wrap 里横滚；窄表仍铺满），首列 `white-space: normal` + `min-width: 5.5em`。md 叙述表格在 `renderMarkdown` 里给每张 `<table>` 包 `<div class="md-table-wrap">`（DOMPurify 之后追加自有可信元素；overflow 写在 table 自身从不滚动——table 不是块级滚动盒），th 不换行、td `min-width: 4.5em` 地板。
4. **chats 列表排版（W24）与未读点真修（W24-R1）**：`.sessionSummary` 改 `-webkit-line-clamp: 2`（真实尾读 projection 是句子级内容）；底栏 `.identityCard` 加 `flex-wrap: wrap`。W24 的未读点重锚（`--right: -8px; --top: 2px`）**从未在活体生效**：选择器写成后代形式且用点分双 class（`.timeBadge :global(.adm-badge.fixed)`），而 antd-mobile Badge 经 `withNativeProps` 把 `className` 合并到携带连字符单 class `adm-badge-fixed` 的同一元素上——后代选择器永不命中同元素、点分双 class 也永不匹配连字符单 class，双重死亡（before 探针实测 8 个未读点 top/right 全 0px/0px）。W24-R1 改复合选择器 `.timeBadge:global(.adm-badge-fixed)`，after 探针实测 8/8 全 `top: 2px`、`right: -8px`。
5. **audit2 走查方法与仲裁纪律（W24）**：11 路由 × light/dark 截图 + DOM probe（`w24-pages-probe.json`，overflowX 全 false），VLM 初筛候选一律以 DOM 几何为仲裁（驳回 4 条：暗色副标题对比度实测 ≈8:1 达标、badge 盒与文本行盒不相交等）。成立项：首页 CTA「登记一条单据」四列网格末轨折 3 行孤字，`text-wrap: balance` 修为均匀折行（3 行 × 2 字是轨道内容宽的物理下限）。
6. **persona 三 preset 同步（W24）**：enterprise-data-assistant 补「实体引用一律写业务名称」（supplier N/product N 禁令 + 名称缺失的人话回退格式）与「抽检/统计记号不进卡面」（ATP 写「可用库存」、ROP 写「再订货点」、receiving=none 写「尚未收货」）；business-advisor 卡面术语纪律段追加同语义一行；mobile-form-assistant 的 AQL 判定建议卡模板去记号化（结论句「实检不合格 Z 个，未超允许值 → 建议接收」替代 `d≤Ac → passed`）。

不做的事：alert 行底部 entity_code（证照编号）保留原样（真实业务标识）；同 title 预警行不相邻时不拆全局聚合组卡（数据形态归预警引擎）；docs 目录卡无角标/右箭头、tasks 空态留白（产品取舍，audit2 O3/O4 记录）。

## Testing

- vitest（jsdom）rich/sanitize/sanitize-edge/views 四文件 168 用例全绿，新增：八态全值域断言（`SUPPLIER_LIFECYCLE_STATES` 逐态经 `sanitizeReportPayload` 渲染无原始枚举/snake 残留）、AQL 大小写变体矩阵（`AQL抽样，D≥RE拒收`/`aql抽样 d>=Re拒收`/`D>=RE` 均出判定句族）、receiving 整对三形态、复数实体、streak「·次」尾部、英文散文 frozen/qualified 保留（body 档同款）、metrics.value/actions.label 的 DOM 断言（`potential`→`潜在`、`WFL_Approval_Todos查看明细`→`查看明细`、点击派发 route `/pur_orders/12` verbatim）、未读点复合 class 与 CSS 源复合选择器双断言（后代/点分死形式 `not.toContain` 锁死）。
- 活体（375px，网关 127.0.0.1:3080，buyer）：`r1-unread-dot-before/after-probe.json`（同一探针脚本对 W24 dist 与 R1 dist）——before 8 点全 0px/0px，after 8/8 全 2px/-8px；`r1-jargon-scan.json` 17 面（11 路由 + 6 个完整会话）七词族（含 receiving）0 命中；durable log `zstdcat` 复核确认 `receiving_status=none` 原始字节真实存在（泄漏场景成立），渲染面经词表后 0 残留。
- `pnpm run typecheck` exit0；回归另含 ui-mobile 全量、staged lint、e2e toolcard、`verify-agent-note-format`（本 note 即按其骨架重写）。

## Alternatives considered

- **逐字段枚举 vs 对象图遍历**：枚举正是 W24 漏掉 `metrics.value`/`actions.label` 的缺陷类；遍历以闭集 verbatim 键换开放显示覆盖，未来新增显示字段自动落网。不遍历 route/url 会腐蚀导航，故闭集显式。
- **`wrapperClassName` 重构 vs 复合选择器**：antd Badge 支持 wrapperClassName，但把排版自定义属性挪到 wrapper 要动 TSX 与 CSS 两处且 `--color` 面也需搬家；复合选择器单点修复，且把两种死形式锁进 views spec 的源断言。
- **全部生命周期词上 CJK 门 vs 只门 frozen/qualified**：`potential` 等词在裸叶（metric value 无 CJK）也必须直映（验证矩阵点名「potential → 全人话」），全门会挡裸叶；只门两个词典词并加「整叶即枚举值」例外，英文散文与裸枚举叶两头兼顾。
- **保留 body/subtitle 双档 vs 统一 subtitle 档**：双档按面枚举 tier 是第二个漏字段温床；卡面设计本就禁止任何面出协议名，统一为最严格档强度只增不减。

## Consequences

- 代价：rich.ts 引入对 fieldControls/docsCatalog 的数据依赖（原先零 import）；`qualified` 渲染词从「档案合格」改为「合格」、`frozen` 从「已冻结」改为「冻结」（随目录单一译名源对齐，两处既有断言随改）；subtitle 档统一后 title/表格单元格等多行面也会剥 subtitle 族工具名（这些名字本就不该出现在任何卡面）。
- 买到：枚举族单一事实源（fieldControls 加状态不可能静默漏译名——八态全值域断言把守）、CI 正则不再按族漂移、未读点定位首次真实生效（活体前后探针为证）、W24 验证 FAIL83 的 6 条 Important 全部清偿且 audit2/note 的未读点「已修」表述按实测更正（真话债清偿）。
- 回滚：词表/正则改动全部在 rich.ts/sanitize.ts 纯函数层，回滚即恢复 W24 字节；CSS 复合选择器回退一行即回 W24 形态，但会重新引入活体 0/0 偏移，views spec 的 CSS 源断言会先红。
