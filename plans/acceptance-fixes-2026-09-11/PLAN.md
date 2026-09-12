# 用户验收反馈修复计划（第二轮）：图谱画布交互 + 业务后台新窗口 + NocoBase 接口回归 + 品牌白标（2026-09-11）

> 面向下一位实施者（Loop 批次/code 模式）：本文回答"为什么与做什么裁决"，每批"怎么做"在 [01](01-kg-canvas-ux.md)~[05](05-closeout.md) 批次文档。所有根因结论附 `文件:行号` 证据；四问题均经真实起服诊断（NocoBase :13000 / DSH 网关 :3080 与 :3084 / PG17 :5432 实测）或源码抽查核实，基线 HEAD=`0543b46c43`（上轮 11 提交，工作树干净，未推送）。

**目标一句话**：治理图谱画布的滚动/适配/交互三层缺陷；业务后台改为新窗口打开（DSH 内只留外链入口卡）；修复 NocoBase 平台页面接口报错（CRM Portal 400 回归 + 权限 + 网关旧 inode）；对 NocoBase 平台做许可合规范围内的品牌白标并修复 AI 员工悬浮图标。

**北极星（用户原话）**：

1. 「图谱 UI/UX 交互根本不行，屏幕适配不行，滚动错乱」
2. 「业务管理 NocoBase 业务平台打开的话，新窗口打开，不要嵌入到 DSH 里了」（范围已确认：仅去掉 iframe 嵌入区块，保留对话式管理主体）
3. 「NocoBase 业务平台里的页面的某些接口怎么报错了，页面都没数据了」
4. 「NocoBase logo 换成新的（自己设计），右下角悬浮的 AI 员工图标没加载出来，其他 NocoBase 文案都替换掉」

---

## 1. 调研结论摘要（四问题根因）

### 1.1 问题一：图谱画布交互/滚动/适配（packages/client/ui-kg）

渲染栈：sigma.js 3.0.3 WebGL + graphology + forceatlas2（[ui-kg/package.json:49](../../packages/client/ui-kg/package.json)），非自研画布。三层根因：

1. **滚动链断裂（"滚动错乱"主体）**：kg 视图未接入框架的 composer-overlay 布局通道，走默认 `.viewArea { flex:1 0 auto; min-height:auto }`（[ConversationRoot.module.css:251-254](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css:251)）——viewArea 被内容撑开，一切滚动上移到会话级 `scrollBody`；页内 `.page { overflow-y:auto }`（[kg.module.css:11](../../packages/client/ui-kg/src/client/kg.module.css)）成死滚动容器，`.mainSplit/.canvasFrame/.canvasViewport` 的 flex 填充链全部失效，**画布高度恒跌到 min-height:300px 兜底**（[kg.module.css:153-159](../../packages/client/ui-kg/src/client/kg.module.css)）。页面超视口时滚动的是含 sticky composer 的 scrollBody，滚轮语义在"画布内=缩放（sigma 拦截 preventDefault）/画布外=整页滚"间高频切换。
2. **resize 不跟随（"屏幕适配不行"）**：sigma 只监听 `window` resize（sigma.esm.js:1540），无 ResizeObserver；本产品侧栏是可拖拽宽度的 grid（[AppFrame.tsx:40-84](../../packages/client/ui-layout/src/client/AppFrame.tsx)），拖侧栏不触发 window resize，**画布不重绘尺寸**。且 kg.module.css 全文件零 `@media` 断点，窄屏 mainSplit 不堆叠。
3. **交互缺失**：sigma 构造仅传 `renderEdgeLabels:false` + `doubleClickZoomingRatio:1`（[KgGraphCanvas.tsx:86-91](../../packages/client/ui-kg/src/client/KgGraphCanvas.tsx)），`minCameraRatio/maxCameraRatio/cameraPanBoundaries` 均默认 null——缩放无上下限、平移可把图拖出视野；sigma v3 不内置节点拖拽，全仓无 downNode 实现；无 zoom in/out/reset 控件；WebGL 路径选中节点无高亮（selected 仅作用于降级列表）；每次游走/过滤切换销毁重建整个 Sigma 实例（useEffect 依赖 `[visibleNodes, visibleEdges, typeFilter, onSelect, onExpand]`，[KgGraphCanvas.tsx:103](../../packages/client/ui-kg/src/client/KgGraphCanvas.tsx)），相机状态（用户缩放/平移）丢失。

上轮边界核实：B4 批次明文"sigma 画布本身不动"（[04-pages-visual.md:33](../acceptance-fixes-2026-09-10/04-pages-visual.md)），本三类问题属已知未做而非回归——登记在 [01](01-kg-canvas-ux.md)。

### 1.2 问题二：业务后台改新窗口（packages/client/ui-business）

iframe 唯一渲染点：[BizView.tsx:214-223](../../packages/client/ui-business/src/client/BizView.tsx) 的 `embedZone`（"高级配置"区块，按需展开 `<iframe src="/nocobase/">`）。URL 是同源相对路径，经 webserver 反代（[nocobase-proxy.ts](../../packages/host/webserver/src/nocobase-proxy.ts)，origin 来自 [cordis.patch.yml:315-319](../../examples/kb-agent/cordis.patch.yml) 的 `NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'`）。**业务管理页签主体（对象切换器/实体卡/表格/问数框）是 DSH 原生界面，不是嵌入**——用户已确认范围：仅去 iframe、保留主体（方案 A）。改动见 [02](02-biz-external-window.md)。

### 1.3 问题三：NocoBase 平台接口报错（真实起服诊断实录）

| 类别 | 现象 | 根因 | 归属 |
|---|---|---|---|
| A. CRM Portal 四页 400 | `crm_contacts:list?sort=name` 等 6 个接口 400（PG `column ... does not exist`） | 官方 Portal 前端硬编码默认排序字段（`name/score/source/issue_date/root_quote_id/version/is_current/total/date`）与自建 collection 实际列（`full_name/sort/...`）错配；引入点 = **c8eaf64e76（N24，09-10 重建部署 Portal）**，server log 时间线证明 09-09 旧代无 sort 参数全 200，09-10 起转 400 | 范围外提交引入的回归，非本轮 11 提交 |
| B. Hub Portal 8 表 404 | `hub_inv_products` 等 8 张官方域表 `list` 404（库存/销售/财务/帮助台页面无数据） | 种子脚本从未建过这些表；QUICKSTART:139 已声明的已知边界 | 长期缺口（非回归） |
| C. `crm_activities:query` 403 | root 角色对自建 collection 的 query action 未授权 | init 链授权缺项 | 权限缺口 |
| D. 双网关旧 inode | :3080 与 :3084 长驻 `dsh web` 持有已删 sqlite 旧 inode，`kg.stats` 三世界不一致（3080=1073/594、3084=1188/755、磁盘=1094） | 今晨种子链重放后网关未重启——B6 警告机制针对的已知模式的发生实例 | 运维动作缺失（非代码缺陷） |

排除项：401 为正常 token 过期；`aiConversations:create` 400 已由 c8eaf64e76 修复（今日零发生）；上轮 11 提交 `git diff --stat` 未触碰 crm/hub/portal 种子面。诊断详情与接口清单见 [03](03-nocobase-api-fixes.md)。

### 1.4 问题四：品牌白标 + AI 员工图标（platform/nocobase 及其外围）

1. **AI 员工悬浮图标挂掉的根因（仅 Portal 端，admin 端正常）**：Portal 悬浮球 `<img src="/assets/nocobase-ai-chat-*.svg">` 无 `/dist/crm` 部署前缀 → gateway SPA fallback **伪 200 返回 text/html**（naturalWidth=0 图标空白）；文件本体存在于部署目录（`/dist/crm/assets/...` fetch 200+image/svg+xml）。源头：[nocobase-portal-deploy.mts:41](../../examples/kb-agent/scripts/nocobase-portal-deploy.mts) 裸 `pnpm build` 未注入上游 vite.config 原生支持的 `NOCOBASE_PORTAL_BASE`（[vite.config.ts:56](../../platform/nocobase-portals/demo-portal-crm/vite.config.ts)）。**不是构建裁剪、不是替换脚本覆盖**。
2. **logo/文案替换面**：admin 侧栏（v1+v2）、登录页 h1、document.title 后缀全部走数据库 `systemSettings.logo/title`（官方 UI 与 REST `systemSettings:put` 双通道，[plugin-system-settings/server.ts:89-101](../../platform/nocobase/packages/plugins/@nocobase/plugin-system-settings/src/server/server.ts)）——可配置；favicon 是构建产物静态资源——需 post-build 覆盖；footer "Powered by NocoBase" 属商业插件钩子。
3. **合规硬边界（Apache-2.0 附加条款 [LICENSE.txt §5.2](../../platform/nocobase/LICENSE.txt)）**：OSS 版**仅"页面左上角主 LOGO"允许移除/更换**；界面其余 NocoBase 品牌、名称、链接不得移除或更改。白标范围 = logo + 站点标题 + favicon + Portal 品牌；footer 与全量文案替换需商业许可，本计划不做并在文档显式声明。
4. **先例**：N17/N18/N22 系列（[examples/kb-agent/scripts/](../../examples/kb-agent/scripts)）确立"REST 幂等 upsert / 部署期目录替换、零 vendor 源码修改"模式；[nocobase-portal-deploy.mts](../../examples/kb-agent/scripts/nocobase-portal-deploy.mts) 是覆盖层先例实体。方案见 [04](04-brand-whitelabel.md)。

---

## 2. 技术决策（已定，实施不再讨论）

1. **C1 分层修复，不动渲染栈**：沿用 sigma（上轮已裁决单文件 bundle 设计，见 [05-closeout.md:50](../acceptance-fixes-2026-09-10/05-closeout.md)）；第 0 层 CSS 治理（接入既有 composer-overlay 布局通道，trajectory 已验证该模式）→ 第 1 层 ResizeObserver 补 resize 跟随 → 第 2 层交互补齐（settings 收敛 + 控件 + 节点拖拽 + 选中高亮 + 相机保留）。若 overlay 属性对 composer 定位副作用超预期，fallback 为 ui-conversation 新增 `data-view-scrolls` 视图自管滚动标记（改动需登记）。
2. **C2 用方案 A + 语义化外链**：`<a href="/nocobase/" target="_blank" rel="noopener noreferrer">` 入口卡片；**反代与 `nocobase.listMeta` 数据面全部保留**（用途从 iframe 同源化变为新窗口同源入口，登录 cookie 落 DSH 域的既有机制不变）。不删 webserver 反代（删除的文档/测试成本远超收益）；"直连 NOCOBASE_BASE_URL + 配置下发"登记为可选后续不做。
3. **C3 主路径 = 种子侧适配字段，不动 vendored Portal 源码**：在 [nocobase-crm-modules.mts](../../examples/kb-agent/scripts/nocobase-crm-modules.mts) 字段 upsert 段幂等补 Portal 期望的列（优先 NocoBase 公式/虚拟字段做只读别名，零数据迁移；普通列+种子回填为备选），同 PR 补种子数据值；hub 8 表按用户"页面要有数据"预期默认补建（幂等 create + 种子），若官方域表结构考证成本超预期允许降级为文档声明已知边界并在收口报告说明；403 由 init 链 root 角色授权修复；网关重启是运维步骤写进批次（不推翻 B6"不做自动 kill/restart"裁决）。
4. **C4 = 方案 A+B 组合**：新写 N19 风格幂等品牌脚本（systemSettings.logo/title upsert，logo 用自研 SVG 经附件上传）+ portal-deploy 构建注入 `NOCOBASE_PORTAL_BASE`（一石二鸟：修 AI 图标根因 + 白标资源前缀）+ favicon post-build 覆盖（挂在 build 之后，重跑安全）。自研 logo 对齐仓库 [BRAND_GUIDELINES.zh.md](../../BRAND_GUIDELINES.zh.md) 与 DSH 现有品牌资产；许可边界（§5.2）在 QUICKSTART 白标节显式声明。
5. **验证断言全部接入 verify**：C3/C4 的验收断言（接口 200、hub 行数、favicon content-type、systemSettings、Portal 图标 200+svg）扩展进 [setup-nocobase.mts](../../examples/kb-agent/scripts/setup-nocobase.mts) verify 断言组，保证 reset→all 幂等链自愈。
6. **设计类改动证据形态**：真实起服浏览器截图（明暗两套）+ GIF（GUI 行为变更 PR 必附，[record-browser-gif](../../.agents/skills/record-browser-gif/SKILL.md) skill）；不接受纯 mock 断言。
7. **沿用 B4 三红线**：禁组件库/Tailwind；域包禁互引（[verify-client-domain-graph.ts](../../scripts/verify-client-domain-graph.ts)）；alias token、明暗双主题。

---

## 3. 批次总览（5 批，顺序执行）

| 批次 | 一句话 | 文档 | 依赖 | 预估 |
|---|---|---|---|---|
| C1 图谱画布 UX | 滚动链治理（overlay 通道）+ resize 跟随 + 交互补齐（缩放界/拖拽/控件/高亮/相机保留）+ 响应式断点 | [01-kg-canvas-ux.md](01-kg-canvas-ux.md) | 无（验收前先重启网关，消除旧 inode 干扰） | 1.5 天 |
| C2 业务后台新窗口 | embedZone iframe → 外链入口卡片（方案 A），反代保留改用途 | [02-biz-external-window.md](02-biz-external-window.md) | 无 | 0.5 天 |
| C3 NocoBase 接口修复 | CRM Portal 字段适配 + hub 8 表补建 + query 授权 + 网关重启 + verify 断言扩展 | [03-nocobase-api-fixes.md](03-nocobase-api-fixes.md) | 建议在 C1/C2 后（重启网关会刷新全部会话） | 1-1.5 天 |
| C4 品牌白标 | 自研 logo + systemSettings upsert 脚本 + PORTAL_BASE 注入（修 AI 图标）+ favicon 覆盖 + 合规声明 | [04-brand-whitelabel.md](04-brand-whitelabel.md) | C2（新入口形态）、C3（Portal 页面有数据） | 1-1.5 天 |
| C5 收口回归 | 全量回归 + 两轮幂等实证 + 文档/handoff/Agent Note 终态 | [05-closeout.md](05-closeout.md) | C1-C4 | 0.5 天 |

顺序理由：C1/C2 纯前端互不依赖先行；C3 修复数据面并重启网关（放在 UI 批次后避免打断截图会话）；C4 需要新入口形态与有数据的 Portal 页面做白标截图；C5 收口。

---

## 4. 验收标准（本轮完成定义）

1. **图谱**：宽屏（≥1600px）画布高度 ≥ 视口剩余空间（不再恒 300px）；拖拽侧栏宽度后画布尺寸跟随重绘；wheel 在画布上只缩放不滚页面、画布外滚动的是 `.page`（自管滚动）而非会话级 scrollBody；缩放控件 + reset + 节点拖拽可用；窄屏（375px）mainSplit 纵向堆叠；明暗两套截图 + GIF 留档。
2. **新窗口**：DSH 业务管理页无任何 iframe；外链入口卡片点击开新窗口直达 NocoBase（可登录、有数据）；`test:web` 与 bizview 单测全绿；GIF 证据。
3. **接口**：诊断报告 A 类 6 个接口带 sort 参数全部 200；Hub Portal 库存/销售/财务/帮助台页面有数据（或降级声明）；`crm_activities:query` 200；双网关 `kg.stats` 一致且等于磁盘 `kg_nodes`；reset→all→all 两轮幂等（二跑全 kept/skip）。
4. **品牌**：admin 登录页与侧栏显示自研 logo 与新站名；Portal 右下角 AI 员工悬浮图标真实加载（HTTP 200 + `image/svg+xml` + naturalWidth>0）；favicon 更新；verify 新断言组全绿；QUICKSTART 含许可边界声明。
5. **过程资产**：每批验收实录（截图/GIF/命令输出）落 `examples/kb-agent/demos/`；Agent Note（非平凡改动同 PR）；`pnpm run lint && typecheck && doc-sync` EXIT=0；受影响 e2e/snapshot 同 PR 更新；每批提交经 lefthook pre-commit 门禁（oxlint 折行/EOF 空行/third-party-notices 再生——失败配方见 [lefthook 提交惯例](../handoff-2026-09-10.zh.md)）。

---

## 5. 硬约束（实施全程有效）

- 不修改 `platform/nocobase` 快照源码（MANIFEST local-modifications 表保持为空）；portal vendored 目录改动属上游 fork 管理，仅限 `NOCOBASE_PORTAL_BASE` 注入等部署参数，不改其源码结构。
- 许可合规：不移除/更改 footer "Powered by NocoBase" 与其他非主 LOGO 品牌位（LICENSE §5.2）。
- 种子链幂等语义不破坏：所有新脚本/新步骤挂进 `all` 链且二跑 kept；`setup all` 既有步骤行为不变，只追加。
- UI 改动遵守包边界（域间禁互引）、CSS Modules + alias token、明暗双主题；客户端改动后执行 `pnpm run build:lib:client && pnpm run build:web` 再重启（BUG-4 契约）；`test:web` 前先 `DSH_BUILD_CLIENT_PROFILE=official pnpm run build`。
- 不推翻上轮已裁决事项（[05-closeout.md:46-52](../acceptance-fixes-2026-09-10/05-closeout.md)）：KgGraphCanvas 静态 import sigma 维持；hmr-live 豁免维持；不做网关自动 kill/restart。
- 范围控制：不做直连 NOCOBASE_BASE_URL 的配置下发、不做商业版全量白标、不做 NocoBase 快照升级、不做图谱数据管线变更。

---

## 6. 风险总览

| 风险 | 等级 | 预案 |
|---|---|---|
| composer-overlay 通道对 kg 页 composer 定位产生副作用（sticky→absolute） | 中 | C1 第 0 层先实测 trajectory 同款形态；异常则 fallback `data-view-scrolls` 新通道（决策 1） |
| NocoBase 公式/虚拟字段做只读别名在 sort/fields 查询下行为不符（仍 400） | 中 | 备选普通列+种子回填；最终 fallback 改 portal 部署侧 sort 字段（登记 fork 改动） |
| hub 8 表官方 schema 考证成本高 | 中 | 允许降级为"已知边界"文档声明（用户验收口径在收口时说明） |
| Portal 重建部署后 ws/静态资源新回归 | 低 | verify 双 portal 探活已就位；C4 增图标断言 |
| 品牌替换触碰 test:web 品牌守卫（official profile 断言） | 低 | 只动 NocoBase 侧品牌面，DSH 侧品牌资产（BRAND_GUIDELINES/favicon.svg）仅作对齐参考不修改 |
| C1 golden 重录面扩大（布局变化影响既有快照） | 中 | 批次内跑 `test:web` 定位全部受影响 golden，同 PR 重录并复核零 console error |
| 长驻网关在批次间再次持有旧 inode | 中 | 每个涉及数据面/服务端的批次验收前先探活重启（QUICKSTART reset 节义务） |
