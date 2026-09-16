# @deepseek-ai/dsh-view-actions

[English](README.md) | 中文

视图动作抽象缝（`ctx.viewActions`）：agent 工具调用可以调整浏览器工作台视图——过滤、聚焦、视图内查询、切 tab——并等待执行器返回可读摘要。Service Definition 维护单 provider 槽位与调用方存活边界；网关注册的 provider 走 `view-action/requested` wire 通道（question 通道的同构兄弟），模型面工具在 `@deepseek-ai/dsh-tool-view-actions`。

## 所有权边界

`apply()` 执行与 user-questions 相同的运行时所有权边界：传入的 agent 必须是注册表里存活的同一实例，且不被其他存活 agent 拥有。被拥有的子 agent 没有可服务它的浏览器，只会阻塞到 provider 超时；带血缘的会话作为新运行时根恢复后可正常 apply。

## 已知限制与后续工作

- 每次调用携带一个动作；把多个动作组合成事务性 apply 留后（模型以顺序调用组合）。
- provider 是进程单例：第二个注册立即失败，不对浏览器做负载均衡。
- `apply_view_patch` 文档型 patch 工具（RFC 6902 子集，打在 tab ViewModel 上）留到后续轮次。
