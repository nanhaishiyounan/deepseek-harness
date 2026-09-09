# Agent Note: NocoBase 反向代理放在 host webserver，并补 WebSocket upgrade 转发

Status: implemented

[English](2026-09-08-webserver-nocobase-proxy.md) | 中文

## Problem

kb-agent 业务页通过反向代理把 NocoBase 管理界面以同源 iframe 内嵌。截至批次五，该代理放在 `packages/host/webserver`（`nocobase-proxy.ts`），最终统一验证指出这是分层偏离：webserver 包自述"不了解 harness 概念、不提供文件服务"，如今却代理起了业务后端。另一个独立断点：代理把入口 HTML 的 `__nocobase_ws_path__` 重写为 `/nocobase/ws`，但只注册了 HTTP 前缀 route——没有 upgrade route——iframe 内 NocoBase 的 WebSocket 握手落到 HTTP handler 上失败，浏览器 console 出现无限重连报错（HTTP 轮询兜底让功能无损，但踩了 console 红线维度）。

## Decision

### 放置：业务反向代理留在 host webserver

`/nocobase` 代理是浏览器 HTTP 服务器上的一条 route，不是 harness 概念：它转发字节、剥离 framing 防护头，没有任何行为触及模型请求或会话。webserver 本就拥有代理所需的全部机制——具名前缀 route、带 upgraded-socket 跟踪销毁的 upgrade 注册表、最长前缀匹配——再起一个服务器（或一个自带端口的独立代理插件）会复制载体，还逼 iframe 走第二个 origin。README 的所有权声明从"不了解 harness 概念，也不提供文件服务"改为"不提供文件服务"，并显式枚举归本包所有的这一条业务 route。代理保持默认关闭：`nocobaseProxyOrigin` 缺省即不注册 route——未认证的网关不得默认代理业务后端，须部署显式开启。

### WebSocket upgrade 转发（`createNocobaseWsUpgradeHandler`）

设置 `nocobaseProxyOrigin` 时在同一个 effect 里同时注册 `/nocobase` HTTP 前缀 route 与 `/nocobase/ws` upgrade route（一个 disposer 同时移除两者）。upgrade handler 重放握手头（除 `host` 全部透传，另加 `x-forwarded-host`/`x-forwarded-proto`），原样转发上游的 101 状态行与响应头，先写回两侧可能已到的早期帧，再对 socket 对做双向 pipe。任一侧关闭即销毁对端——没有这条联动，半开的 pipe 会让对端等一个永远不会关闭的 socket，集成测试正是以 teardown 挂死暴露了这一点。上游对 upgrade 回普通响应（如鉴权失败）时，状态行与头先原样转发、body 随后透传，iframe 看到的是真实拒绝而不是连接中断。

### 验证

`nocobase-proxy.spec.ts` 以真实 `WebServer`（cordis 组合、OS 分配端口）对手搓的 RFC6455 echo 上游（零新依赖）做端到端断言：原生客户端 socket 收到 101 状态行与 `upgrade`/`connection`/`sec-websocket-accept` 头、`sec-websocket-key` 完整到达上游、一个 masked 帧经代理往返 echo、两侧服务器干净收尾。

## Alternatives considered

**iframe 内禁用 NocoBase ws 客户端（把 `__nocobase_ws_path__` 重写为禁用值）。** 否决：靠砍功能消音，轮询兜底成为唯一通道，还把客户端行为假设（禁用值会被遵守）固化进服务端重写。upgrade 转发只在本包既有机制上加了约 50 行。

**独立反代插件自持端口。** 否决：为一条 route 多一个监听端口、为 iframe 多一个 origin、多一套 upgrade 注册表——只为保住一句 README 措辞，改措辞更诚实。

**前置真正的反代（nginx/caddy）。** 否决：webserver 已声明的 dev-facing v1 姿态是单 `node:http` 进程、零外部依赖；部署加固本就明确不在范围。

## Consequences

- webserver 包持有一条业务 route 族，README（双语）与 config schema 已如实记录；本包若再出现业务后端气味的东西，应重开本决策而不是自然增殖。
- iframe 的 NocoBase WebSocket 流量与应用同 origin 同端口，关闭了 console 重连循环；轮询兜底保留为 upgrade 路径损坏时的自然降级。
- README 双语所有权措辞与包描述一并修改；"knows no harness concepts"的声明退役，而不是被绕开。
