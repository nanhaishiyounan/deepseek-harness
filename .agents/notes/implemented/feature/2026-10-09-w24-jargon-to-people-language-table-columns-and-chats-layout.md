# W24：卡面全字段人话化兜底、表格滚动列宽契约、chats 列表排版

- 日期：2026-10-09
- 状态：implemented（W24 批次，用户四点反馈：文案代号人话化 + md 表格挤压 + 消息列表排版 + 全页视觉走查）

## 背景

用户以会话「供应链数据关注要点」的报告卡实例点名：rows hint 直接写 `supplier 4 · 物料 product 1 与 product 8 各涉及 · AQL 抽样 d≥Re 拒收`，metrics label 出现 `连续拒收 streak≥3`、`味之源 reject_streak=5`、`product 11 当前 ATP=0`——底层标识符与统计记号直达用户。同时点名会话内 md 表格 5 列在 375px 全部挤压、chats 会话列表行错位换行。

## 决策

1. **卡面 sanitize 从 title/subtitle 扩到全部用户可见字段（W23-R5 的完成面）**：`sanitizeReportPayload` 现在 map `metrics.label`（body 档）、`rows.label`（body 档）、`rows.hint`（subtitle 档）、`table.columns[].label`（subtitle 档）、`table.rows[][]`（body 档）。存量会话的报告卡渲染时即时生效（存储工件保持 verbatim 字节——copy 路径与持久日志永远不见 sanitize 后文本，纯函数对同一输入幂等）。
2. **`sanitizeBizText` 的四族新映射（渲染侧保证，persona 是软约束）**：实体 id 引用 `\b(supplier|product|customer|material)\s*#?\s*(\d+)\b`（忽略大小写）→「某供应商 4 号」类人话回退——真名解析归 persona 主路径（模型 nb_list 已拿到名称，纪律要求写名称；名称缺失才允许「某供应商（档案 4 号）」）；AQL 整句 `AQL 抽样 d≥Re 拒收` →「按抽检标准判定拒收（不合格数达到拒收线）」+ 单记号 `d≥Re`/`d≤Ac` 兜底；streak 折叠 `连续拒收 streak≥3` →「连续拒收 3 次及以上」（BIZ_TERMS 的 `reject_streak=5` →「连续拒收批数=5」已有路径保留）；大小写不敏感词表 `ATP`→「可用库存」、`ROP`→「再订货点」。
3. **表格列宽契约（两处同修）**：报告卡 `.reportTable` 的根因是 `table-layout: fixed` 忽略单元格 `white-space: nowrap` 的内容宽度——5 列被均分 ~56px 后单元格内容横向互撞。改为 `table-layout: auto` + `min-width: max-content`（宽表溢出卡片、在既有 wrap 里横滚；窄表仍 `width: 100%` 铺满），首列 `white-space: normal` + `min-width: 5.5em`（长实体名折两行而非拉长滚动行程）。md 叙述表格在 `renderMarkdown` 里给每张 `<table>` 包 `<div class="md-table-wrap">`（DOMPurify 之后追加自有可信元素；`overflow-x` 写在 table 自身从不滚动——table 不是块级滚动盒），th 不换行、td `min-width: 4.5em` 地板。
4. **chats 列表排版**：`.sessionSummary` 从单行 nowrap 改 `-webkit-line-clamp: 2`（真实尾读 projection 是句子级内容，两行截断；badge 侧对两行块垂直居中）；未读点从时间文本右上角 `-3px`（读作漂浮错位 speck）重锚到时间右侧固定偏移 `--right: -8px; --top: 2px`；底栏 `.identityCard` 加 `flex-wrap: wrap`（两段 12px 文案在 375px 挤压断行）。
5. **audit2 走查方法与仲裁纪律**：11 路由 × light/dark 截图 + DOM probe（`w24-pages-probe.json`，overflowX 全 false），VLM 初筛 5 张（home/chats/tasks/alerts/docs）产出候选，**DOM 几何为仲裁**——VLM 噪声率高（如「暗色副标题对比度不足」实测 `#c3ab93` on `#191310` ≈8:1 达标、「角标 3 压住警字」实测 badge 盒与文本行盒不相交，均驳回）。成立项：首页 CTA「登记一条单据」6 字在四列网格末轨折 3 行孤字（`text-wrap: balance` 修两行）。
6. **persona 三 preset 同步**：enterprise-data-assistant 补「实体引用一律写业务名称」（supplier N/product N 禁令 + 名称缺失的人话回退格式）与「抽检/统计记号不进卡面」两条；business-advisor 卡面术语纪律段追加同语义一行；mobile-form-assistant 的 AQL 判定建议卡模板去记号化（metrics 标签「应抽检数量/允许不合格数/拒收线不合格数/实检不合格数」，结论句「实检不合格 Z 个，未超允许值 → 建议接收」替代 `d≤Ac → passed`）。

## 不做的事

- alert 行底部 entity_code（证照编号 `00IFSMS4401 (iso22000)`）保留原样：证照编号是用户对单用的真实业务标识，不是泄漏代号；括号内的体系类型属档案分类。
- 同 title 预警行不相邻时拆成多张组卡（W8-B2 折叠按相邻 run）：数据形态问题归预警引擎分组，不动 UI 折叠语义。
- docs 目录卡无数量角标/右箭头、tasks 空态页下部留白：产品取舍观察，非缺陷（audit2 记录）。
