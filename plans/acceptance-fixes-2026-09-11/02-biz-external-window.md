# 批次 C2：业务后台改新窗口打开（去 iframe，留外链入口卡片）

> 隶属 [PLAN.md](PLAN.md)。前置：无。范围裁决（用户已确认）：**仅去掉页底 NocoBase iframe 嵌入区块，换成「新窗口打开业务后台」外链入口卡片；对话式管理主体（对象切换器/实体卡/表格/问数框）保留；页签环不动**。回滚 = revert 本批提交。

**目标**：DSH 内不再嵌入 NocoBase 平台；业务后台在浏览器新标签页打开；DSH 内留一张信息完整的外链入口卡片。

## 现状（改动点全景）

iframe 唯一渲染点与链路证据见 [PLAN.md §1.2](PLAN.md)。改动集中于 `packages/client/ui-business` 前端 + 文档面；**webserver 反代、apiproxy `nocobase.listMeta` 数据面、三 slot 注册全部保留**（反代用途从"iframe 同源化"变为"新窗口的同源入口"）。

## 改动面

1. [`BizView.tsx`](../../packages/client/ui-business/src/client/BizView.tsx)：
   - 删 `embedOpen` state（:66）与 iframe 段（:220-222）；
   - `embedZone` 区块（:214-223）改造为外链入口卡片：`<a href="/nocobase/" target="_blank" rel="noopener noreferrer">`——语义化 `<a>`（保留中键/Cmd+点击、右键复制链接、无障碍 link 语义），`rel="noopener noreferrer"` 必带；卡片信息架构 = 标题 + 一句话说明 + URL 展示 + 打开按钮（文案沿用 `embed.openHint` 的「低频管理辅助…打开后需登录，账号见 QUICKSTART」语义）；
   - 视觉对齐同页 `entityCard`（[business.module.css:101](../../packages/client/ui-business/src/client/business.module.css)：border-l1 + radius12 + bg-layer-1 + hover 抬升）与 hero 场景卡基调，alias token、明暗两套。
2. [`business.module.css`](../../packages/client/ui-business/src/client/business.module.css)：删 `.embedFrame`（:218-224）；`.embedZone/.embedHint`（:204-216）改造为卡片容器风格。
3. [`locales.ts`](../../packages/client/ui-business/src/client/locales.ts)：`embed.*` 四 key（:35-38 定义、:69-72 zh、:104-107 en）改语义——`embed.open` →「在新窗口打开业务后台」，删 `embed.frameTitle`，zh/en 同步。
4. 模块 JSDoc 与包文档同步：[`BizView.tsx`](../../packages/client/ui-business/src/client/BizView.tsx) 头注释（"NocoBase embed entry ... /nocobase proxy"表述）、[`client/index.ts`](../../packages/client/ui-business/src/client/index.ts) 头注释、ui-business [README.md](../../packages/client/ui-business/README.md)/[README.zh.md](../../packages/client/ui-business/README.zh.md) 嵌入描述（doc-sync 门禁联动）。
5. 用户文档：[`QUICKSTART.zh.md`](../../examples/kb-agent/QUICKSTART.zh.md)（:129「业务管理页『高级配置』的 iframe 内嵌同一后台」、:243「高级配置：/nocobase 反代把业务后台同源嵌进页面」）改为新窗口入口表述；[docs/subsystems/web-server.md:44](../../docs/subsystems/web-server.md)（及其 zh 配对）、[docs/config-catalog.md:1019-1021](../../docs/config-catalog.md) 中"iframe 内嵌"表述同步——按 [dsh-doc-site-sync](../../.agents/skills/dsh-doc-site-sync/SKILL.md) 流程走双语配对。
6. 测试：[`bizview.client.spec.tsx`](../../packages/client/ui-business/tests/bizview.client.spec.tsx) :138-144"reveals the embed iframe on demand"改为断言外链 `<a>` 的 href=`/nocobase/`、target=`_blank`、rel 含 noopener；文件头注释（:5-7）同步。
7. Agent Note（非平凡变更义务）：记录"iframe → 新窗口入口卡"的产品裁决（用户原话 + 方案 A 确认）与反代保留理由。

**明确不动**：[`nocobase-proxy.ts`](../../packages/host/webserver/src/nocobase-proxy.ts) 及其 spec、[cordis.patch.yml:315-319](../../examples/kb-agent/cordis.patch.yml) `nocobaseProxyOrigin`、三个 slot 注册（[client/index.ts:116-156](../../packages/client/ui-business/src/client/index.ts)）、BizView 管理主体（:103-212）、apiproxy nocobase 域。

## 验收断言

1. 真实起服浏览器实测（先重启网关）：
   - 业务管理页 DOM 无任何 `iframe` 元素（可断言 `page.locator('iframe')` 计数为 0）；
   - 入口卡片点击打开新标签页（context 事件 page 新建），URL 为 `${origin}/nocobase/`，NocoBase 登录页可达、登录后有数据（admin@nocobase.com/admin123）；
   - 中键/Cmd+点击可开新窗；右键可复制链接；
   - 明暗两套截图 + 点击动线 GIF（record-browser-gif，GUI 行为变更 PR 必附）落 `examples/kb-agent/demos/acceptance-c2/`。
2. `bizview.client.spec.tsx` 新断言全绿；apps/web e2e 无业务管理 iframe 断言（已核实无影响），`test:web`（official profile 构建）全绿。
3. `pnpm run lint && pnpm run typecheck && pnpm run doc-sync` EXIT=0（README/QUICKSTART/subsystems 文档双语配对完成）。

## 风险与回滚

| 风险 | 预案 |
|---|---|
| 新窗口内 ws 握手失败延续（Phase4-exploration 曾录 25+ 次 `/nocobase/ws` 失败） | 本批不修 ws（反代 upgrade 已在历史批次实现，失败为 dev-server 场景噪声）；收口时若用户反馈再立项 |
| 远程部署时 `/nocobase/` 相对路径依赖网关存活 | 业务页本身在 DSH web 内同生命周期，可接受；"直连 + 配置下发"已登记 PLAN §5 范围外 |
| B4 截图基线（`demos/acceptance-b4/N4-06/13-business-*.png`）过时 | 本批同 PR 重拍业务页明暗截图 |
| ADR 旧表述漂移（[2026-09-08-webserver-nocobase-proxy.md](../../.agents/notes/implemented/architecture/2026-09-08-webserver-nocobase-proxy.md) 是 frozen 归档） | 不改旧 note；新 Agent Note 记录用途变化，形成时间线 |

回滚：revert 本批提交（纯前端 + 文档；反代未动无服务面影响）。
