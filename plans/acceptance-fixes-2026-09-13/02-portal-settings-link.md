# 批次 E2：Portal「设置」404 修复——显式配置中心 URL + 配置引导

> 隶属 [PLAN.md](PLAN.md)。前置：无（与 E1 独立；portal 源码改动后需 deploy 重建，安排在 E1 数据面验收后执行避免会话交织）。改动面：两 portal fork 各 1 处组件 + deploy；QUICKSTART 一节。

## 根因（分层定位，实机三层复现）

「hub 的设置点进去 404」传播路径：

```
Portal header 齿轮 SettingsLink（新标签 <a href>）
  → URL 由 portal-sdk@2.1.0 resolveNocoBaseSettingsUrl() 生成 = http://localhost:3080/nocobase/settings
  → 层1 :3080 网关    GET /nocobase/settings → 200（admin SPA 入口壳，无 fallback 参与）
  → 层2 :13000 直连   GET /settings          → 200（同一壳；NocoBase gateway 对非 API 路径统一 SPA fallback）
  → 层3 admin SPA 客户端路由：2.2.6 的 settings 全部挂在 /admin/settings/*（plugin-manager /
     data-source-manager / system-settings / users-permissions 实测 200），路由表不存在裸 /settings
     → 渲染「Sorry，该页面不存在。」  ← 404 精确发生点（客户端，非 HTTP 层）
```

**根因一句话**：portal-sdk@2.1.0 生成 `/settings`（NocoBase v2.13+ 根路径 settings 中心形态，配套 plugin-settings-manager/plugin-multi-portal——本地 89 个启用插件均无）与本地快照 **2.2.6** 的实际路由形态版本错配。

与 D3 fallback 无关（双层不可达）：`/nocobase/settings` 不在 [`NOCOBASE_PORTAL_PREFIXES`](../../packages/host/webserver/src/nocobase-proxy.ts:99) 的 `/dist/{crm,hub}` 前缀下，且上游返回 200 壳——fallback 触发条件（404 + GET/HEAD + text/html）两条都不满足；真正的 404 渲染在客户端路由层，服务端 fallback 原理上不可达。

CRM Portal 的 [SettingsLink](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/header.tsx:125) 完全同构（同 `pluginSettingsResource` ACL `pm.*`、同 `resolveNocoBaseSettingsUrl()`，[:137](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/header.tsx:137)）——**两处同修**。

「没有可配置编辑功能」的实情：能力在 admin 侧齐全（hub_*/crm_* 49 表在数据源管理器可见可配、界面配置模式、用户和权限、图形化界面 tab），缺正确入口引导。Hub 菜单为前端写死（[`extensions.tsx:66-140`](../../platform/nocobase-portals/demo-portal-hub/src/app/extensions.tsx:66)）——菜单运行时配置化超本轮范围（模板设计）。

## 改动面

### 1. 两 portal SettingsLink 显式 URL（fork 源码级改，合规同 D4 先例）

- [`demo-portal-hub/src/components/app-shell/header.tsx:124`](../../platform/nocobase-portals/demo-portal-hub/src/components/app-shell/header.tsx:124)：`href={resolveNocoBaseSettingsUrl()}` 替换为本文件内小函数/常量，目标 **admin 数据源管理器**：

  ```
  <apiBase 去掉尾部 /api>/admin/settings/data-source-manager/main/collections
  ```

- [`demo-portal-crm/src/components/app-shell/header.tsx:137`](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/header.tsx:137)：同款替换。
- `apiBase` 来源：运行时 `window.NOCOBASE_API_URL`（:3080 部署产物已被 [`rewriteNocobaseHtml`](../../packages/host/webserver/src/nocobase-proxy.ts:58) 重写为 `/nocobase/api`；直连为 `/api`）——**从运行时值推导，不硬编码 host/前缀**，保证两种访问形态（网关/直连）都正确。
- 落点裁决：data-source-manager（用户诉求=「配置编辑功能」，直达表配置；hub_* 全在）优先于泛设置中心 system-settings。悬浮球/ACL（`pm.*`）逻辑不动。

### 2. deploy 重建

[`nocobase-portal-deploy.mts`](../../examples/kb-agent/scripts/nocobase-portal-deploy.mts) 双跑树哈希一致（D 轮惯例）。

### 3. QUICKSTART「在 admin 配置 Portal 数据」小节

- 设置齿轮直达数据表管理（hub_*/crm_* 可配字段/编辑）；
- 界面配置模式（admin 顶栏「界面配置」）可调 admin 业务页区块；
- 用户和权限在 settings 抽屉；
- 已知边界：Hub/CRM Portal 页面本身为模板静态页，菜单不开放运行时配置（E3 定位节呼应）。

## 实施步骤

1. 两 portal header.tsx 替换（每处 ≤10 行 diff）；
2. deploy 双跑 + 树哈希核对；
3. 真实浏览器验收 + 截图落 `examples/kb-agent/demos/acceptance-e2/`；
4. QUICKSTART 小节落盘（与 E3 定位节同文件，注意先后合并编辑避免冲突——本批先落，E3 扩写）。

## 验收断言

1. hub Portal 点设置齿轮 → 新标签打开 `:3080/nocobase/admin/settings/data-source-manager/main/collections`，正常渲染数据表管理页（hub_pj_* 可见），**非 Not Found**；
2. CRM Portal 同款断言；
3. 直连形态（`:13000/dist/hub/` 打开的 portal）点齿轮 → 落 `/admin/settings/...` 同样 200（运行时 apiBase 推导的旁证）；
4. `curl -s -o /dev/null -w '%{http_code}' :3080/nocobase/admin/settings/data-source-manager/main/collections` = 200；
5. deploy 双跑树哈希一致；verify 既有 Portal 断言组全绿（品牌/PORTAL_BASE 无回归）；
6. 截图 ≥3 张（hub 齿轮落点页 / CRM 同款 / 直连形态）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| portal-sdk 的 `resolveNocoBaseSettingsUrl` import 残留导致 lint 未用告警 | 低 | 同步移除 import；oxlint 分区绿 |
| deploy 重建引发 PORTAL_BASE/品牌回归（C4/C6 面） | 低 | 双跑树哈希 + verify Portal 断言组兜底 |
| data-source-manager 页在部分表上触发 `fields.target` 版本错配报错（E2 调研旁证） | 低 | 页面整体可用（hub_* 列表实测正常）；单表操作报错归档已知边界，E1 探查 0-2 一并定性 |

**回滚**：revert 单提交 + deploy 重建即可；无数据面影响。
