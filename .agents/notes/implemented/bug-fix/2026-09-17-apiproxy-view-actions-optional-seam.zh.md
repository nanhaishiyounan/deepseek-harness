# Agent Note: apiproxy view-actions 可选缝——无浏览器面则无 provider

Status: implemented

[English](2026-09-17-apiproxy-view-actions-optional-seam.md) | 中文

## Problem

`createApiProxy` 无条件注册 view-actions provider，且 `ApiProxyService` 在 static `inject` 里声明了 `'viewActions'`。vendored Cordis 的 inject 条目全部是必需依赖（"it only loads while all are available"，[vendor/cordis/src/registry.ts](../../../../vendor/cordis/src/registry.ts)）——没有可选语法。两个后果：

1. 不带浏览器面直接组装 proxy 的 keyless harness（`examples/kb-agent/tests/market-pages.spec.ts`、`examples/kb-agent/tests/data-routing.spec.ts`）在构造时崩溃：`ctx.viewActions` 为 `undefined`，`.registerProvider` 抛错。
2. 任何在没有 view-actions 服务的组合里挂载网关的部署，`ApiProxyService` 会永远等待，静默地没有 HTTP 面。

## Decision

把该缝当作可选，对齐同文件里 `ctx.get('approval')` 的先例（[api-proxy.ts](../../../../packages/host/apiproxy/src/api-proxy.ts)）：provider 注册移入 `createApiProxy` 内的 `ctx.inject(['viewActions'], …)` 子 fiber，`'viewActions'` 从 `static inject` 移除。子 fiber 在服务可用时注册 provider——组装行序不承载加载语义，晚于网关挂载的服务同样会激活该 fiber——返回的 disposer 注销 provider 并把 pending apply 结清为 `APPLY_ABORTED`；在无浏览器面的 host 里它永远保持 pending，`view_apply` 由服务本身报 `NO_PROVIDER`：没有浏览器的会话得到的就是这个诚实答案。

## Alternatives considered

**给两个 harness 补挂 ViewActionService。** 否决：掩盖了真实边界——纯 API 会话没有视图面，harness 的组装方式本身是合法的。

**构造时同步 `ctx.get('viewActions')` 判空。** 否决：激活由服务可用性驱动、无行序保证，网关可能在服务挂载之前激活，从而永远注册不上。

## Consequences

服务已存在时，fiber `_reload` 在 `ctx.inject` 之后一个 microtask 内执行回调，因此先 `await ctx.plugin(ViewActionService)` 再调 `createApiProxy` 的 harness 仍会在首次使用前看到 provider 已注册。服务重启时子 fiber 卸载并重新注册 provider，没有 `DUPLICATE_PROVIDER` 窗口：fiber disposer 先注销。

## Testing

apiproxy 包 445 测试 / 27 文件全绿；两个 kb-agent harness 全绿；全量 `pnpm run test` 绿。
