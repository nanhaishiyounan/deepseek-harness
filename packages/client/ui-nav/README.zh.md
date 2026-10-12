# @deepseek-ai/dsh-client-ui-nav

[English](README.md) | 中文

dsh web 客户端的豆包式主导航列。插件占据 layout 拥有的 `nav` 列，外壳声明 `sidebar.nav` 菜单座位；每个功能页（kb 工作台、场景门户、市场、连接器、kg、业务、移动预览……）向该座位贡献自己的菜单行，导航完全由插件组成——摘除某页插件，它的行随之消失。

## 组合

- `ctx.slots.inject('nav', …)` 注册 `NavRoot`（列框架：可滚动菜单区与底部折叠开关）并声明 `sidebar.nav` 列表座位。
- 座位的公共注入面向每行提供：
  - `useNavState` —— view-context 导航状态钩子（已解析活动屏 + 切换可用性），用于活动行高亮；
  - `activate(view)` —— 激活通道：经挂载的 header rider 切换当前会话视图；无会话时打开可复用空白会话并有界重试。
- 插件自身注册 `chat` 行（`ChatNavItem`，order 0）。功能页沿用各自旧 `conversation.view` 顺序（kb=10 … mobile-preview=16）注册行，保持心智连续。

## API

- `apply` / `inject` —— cordis client 插件体（`slots`、`locale`、`layout`、`workspaces`、`viewContext`）。
- 契约导出：`SidebarNavItemOwnerProps`（`{ wide }`）、`SidebarNavSlotInject`（座位公共注入面）、`NavRootComponentProps`、`ChatNavItemProps`。

## 事件

无。插件纯展示；视图切换走 view-context 服务，面板几何走 layout 服务。此处无模型可见内容，不涉及会话事件。

## 扩展点

向 `sidebar.nav`（列表，根作用域）注册：`{ id, order, label }` 加你的行组件。组件收到 `{ wide }` 拥有者 props、座位的 `useNavState`/`activate` 注入与标准 locale 座位。把对应的 `conversation.view` 条目标记 `hidden: true`，头部 tab 环便收起其 tab 而视图仍可解析。

## 模型体验

无：本客户端页只渲染与模型无关的读取；所有 prompt、schema、工具面都在服务端包。

#### KV Cache 影响

独立于模型请求流：客户端页读取从不进入请求，本包既不追加也不失效任何可复用请求前缀。


## 已知限制与遗留工作

- 激活是尽力而为：完全没有工作区时无法打开空白会话，行点击落在聊天主页（与已退役的 footer-action 条目对等）。
- 各行拥有自己的图标/标签/徽标与各自的规范导航项 CSS 副本；外壳只拥有列框架与排序。
