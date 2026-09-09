# Agent Note: NocoBase :13000 双入口形态——构建产物供完整 UI，dev-server 不变

Status: implemented

[English](2026-09-08-nocobase-full-ui-dual-entry.md) | 中文

## Problem

用户打开 http://127.0.0.1:13000 只见 404/空壳，业务管理页 iframe 同样不可用——"NocoBase 功能很强大，不能只有 dsh 一个入口"。调查结论：dev-server 的 gateway（`platform/nocobase` 快照内 server 源码 `gateway/index.ts` 的 requestHandler）本来就把非 `/api/*` 请求伺服到 app 包的 `dist/client` 构建产物（SPA rewrite 到 index.html），`:13000` 是 API-only 只因**客户端产物从未构建**（`no dist (never built)`）。iframe 侧另有三层独立断点：构建产物的 index.html 把全部资源（`/assets/*`、`/global.css`）与运行时基址（`__nocobase_public_path__='/'`、`__nocobase_api_base_url__='/api/'`）写成 origin 根路径，在 iframe 的 origin（DSH web 端口）下全部 404；requirejs 按 `/api/pm:listEnabled` 清单的根路径 `url` 加载插件，同样 404（`Script error for "@nocobase/plugin-acl"`）；NocoBase 的登录 origin 校验（`isTrustedOrigin`，core/auth）以请求的 Origin 对比 `x-forwarded-host`/host 推导的 origin，反代未声明转发来源时 signIn 一律 403 "Invalid sign-in origin"。

## Decision

### 形态：`yarn build` 产物 + 保留 `yarn dev-server` 启动（不换 dev 全量）

构建产物让 :13000 单端口同时伺服完整 UI 与 `/api/*`：REST 轨道（connector-nocobase、expert-orders、apiproxy nocobase 域、demo 场景 2/3）零改动、零新增代理层；start 秒级就绪（产物与 DB 无关，reset 保留）；行为与官方 docker 生产形态一致。dev 全量模式（`yarn dev`）被否决：client rsbuild 占 :13000、API 靠代理到 :13001 的 server——REST 全部经代理层（SSE/上传的边缘风险），首次打开等编译（分钟级），三进程 + 双 watch 常驻；使用系统（而非开发 NocoBase 插件）不需要 HMR。

### setup 脚本（examples/kb-agent/scripts/setup-nocobase.mts）

新增 `build` 步骤：幂等标记是 `dist/client/index.html` 与 `dist/client/v/index.html` 同时存在（legacy shell + modern client），`NOCOBASE_FORCE_BUILD=1` 强制重建；`all` 链变 install → build → start → init → verify；`verify` 断言完整 UI（`GET /` 200 html 且含 `__nocobase_public_path__`——非 404 空壳）；`start` 在产物缺失时输出指向 build 的 warning（REST 仍可用，不失败）。实测全量 build 约 23 分钟（逐包 dts + tsup + 两套 rsbuild，client 阶段 1290s）。

### iframe 反代三件修复（packages/host/webserver/src/nocobase-proxy.ts）

- `rewriteNocobaseHtml`：HTML 入口缓冲后重写——`(href|src)="/x"` 加 `/nocobase` 前缀（协议相对 `//` 不动），`__webpack_public_path__`/`__nocobase_public_path__`/`__nocobase_api_base_url__`/`__nocobase_ws_path__` 重定根，使帧内 fetch、懒加载 chunk 与 API 调用全部走反代；content-length 重算。
- `rewriteNocobasePluginManifest`：仅对 `/api/pm:listEnabled` 的 JSON 响应做结构化重写（`data[].url`/`clientV2Url` 以 `/` 开头时加前缀）；非清单形态原样通过——模块加载器的 URL 来自这一份清单，别处（HTML 已重写、API 相对基址已重定根）不再出现根路径引用。
- 转发携带 `x-forwarded-host`（原请求 host）与 `x-forwarded-proto: http`：标准代理语义，NocoBase 的 `getRequestOrigin` 据此判 same-origin，signIn 从 403 恢复 200。请求侧剥离 `accept-encoding`（重写需要明文；回环损失可忽略）。

### i18n 模板 title 解包（connector-nocobase/src/client.ts 的 `unwrapNbTitle`）

系统 collection（roles/users）的 title 在线上是 `{{t("Roles")}}` 模板，由 NocoBase 前端翻译器渲染；DSH 侧无翻译器，直接透传会把模板原样显示在业务对象切换器与 nb_collections 输出里。解包只认完整模板形态（`{{t("X")}}` → `X`），其余 title 原样；apiproxy 的 listMeta 投影与 tool-nocobase 的 collectionCards 共用同一函数。

## Alternatives considered

**`APP_PUBLIC_PATH=/nocobase/` 重新构建（NocoBase 子路径部署）。** 否决：需以该配置重跑 20 分钟构建并在 server 侧同设运行时变量；`/storage/uploads` 等存储路径随之改前缀，REST 与附件 URL 面都要回归；且 :13000 直开体验（根路径重定向）变化。反代侧重写只影响 iframe 这一条低频调试面，:13000 直开与 REST 零扰动。

**`CORS_ORIGIN_WHITELIST` 放行 DSH 端口。** 否决作为主修复：白名单跟随 DSH web 端口（可配）而漂移，多一个部署耦合；x-forwarded-host 是代理本应声明的事实，一处修复对任意端口成立。

**iframe 跨源直嵌 :13000（无 frame guard 头，可渲染）。** 否决：登录态依赖第三方 cookie，Chrome 默认限制下不可靠。

## Consequences

- `GET /`（构建产物就位后，dev-server 无需重启即生效）返回完整 shell；浏览器登录 admin@nocobase.com/admin123 后 workflow 管理、待办任务、collections 管理、字段抽屉、UI Editor 建页全部可用（截图 examples/kb-agent/demos/nocobase-ui/ 01–07）。
- DSH 业务管理页 iframe 内 NocoBase 完整启动、登录、渲染数据页（截图 08）；`/nocobase/api/pm:listEnabled` 与 HTML 入口均以 `/nocobase` 前缀应答，signIn 探针 403 → 200。
- 五场景 demo 真轨道全 PASS（REST 不经任何新增代理层）；分区 128 测试全绿（含 HTML/manifest 重写、title 解包、非 HTML passthrough 用例）。
- DSH web 常驻实例需重启一次才带上反代修复与 title 解包（运行中的 :3080 由用户守护）。
- 遗留：UI Editor 自建页面的表格列值渲染未见值（现成 schema 页面如 Users 正常）——NocoBase 快照内部前端行为，快照升级时复核。
