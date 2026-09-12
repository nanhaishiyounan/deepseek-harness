# Agent Note：C6 —— 网关代理持有 Portal 运行时基址，部署链持有 Portal 品牌

Status: implemented

[English](2026-09-12-c6-gateway-portal-brand-chain.md) | 中文

## 问题

统一验证本轮 FAIL 70/100，mandatory 三维度全绿：失败集中在网关同源入口（`:3080/nocobase/...`）视角的品牌面。三个 in-scope 缺陷：(1) Portal 仍是上游 demo 品牌（NocoBase logo-mark、上游 favicon、运行时文档标题以 `| NocoBase` 结尾）；(2) `systemSettings.logo.url` 是根绝对路径 `/dsh-brand-logo.svg`，admin 页面按页面 origin 解析——`:13000` 200、`:3080` 根 404、仅代理前缀下 200；(3) Portal 入口内联的 `window.NOCOBASE_PORTAL_BASE="/dist/<name>/"` 未被代理重写，`/nocobase/dist/<name>/` 下路由 basename 与全部运行时资产 URL 落空，页面从破图恶化为白屏。修复 (3) 又暴露 Portal 运行时门禁还会探测 `window.NOCOBASE_API_URL ?? "/api"`——代理下这些探测打到网关自身根（`404`/`415`）。

## 决策

- **代理重写 Portal 入口的内联运行时定义**（`rewriteNocobaseHtml`）：根绝对的 `window.NOCOBASE_PORTAL_BASE` 与 `window.NOCOBASE_API_URL` 值加上代理前缀，与既有运行时全局重写（webpack public path、API base、ws path）同构；非根绝对值原样透传。代理同时重根入口的 og:image 预览图——覆盖后的 logo-mark 挂在根绝对 `content` 属性上，href/src 重写够不到，因此命中的 meta 标签重写自身 content 值，其余 meta content 原样保留。
- **部署脚本显式注入 `window.NOCOBASE_API_URL="/api"`**（与 portal-base define 并列）。该值等于直连默认值，`:13000` 行为不变——显式 define 的意义是给代理一个可重写的稳定标记；没有它就没有可改道的内联值，门禁探测无法跟随代理。两个 define 独立注入、独立校验：入口已自带一个标记不再静默跳过另一个的注入，注入后仍缺任一标记即部署失败。
- **Portal 品牌落在部署链而非 Portal 源码**：`nocobase-portal-deploy.mts` 每次运行改写入口 `<title>`，并按字节比对覆盖 `favicon.ico` + `logo-mark.png`/`logo-mark-dark.png` 为 DSH 徽标（`dsh-logo-mark.png`，由品牌 SVG 经仓库 sharp 派生）。重建会还原上游资产，因此覆盖挂在每次拷贝之后、重跑落到相同字节；标记缺失或 `<head>`/`<title>` 缺席即 fail loud。`verify` 对全部三个覆盖资产（含 favicon）做品牌源字节比对——本地品牌资产缺失直接令 verify 失败，而不是降级为仅 MIME 探测；站名与覆盖 helper 收敛到同一模块（`examples/kb-agent/scripts/dsh-brand.mts`）。
- **源码级改动保持最小**：两处 `App.tsx` 的 `DocumentTitleHandler appName` 承载运行时标题；两 Portal 的 `BrandLogo` 改经 `assetUrl`（运行时 portal base）解析徽标，替代会在构建期烤死根绝对字符串（代理下 404）的 `import.meta.env.BASE_URL` 拼接；AI 悬浮球图标降级改经 React state——`iconFailed` 标志把 img 换成 "AI" 文本占位，与 file-thumbnail 模式收敛，不再直改 DOM style。
- **`systemSettings.logo.url` 存网关形**（`/nocobase/dsh-brand-logo.svg`）：用户真实 origin 是同源代理，其剥前缀后落到 client dist 根；`:13000` 直连是调试面，读该前缀路径渲染为 SPA HTML 兜底——接受的边界。`verify` 探上游静态根并断言网关形存储值；代理链取数是验收证据。
- **上游 footer 默认渲染**（闭环 1）：v2.2.6 `AuthLayout` 在登录页无条件渲染 `<PoweredBy />`——隔离浏览器上下文运行时核实 + 已构建的 `plugin-auth/dist/client-v2` bundle 佐证。未触碰任何 vendored 文件；QUICKSTART 合规表述改为已核实的默认行为。

## 验证

- webserver 单测 8/8（含新 portal define 重写：根绝对加前缀、相对透传）；`packages/client/ui-business` 37/37；`pnpm run typecheck`、`pnpm run lint` 0/0；`doc-sync` 绿。
- `:3080` 主链路：Portal 入口下发 `window.NOCOBASE_PORTAL_BASE="/nocobase/dist/<name>/"` + `window.NOCOBASE_API_URL="/nocobase/api"`；双 Portal 渲染数据、DSH 徽标（明暗）、DSH 标题（`销售看板 | DSH食品业务平台`、`总览 | DSH食品业务平台`）、AI 悬浮球（200 `image/svg+xml`）；零 console error。admin 登录页显示 footer "Powered by NocoBase" 与 DSH h1；侧栏 logo 加载 `/nocobase/dsh-brand-logo.svg`（200 SVG，无裂图）。
- 幂等：`nocobase-portal-deploy.mts` 双跑 `storage/dist-client` 树哈希一致；`nocobase-n25-brand.mts` 首跑漂移更新 logo url、二跑全 kept；`setup-nocobase.mts verify`（含新 portal 品牌断言组：标题、favicon、logo-mark 字节）OK。C7 复验：双跑 entry 文件 sha256 一致、favicon 字节断言拒绝单字节篡改、本地 mark 资产缺失在探测前即 throw。
- 闭环 2（图谱 click→select→details）：合成鼠标事件——81 点网格 + `sigma.graphToViewport` 精确节点坐标——均不触发 sigma 命中测试（untrusted）；可信 CDP 点击在精确节点位置能到达容器，但画布随走查刷新周期性 remount，击败 DOM 探针。链路改经 sigma 实例 API 验证（fiber 定位 `rendererRef` → `sigma.emit('clickNode')`）：详情卡渲染（截图 `demos/acceptance-c1/c1-graph-click-select-details.png`）。真实鼠标单击任一节点仍是单步人工复核项。

## 后果

- Portal 成为代理 origin 的一等公民：`/nocobase/dist/{crm,hub}/` 承载数据、认证与品牌；"仅从入口页进"的深链边界仍然适用（`:13000` 同病）。
- `:13000` 直连 admin 入口不再渲染侧栏 logo（前缀路径落 SPA HTML 兜底）；网关链是被断言的用户路径。
- `verify` 的 Portal 标题探针读部署入口 HTML；运行时标题在 Portal 源码（`appName`），由浏览器验收覆盖而非 `verify`。

## 已考虑的替代方案

- **网关根路径兜底代理品牌资产**，使根绝对 logo url 双链可用：否决——为示例资产名增加产品面路由，且违背网关默认不开代理的立场；一次存储值改动 + 前缀剥除即可在用户路径达成同效。
- **后处理构建 JS bundle** 改道烤死的 `/dist/<name>/logo-mark.png` 字符串：否决——对压缩 bundle 做字符串手术脆弱；`assetUrl` 经代理已重写的同一 define 给出运行时解析。
- **网格扫描合成点击 / DOM 探针 + 可信 CDP 点击（闭环 2）**：已尝试并如上记录；sigma 实例路径是可复现的自动化缝隙，DOM 层命中测试保持人工。
