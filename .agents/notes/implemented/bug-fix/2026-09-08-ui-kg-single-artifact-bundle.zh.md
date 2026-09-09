# Agent Note: ui-kg client bundle 必须保持单文件产物（浏览器启动阻断）

Status: implemented

[English](2026-09-08-ui-kg-single-artifact-bundle.md) | 中文

## Problem

诊断 [plans/diagnosis-2026-09-08.zh.md](../../../../plans/diagnosis-2026-09-08.zh.md) F1：任何 `dsh web` 启动后，浏览器在 1–2 秒内崩为全屏 "Failed to load plugins"。`KgGraphCanvas` 以动态 `import()` 加载 sigma/graphology/FA2——全部 `dsh.client` 包中唯一的运行时动态 import——rolldown 因此把 bundle 拆成五个哈希 chunk 加一个 `rolldown-runtime` chunk，factory 第一行同步 require 它们。浏览器模块表（`makeRequire`）只解析平台种子词、已物化记录与已注册包工厂；没有获取并执行相对路径 chunk 的通道，激活即抛错，整个插件集随之倒下——六个工作台页面全部不可用，与是否带 kb-agent patch 无关。内联渲染栈后又暴露第二层阻断：sigma 的 npm 依赖 `events` 与 Node 内置模块同名，rolldown 在 browser 平台把内置名 external 化，漏出模块表同样无法应答的裸 `require("events")`。

## Decision

### KgGraphCanvas 静态内联（packages/client/ui-kg/src/client/KgGraphCanvas.tsx）

sigma、graphology、force-atlas2 改为静态 import；构造失败（无 WebGL）仍经 try/catch 降级到关系列表——行为不变，无异步竞态，随 promise 一起删掉了 `killed` 跟踪。

### 共享 preset 的两道构建门禁（packages/client/tsdown.client.ts）

`dsh-client-single-artifact` 在任何 client bundle 产出 `client.js`(+map) 之外的 chunk 时构建失败——今后任何 dsh.client 包引入动态 import，构建在分裂源头就红，而不是死在浏览器里。`dsh-npm-package-over-builtin` 经子路径解析（`events/package.json` → main 文件）把 `events` 解析到真实 npm 包，绕过 Node 解析器的内置名匹配，让 EventEmitter polyfill 内联。

### jsdom 与路由测试

kg 测试经 `vi.hoisted` stub `WebGL2RenderingContext`/`WebGLRenderingContext` 枚举常量（sigma 在模块顶层读取；真实浏览器总是定义它们）；详情面板断言用标签区分降级列表（span）与面板（p）。`node-half.client.spec.ts` 锁定服务端事实：`client.js` 正常服务、同目录 chunk 文件拒答 404、dot-segment 与百分号编码穿越拒答。

## Alternatives considered

**经 `/plugins/<id>/<file>` 服务 chunk（诊断方向 a）。** 不作为主修复：chunk 拿到 HTTP 200 不等于能加载——模块表按设计是包粒度、同步的注册表，应答相对路径 `require("./rolldown-runtime-*.cjs")` 需要一套文件粒度加载协议（boot graph 的 chunk 行、异步却又必须同步的 require 语义）——那是新子系统，不是修复。单文件输出是别处早已成立的契约：`entryFileNames: 'client.js'` 钉死它，其余全部 ui-\* 包都这样构建，`files` 发布清单从未包含 chunk 文件——拆分产物在真实安装里本来就是坏的，与开发服务器无关。体积代价有界：ui-kg 无 `immediately` 标记，只有打开图谱页的会话才拉取，内联后 76KB gzip。

**经模块表保留懒加载（给 sigma 声明 `dsh.client.external` 行）。** 否决：模块表行应答的是表自己拥有的包 id；sigma 是普通库不是 dsh 包——该行没有供给方，组合会拒绝它。

## Consequences

- 重建后的 ui-kg lib 恰好是 `client.js`（426.7KB / 76.3KB gzip）加 map；`curl /plugins/@deepseek-ai/dsh-client-ui-kg/client.js` 返回 200、浏览器 console 干净——六个工作台页面可导航可渲染，图谱页 seed 搜索 → 子图游走 → 节点列表链路端到端可用（无 WebGL 的 headless Chrome 按设计降级为关系列表）。
- 今后任何 dsh.client 包的动态 `import()` 会让 `pnpm run build` 以 single-artifact 错误失败，而不是发布一个浏览器里必坏的 bundle。
- jsdom 环境在 import KgView/KgGraphCanvas 前需要 hoisted 的 WebGL 枚举 stub；两个 spec 文件内联携带。
- 同批同记：F2（setup-nocobase 的 `all` 链 verify 经共享 `resolveEnv` 回读刚写入的 `.env`，README 首条命令退出码 0）与 F3（launcher flag 顺序契约——启动器 flag 在 web 应用自有 flag 之前——写入 README.md/README.zh.md 与 QUICKSTART.zh.md，附实测过的 `dsh web --patch <file> --no-open` 形态；commander 透传语义按设计保留）。
