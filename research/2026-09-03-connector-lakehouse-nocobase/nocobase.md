# NocoBase 源码调研报告 —— 为 DSH 食品 KB+Agent 产品的融合方案提供决策依据

- 调研对象：`/Users/mac/Documents/github/nocobase-main`（NocoBase 官方源码主仓库，lerna + yarn workspaces monorepo）
- 版本：**2.2.6**（`lerna.json`）
- 调研日期：2026-09-03
- 方法：纯源码级证据。所有路径均相对 `nocobase-main/` 仓库根。本次调研环境无法访问外部网络（web 检索工具不可用），涉及外部生态（npm 包、文档站）的结论均显式标注"待实测验证"。
- 与 v1 的重大差异提示：本仓库是 v2（"AI + no-code"定位），存在双客户端运行时（legacy `@nocobase/client` 与 modern `@nocobase/client-v2`，术语见 `CONTEXT.md`）；包管理器为 **yarn 1**，不是 pnpm。

---

## 1. 版本与运行要求

### 1.1 版本与引擎

| 项 | 值 | 证据 |
| --- | --- | --- |
| 版本号 | 2.2.6 | `lerna.json`（`"version": "2.2.6"`）；`packages/plugins/@nocobase/plugin-hello/package.json:3` |
| Node 要求 | `>=22` | `package.json:9-11`（`"engines": { "node": ">=22" }`） |
| 包管理器 | yarn 1.22.22（**非 pnpm**） | `package.json:118`（`packageManager: yarn@1.22.22`）；`volta.yarn: 1.22.19`（`package.json:113-116`） |
| workspace 布局 | `packages/*/*` 与 `packages/*/*/*` | `package.json:4-7` |
| 许可证 | Apache-2.0（仓库根 `LICENSE.txt`）+ 插件文件头声明 AGPL-3.0/商业双许可 | `package.json:8`；`packages/plugins/@nocobase/plugin-hello/src/server/plugin.ts:6-7` |

Docker 构建基于 `node:22-bookworm`（`Dockerfile:1`）。

### 1.2 数据库支持

- 官方安装器支持的方言：**postgres / mysql / mariadb / kingbase**。`packages/core/create-nocobase-app/src/cli.js:25`：
  ```text
  .option('-d, --db-dialect [dbDialect]', 'database dialect, current support postgres, mysql, mariadb, kingbase')
  ```
- `.env.example:46-55` 默认 `DB_DIALECT=postgres`（localhost:5432，库/用户/密码均 `nocobase`）。
- **SQLite：核心运行时完整支持，但不在官方安装器选项中**。证据：
  - 完整方言实现：`packages/core/database/src/dialects/sqlite-dialect.ts:12`（`export class SqliteDialect extends BaseDialect`）；
  - `packages/core/database/src/mock-database.ts:19-22` 测试默认 `dialect: 'sqlite', storage: ':memory:'`；
  - `packages/core/database/src/database.ts:228-230` 对 sqlite 删除 timezone 选项的专门处理。
  - 含义：源码仓库本地开发可以用 `DB_DIALECT=sqlite`（`DB_STORAGE` 指定文件）跑起来；但 create-nocobase-app 生成的独立工程不提供 sqlite 选项，生产不支持。
- 外部数据库连接（数据源插件用）同样走 sequelize introspection，见 §5。

### 1.3 端口与启动

- 默认端口 **13000**：`.env.example:14`（`APP_PORT=13000`）。
- API 前缀：`API_BASE_PATH=/api/`（`.env.example:17`）。
- 根管理员初始化：`INIT_ROOT_EMAIL=admin@nocobase.com` / `INIT_ROOT_PASSWORD=admin123`（`.env.example:83-86`）。
- `APP_ENV=production` 时根路径返回 Not Found，官方建议 nginx 代理静态资源（`.env.example:11-12`）。

启动命令差异（`package.json:18-52`）：

| 命令 | 实际执行 | 说明 |
| --- | --- | --- |
| `yarn dev` | `nocobase-v1 dev --rsbuild` | 全栈开发模式（server + modern client，rsbuild） |
| `yarn dev:umi` | `nocobase-v1 dev` | legacy umi 客户端 |
| `yarn dev-server` | `nocobase-v1 dev --server` | 仅后端 |
| `yarn build` | `nocobase-v1 build` | 生产构建（client dist + server dist） |
| `yarn start` | `nocobase-v1 start` | 生产启动（需先 build） |
| `yarn tar` | `nocobase-v1 tar` | 打 tar 包 |
| `yarn pm / pm2` | `nocobase-v1 pm / pm2` | 插件管理 / 进程管理 |

### 1.4 源码仓库 vs create-nocobase-app 安装

- **源码仓库**（本仓库）：面向贡献者/插件开发者。yarn workspaces 全量安装（200+ 包），`yarn dev` 直接跑 TS 源；自建插件放 `packages/plugins/<pkg>`（见 §2.6）。
- **create-nocobase-app**：面向应用搭建者。生成独立 app 工程，模板在 `packages/core/create-nocobase-app/templates/app/`，含 `packages/plugins/`（空，放本地插件）、`storage/db/`、`storage/plugins/`（外部 pm 安装的插件落点）、`storage/uploads/`（附件）。
- **v2 官方推荐安装流**（`README.md:38-48`、`README.zh-CN.md:38-44`）：
  ```bash
  npm install -g @nocobase/cli
  nb --version
  nb init --ui      # 安装 NocoBase 应用
  ```
- Docker 路线同样基于 `yarn create nocobase-app`（`Dockerfile:42`），构建期可用本地 verdaccio 私服加速。

### 1.5 本地 macOS 可跑性（估计）

- 硬要求：Node ≥22（Apple Silicon 无原生依赖障碍；`ali-oss`/`@aws-sdk` 等均纯 JS 或预编译）。
- `yarn install`（源码仓库全量）：依赖体量大（monorepo 200+ 包，resolutions 锁 antd/react 全家桶），估计 **5–15 分钟**（取决于网络；`.env.example` 提供 `VERDACCIO_PORT=10104` 本地私服加速选项，`Dockerfile:2` 也用它）。
- `yarn build`：双客户端（legacy umi + modern rsbuild）+ 全插件 tsc/打包，估计 **10–30 分钟**量级。
- `yarn dev`（源码模式）：首启编译 **3–10 分钟**，之后热更。
- 结论：macOS 本地可跑，但属于"中大型 monorepo"量级，非轻量工具；用 create-nocobase-app 起独立工程更快（只装运行时依赖）。

---

## 2. 插件体系

### 2.1 目录结构模板

最小模板 `packages/plugins/@nocobase/plugin-hello/`：

```text
plugin-hello/
├── package.json          # name=@nocobase/plugin-hello, version=2.2.6
├── server.js             # module.exports = require('./dist/server/index.js')
├── client.js / client.d.ts
├── src/
│   ├── index.ts          # export * from './server'; export { default } from './server'
│   ├── server/
│   │   ├── index.ts
│   │   ├── plugin.ts     # Plugin 子类（生命周期钩子）
│   │   └── collections/  # collection 定义（.ts 文件默认导出 CollectionOptions）
│   ├── client/index.tsx  # 前端插件入口（legacy client）
│   └── locale/zh-CN.json # 18 种语言文案
```

`package.json` 关键约定（`plugin-hello/package.json`）：

```json
{
  "name": "@nocobase/plugin-hello",
  "version": "2.2.6",
  "main": "dist/server/index.js",
  "peerDependencies": {
    "@nocobase/client": "2.x",
    "@nocobase/server": "2.x",
    "@nocobase/test": "2.x"
  }
}
```

注意：v2 **没有 v1 的 plugin.json/.npmrc 清单**，插件元信息（displayName/description/version）放在 PluginOptions 与 `collection_migration`/`applicationMenus` 等 options 中（`packages/core/server/src/plugin.ts:31-42`）。客户端入口通过包内 `client.js`/`client-v2.js` 约定解析。

### 2.2 server 端 Plugin 类

基类：`packages/core/server/src/plugin.ts:44`（`export abstract class Plugin<O = any>`）。核心访问器：`this.app`（Application）、`this.db`（Database）、`this.pm`、`this.ai`（aiManager）、`this.log`（87-89 行附近）。

生命周期钩子（`plugin-hello/src/server/plugin.ts:12-26` 完整列出）：

```ts
export class PluginHelloServer extends Plugin {
  async afterAdd() {}
  async beforeLoad() {}
  async load() {}
  async install() {}
  async afterEnable() {}
  async afterDisable() {}
  async remove() {}
}
```

### 2.3 完整范例：plugin-api-keys（define collections + 自定义 action + middleware）

`packages/plugins/@nocobase/plugin-api-keys/src/server/plugin.ts:52-87`：

```ts
async beforeLoad() {
  this.app.resourcer.define({
    name: this.resourceName,           // 'apiKeys'
    actions: { create, destroy },      // 自定义 action
    only: ['list', 'create', 'destroy'],
  });
  this.app.acl.registerSnippet({
    name: ['pm', this.name, 'configuration'].join('.'),
    actions: ['apiKeys:list', 'apiKeys:create', 'apiKeys:destroy'],
  });
}

async load() {
  this.app.resourcer.use(async (ctx, next) => {      // 中间件：注入数据过滤
    const { resourceName, actionName } = ctx.action;
    if (resourceName === this.resourceName && ['list', 'destroy'].includes(actionName)) {
      ctx.action.mergeParams({ filter: { createdById: ctx.auth.user.id } });
    }
    await next();
  }, { group: 'apiKeys', before: 'acl', after: 'auth' });  // 中间件排序
}
```

- collection 定义：`src/collections/apiKeys.ts`（默认导出 `CollectionOptions`，含 `dumpRules/migrationRules/shared/dataCategory/sortable/createdBy` 与 `fields` 数组，字段内含 `interface`（UI 语义）与 `uiSchema`）。v2 插件的 collection 由加载器自动 import（`plugin-hello/src/server/collections/` 目录即约定）。
- 自定义 action 写法：`src/server/actions/api-keys.ts:13-45`（读 `ctx.action.params.values`，调 `ctx.app.authManager.jwt.sign(...)` 签发 token，复用 `@nocobase/actions` 的 `actions.create`）。
- CLI 命令：`src/server/commands/generate.ts` —— 插件 `server/commands/*.ts` 会被自动加载（`packages/core/server/src/plugin-manager/plugin-manager.ts:389-424` `loadCommands()` 用 glob 收集 `server/commands/*.{ts,js}`）。

### 2.4 客户端插件

- legacy：`src/client/index.tsx`（`Plugin` from `@nocobase/client`，注册 settings 页/区块/字段 interface 等，见 `plugin-api-keys/src/client/Configuration/`）。
- modern（client-v2）：`src/client-v2/plugin.tsx` + pages（`plugin-api-keys/src/client-v2/pages/ApiKeysPage.tsx`）。
- 纯后端插件可完全省略 client 部分（plugin-hello 的 client 仅为示例）。

### 2.5 插件加载与 pm 插件管理器

- pm CLI 命令全集：`packages/core/server/src/commands/pm.ts:17-110` —— `pm list / create / pull / add / update / enable / disable / enable-all`；`pm add` 支持 `--registry --auth-token --version`（从 npm 安装）。
- 加载路径常量：`packages/core/server/src/plugin-manager/constants.ts:11-13`：
  ```ts
  export const DEFAULT_PLUGIN_STORAGE_PATH = 'storage/plugins';   // pm add 的外部插件落点
  export const DEFAULT_PLUGIN_PATH = 'packages/plugins/';          // 工程内插件
  export const pluginPrefix = (process.env.PLUGIN_PACKAGE_PREFIX || '@nocobase/plugin-,@nocobase/preset-').split(',');
  ```
- 实例化流程：`plugin-manager.ts:332-368` `addOrThrow()` → `PluginManager.resolvePlugin(packageName)` 解析包名 → `new P(createAppProxy(app), options)` → `instance.afterAdd()`。
- 插件启用状态持久化在 `applicationPlugins` 表（repository 驱动，`plugin-manager-repository.ts`）。

### 2.6 自建插件放哪里（不 fork 源码）

三条官方支持路径：

1. **独立 app 工程内**：`yarn create nocobase-app my-app` 后，把插件放进工程的 `packages/plugins/<pkg>`（模板自带该目录，`templates/app/packages/plugins/`）。开发期热载，`yarn build` 时打进产物；Dockerfile 还提供 `PLUGINS_DIRS` 构建参数（`Dockerfile:5,8`）。
2. **脚手架生成**：`nb scaffold plugin <pkg>`（`packages/core/cli/src/commands/scaffold/plugin.ts:13-40`）→ 转发 `pm create` → `packages/core/server/src/plugin-manager/plugin-manager.ts:304-330` 在 `process.cwd()/packages/plugins/<name>` 生成模板（内部复用 `@nocobase/cli-v1` 的 PluginGenerator）。
3. **npm 分发**：插件发布 npm 后 `pm add <pkg>` 安装到 `storage/plugins/`（无需碰源码）。
4. **参考样板**：`packages/plugins/@nocobase-example/`（18 个示例插件，中文说明表见 `packages/plugins/@nocobase-example/README.md`：simple-block / collection-block / custom-table-block / simple-action / settings-page 等）。
- 官方"自建插件"文档站路径：`https://docs.nocobase.com/`（`README.md:27-28` 链接；本仓库 `docs/` 目录为文档站源码）。待实测验证：v2 版 plugin development 指南的确切 URL。

---

## 3. collections 数据模型与 REST API

### 3.1 collection 定义方式

- **代码定义**（插件内）：`src/server/collections/*.ts` 默认导出 `CollectionOptions`（见 §2.3）；运行时 `db.collection({...})`（`packages/core/database/src/database.ts`）。
- **界面定义**（db2cm）：collection 元数据存 `collections`/`fields` 表，由 `plugin-data-source-main` 的 `collections`/`fields` 资源管理（`packages/plugins/@nocobase/plugin-data-source-main/src/server/collections/collections.ts`、`fields.ts`）。
- **字段类型清单**（`packages/core/database/src/fields/` 目录，29 个实现）：`string / text / boolean / number / json / date / datetime（含 no-tz/tz 变体）/ time / uuid / uid / nanoid / snowflake-id / unix-timestamp / password / radio / set / array / blob / virtual / context`，关系字段 `belongsTo / hasMany / hasOne / belongsToMany`（`belongs-to-field.ts`、`has-many-field.ts`、`has-one-field.ts`、`belongs-to-many-field.ts`）。关系字段示例（`plugin-api-keys/src/collections/apiKeys.ts:45-64`）：
  ```ts
  { interface: 'obo', type: 'belongsTo', name: 'role',
    target: 'roles', foreignKey: 'roleName', uiSchema: {...} }
  ```
- collection 级选项：`sortable / createdBy / updatedBy / logging / template（如 'file'/'tree'/'calendar'）/ inherits / view / filterTargetKey` 等。

### 3.2 REST API 规范（resourcer）

URL 解析规则（`packages/core/resourcer/src/utils.ts:55-169`）：

- 动作式：`/api/<resource>:<action>`（如 `users:list`、`attachments:upload`、`auth:signIn`）。
- REST 式（默认映射，`utils.ts:91-115`）：
  ```text
  GET    /api/<collection>            → list
  POST   /api/<collection>            → create
  GET    /api/<collection>/<index>    → get
  PUT/PATCH /api/<collection>/<index> → update
  DELETE /api/<collection>(/<index>)  → destroy
  ```
- **关联资源**（`utils.ts:104-160`，按关系类型映射）：
  ```text
  GET    /api/<assoc>/<assocIndex>/<resource>            → list（hasMany/belongsToMany）
  POST   /api/<assoc>/<assocIndex>/<resource>:set        → belongsToMany 整体设置
  POST   /api/<assoc>/<assocIndex>/<resource>/<index>:add / :remove  → belongsToMany 增删成员
  POST   /api/<assoc>/<assocIndex>/<resource>/<index>:set            → belongsTo 设置
  DELETE /api/<assoc>/<assocIndex>/<resource>            → remove
  ```
  注意：v2 的关联动作是 **`:set / :add / :remove`**（`packages/core/data-source-manager/src/load-default-actions.ts:16-66` 中注册），**不是旧文档里的 `:attach/:detach`**。
- 默认 action 全集（`load-default-actions.ts:68-79`）：`list / get / create / update / destroy / add / set / remove / toggle / firstOrCreate / updateOrCreate / query`。
- 自定义 action 注册：`app.resourcer.define({ name, actions })`（§2.3）或 `app.resourcer.registerActionHandler('<action>', handler)`（如 `'upload'`，`plugin-file-manager/src/server/actions/index.ts:36`）。

### 3.3 list 参数（分页 / filter / 关联加载）

`packages/core/actions/src/actions/list.ts:19-89`：

```ts
function findArgs(ctx) {
  const { fields, filter, appends, except, sort } = ctx.action.params; // + tree
}
// 分页响应：
ctx.body = { count, rows, page, pageSize, totalPage };
// 简单分页（大表优化）：
ctx.body = { rows, hasNext, page, pageSize };
```

- 参数：`page`（默认 `DEFAULT_PAGE`）、`pageSize`（`DEFAULT_PER_PAGE`）、`paginate=false` 关闭分页、`filter`（JSON，支持 `$eq/$ne/$in/$or/$and` 等操作符，实现于 `packages/core/database/src/operators/`）、`fields / appends / except / sort / tree`。
- query 解析用 `qs`（`packages/core/resourcer/src/utils.ts:13`），故 filter 以 URL 编码 JSON 传递：`?filter={"status":{"$eq":"paid"}}`。
- 大表自动降级 simplePaginate（`list.ts:51-65`，超 `SIMPLE_PAGINATION_LIMIT` 行自动切换）。

### 3.4 鉴权方式

**(a) 登录换 JWT**：`POST /api/auth:signIn`，header `X-Authenticator: basic`，body `{account, password}`（`packages/core/auth/src/actions.ts:59-63`；测试用例 `packages/core/auth/src/__tests__/middleware.test.ts:158-198`）。返回 `{ token }`。认证类型可扩展（`authManager.registerTypes('basic', ...)`，`packages/core/auth/src/__tests__/auth-manager.test.ts:62`；短信等见 `plugin-auth-sms`）。

**(b) 携带 token**：`Authorization: Bearer <token>` 或 query `?token=`（`packages/core/auth/src/base/auth.ts:305-311` 同时支持；`middleware.test.ts:182-198` 两种均验证）。

**(c) API Token / API key（程序集成首选）**：`plugin-api-keys` 提供长期 token：
- 创建：`POST /api/apiKeys:create`（body `values: { name, role: {name}, expiresIn }`）→ 响应 `{ data: { token } }`（`plugin-api-keys/src/server/actions/api-keys.ts:13-45`）。
- token 绑定**角色**：`ctx.app.authManager.jwt.sign({ userId, roleName }, { expiresIn })`（同文件 30-33 行）→ 之后所有请求按该角色过 ACL。
- 有效期选项：`1d/7d/30d/...`（`src/collections/apiKeys.ts:66-80` enum）。
- 吊销：`apiKeys:destroy` 会 `jwt.block(token)` 拉黑（`actions/api-keys.ts:47-58`）。
- 验证用例：`plugin-api-keys/src/server/__tests__/actions.test.ts:97-99`（`agent.set('Authorization', 'Bearer ' + token)` 直接调资源成功；过期 token 返回 401）。
- 也提供 CLI 生成命令（`src/server/commands/generate.ts`）。

**(d) ACL 角色与权限粒度**（`plugin-acl` + `packages/core/acl`）：
- 角色：`roles` collection，用户多角色（`rolesUsers`）；默认三角色 `root / admin / member`（`plugin-acl/src/server/server.ts:437-460`，member 默认 `strategy: { actions: ['view:own'] }`）。
- 粒度三层：资源-动作（`rolesResourcesActions`）→ 字段（actions 的 fields 白/黑名单）→ 数据范围（`rolesResourcesScopes`，用 filter 表达行级范围）。
- snippet 机制：`acl.registerSnippet({name, actions})` 声明插件权限片段，角色勾选（`plugin-api-keys/src/server/plugin.ts:62-65`）。
- root 全放行：`this.app.acl.allow('*', '*', (ctx) => ctx.state.currentRoles?.includes('root'))`（`plugin-acl/src/server/server.ts:504-505`）。

**(e) 无认证（public）访问**：`app.acl.allow(resource, action, 'public')` 即匿名可访问；匿名角色名为 `anonymous`（`packages/core/acl/src/acl.ts:374-393`；`packages/core/acl/src/allow-manager.ts:28`）。示例：`acl.allow('attachments', ['upload','create'], 'loggedIn')`（`plugin-file-manager/src/server/server.ts:380`）。

**(f) Swagger**：`plugin-api-doc`（`packages/plugins/@nocobase/plugin-api-doc/`）；`plugin-api-keys/src/swagger/index.ts` 展示了插件自定义 swagger 文档的方式。

---

## 4. 数据源插件体系（重点）

### 4.1 核心抽象

`packages/core/data-source-manager/src/data-source.ts:27-83`：

```ts
export abstract class DataSource extends EventEmitter {
  public collectionManager: ICollectionManager;
  public resourceManager: ResourceManager;   // 独立的资源/路由管理
  public acl: ACL;                            // 每数据源独立 ACL
  init(options) {
    this.acl = this.createACL();
    this.resourceManager = this.createResourceManager({ prefix: process.env.API_BASE_PATH, ... });
    this.collectionManager = this.createCollectionManager(options);
    this.resourceManager.registerActionHandlers(loadDefaultActions());
    if (options.acl !== false) {
      this.resourceManager.use(this.acl.middleware(), { tag: 'acl', after: ['auth'] });
    }
  }
}
```

- Repository 契约（`types.ts:115-131`）：`find / findOne / count / findAndCount / create / update / destroy` —— **接口层面读写双向都支持**，自定义数据源可自行实现。
- Collection 契约（`types.ts:88-107`）支持 `availableActions()/unavailableActions()` 声明能力边界。

### 4.2 注册与实例化

- 类型注册：`app.dataSourceManager.factory.register(type, DataSourceClass)`（`packages/core/data-source-manager/src/data-source-manager.ts:111-113`）。
- 创建实例：向 `dataSources` collection 写记录（`plugin-data-source-manager/src/server/collections/data-sources.ts`）：
  ```ts
  await app.db.getRepository('dataSources').create({
    values: { key: 'mockInstance1', type: 'mock', displayName: 'Mock', options: {} },
  });   // 见 src/server/__tests__/data-sources.test.ts:53-60
  ```
  保存时按 `type` 从 factory 取类实例化（`plugin-data-source-manager/src/server/plugin.ts:188` `factory.getClass(type)`）。
- main 数据源：`packages/core/server/src/main-data-source.ts:16` `export class MainDataSource extends SequelizeDataSource`；`app.mainDataSource`（`packages/core/server/src/application.ts:358-360`）。
- **v2 内置的外部数据源类型只有 `sequelize`**（连接外部 postgres/mysql 等数据库 + 表结构 introspection：`packages/plugins/@nocobase/plugin-data-source-manager/src/server/middlewares/load-tables.ts`、`packages/core/data-source-manager/src/database-introspector/`、类型推断 `src/server/services/type-interface-map.ts`）。UI 侧即"数据源 → 连接数据库"（`src/client/component/CreateDatabaseConnectAction.tsx`）。
- 外部数据源的 collection/字段元数据存 `dataSourcesCollections` / `dataSourcesFields` 表（`plugin-data-source-manager/src/server/collections/`），可逐表选择载入。
- 每个数据源的 ACL 独立配置（`dataSourcesRoles` / `dataSourcesRolesResources*`，`plugin.ts:509-640`；测试 `src/server/__tests__/data-source-with-acl.test.ts`）。

### 4.3 外部 REST API 数据源的能力边界（关键结论）

- **v2 主仓库没有 REST 数据源插件**。证据：`packages/plugins/@nocobase/` 插件全列表（98 个）中无 `plugin-data-source-rest-api`；全仓库 md/ts 检索 `data-source-rest|rest-data-source` 零命中。v1 生态的 `@nocobase/plugin-data-source-rest-api`（可把外部 REST API 映射成 collection）是否发布 v2 兼容版**待实测验证**（本次无网络）。
- 若走此路需自研：写 `DataSource` 子类 + 自定义 `CollectionManager/Repository`（把 find/create/update/destroy 翻译成对 DSH apiproxy 的 HTTP 调用），再 `factory.register('dsh-rest', ...)`。Mock 数据源的测试（`data-sources.test.ts:26-70`）展示了最小实现面：`static testConnection()` + `load()` + `createCollectionManager()`。
- 理论能力：映射成 collection 后即可被区块/表单/工作流变量消费（客户端按数据源 key 访问 `/api/<ds>:<collection>:list` 形式，由各数据源 resourceManager 承接）；**双向写在接口上可行**（IRepository 含 create/update/destroy），但 filter/分页/排序下推、schema 同步、字段类型映射（`type-interface-map.ts`）都需自行实现，工作量与不确定性最高。
- 结论：**不建议**把"外部 REST → collection"当作主集成路径；数据库型外部源（如 DSH 侧落库后把 Postgres 挂进来）是现成能力。

---

## 5. workflow 插件

### 5.1 架构与扩展点

- 核心：`plugin-workflow`。注册 API（`packages/plugins/@nocobase/plugin-workflow/src/server/Plugin.ts:302-328`）：
  ```ts
  workflowPlugin.registerTrigger(type, TriggerClass);      // this.triggers.register(...)
  workflowPlugin.registerInstruction(type, InstructionClass); // this.instructions.register(...)
  ```
- 内置触发器（`src/server/triggers/`）：
  - **CollectionTrigger**：表数据事件——`afterCreateWithAssociations / afterUpdateWithAssociations / afterDestroy`（`CollectionTrigger.ts:43-45`），即"表单/数据提交触发"。
  - **ScheduleTrigger**：定时——cron 表达式（`cron-parser`，`StaticScheduleTrigger.ts:10`）+ 按记录日期字段排程（`DateFieldScheduleTrigger.ts`）。
- 插件触发器：`plugin-workflow-action-trigger`（界面动作/按钮触发）、`plugin-workflow-custom-action-trigger`、**`plugin-workflow-request-interceptor`（拦截指定 REST 请求触发流程，可先审批后放行/改写响应**——`src/server/Plugin.ts:15-20` 注册 `request-interception` 类型）。
- 内置节点（`src/server/instructions/`）：calculation / condition / multiConditions / **create / update / destroy / query（对任意 collection CRUD）** / end / output。
- 插件节点：`manual`（人工/审批）、`request`（HTTP）、`sql`、`javascript`、`loop`、`parallel`、`delay`、`aggregate`、`notification`、`mailer`、`response-message`、`json-query`、`variable`、`cc` 等（见 `packages/plugins/@nocobase/` 目录 `plugin-workflow-*` 共 18 个）。

### 5.2 审批节点（存在，且是"人工任务"模型）

`plugin-workflow-manual/src/server/ManualInstruction.ts:42-73`：

```ts
async run(node, prevJob, processor) {
  const { mode, ...config } = node.config;      // mode: 会签(多任务人全部处理)/或签
  const assignees = [...new Set(processor.getParsedValue(config.assignees, node.id).flat().filter(Boolean))];
  const job = processor.saveJob({ status: assignees.length ? JOB_STATUS.PENDING : JOB_STATUS.RESOLVED, ... });
  await TaskRepo.createMany({ records: assignees.map((userId) => ({
    userId, jobId: job.id, executionId: job.executionId, status: JOB_STATUS.PENDING, title })) });
}
```

- 多任务人（assignees 可为变量/角色解析）、会签/或签（mode）、配套表单类型 `custom/create/update`（`src/server/forms/`），任务落 `workflowManualTasks` 待办。
- 配合 `condition` 节点按审批结果（通过/驳回）分支，即构成审批流。

### 5.3 HTTP 节点（连接 DSH 的桥梁）

`plugin-workflow-request/src/server/RequestInstruction.ts:33-38`：

```ts
export type RequestInstructionConfig = Pick<AxiosRequestConfig, 'url'|'method'|'params'|'data'|'timeout'> & {
  headers?: Header[]; contentType: string; ignoreFail?: boolean; onlyData?: boolean;
};
```

- 支持任意 URL/method/headers/params/body/timeout；`multipart/form-data` 模式还能把 NocoBase 附件作为文件字段转发给外部 API（`RequestInstruction.ts:81-110`，经 `plugin.getFileStream(file)` 读流拼 FormData）。
- 出站请求受 `SERVER_REQUEST_WHITELIST` 白名单约束（`.env.example:99-106`）。

### 5.4 "用户下单 → 审批 → 交付"可行性判定：**可行，全部用现成节点**

推荐编排：`CollectionTrigger`（orders 表 afterCreate）→ `manual`（运营商/管理员审批，会签或或签）→ `condition`（通过/驳回分支）→ `request`（POST DSH apiproxy 触发交付/生成）→ `update`（回写订单状态）。驳回分支可走 `notification`（邮件/站内信）。定时对账用 `ScheduleTrigger`。

---

## 6. 文件与附件

### 6.1 存储机制

- 插件：`plugin-file-manager`（v2 已把多后端**内置**，不再是独立 S3 插件）。存储类型（`src/constants.ts:16-19`）：
  ```ts
  export const STORAGE_TYPE_LOCAL = 'local';
  export const STORAGE_TYPE_ALI_OSS = 'ali-oss';
  export const STORAGE_TYPE_S3 = 's3';
  export const STORAGE_TYPE_TX_COS = 'tx-cos';
  ```
  注册于 `src/server/server.ts:334-337`；扩展点 `plugin.registerStorageType(type, Class)`（`server.ts:157-158`）。默认存储为 local（`server.ts:42`）。
- 本地存储路径：默认 `storage/uploads`（`src/server/storages/local.ts:21` `DEFAULT_BASE_URL = '/storage/uploads'`；`local.ts:69-71` documentRoot 取 `storage.options.documentRoot ?? process.env.LOCAL_STORAGE_DEST ?? <storage>/uploads`，可用环境变量改根路径）。S3 引擎走 `@aws-sdk/lib-storage` Upload 流式上传（`storages/s3.ts:128-144`，默认配置读 `AWS_S3_STORAGE_BASE_URL` 等环境变量，`s3.ts:40-42`）。
- 存储规则：mimetype 白名单、大小限制、路径穿越防护（`actions/attachments.ts:38-53`、`rules/`、大量用例）。
- attachments collection：`src/common/collections/attachments.ts`（title/filename/extname/mimetype/size/url/path/readonly meta）；业务表加"附件字段"（collection template `file` 或字段 interface attachment）即可挂文件。

### 6.2 上传接口形态（外部系统挂 PDF 到订单）

- **multipart 上传**：`POST /api/attachments:upload`，form-data 字段名 **`file`**（`src/server/actions/attachments.ts:197` `multer(multerOptions).single(FILE_FIELD_NAME)`；action 注册 `src/server/actions/index.ts:36` `registerActionHandler('upload', actions.create)`）。权限 `loggedIn`（`server.ts:380`）。
- 也可对任意 file 模板 collection 上传：`POST /api/<fileCollection>:upload`（`actions/attachments.ts:230-232` 判断 `template === 'file'`）。
- **免流注册（关键技巧）**：`POST /api/attachments:create` 直接传元数据（title/filename/extname/size/mimetype/**url**）不传文件流——用例 `src/server/__tests__/server.test.ts:412-421`（`direct-upload`：`values: { title:'direct-upload', filename, extname, size, url:'https://bucket.example.com/direct-upload.txt', mimetype }`）。含义：**DSH 侧生成 PDF 后两种接法**：
  1. DSH 把 PDF 字节流 multipart POST 到 `attachments:upload`（NocoBase 落本地/S3）；
  2. DSH 自存（如对象存储）后调 `attachments:create` 注册外部 URL，再把返回的 attachment id 通过订单记录更新挂上（`POST /api/orders/<id>:update` values 含附件字段，或 `orders/<id>/attachments:set`）。
- 服务端程序化上传：`plugin.uploadFile({ storageName, subPath, filePath })`（`server.ts:181-190`），工作流/插件内部可用。

---

## 7. 多租户 / 权限模型

### 7.1 现有构件

- **角色**：`plugin-acl` 的 `roles`（多角色、默认角色、`allowConfigure`）+ `rolesUsers`；root/admin/member 预置（§3.4d）。
- **权限粒度**：资源-动作 → 字段 → 行级 scope（filter）；跨数据源独立 ACL（§4.2）。
- **部门**：`plugin-departments`（`src/server/collections/`）：
  - `departments.ts`：树形（parentId，isLeaf 维护见 `middlewares/update-department-isleaf.ts`）；
  - `departmentsUsers.ts`：用户-部门多对多 + `mainDepartmentId`（`migrations/migrate-main-department-id-20250828100101.ts`）；
  - `departmentRoles.ts`：**部门维度绑定角色**（同一全局角色在不同部门可不同）；
  - 部门负责人（owners，`middlewares/set-department-owners.ts`）。
- **用户组织表达力**：部门树（任意深度）× 部门角色 × 多角色，行级数据范围用 scope filter（如 `{"departmentId":{"$in":"{{$user.departments}}"}}` 类变量，配合 `plugin-custom-variables`）。

### 7.2 "平台-场景运营商-企业-用户"四级租户判定

- **同一实例内近似表达：可以，但非硬隔离**。方案：四级各建角色（platform/operator/enterprise/user）+ departments 树（平台 → 运营商 → 企业节点，用户挂叶节点）+ 每级数据 scope。适合 MVP 与中等规模。
- 局限：无原生 tenant 概念——所有数据同库同表，隔离靠 filter（存在配置错误泄漏风险）；跨企业报表/全局搜索需自行聚合。
- **硬隔离选项**：`plugin-multi-app-manager`（每个租户一个子应用/子库）+ `plugin-multi-app-share-collection`（共享集合），代价是运维多实例。证据：`packages/plugins/@nocobase/plugin-multi-app-manager/`、`plugin-multi-app-share-collection/` 存在（能力细节未深入，属商业插件范畴的以 `plugin-license` 相关为准，待实测验证）。
- 结论：MVP 用"角色+部门+scope"软隔离；规模上来后按企业拆 multi-app。

---

## 8. 对接方案评估（A/B/C）

### 路径 A：DSH 仅经 REST API 调用 NocoBase（Bearer token）作业务后台

- **证据支撑**：REST 全量 CRUD + 关联 + 分页 filter（§3.2/3.3）；API token 与角色绑定、可吊销（§3.4c）；附件双向（§6.2）；workflow 可用 CollectionTrigger+request 节点把"NocoBase 侧事件"回调 DSH（§5.3）；Swagger 有 plugin-api-doc；另有 **`plugin-mcp-server` 暴露 `/api/mcp` MCP 端点**（OAuth2 resource server，`src/server/plugin.ts:29-52`，含 CRUD 工具生成 `crud-tool.ts`）——DSH agent 未来可直接以 MCP 客户端身份接入。
- **优点**：零侵入、升级安全（不碰 NocoBase 内部）；权限天然受 ACL 约束（token 即角色）；双向可达（NocoBase→DSH 用 workflow request 节点推送，DSH→NocoBase 用 REST）。
- **缺点**：深度定制受限（复杂业务逻辑只能塞进 workflow 的 JS/SQL 节点）；每张表/collection 需在 NocoBase 界面或经 REST 建（也可由 DSH 程序化调 `collections:create`，`plugin-data-source-main/src/server/resourcers/collections.ts`）。
- **最小工作量**：DSH 侧一个 NocoBase REST client（token 刷新/重试）+ 数据模型初始化脚本 + 3–5 个 workflow 模板。**约 2–5 人日**。

### 路径 B：自建 NocoBase 插件

- **证据支撑**：脚手架 `nb scaffold plugin`（§2.6）；18 个 `@nocobase-example` 样板；模板插件展示 collection/action/middleware/节点/存储类型全部扩展点（§2.3、§5.1、§6.1）；独立 app 工程 `packages/plugins/` 本地开发无需 fork 源码；分发可 `pm add` npm 包。
- **适合**：需要自定义界面区块（订单驾驶舱）、自定义 workflow 节点（"调 DSH 生成报告"做成可复用节点）、或把 DSH KB 查询封装成 NocoBase 内的 action。
- **缺点**：需遵循 v2 双客户端体系（legacy + modern 两套 UI API，`CONTEXT.md`）；构建链（rsbuild/father）与调试有学习成本；AGPL 双许可需法务确认（自用部署不分发则 AGPL 义务有限，**待法务验证**）。
- **最小工作量**：纯 server 插件（自定义 action + collection）**1–3 人日**即可跑通；带完整 UI 区块 **1–3 周**。加载：独立工程 `packages/plugins/` 内直接启用，或发布 npm 后 `pm add`。

### 路径 C：NocoBase 数据源插件指向 DSH apiproxy 的 REST API

- **证据支撑（负面为主）**：v2 主仓库无 REST 数据源插件（§4.3）；自研需实现 DataSource + CollectionManager + Repository 全链（filter/分页翻译、类型映射、schema 同步），mock 测试可见最小面但仍需 HTTP 化；能力边界：能映射成 collection 供区块展示，写路径接口存在但全靠自实现。
- **结论**：**不推荐作为主路径**。若只是"让 NocoBase 界面能看到 DSH 数据"，更快的替代是 (1) DSH 把结果落 Postgres 表 → 用现成的 sequelize 外部数据源连接（§4.2，零代码）；(2) 或走路径 B 写个定时同步 action。
- **最小工作量**：自研 REST DataSource 插件 **3–6 人周**（高不确定性）。

### 推荐组合

**A 为主 + B 按需补充**：NocoBase 作企业侧业务后台（订单/审批/文件/权限），DSH 经 REST token 写读；NocoBase workflow 的 request 节点回调 DSH apiproxy 触发交付与报告生成；PDF 经 `attachments:create`(外部 URL) 或 `attachments:upload` 挂订单。当需要"在 NocoBase 界面内嵌 KB 问答/生成按钮"时再做路径 B 的第一个插件（纯 server action 起步）。C 路径仅在"必须让 DSH 数据出现在 NocoBase 区块且不能落库"时评估。

---

## 9. 中文文档与辅助资源（仓库内）

- `README.zh-CN.md`（根，中文安装/特性说明；安装段 38-53 行）
- `packages/plugins/@nocobase-example/README.md`（**中文**示例插件目录表：区块/操作/资源/字段四类 18 个）
- `CHANGELOG.zh-CN.md`（根）
- 各插件 `src/locale/zh-CN.json`（界面文案，18 语言全集）
- `CONTEXT.md`（客户端双运行时术语，英文）
- `AGENTS.md` / `CLAUDE.md`（仓库的 AI 协作规范，英文）
- 官方文档站：`https://docs.nocobase.com/`（中文 `/cn/` 路径；本仓库 `docs/` 为其源码投影）
- `examples/`（根目录，可运行示例入口 `scripts/run:example`，`package.json:51`）

## 10. 未决事项（需实测/外部验证）

1. `@nocobase/plugin-data-source-rest-api`（v1 生态包）是否已发布 v2 兼容版本——本次无网络未能核实；若存在可直接改判路径 C 成本。
2. `plugin-multi-app-manager` 子应用隔离的具体能力边界（是否含企业级租户计费/域名）未深入。
3. 源码仓库 `DB_DIALECT=sqlite` 本地跑通的实测（核心代码支持，但官方安装器不提供该选项，可能存在边角问题如 `.env.example` 未含 `DB_STORAGE` 示例）。
4. v2 双客户端（legacy/modern）生产成熟度：modern client（`/v/` 前缀）是否已可作默认入口（`CONTEXT.md` 记录了三种 entry mode 的演进）。
5. AGPL-3.0/商业双许可对"内部部署+不对外分发"场景的义务边界——需法务确认。
