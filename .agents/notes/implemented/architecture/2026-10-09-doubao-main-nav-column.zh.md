# Agent Note：单侧边栏内的豆包式主导航与视图环隐匿条目

Status: implemented

[English](2026-10-09-doubao-main-nav-column.md) | 中文

## 问题

桌面壳曾把每个功能面都暴露为 `conversation.view` tab：工作台页面齐装时会话头部挂着九枚 tab（chat、kb、scenarios、market、connectors、kg、business、trajectory、mobile-preview），侧栏底部又把其中五个复制成图标入口。W24 的目标产品形是豆包网页版形态——**一根**侧边栏同时承载功能菜单与会话浏览器，会话头部只留 会话/轨迹。缺两块机制：住在侧边栏内部的插件化菜单区块；以及让一个页面继续作为视图可达（其组件、按会话状态、深链与 view-context 投影全部骑在视图环上）同时其 tab 从头部消失的手段。

## 决策

侧边栏新增 `sidebar.nav.host` 席位（single、root 作用域、owner 为 `{ wide }`），渲染位置在新会话按钮与会话浏览器之间，一条发丝线把菜单与会话区分开；侧边栏保留既有三轨框架几何（`sidebar | center | details`，264–420 px 拖拽、56 px rail）与自身的折叠开关——没有第二根左列。`packages/client/ui-nav` 以纯铬菜单区块（`NavRoot`：行距 + 40 vh 滚动钳制）占据该席位，并声明 `sidebar.nav` 列表席位供各功能页贡献菜单行——chat 行随 ui-nav 自带；kb（10）、scenarios（10.5）、market（11）、connectors（12）、kg（13）、business（14）、mobile-preview（16）、cordis-panel（17）沿用旧 order 保持心智连续。席位的槽级 inject 给每行 `useNavState`（view-context 新可观测源 `ViewContextService.navState` 暴露的活动屏幕 + 可切换性）与 `activate(view)`——经已挂载的头部 rider 切换，无已发布切换时打开可复用空白会话并有限重试（约 3 秒）；菜单行不再自建视图桥。侧栏 rail 态下行渲染为 36 px 图标方块带 tooltip，随整列折叠动画。

环隐匿是 slot 注册表选项：列表条目可注册 `hidden: true`。`viewTabs()` 投影该标志，`ConversationSessionHeader` 在 tab 环与环计数可见性判定两处过滤它，而 `resolveActiveView` 保持隐匿条目可解析——nav 点击选中隐匿视图时照常渲染。退役的 `sidebar.footer.action` 槽整体删除（声明、契约类型、渲染点）；五个注册者迁入 `sidebar.nav`，`ui-cordis` 一并迁移。移除某功能插件只移除其菜单行——以禁用 ui-business 重启实机验证。

账号/登录位（豆包形态的左下角）即侧边栏既有设置席位；桌面壳当前无登录面（匿名身份），真正的登录随 B7 carbon 身份切换落位。

## 备选方案

- 侧栏旁再加一根专用 nav 列：先建成，产品评审后撤回——豆包形态是一根侧边栏装下会话与功能；第二根左列读作两条竞争的导航轨，且别的问题一个也没多解决。
- 彻底撤出七个 `conversation.view` 注册、把页面挂进新的中区槽：否——按会话视图状态、kg 种子深链、view-context 投影与所有驱动 `setView` 的 e2e 全部搁浅，行为零收益。
- 在 ui-conversation 内以 ui-nav 持有的 id 集合过滤环：否——把会话包耦合到兄弟插件，且对其他组合隐藏机制；`hidden` 选项让注册表仍是列表条目显示事实的唯一来源。

## 后果

框架保持三轨网格；窄视口（< 1024 px）下整根侧栏收 rail（菜单行变图标，与会话并列）。菜单区块以 40 vh 钳高，功能集增长时在区块内滚动而不是挤死会话浏览器。`activate` 尽力而为：完全没有工作区时行点击落在 chat 主视觉（与退役 footer 条目同等）。菜单行各自拥有图标/标签/徽标，并携带一份导航行规范 CSS 的拷贝（36 px 行高、软填充 + 品牌强调条的激活态、rail 方块带 tooltip）——视觉一致性靠约定，与退役的 footer 条目相同。`hidden` 骑在 ui-slots 的 `StoredEntry.options` 上，该静态包的 `lib/` 构建过期会静默丢掉标志（B1 起服时实测发现）：改完 shell 静态包后，先跑完整 build 再探测在线服务。

交叉链接：[槽声明注入](2026-08-05-slot-declaration-injection.zh.md)拥有 nav 行依赖的「声明前休眠」语义；[槽类型链](2026-07-22-slot-type-chain-implementation.zh.md)拥有 `hidden` 选项所扩展的组合模型。
