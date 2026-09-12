# Agent Note: Portal AI 图标修复 —— window.NOCOBASE_PORTAL_BASE 是运行时定义，不只是构建开关

Status: implemented

[English](2026-09-12-portal-base-runtime.md) | 中文

## 问题

CRM/Hub Portal 的 AI 员工悬浮球图标空白：`<img>` 解析到 `http://<origin>/assets/nocobase-ai-chat-*.svg`——origin 根——NocoBase 网关用 SPA 的 HTML fallback 应答（HTTP 200、`text/html`），`naturalWidth` 恒 0。计划把根因钉在 `nocobase-portal-deploy.mts` 裸构建未注入 `NOCOBASE_PORTAL_BASE`——这只对了一半：缺失该 env 确实破坏构建期静态引用，但注入后重建**并没有**修好悬浮球。部署产物里图标走 vite 的运行时资源机制，产物代码是 `new URL(path, new URL(window.NOCOBASE_PORTAL_BASE || "/", window.location.origin))`——**页面加载时的 window 全局**，入口 HTML 未定义，于是所有动态解析的资源无论构建期 base 是什么都回落到 `/`。同批完成 admin 面的品牌白标（logo、站名、favicon，OSS 许可边界内）。

## 决策

### 双通道部署期注入：构建 env + 入口 HTML 全局

`nocobase-portal-deploy.mts` 现在把 `NOCOBASE_PORTAL_BASE=/dist/<portal>/` 传入 `pnpm build`（vite 重写 HTML 里的静态引用），并在 dist 拷入网关 `dist-client` 后向 `<head>` 顶部注入 `<script>window.NOCOBASE_PORTAL_BASE="/dist/<portal>/"</script>`，让运行时 `new URL` 链在前缀下解析。注入是构建产物后处理——vendored portal 源码不动（快照 local-modifications 表保持为空）。真实服验证：`window.NOCOBASE_PORTAL_BASE === '/dist/crm/'`，悬浮球 src 变为 `/dist/crm/assets/nocobase-ai-chat-*.svg`，图片真实加载（`naturalWidth` 878）；双 Portal 图标 URL 均 200 + `image/svg+xml`。

### 白标 logo 放公共静态资源，不进附件仓库

第一版经 `attachments:create` 上传 SVG 并把 `systemSettings.logo` 指向附件行。登录态可用，但附件库 ACL 拒绝匿名读取——而登录页在没有任何会话之前就要渲染 logo。最终形态复用 plugin-system-settings 自己的 install fallback：`systemSettings.logo` 携带纯对象（`{ title, filename, extname, mimetype, url }`），url 指向 `/dsh-brand-logo.svg`——品牌脚本在 `yarn build` 后覆盖进构建客户端根目录的文件。同一覆盖步骤替换 `favicon/favicon.ico` 与 `nocobase.png` 兜底，字节比对让重建（还原官方资源）与重跑收敛；`all` 链重放该脚本，reset 后品牌自动恢复。

### 品牌资产与许可边界

徽标是原创 SVG（DSH 品牌蓝 `#4176E6` 圆角方底，白色叶形尖端生长出三节点知识簇——食品行业 KB+agent 的产品语义），真源在 `examples/kb-agent/workspace/assets/brand/`，含紧凑 favicon 版与派生 `.ico`/`.png`。站名 `DSH食品业务平台` 遵循仓库品牌规范（DSH 短标识，不用完整商标）。LICENSE §5.2 把 OSS 白标范围限定在左上角主 LOGO；footer "Powered by NocoBase" 与其余品牌位保留，QUICKSTART 白标节载明边界声明。

## 已考虑的替代方案

**仅构建期 base。** 被证据否决：悬浮球 URL 在运行时按 window 全局计算，构建开关单独留着它照样裂。

**改 Portal 源码硬编码前缀。** 否决：为产物注入就能解决的事去搅动上游 fork。

**附件背书 logo + 改 ACL 规则。** 否决：纯对象形态就是插件自身无 file-manager 时的先例，零权限手术。

## 后果

双 Portal 悬浮球正常渲染（此前所有挂载页空白）；admin 侧栏、登录页标题、document.title、favicon 呈现 DSH 品牌；NocoBase 客户端 `yarn build` 不再无声抹掉覆盖——`all` 链与 verify 复核（favicon content-type、logo SVG 可取、systemSettings 标题/logo、每 Portal 图标 URL + content-type 全部钉进 verify 断言，漂移即链红）。verify 的图标探针从部署目录定位哈希资源而非抓入口 HTML——悬浮球是运行时 import，HTML 抓取产生假阴性。Portal 深链直开仍 404（已知边界，不变）。
