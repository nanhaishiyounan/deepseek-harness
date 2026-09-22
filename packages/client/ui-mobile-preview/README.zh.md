# @deepseek-ai/dsh-client-ui-mobile-preview

[English](README.md) | 中文

PC 工作台的移动端预览会话视图：390×844 手机壳内嵌同源 `/mobile` 页面的 iframe。内嵌客户端完全可交互——在 PC 会话内切到本视图即可完成任务卡操作而无需离开工作台（演示路径）。view-context 投影按设计降级为标题级：iframe 内部状态不进入模型可见报告。

- 在 `conversation.view` 槽注册 `mobile-preview` 条目（标签「移动端预览」），附 zh/en 双语命名空间。
- 手机壳按会话正文尺寸自适应缩放（`ResizeObserver`）；指针事件穿透 transform，缩放后内嵌页面仍可操作。
- `/mobile` 由 web-app bundle 的 `mobileEnabled` 配置提供；未启用时 iframe 显示网关的 404 内容。

## Model Experience

无。本视图是浏览器侧 UI 插件层，除标题级（不含 iframe 状态）的 view-context 投影外不注册任何模型可见表面。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- 从外部驱动 hash 深链时 iframe 会整页重载；PC 壳与内嵌客户端之间没有 postMessage 通道。
- 未启用 `mobileEnabled` 的部署在手机壳内渲染网关的 404 内容；本视图不预探可用性。
