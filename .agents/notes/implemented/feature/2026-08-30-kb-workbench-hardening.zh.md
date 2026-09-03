# Agent Note: kb 工作台加固——设计 token、fixed 面板落位、部署单一租户源、写端点 opt-in、embed 故障降级

Status: implemented

[English](2026-08-30-kb-workbench-hardening.md) | 中文

## 问题

验证的 Important 发现聚在 kb 工作台与产品其余部分的契合上：面板用私有的 `--color-*`/`--bg-*`/`--radius-*` 变量自成一派（暗色模式到不了它）、以文档流挂载被侧栏窄列裁切、每次渲染泄漏一个模块级监听器注册、pending 期间双击会双倍计量。部署侧租户绑定的事实源分裂、网关无条件暴露 kb 写方法、embed 运行时故障把 hybrid 检索一起拖垮。

## 决策

### H4：ui-kb 并入设计体系与 CordisPanel 落位模式

`KbPanel.module.css` 现在只消费 `--dsw-alias-*` 语义 token（`bg-layer-1/2`、`label-primary/secondary`、`border-l1/inverted`、`state-error-*`）加主题的 `--dsw-shadow-lv3`；圆角用字面值，与其他所有 `ui-*` 包一致（主题不持有 radius token）。面板 `position: fixed`，偏移在 `useLayoutEffect` 里从触发器测量——CordisPanel 先例，因为侧栏裁切 overflow，文档流面板逃不出窄 footer 列（`min-width: 280px` 对上更窄的列，stats 加载后面板被推出视口）。外点消除走共享的 `useDismissOnOutsidePointer` hook，为此新增 `ui-primitives` peer 依赖。in-flight 防护在 round trip pending 期间禁用检索/入库按钮（防护折进与空输入检查同一个条件，与检索侧对称）；模块级重渲染监听器集合改在 `useEffect` 里注册并 cleanup——双挂载双卸载后 window/document 监听器净计数为零，由 spy 测试断言。

### H5：一个租户 env、写端点 opt-in、租户绑定 fail-loud

`DSH_KB_TENANT` 成为单一事实源：`cordis.patch.yml` 用它读取 `tool-kb` 的 `tenant`、预设行与 api-gateway 的 `kbTenant`（三处都回落 `demo-food-co`），替换掉与文档口径静默分叉的硬编码字面量。网关的 kb 写方法（`kb.ingest`、`kb.ingestUrl`）在部署未设 `kbWriteEnabled: true` 时回答 `kb-write-disabled`——网关无鉴权且 `kb.ingest` 读取传入的任意路径，写能力是逐部署决策；通用 web-app bundle 显式钉 `kbTenant: default`，kb-agent 的 patch 为其单租户、磁盘防护的部署显式开启写。`kbTenant` 在插件 schema 必填（漏配在加载时失败），且每个 kb 方法在直构 `createApiProxy` 漏配时也拒绝 `kb-tenant-unbound`——不再静默落到默认租户。DEPLOY（双语）写明无鉴权禁公网、任意文件读链、以及如实的 v2→v3 升级路径（v2 备份依旧被拒；重建语料靠重新入库；回滚代码与库一起回）。

### H6：embed 运行时故障降级 search，不降级 ingest

`KbRuntime.search` 现在把运行时 `embed()` 故障（或空向量批次）等同于 provider 缺席：文本排序以 `mode: 'text'` 作答、warn 日志点名 provider 与原因、降级检索照常计量（`searches: 1, embedTexts: 0`）。ingest 在同一故障下保持 `KB_EMBED_FAILED` fail-loud——残缺向量绝不能入库，静默的 text-only 入库会无形中毒化 hybrid 召回。`kb_ingest_url` 的 DNS rebinding TOCTOU 与 graph 工具零计量登记为 `plans/food-kb-agent-plan.md` 债务并附修复方向（pin-IP 进 `ctx.web` 请求字段；graph execute 走 recordUsage 缝），本批不实现。

## 考虑过的替代方案

- **面板落位用 portal**：否决——portal 逃出侧栏裁切但丢失锚点的布局上下文；测量式 fixed 偏移（CordisPanel 先例，现为共享的 `useFixedPanelAnchor` hook）让两个面板保持同一落位模式。
- **写开关按方法分设**（ingest/ingestUrl 各一旗标）：否决——部署决策是"这个网关可不可写"，不是允许哪个写动词；一个旗标与威胁模型（无鉴权可达的网关）对齐。
- **ingest 在 embed 故障时也降级 text-only**：否决——静默无向量的切片会无形中毒化 hybrid 召回；search 的降级每次调用可观测，入库的向量不可观测。

## 后果

- `packages/client/ui-kb/src/client/{KbPanel.module.css,KbPanel.tsx,KbEntry.tsx,index.ts}` + `package.json`（ui-primitives peer）；测试 `kbentry.client.spec.tsx`、`kbpanel.client.spec.tsx`、`apply.client.spec.tsx`、`invariant.client.spec.ts`。
- `packages/host/apiproxy/src/{api-proxy.ts,index.ts,api/rpc.ts,api/rpc.schema.ts}`；测试 `kb-domain.spec.ts`；`packages/bundle/web-app/cordis.patch.yml`；`examples/kb-agent/cordis.patch.yml`；`apps/web/tests/kb-workbench.{overlay.yml,e2e.ts}`。
- `packages/kb/kb/src/index.ts` + `tests/runtime.spec.ts`；`examples/kb-agent/DEPLOY.{md,zh.md}`；`plans/food-kb-agent-plan.md`（债务表）。
