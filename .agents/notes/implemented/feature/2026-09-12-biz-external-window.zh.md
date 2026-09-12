# Agent Note: 业务后台改为新窗口打开 —— 嵌入 iframe 变为外链入口卡片

Status: implemented

[English](2026-09-12-biz-external-window.md) | 中文

## 问题

业务页签把 NocoBase 管理界面按需嵌在页底的 iframe 里（「高级配置」区块）。用户直接否定了嵌入形态：「业务管理nocobase业务平台打开的话，新窗口打开，不要嵌入到dsh里了」——业务后台新窗口打开，不要嵌入 DSH。实践中 iframe 也是更弱的承载面：框内 SPA 自带滚动与登录墙，`ws` 重连流还会在会话页里制造控制台噪声。

## 决策

### 嵌入区块改为语义化外链卡片；页面其余部分不动

`BizView.tsx` 删除 `embedOpen` state 与条件渲染的 `<iframe src="/nocobase/">`；该区块渲染一张 `<a href="/nocobase/" target="_blank" rel="noopener noreferrer">` 卡片——标题、一句话说明（文案明示新窗口行为）、`/nocobase/` URL 展示、胶囊形态的打开按钮元素。真实锚点保留中键/Cmd+点击与右键复制链接，`rel="noopener noreferrer"` 必带。对话式管理主体（对象切换器、实体卡、表格、问数框）不动——范围确认很明确：只去嵌入。

### 反代保留；用途从同源内嵌变为同源入口

webserver 的 `/nocobase` 反代、`nocobaseProxyOrigin` 配置、`/nocobase/ws` upgrade route、apiproxy `nocobase.listMeta/list` 数据面全部保留。新窗口仍经网关解析 `/nocobase/`，管理界面落在网关域名上：DSH 内登录过的 cookie 继续生效，不引入 CORS 面，远程部署也只需暴露一个 origin。删反代毫无收益，还要赔上 HTML/插件清单重写与登录态连续性。JSDoc 与 README 把反代用途改述为新窗口同源入口；framing 防护头剥离行为不变（无框时无害，删它只会徒增 proxy spec 改动）。

### 链接契约写进客户端 spec

`bizview.client.spec.tsx` 断言页面无 iframe、链接带 `href="/nocobase/"`、`target="_blank"`、`rel` 同时含 `noopener` 与 `noreferrer`。locale key `embed.frameTitle`（iframe 专属属性）删除；`embed.open`/`embed.openHint` 文案中英文均改为新窗口语义。

## 已考虑的替代方案

**iframe 收进折叠开关后面。** 否决：用户否定的是嵌入这个形态，不是它的默认可见性。

**直连 `NOCOBASE_BASE_URL` + 配置下发。** 否决为范围外（PLAN §5）：需要新增配置面，破坏与 DSH 域的登录态连续性，对本产品实际发布的本地部署毫无收益。

**彻底删除反向代理。** 否决：新窗口入口依赖它做同源伺服；数据面（`nocobase.listMeta`）共用该路由。

## 后果

业务页签不再含 iframe，框内 SPA 的滚动混乱、会话页里的二次登录提示与 iframe 源 404 随之消失；管理界面成为整窗体验。`/nocobase` 反代及其测试未动——行为一致、文档改述——web-server 面零回归风险。`docs/subsystems/web-server.md` 及其中文配对、`docs/config-catalog.md`、两份 ui-business README、QUICKSTART.zh.md 均改为外链入口表述；2026-09-08 的归档代理 note 保持冻结，本文记录用途变化形成时间线。iframe 产生的 `ws` 重连噪声随之离开会话页（新窗口拥有自己的 socket 生命周期）。
