# 批次 D4：品牌收尾 —— portal fork 文案源码级替换 + twitter:image 重写 + 根路径 favicon 别名

> 隶属 [PLAN.md](PLAN.md)。前置：无硬依赖（建议在 D2 后，portal fork 已有一次重建，合并走同一条 deploy 链减少往返）。三个独立小面：fork 文案（~10 处源码）、twitter:image（webserver 1 行正则）、favicon 别名（品牌脚本 1 行 overlay）。

## 合规先决（口径已核实）

- demo-portal-crm / demo-portal-hub 是**我们自有 fork 应用**（[AGENTS.md:3](../../platform/nocobase-portals/demo-portal-hub/AGENTS.md:3) 自称 NocoBase 应用模板 starter，应用源码修改是模板预期用法）；`platform/nocobase` 核心与 MANIFEST **零提及 portals**——fork 源码级改文案合规；
- NocoBase 商标义务（LICENSE §5.2）落在 admin 侧 footer（保留不动），portal 源码全扫 **0 处 "Powered by NocoBase"**；
- 替换目标值遵循上轮「不自造新名」原则：统一 `DSH食品业务平台`（既有真源 [dsh-brand.mts:9](../../examples/kb-agent/scripts/dsh-brand.mts:9) `BRAND_TITLE`）。两 portal 不派生区分名。

## 改动面 1：fork 文案（B 类可替换清单，源码级一次改完）

post-build 替换路线被否决：`displayName` 经 vite define 进 bundle（[vite.config.ts:68](../../platform/nocobase-portals/demo-portal-hub/vite.config.ts:68) 注入 `__PORTAL_TEMPLATE_NAME__`），构建后不可达——源码级改是唯一完整通道（源/运行时/产物三面一致，重建不回退）。

| 文件 | 现值 | 替换为 |
|---|---|---|
| [crm brand.tsx:3](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/brand.tsx:3) | `APP_NAME = "Salesroom CRM"` | `DSH食品业务平台` |
| [crm build-story-banner.tsx:67](../../platform/nocobase-portals/demo-portal-crm/src/components/build-story/build-story-banner.tsx:67) | `APP_TITLE = "Salesroom CRM"` | 同上 |
| [crm index.html:10](../../platform/nocobase-portals/demo-portal-crm/index.html:10) | description "Salesroom CRM — pipeline…" | `DSH食品业务平台 — …` |
| [crm index.html:56](../../platform/nocobase-portals/demo-portal-crm/index.html:56) | `<title>Salesroom CRM</title>` | `DSH食品业务平台` |
| [hub brand.tsx:3](../../platform/nocobase-portals/demo-portal-hub/src/components/app-shell/brand.tsx:3) | `APP_NAME = "All in one"` | `DSH食品业务平台` |
| [hub build-story-banner.tsx:67](../../platform/nocobase-portals/demo-portal-hub/src/components/build-story/build-story-banner.tsx:67) | `APP_TITLE = "All in one"` | 同上 |
| [hub replicate-prompt.ts:7](../../platform/nocobase-portals/demo-portal-hub/src/components/build-story/replicate-prompt.ts:7) | `'Build an "All in one" app…'` | 品牌词同步（保留结构） |
| [hub theme.ts:1](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/theme.ts:1) | "All in one" 注释 | 同步 |
| [hub index.html:10](../../platform/nocobase-portals/demo-portal-hub/index.html:10)/[:56](../../platform/nocobase-portals/demo-portal-hub/index.html:56) | "All in one" desc/title | `DSH食品业务平台` |
| **两 portal** [package.json:3](../../platform/nocobase-portals/demo-portal-hub/package.json:3) | `displayName: "CRM DEMO"`（hub 也叫 CRM DEMO） | `DSH食品业务平台` → 侧栏底部品牌位（[sidebar.tsx:296-297](../../platform/nocobase-portals/demo-portal-hub/src/components/app-shell/sidebar.tsx:296) "CRM DEMO v1.0.0"） |

**保留不动（A 类）**：[document-title-handler.tsx:75](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/document-title-handler.tsx:75) 组件默认 `appName="NocoBase"`（上游契约、已被 App.tsx 显式传参遮蔽）、build-story 内 NocoBase CLI/`nb portal` 工具名（功能性内容）、README/package.json name scope（无用户可见面）。

**勿重复（C 类已改）**：App.tsx 运行时 appName、BrandLogo、deploy title 替换 + favicon overlay（C4/C6）。

## 改动面 2：twitter:image 前缀重写（[nocobase-proxy.ts:50](../../packages/host/webserver/src/nocobase-proxy.ts:50)）

og:image 已在 C7/C8 修好；同型 `name="twitter:image"` 不在重写集（部署产物实证 [hub/index.html:18-22](../../platform/nocobase/storage/dist-client/hub/index.html:18)），经 :3080 解析为根绝对路径落 DSH fallback 404。修复 = 一处正则扩展：

```ts
.replace(/<meta\b[^>]*\b(?:property="og:image"|name="twitter:image")[^>]*>/gu, tag => tag.replace(/(\bcontent=")\/(?!\/)/u, `$1${prefix}/`))
```

测试：[nocobase-proxy.spec.ts:103](../../packages/host/webserver/tests/nocobase-proxy.spec.ts:103) fixture 加 twitter meta、[:131](../../packages/host/webserver/tests/nocobase-proxy.spec.ts:131) 加断言。

## 改动面 3：根路径 favicon 别名（[n25-brand.mts:89-93](../../examples/kb-agent/scripts/nocobase-n25-brand.mts:89)）

admin 入口 HTML 无 favicon link（上游故意配不存在路径防默认图标），浏览器回退请求 origin 根 `/favicon.ico` → `dist/client` 根无 ico → gateway `/**→/index.html` **伪 200 text/html**。修复 = overlay 数组加一行把已覆盖的 favicon 复制到根：

```ts
[faviconPath, join(clientRoot, 'favicon.ico')]  // 既有 favicon/ 子目录行之外新增根别名行
```

零代理/网关代码改动；dist 产物改动由 all 链重放自愈（C4 先例）。verify 追加：`GET /favicon.ico` = 200 且 `content-type` 非 `text/html`。

## 实施步骤

1. fork 文案 ~10 处源码替换（两 portal）；
2. twitter:image 正则 + spec 用例；
3. n25 overlay 一行 + verify 断言；
4. portal 重建部署（deploy 双跑树哈希一致）+ 重启 :3080 网关（proxy 改动生效）；
5. `pnpm run test -- packages/host/webserver` + typecheck + lint。

## 验收断言（证据落 `examples/kb-agent/demos/acceptance-d4/`）

1. 两 portal 构建产物与运行时全无 "Salesroom CRM"/"All in one"/"CRM DEMO"（`grep -r` 部署目录 + 浏览器截图：header 品牌位、侧栏底部、document.title、页面 title 均为 `DSH食品业务平台`）；
2. `curl -s :3080/nocobase/dist/hub/ | grep -E 'twitter:image|og:image'` 两者 content 均带 `/nocobase/dist/hub/` 前缀，且该 URL fetch 200 image/*；
3. `curl -s -o /dev/null -w '%{http_code} %{content_type}' :13000/favicon.ico` 与 `:3080/nocobase/favicon.ico` 均 200 非 text/html；浏览器打开 admin 后 tab 图标为 DSH 徽标（截图）；
4. verify 新断言组全绿；deploy 双跑树哈希一致；webserver 分区单测绿；
5. "Powered by NocoBase" footer 仍在 admin 侧（合规回归确认）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| displayName 改名导致 portal 构建产物大 diff（define 变化） | 低 | deploy 树哈希重录为新基线即可 |
| twitter:image 正则过宽误改其他 meta | 低 | 正则仍锚定完整 meta 标签内单属性 content；spec 双断言 |
| favicon 根别名与上游后续版本冲突 | 低 | dist 产物面，all 链重放自愈 |

回滚：三面各为独立小提交（fork 文案 / proxy 正则 / n25 overlay），revert + 重建/重启即回。
