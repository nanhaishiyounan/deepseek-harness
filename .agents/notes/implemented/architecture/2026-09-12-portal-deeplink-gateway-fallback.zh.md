# Agent Note：Portal 深链 SPA fallback 落在 DSH 网关层

Status: implemented

[English](2026-09-12-portal-deeplink-gateway-fallback.md) | 中文

## 问题

打开或刷新 Portal 深链（`http://…:3080/nocobase/dist/hub/projects`）得到 NocoBase 网关的 404 body。网关 `/dist/` 分支按文件服务、无 rewrites，history 模式的 SPA 路由——只在客户端存在的路径——就是一次文件 miss。admin SPA 的 fallback 在更早的分支里，对 `/dist/*` 永远不会执行。NocoBase 快照没有为该分支提供 rewrites 配置；改它就是 vendored 核心 local-modification，被 vendoring 政策禁止。Portal 侧也无解：SPA 按构造就需要服务端 fallback。

## 决策

在唯一自有层修复：DSH webserver 代理（`packages/host/webserver/src/nocobase-proxy.ts`）。

- `NOCOBASE_PORTAL_PREFIXES`（`/nocobase/dist/crm`、`/nocobase/dist/hub`）是唯一接线点；`WebServer` constructor 把它们注册为前缀路由、排在普通 `/nocobase` 路由之前（最长前缀匹配胜出），新增 portal 只加一条。
- `createNocobaseProxyHandler` 增加 `spaFallbackIndex` 选项；`createNocobasePortalHandler(origin, portal)` 把它设为 `/dist/<portal>/`。上游对导航请求——`Accept` 含 `text/html` 的 GET/HEAD——回答 404 时，代理改为取 portal 入口，并经同一 `rewriteNocobaseHtml` 管线服务（`NOCOBASE_PORTAL_BASE` 重定根让 SPA router 拿到正确 basename）。资产与 API 请求保持 404；非 GET 保持 404。
- fallback 路径用目录形式 `/dist/<portal>/` 而非 `/dist/<portal>/index.html`：网关静态 handler 对后者做 cleanUrls 重定向（301）到前者，显式文件形式会砸在自己的 fallback 上。
- `/dist/*` 的 3xx 响应若带根绝对 `Location`，补上 `/nocobase` 前缀——与代理出站时剥前缀互为对称，让重定向跟随留在代理内。

## 已考虑的替代方案

**在 NocoBase 网关上配置 rewrites。** 否决：快照 `/dist/` 分支没有 rewrite 钩子；补丁快照属于 vendored 核心 local-modification。

**Portal 侧改 hash 路由。** 否决：要改每条 portal 路由与链接，破坏与部署入口共享的 history 语义，且 portal fork 与上游模板形态漂移。

**对每个 `/nocobase` 404 导航请求做 fallback。** 否决：普通代理还承载 admin UI，其 fallback 语义属于上游；限定在两条注册的 portal 前缀使保证局部而显式。

## 后果

- 深链与刷新可渲染（`demos/acceptance-d3/`：my-tasks、kb-search、purchase-orders、crm/deals 均为硬导航，零页面错误）；`/nocobase/api/not-exist` 与缺失资产仍 404；裸 `/nocobase/dist/hub` 保持 200。
- webserver 代理测试 15 个（新增 7 个：导航 GET/HEAD fallback、资产与 POST 透传、重定向重定根、按 portal 选 index、双前缀接线）。
- 长驻 `dsh web` 网关需要一次重启生效（source 启动，无构建步骤）。
