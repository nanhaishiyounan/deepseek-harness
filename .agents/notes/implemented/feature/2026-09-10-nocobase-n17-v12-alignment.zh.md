# Agent Note：NocoBase N17 对齐 v12 demo——v2 表格页、应用中心、全平台中文

状态：已实现

[English](2026-09-10-nocobase-n17-v12-alignment.md) | 中文

## 问题

admin 业务页呈现"搭建页"观感（满屏拖拽把手）、缺少 v12 demo `/settings/multi-portal` 式多应用入口、AI 悬浮球只在工作台出现、平台与双 Portal 均以英文应答。用户要求在 2.2.6 OSS 快照上达到 v12 demo 体验。

## 考虑过的替代方案

- 保留 v1 页并在每页页头手工注入"AI"按钮——否决：1.x 没有 ChatBox 组件可打开，任何跳转都失去官方悬浮球的页内会话。
- 只把 CRM 客户页重建为 v2——否决：用户的验收线是"每个表格页 add new 旁都有"，且弹窗表单 wire 一旦 dump 即可跨集合泛化。
- 等待每雇员的 locale 模板（form-assistant 模板自带 en/zh）——否决：九个内置雇员代码里没有 zh-CN 分支；`about` 是运行时提示词唯一来源，行级 upsert 才是忠实机制。

## 决策

1. "搭建页"观感的根因是浏览器本地的 `NOCOBASE_MAIN_DESIGNABLE` UI Editor 开关，非服务端缺陷——业务页始终可从九组菜单进入；修复即使用指引加上关闭开关后的截图实证。
2. v12 "add new 旁的 AI 员工"实为 plugin-ai ChatButton 悬浮球（右下角），2.2.6 仅在非 v1 页且路径以 `/admin` 开头时渲染。因此把八个核心表格页升级为 v2 flowPage 即官方同款路径：表格 + 官方 Add new/刷新操作栏 + 弹窗表单（wire 从手建样本 dump：ChildPageModel → ChildPageTabModel → BlockGridModel → CreateFormModel → FormGridModel → FormItemModel + 编辑字段模型，外加裸 FormSubmitActionModel）+ 自然获得悬浮球。
3. multi-portal 在 OSS 2.2.6 为商业专属（preset 边界测试断言插件缺席）；「应用中心」Markdown 卡片页链接双 Portal、AI 工作台与 DSH，是公认的等价实现。
4. zh-CN 必须同时写 `systemSettings` 顶层列（portal-sdk 读取）与 `options.enabledLanguages`（admin 端读取）——只写一层必有一侧英文。内置 AI 雇员文案存于 `about` 行（null 回落代码英文默认），故中文提示词按 username 幂等 upsert。
5. `flowModels:list` 不回 `parentId`（仅 `findOne` 携带）：幂等判重不能基于列表行的父子链——改用确定性子 uid（`n17sb-<formUid>`）。且 v1 区块重放必须跳过 desktopRoutes 行已变 `flowPage` 的同名页，否则 `getJsonSchema` 找不到 Grid、`all` 链重放即断。

## 影响

`nocobase-n17-alignment.mts` 并入 `all` 链且全幂等；`verify` 携带六组 N17 断言（双层 locale、应用中心、八个 v2 flowPage、AddNew/FormSubmit 模型下限、atlas 中文提示词）。证据：`examples/kb-agent/demos/nocobase-full-features/N17-01..07-*.png`。遗留为有意为之：Add new 表单覆盖 input/select/number 字段（date/m2o 编辑模型未 dump）；v12 的 AI-mode git 源 Portal 与 Connect coding agent 对 OSS 不在范围。
