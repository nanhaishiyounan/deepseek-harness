# platform/nocobase — NocoBase 2.2.6 隔离快照

本目录是 NocoBase 2.2.6 的源码快照，作为本项目的**企业日常业务系统主体**
（架构 v2 地基：数据源、订单审批、业务 collections 均在此）。它是独立的
yarn 1 workspace 子树：**用 yarn 安装运行，不参与根 pnpm workspace**，
根 `pnpm-workspace.yaml` 对它零改动、零吸收。

## 定位

- 上游：NocoBase 2.2.6（来源、排除清单、license 立场、本地修改登记见
  [MANIFEST.md](MANIFEST.md)；修改声明见 [NOTICE.md](NOTICE.md)）。
- 隔离先例：`native/landlock-run`（独立子树自带工具链与门禁豁免）。与
  `vendor/` 的 vendoring 合同（rescope + manifest 义务）无关——rescope 会破坏
  `@nocobase/plugin-*` 运行时插件名解析。
- 边界：NocoBase 代码永不进入 `@deepseek-ai/dsh-*` 发布包；DSH Web 不引入
  NocoBase 前端（React18/antd5/formily 双树隔离）；两侧仅经 REST
  （`packages/connector/connector-nocobase`）与数据层 postgres 交互。
- 对快照源码的任何修改必须登记 `MANIFEST.md` local-modifications。

## 构建（yarn 1，勿用 pnpm --dir）

```sh
cd platform/nocobase
yarn install        # 首次约 15 分钟；postinstall 生成 tsconfig.paths.json 并复制 .env.example → .env
```

`.env` 默认即 `DB_DIALECT=postgres`、`localhost:5432/nocobase`。本机 postgres
由 `examples/kb-agent/scripts/setup-nocobase.mts install` 的 ensurePostgres
幂等引导（pg_ctl 拉起 + 建 role/database）。

## 启动

```sh
yarn nocobase install   # 初始化库表+内置插件+超管（tsx 直跑 src，无需 build）
yarn dev-server         # server 监听 :13000（全栈 yarn dev 另占 13001/13002）
```

日常推荐经仓内轨道一键驱动（安装/启动/初始化/校验/停止/重置六命令，会指向
本目录）：

```sh
node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts all
```

生产路线：`yarn build` → `yarn start`（pm2-runtime 跑构建产物）。

## 与本仓库的关系

- DSH 侧消费面：`packages/connector/connector-nocobase`（REST 客户端五动作）、
  `examples/kb-agent` 的 expert-orders/orders 域（下单→审批 workflow→PDF 交付）。
- 凭据：`NOCOBASE_BASE_URL` / `NOCOBASE_API_KEY` 写入仓库根 `.env`（setup 脚本
  writeEnv）；与源码位置解耦。
- 端口矩阵：DSH 3080/3081，NocoBase 13000/13001/13002，postgres 5432 唯一共享。
- 根仓库门禁对此子树豁免（oxlint ignore、gitattributes `-text` 等，见仓库
  `.oxlintrc.json` / `.gitattributes` / `lefthook.yml`）。

## 升级 = 重新快照

按 MANIFEST.md 的 rsync 命令对齐新上游版本 → 核对排除清单 → 更新 MANIFEST →
重放 local-modifications 补丁。不使用 git submodule。
