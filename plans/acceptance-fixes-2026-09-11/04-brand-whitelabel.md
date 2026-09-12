# 批次 C4：NocoBase 平台品牌白标 + AI 员工悬浮图标修复

> 隶属 [PLAN.md](PLAN.md)。前置：C2（新窗口入口形态已定）、C3（Portal 页面有数据，白标截图才有意义）。改动面 = `examples/kb-agent/scripts/`（新品牌脚本 + portal-deploy 注入）+ 自研 SVG 资产；**不改 platform/nocobase 快照源码（MANIFEST local-modifications 保持为空）**。回滚 = revert 脚本提交 + systemSettings 由 reset→all 恢复默认后重跑新链（或反向跑旧链）。

**目标**：admin 端 logo/站名换成自研品牌；Portal 右下角 AI 员工悬浮图标真实加载；favicon 更新；许可边界内的文案替换；全部幂等接入 `all` 链。

## 根因与替换面（调研结论）

### AI 员工图标挂掉根因（本批核心修复点）

Portal 悬浮球 `<img src="http://127.0.0.1:13000/assets/nocobase-ai-chat-*.svg">`——URL 缺 `/dist/crm` 部署前缀，gateway SPA fallback **伪 200 返回 text/html**（naturalWidth=0，图标空白）。证据链：同 URL fetch 200 但 content-type text/html；带前缀 `/dist/crm/assets/...` fetch 200+image/svg+xml（文件真实存在）；源头 = [`nocobase-portal-deploy.mts:41`](../../examples/kb-agent/scripts/nocobase-portal-deploy.mts) 裸 `pnpm build` 未注入 [`vite.config.ts:56,63`](../../platform/nocobase-portals/demo-portal-crm/vite.config.ts) 原生支持的 `NOCOBASE_PORTAL_BASE`。admin 端（plugin-ai ChatButton，`/static/plugins/...` 路由）实测正常，不用修。

### logo/文案替换面清单

| 替换点 | 机制 | 本批处理 |
|---|---|---|
| admin 侧栏 logo（v1+v2 客户端）+ 登录页 h1 + document.title 后缀 | 数据库 `systemSettings.logo/title`（官方 UI 与 REST `systemSettings:put` 双通道，[plugin-system-settings/server.ts:89-101](../../platform/nocobase/packages/plugins/@nocobase/plugin-system-settings/src/server/server.ts)） | ✅ 新脚本 upsert |
| 浏览器 favicon | 构建产物静态资源（`packages/core/app/client{,-v2}/public/favicon/`），无数据库项 | ✅ post-build 覆盖 |
| 静态 `nocobase.png`（无 logo 配置时的 fallback） | 构建产物 | ✅ post-build 覆盖 |
| Portal 品牌位（"Salesroom CRM" + 纯 CSS logo + `appName="NocoBase"` 后缀 + 登录文案） | vendored portal 源码/locales | ⚠️ 仅 `NOCOBASE_PORTAL_BASE` 注入（修图标）；portal 源码品牌文案改动属上游 fork 管理，超出本轮（登记） |
| footer "Powered by NocoBase" | 商业插件 `plugin-custom-brand`（不在 OSS 快照） | ❌ LICENSE §5.2 禁移除，显式声明保留 |
| AI 员工头像 | `aiEmployees.avatar` 数据库字段（N17 脚本已有 upsert 先例） | ✅ 顺带对齐（如需换头像资源） |

### 许可合规硬边界（写入用户文档）

[platform/nocobase/LICENSE.txt §5.2](../../platform/nocobase/LICENSE.txt)：OSS 版**仅"页面左上角主 LOGO"允许移除/更换**；其余品牌、名称、链接不得移除或更改。本批白标范围 = logo + 站点标题 + favicon；QUICKSTART 新增白标节显式声明此边界（§6.4 商业许可才可全量白标）。

## 改动面

### 1. 自研 logo 设计（批内产出）

- 设计要求：对齐仓库 [BRAND_GUIDELINES.zh.md](../../BRAND_GUIDELINES.zh.md) 与 DSH 现有品牌资产（[apps/web/public/favicon.svg](../../apps/web/public/favicon.svg)）的风格基调；食品行业 KB+Agent 产品语义；SVG 矢量（admin logo 与 favicon 双用途；favicon 另出 .ico/.png 尺寸档）。
- 产出方式：SVG 生成（svg-generator 模式思路：尺寸/配色/风格自定义、产物落 examples/kb-agent/workspace/assets/brand/ 或脚本资源目录）；站名沿用 DSH 产品品牌（具体名称实施时从 BRAND_GUIDELINES 取，不自造新名）。
- 验收口径：明暗主题下均清晰可辨；浏览器实际渲染截图。

### 2. 品牌脚本（N19 风格幂等 upsert）

新脚本 [`nocobase-n19-brand.mts`](../../examples/kb-agent/scripts/)（命名沿用 n 系列编号，实际编号实施时按既有序号顺延）：
- `systemSettings:put` upsert `title`（新站名）与 `logo`（SVG 经附件上传 API 存 file-manager，取 URL 写入——复刻 [plugin-system-settings/server.ts:19-46](../../platform/nocobase/packages/plugins/@nocobase/plugin-system-settings/src/server/server.ts) install 时的上传模式）；
- 挂进 [`setup-nocobase.mts`](../../examples/kb-agent/scripts/setup-nocobase.mts) `all` 链（模块重放段之后、verify 之前，与 n17/n18 同模式）；
- verify 断言：`systemSettings:get` 的 title 等于新站名、logo URL 200；
- 双 Portal 探活断言扩展：悬浮球图标 URL fetch 200 + `image/svg+xml`（当前伪 200 正是漏网之鱼——UI 探活要校验 content-type 不是 text/html）。

### 3. Portal 部署注入 `NOCOBASE_PORTAL_BASE`（修 AI 图标根因）

[`nocobase-portal-deploy.mts`](../../examples/kb-agent/scripts/nocobase-portal-deploy.mts) `run('pnpm', ['build'], source)` 处按 PORTALS 常量已有的 `base` 字段（:22-23 `/dist/crm/`、`/dist/hub/`）注入构建环境：

```ts
if (!run('pnpm', ['build'], source, { NOCOBASE_PORTAL_BASE: portal.base })) throw ...
```

（spawnSync env 合并 process.env；vite.config 读该变量产出带前缀的资源 URL。）重跑部署后悬浮球 src 变为 `/dist/crm/assets/...` 真实路径。**注意**：该脚本不进 `all` 链（独立命令），QUICKSTART 补一句品牌/图标变更需重跑 portal 部署。

### 4. favicon / nocobase.png post-build 覆盖

在品牌脚本（或 setup 的 build 后置步骤）加目录覆盖：自研 favicon 覆盖 `platform/nocobase/packages/core/app/dist/client{,-v2}/public/favicon/` 与 `nocobase.png`——幂等 = 文件复制；`yarn build` 重建会冲掉覆盖，因此必须挂在 build 步骤之后（[setup-nocobase.mts stepBuild](../../examples/kb-agent/scripts/setup-nocobase.mts) 之后执行或 all 链内置重放）。dist 被 MANIFEST 排除，不产生 local-modifications 登记。

### 5. 文档

- [QUICKSTART.zh.md](../../examples/kb-agent/QUICKSTART.zh.md) 新增「品牌白标」节：覆盖面、重跑方式（改 logo 后重跑品牌脚本 + portal 部署）、**LICENSE §5.2 合规边界声明**（footer 保留）；
- Agent Note：白标方案裁决（A+B 组合、许可边界、portal 源码品牌位登记为后续）。

## 验收断言

1. 真实起服浏览器实测（截图落 `examples/kb-agent/demos/acceptance-c4/`）：
   - `:13000` 登录页 h1 与 admin 侧栏显示自研 logo + 新站名（明暗检查）；
   - 浏览器标签 favicon 更新（`/favicon/favicon.ico` 返回新资源，content-type 正确）；
   - Portal（`/dist/crm/`）右下角 AI 员工悬浮球图标真实渲染（截图放大特写；`naturalWidth>0`）；
   - footer "Powered by NocoBase" 保留（合规断言）；
   - DSH 新窗口入口（C2 产物）打开后同上品牌一致。
2. HTTP 断言：`GET /dist/crm/assets/nocobase-ai-chat-*.svg` 200 + `image/svg+xml`；`GET /favicon/favicon.ico` 200 非 text/html；`systemSettings:get` title/logo 正确。
3. 幂等：品牌脚本二跑 kept；reset → `all` 后品牌自动恢复（链内置）；verify 新断言组全绿。
4. `pnpm run test && pnpm run lint && pnpm run typecheck && pnpm run doc-sync` EXIT=0。

## 风险与回滚

| 风险 | 预案 |
|---|---|
| SVG 上传为 systemSettings.logo 后渲染尺寸/留白不佳 | logo 设计含紧凑方形版（sidebar 小尺寸场景）；实测截图裁决 |
| favicon 覆盖被 `yarn build` 冲掉（all 链内 build 重跑） | 覆盖步骤挂 build 之后（改动面 §4 已定）；verify 加 favicon 断言兜底 |
| PORTAL_BASE 注入后 portal 内部路由跳转异常（深链 404） | 上游 vite base 语义原生支持部署前缀；verify 双 portal 探活 + 页面走查（handoff 已知深链限制不变） |
| 品牌资源进 git 的体积/许可问题 | 自研 SVG 无第三方许可问题；ICO/PNG 由 SVG 派生，进 examples/kb-agent/workspace/assets 或脚本 resources 目录 |
| 白标范围被误读为"全量替换" | QUICKSTART 合规边界声明 + 收口报告向用户明确 OSS/商业差异 |

回滚：revert 脚本与资产提交；数据面 `systemSettings` 由 reset→all 恢复 install 默认（NocoBase 官方 logo）后，如需再回白标态重跑品牌脚本即可。
