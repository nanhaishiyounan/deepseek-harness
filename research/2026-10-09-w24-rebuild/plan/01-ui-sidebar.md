# 分域计划 01｜豆包式左侧边栏 UI 重构（B1）

- Spec 溯源：主计划 §1.1 指令 3（tab→侧边栏，会话/轨迹保留）+ §2 六铁律；R3 报告 §2（tab 机制全景）
- 范围：桌面端导航层重构；mobile 入口不在本批（B7 换身份时顺带）

## 现状基线（R3 证据）

- 布局几何冻结于 [`columns.ts`](../../../packages/client/ui-layout/src/client/columns.ts:17)：sidebar 264–420px（默认 280）+ 折叠 rail 56px + details 300–520px（默认 360）；center 下限 640；让步链 center→details→自动关 details，sidebar 永不让步（[`columns.ts:62`](../../../packages/client/ui-layout/src/client/columns.ts:62)）
- 当前 56px rail 是折叠态会话侧栏（rail 上有 Search sessions 按钮，[`rail-search-expand.e2e.ts:44`](../../../apps/web/tests/rail-search-expand.e2e.ts:44)），**不是**主导航菜单
- tab 环 = conversation.view slot 座位（order 排序，R3 §2.2 完整注册行表）：chat=0 / view-context=0.5 / kb=10 / scenarios=10.5 / market=11 / connectors=12 / kg=13 / business=14 / trajectory=15 / mobile-preview=16
- 侧栏既有 slot：sidebar.brand.mark / sidebar.brand.name / sidebar.workspaces / sidebar.settings / **sidebar.footer.action（kb=5、market=6、connectors=7、kg=8、business=9——功能入口带雏形）**
- 面板动作面 `ctx.layout`（toggleSidebar/openDetails/closeDetails）在 [`service.ts:23`](../../../packages/client/ui-layout/src/client/service.ts:23)
- UI 只能经 `ctx.slots.register` 组合（[`packages/client/AGENTS.md:11`](../../../packages/client/AGENTS.md:11)）；外部插件用 `ctx.slots.inject`

## 目标形态（豆包网页版范式）

- 左侧**固定主导航列**（icon + 文字菜单，分组：智能对话 / 知识库 / 数据资产 / 图谱 / 业务 / 治理 / 设置），点击切换主功能区；功能区内部各自保留既有布局（kb 工作台、market、kg 画布等页面本体不动）
- 会话页 = 主导航「对话」进入，会话列表沿用 sidebar.workspaces；会话体内 **tab 环收缩为 chat + trajectory**（view-context 保留为上下文层）
- 折叠态：主导航收窄为纯图标 rail（56px 语义复用，语义从「会话折叠」改为「主导航折叠」）

## 关键文件

| 文件 | 动作 |
|---|---|
| [`packages/client/ui-layout/src/client/columns.ts`](../../../packages/client/ui-layout/src/client/columns.ts:17) | 几何契约扩展：新增主导航列宽度契约（导航列 + 会话列双层）；sidebar 永不让步语义保留 |
| `packages/client/ui-nav/src/`（新包） | 主导航 slot 声明者：菜单结构、分组、激活态、折叠态；声明 `sidebar.nav` slot |
| [`packages/client/ui-sidebar/src/`](../../../packages/client/ui-sidebar) | sidebar.footer.action 座位迁移到 sidebar.nav；保留 brand/settings |
| [`packages/client/ui-kb/src/client/index.ts:239`](../../../packages/client/ui-kb/src/client/index.ts:239)、[`ui-assets:127`](../../../packages/client/ui-assets/src/client/index.ts:127)、[`ui-connectors:120`](../../../packages/client/ui-connectors/src/client/index.ts:120)、[`ui-kg:318`](../../../packages/client/ui-kg/src/client/index.ts:318)、[`ui-business:130`](../../../packages/client/ui-business/src/client/index.ts:130)、[`ui-mobile-preview:47`](../../../packages/client/ui-mobile-preview/src/client/index.ts:47) | conversation.view 注册撤出（保留页面组件），注册 sidebar.nav 菜单项 |
| [`packages/client/ui-trajectory/src/client/index.ts:43`](../../../packages/client/ui-trajectory/src/client/index.ts:43) | 保留 tab 座位不动（注释更新） |
| [`packages/client/ui-view-context/src/client/index.ts:131`](../../../packages/client/ui-view-context/src/client/index.ts:131) | 深链适配：setView/requestView 通道扩展「功能区」语义 |

## Interfaces 契约块

```ts
// Produces（后续批次依赖）：
// packages/client/ui-nav 声明并导出：
//   slot 'sidebar.nav'：座位 = { id: string; order: number; icon: string; labelLocale: LocaleThunk; view: string }[]
//   预留座位表：chat=0（对话区）/ kb=10 / scenarios=10.5 / market=11 / connectors=12 / kg=13 / business=14 /
//     governance=14.5（B6 ui-governance 预订）/ mobile-preview=16 —— 沿用 conversation.view 旧 order 保持心智连续
// Consumes（本批依赖既有）：
//   ctx.slots.register / ctx.slots.inject（ui-slots 包）
//   ctx.layout.toggleSidebar（ui-layout service.ts:23）
//   view-context 的 actions.setView(view) 深链通道
// 新包三注册面：tsconfig.client.json aggregate / web-app cordis.patch.yml dsh.client 行 / web-app package.json 依赖行
```

## 实施步骤

- [ ] 设计稿先行：ui-ux-pro-max 标尺下产出主导航视觉规格（分组/图标语义/激活态/折叠 rail 态/暗色主题），延续 W7 设计语言（普鲁士深蓝 #1E4E8C + Fiori 语义五态）
- [ ] 新增 ui-nav 包（三注册面 + dsh.client manifest + clientBundle），声明 sidebar.nav slot 与菜单默认结构
- [ ] columns.ts 几何契约扩展 + ui-sidebar 改造（footer.action → nav 段迁移，brand/settings 保留）
- [ ] 七个功能页包：撤 conversation.view 注册行 → 注入 sidebar.nav 菜单项（页面组件零改动）
- [ ] view-context 深链扩展：功能区切换经既有 pending 通道；kg seeds 深链回归
- [ ] e2e/snapshot 全量更新：navigation-panes、rail-search-expand、overview-home、biz-navigator、kg-graph-page、market-pages、sidebar 相关；DSH_SNAPSHOT=refresh 明示刷新
- [ ] bundle + 重启 dsh web（模块表启动时扫描），真浏览器往返验证全部菜单路径
- [ ] Agent Note + doc-sync + lefthook

## 验收标准（R1 验证轮判据）

1. 左侧边栏主导航可往返切换全部功能页（真浏览器点击序列录证）
2. 会话体内 tab 仅剩 会话+轨迹（view-context 隐形层保留），深链旧 URL 兼容或显式重定向
3. `pnpm run test:web` / typecheck / lint 全绿；coverage per-file 100% 不回退
4. 折叠 rail 态可展开，暗色主题视觉达标（截图对比）

## 风险

| 风险 | 缓解 |
|---|---|
| e2e 基线面大（10+ 测试文件） | 一次性集中刷新 snapshot，独立 commit 便于 review |
| view-context 深链语义扩展引入回归 | kg seeds 深链保留专用 e2e（既有 kg-graph-page.e2e 复用） |
| sidebar 永不让步契约与新增导航列冲突 | columns.ts 契约变更附单测：三让步链场景回归 |
