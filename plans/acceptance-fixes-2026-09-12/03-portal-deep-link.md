# 批次 D3：Portal 深链直开 404 —— 网关层 SPA fallback

> 隶属 [PLAN.md](PLAN.md)。前置：无（与 D1/D2 独立，建议在其后避免打断数据面验证）。改动面：DSH webserver 双文件 + 单测。改后须重启长驻 :3080 网关生效（BUG-4/旧 inode 惯例）。

## 根因（分层定位）

直开/刷新 `http://localhost:3080/nocobase/dist/hub/projects` 的传播路径：

```
浏览器 → 层1 webserver :3080 最长前缀匹配 /nocobase（无 portal fallback 逻辑）
       → 层2 剥前缀 /dist/hub/projects 转发（[nocobase-proxy.ts:152](../../packages/host/webserver/src/nocobase-proxy.ts:152)）
       → 层3 NocoBase gateway :13000 /dist/ 分支 → serve-handler(public=storage/dist-client, 无 rewrites)
         文件 miss 直接 404（[gateway/index.ts:489-502](../../platform/nocobase/packages/core/server/src/gateway/index.ts:489)）← 404 精确发生点
         （admin SPA fallback 在 [:575](../../platform/nocobase/packages/core/server/src/gateway/index.ts:575)，但 /dist/* 提前命中到不了）
```

- NocoBase 快照侧不可配置（dist 分支无 rewrite 配置项；改它 = vendored 核心 local-modification，越界）；
- portal 侧无解（SPA 路由本需服务端 fallback）；
- **修复层裁决：DSH 网关层**（唯一自有代码层）。

登记原文：[handoff-2026-09-10.zh.md:13](../handoff-2026-09-10.zh.md:13)「Portal 深链直开仍 404」、[:54](../handoff-2026-09-10.zh.md:54)。

## 改动面

### 1. [index.ts](../../packages/host/webserver/src/index.ts) 注册双长前缀路由

`WebServer` constructor（[:104-123](../../packages/host/webserver/src/index.ts:104) 现有 `/nocobase` 注册处）追加 `/nocobase/dist/crm`、`/nocobase/dist/hub` 两条更长前缀路由——[`match()`](../../packages/host/webserver/src/index.ts:295) 最长前缀优先，天然压过 `/nocobase`。

### 2. [nocobase-proxy.ts](../../packages/host/webserver/src/nocobase-proxy.ts) fallback 包装 handler

新导出 `createNocobasePortalHandler(name: 'crm'|'hub', delegate)` 包装既有 [`createNocobaseProxyHandler`](../../packages/host/webserver/src/nocobase-proxy.ts:149)：

1. 委托原 handler 转发；上游响应 **404 且方法为 GET/HEAD 且 `Accept` 含 `text/html`**（导航请求）时；
2. 二次请求上游 `/dist/<name>/index.html`（入口必 200），body 走既有 [`rewriteNocobaseHtml`](../../packages/host/webserver/src/nocobase-proxy.ts:42) 管线——`window.NOCOBASE_PORTAL_BASE` 被 [:57](../../packages/host/webserver/src/nocobase-proxy.ts:57) 重写为 `/nocobase/dist/<name>/`，router basename 正确；
3. 回 200 + text/html。

**不误伤面**（测试锁定）：`/nocobase/api/*` 不在新前缀路由下、API 404 照旧透传；资产请求（Accept 非 text/html，如旧哈希 js/css）保持 404 不收 HTML。

**已知边界一并处理**：`/nocobase/dist/hub`（无尾斜杠 exact）上游 301 `Location: /dist/hub/`——代理不重写 Location 头导致浏览器跳出前缀。修复：新 handler 对 3xx 的 `Location` 以 `/dist/<name>` 开头时补 `/nocobase` 前缀（与剥前缀对称）。

### 3. 单测（[nocobase-proxy.spec.ts](../../packages/host/webserver/tests/nocobase-proxy.spec.ts)，fakeUpstream 脚手架现成）

新增四类用例 + wiring 扩展：

1. 上游 `/dist/hub/projects`→404 + `/dist/hub/index.html`→200，GET+text/html → 代理回 200，body 含 `NOCOBASE_PORTAL_BASE="/nocobase/dist/hub/"`；
2. 资产 200 透传、资产 404（Accept: application/octet-stream 或 */* 无 text/html）不 fallback；
3. 非 GET（POST 404）不 fallback；
4. `/nocobase/api/*` 404 透传无 fallback；
5. wiring describe（[:184-199](../../packages/host/webserver/tests/nocobase-proxy.spec.ts:184)）：constructor 注册的两条新前缀可命中（duplicate-route probe 扩展）；
6. 301 Location 补前缀用例。

## 实施步骤

1. 实现双文件改动 + 单测（TDD：先红后绿）；
2. `pnpm run test -- packages/host/webserver` 分区绿；`pnpm run typecheck && lint`；
3. 重启长驻 :3080 网关（探活旧 inode 检查先行）；
4. 真实浏览器验证（证据落 `examples/kb-agent/demos/acceptance-d3/`）。

## 验收断言

1. 直开 `:3080/nocobase/dist/hub/<任一深层路由>`（projects、my-tasks、knowledge/search 等 ≥3 条）与 `/nocobase/dist/crm/<路由>` ≥1 条均 200 渲染出对应页面（非 404、非 admin SPA）；
2. 刷新按钮（F5）同结果；页面内导航后再刷新仍 200；
3. `curl -s -o /dev/null -w '%{http_code} %{content_type}' :3080/nocobase/dist/hub/projects` = `200 text/html`；
4. API 与资产不误伤：`/nocobase/api/not-exist` 仍 404 JSON；构造不存在的资产路径 `.../assets/old-hash.js` 仍 404；
5. 深链打开的页面内悬浮球图标、favicon、路由跳转全部正常（PORTAL_BASE 重写生效的旁证）；
6. 无尾斜杠 `/nocobase/dist/hub` 浏览器最终落在带尾斜杠 portal 入口 200（不再跳出前缀）；
7. webserver 分区单测全绿（新增 ≥6 用例）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| fallback 吞掉上游真实 404 页面语义 | 低 | 仅 GET/HEAD+text/html 导航请求；用例 2/4 锁定 |
| 长前缀路由与未来新增 `/nocobase/dist/*` 部署冲突 | 低 | 前缀白名单常量集中定义，新增 portal 时显式扩 |
| 网关重启打断并行批次会话 | 低 | 安排在 D1/D2 验收完成后执行 |

回滚：revert 单提交 + 重启网关即可，无数据面影响。
