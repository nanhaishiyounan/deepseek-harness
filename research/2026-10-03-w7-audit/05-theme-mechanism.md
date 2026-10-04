# W7 主题落地机制考古：全局 token → 全局 CSS → 页内样式 三层注入路径

- 考古时点：2026-10-03，live GET 实测 + 仓库脚本/插件源码考古
- 结论先行：三层注入路径全部有本仓库先例与现成 API，W7 全站重设计可在不动 NocoBase 源码的前提下完成三层落地

## 1. 层 1：全局主题 token（themeConfig）

**存储**：`themeConfig` 集合（plugin-theme-editor），定义于 [`theme-config.ts`](platform/nocobase/packages/plugins/@nocobase/plugin-theme-editor/src/server/collections/theme-config.ts:13)（`dataCategory: 'system'`），每行一个主题：`{ uid, config: { name, token, algorithm? }, optional, isBuiltIn, default }`。

**live 实测**（GET /api/themeConfig:list?paginate=false&sort=id，2026-10-03）：

| id | uid | name | isBuiltIn | default | 关键 token |
|---|---|---|---|---|---|
| 1 | default | Default | true | false | — |
| 2 | dark | Dark | true | false | — |
| 3 | compact | Compact | true | false | fontSize 16 |
| 4 | compact_dark | Compact dark | true | false | fontSize 16 |
| 5 | **mfg-standard** | **制造业标准** | false | **true** | colorPrimary #1677FF / borderRadius 6 / fontSize 14 / colorBgSider #001529 / **globalStyle 1038B** |

**W5-B6 先例**（theme heal 的完整模式）：[`w5b6-theme.mts`](examples/kb-agent/scripts/w5b6-theme.mts:57)
- `MFG_STANDARD_THEME` token map（报告 §4.1 A）：colorPrimary/colorSuccess/colorWarning/colorError/colorInfo/borderRadius 6/fontSize 14/sizeStep 4/sizeUnit 4/colorBgSider #001529
- 三模式 CLI：`--apply`（demote 旧 default → create/update mfg-standard 为 default）/ `--assert` / `--rollback`（回滚 JSON 落盘 [`w5-b6-theme-rollback.json`](research/2026-09-29-w5-rework/w5-b6-theme-rollback.json)，字段 `created/previousDefaultId/previousDefaultDefault/mfgRowBefore`）
- API 面：`GET /api/themeConfig:list`、`POST /api/themeConfig:create`、`POST /api/themeConfig:update?filterByTk=<id>`、`POST /api/themeConfig:destroy?filterByTk=<id>`
- 生效机制：客户端 InitializeTheme（[`InitializeTheme.tsx`](platform/nocobase/packages/plugins/@nocobase/plugin-theme-editor/src/client/components/InitializeTheme.tsx)）对未自选主题的用户应用 `find(item => item.default)` 行——**一次行写入即可全站换肤**
- 可配面：antd v5 seed token 全集（色板/圆角/字号/间距 sizeStep/sizeUnit/线宽/侧栏色/算法 dark）——theme editor 的 token 面板（[`TokenContent.tsx`](platform/nocobase/packages/plugins/@nocobase/plugin-theme-editor/src/client-v2/antd-token-previewer/token-panel-pro/TokenContent.tsx:351) 含 globalStyle 编辑 TextArea）
- **W7 关键判断**：当前全站跑在 mfg-standard（antd 默认蓝 #1677FF 直出）——用户「难看」观感的 token 层根源；W7 应更新该行或新 uid 主题行（新行+demote 旧 default 更稳，保留回滚面）

## 2. 层 2：全局 CSS（themeConfig.config.token.globalStyle）

**机制**：theme editor 把 `globalStyle` 作为 seed token 之一（[`category.ts:300`](platform/nocobase/packages/plugins/@nocobase/plugin-theme-editor/src/client-v2/antd-token-previewer/meta/category.ts:300) 列于 `['wireframe','siderWidth','globalStyle']`），字符串整段注入全局样式。

**W5 先例**（mfg-standard 当前行内 1038 字节，[`w5b6-theme.mts:31-48`](examples/kb-agent/scripts/w5b6-theme.mts:31)）：
- 九态状态调色板 CSS 变量（--w5-status-draft/pending/reviewing/approved/rejected/inprogress/completed/cancelled/void 的 fg/bg 精确对）
- `.ant-table td, .ant-table th { font-variant-numeric: tabular-nums }`（金额列等宽数字）
- `.ant-drawer-content .ant-tag { font-size:14px; ... }`（抽屉内 Tag 放大）

**W7 用法**：02 报告的跨页共性缺陷（表头字重、行高、Tag 色阶、卡片阴影圆角、斑马纹、hover）都可在此层批量兜底——这是「一处改全站生效」的最高杠杆点；但 globalStyle 只有一格字符串，无模块化，建议控制在 200 行内做基底，页面级精修留给层 3。
**注意**：NocoBase 无独立的「系统设置 custom CSS」入口，themeConfig.globalStyle 即官方全局 CSS 面（UI 路径：主题编辑器 → 高级 → 全局样式）。

## 3. 层 3：页内样式（三类载体）

### 3.1 v2 块页（schema 层 props）
列宽/对齐/枚举色 options/FilterForm 折叠态都是 flowModels 行的 props——**W5-B6 schema heal 先例**：[`w5b6-heal.mts`](examples/kb-agent/scripts/w5b6-heal.mts:157) 的 `HealCounts { recolor, alignRight, alignLeft, collapse, enumSwap }` 逐列修补（run 输出见 [`w5-b6-heal-run-all.txt`](research/2026-09-29-w5-rework/w5-b6-heal-run-all.txt)：pilot recolor=3 alignRight=27 collapse=1）。W4 先例 [`w4-heal-b1.mts`](examples/kb-agent/scripts/w4-heal-b1.mts:281) 同模式（enumize/recolor/sort/number/date/rel/filterForm 七类动作）。
- 适用：87 页表格的列级精修（金额右对齐/千分位/枚举配色映射），脚本化幂等可回滚（rollback JSON 模式同层 1）

### 3.2 JSBlock 页（页内 HTML/CSS 自绘）
W6 全部 JSBlock 页的写法：`root.innerHTML` 拼接 + **全内联 style**——先例 [`w6b7-blocks.mts:74-148`](examples/kb-agent/scripts/w6b7-blocks.mts:74)（比价矩阵：`const cell = 'padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:12px'` 逐元素手写）；少量页内 `<style>` 块先例 [`w6b9-cockpit.mts:464`](examples/kb-agent/scripts/w6b9-cockpit.mts:464)（对账单打印页）。
- **这正是 W6 页「难看」的结构性根源**：无设计 token、无组件库、色彩/圆角/间距逐处硬编码（02 报告实证：同一页 4 套圆角、两种红、紫 #7C3AED 与平台蓝 #1677FF 并存）
- W7 改造建议：JSBlock 页内样式收敛为「页内 `<style>` 块 + CSS 变量引用层 2 的 --w5-status-* / 新增 --w7-* 设计令牌」，禁散装内联

### 3.3 SPA / iframe 页（完全自控）
- labels 条码 SPA：[`examples/kb-agent/labels/index.html:7-32`](examples/kb-agent/labels/index.html:7) 单文件内联 `<style>`，独立设计令牌（#f5f6f8 底/#1677ff 主按钮/system-ui）——样式自控面完整但与平台主题割裂（同样用了 antd 蓝，无联动）
- iframe 终端页（车间终端/质检工作台/收货终端/商机管道，url 指向 13110 引擎或 3080 网关）：样式在引擎侧页面，NocoBase 主题不穿透 iframe——W7 需在引擎侧页面统一设计令牌，且注意外层壳与 iframe 背景一致性（02 报告 w6-04 实证双层背景割裂）

## 4. 三层注入路径汇总（W7 落地顺序建议）

| 层 | 载体 | 先例文件 | 生效范围 | W7 动作 |
|---|---|---|---|---|
| 1 全局 token | themeConfig 行（uid/default） | examples/kb-agent/scripts/w5b6-theme.mts | 全站（antd 组件全量） | 新 uid 主题行（品牌色/圆角/字号阶梯），demote mfg-standard |
| 2 全局 CSS | themeConfig.config.token.globalStyle | 同上 GLOBAL_STYLE 段 + theme-config.ts 集合定义 | 全站（含 JSBlock 内的 antd 类元素） | 设计令牌 CSS 变量集 + 表格/Tag/卡片基底规则 |
| 3a schema props | flowModels 列/块 props | w5b6-heal.mts / w4-heal-b1.mts | 逐页逐列 | 87 表格页列级 heal（金额右对齐/枚举色映射/行高） |
| 3b JSBlock 页内 | JS 代码字符串 | w6b7-blocks.mjs / w6b9-cockpit.mts | 单页 | 重写为 token 引用式 `<style>` |
| 3c SPA/iframe | 独立 HTML | labels/index.html + 13110/3080 页面 | 单页 | 引擎侧统一令牌 |

- 回滚面：三层都有 W4/W5 幂等+rollback JSON 先例（w5-b6-theme-rollback.json / w5-b6-heal-run-all.txt / w4-b1-rollback.json 模式）
- 验证面：截图脚本 `.pc-shot.mjs` 可直接复用为改造前后对比驱动
