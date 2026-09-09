# NocoBase 源码快照 MANIFEST

## upstream

- 项目：NocoBase（NO-CODE 平台，企业业务系统主体）
- 版本：2.2.6（`lerna.json` `"version": "2.2.6"`）
- 来源仓库：https://github.com/nocobase/nocobase
- 版本参照：GitHub release/tag `v2.2.6`
- 快照形态：源码 zip 展开（上游 `.git/` 为残壳、无历史），本地先落至
  `/Users/mac/Documents/github/nocobase-main` 后由 rsync 并入本仓库

## snapshot

- snapshot-date：2026-09-06
- 来源路径：`/Users/mac/Documents/github/nocobase-main`（2.2.6，yarn1 已安装状态）
- 复制命令（可复现）：

  ```sh
  rsync -a \
    --exclude 'node_modules/' --exclude 'storage/' --exclude '.git/' \
    --exclude '.env' --exclude '.env.test' \
    --exclude 'dist/' --exclude 'coverage/' \
    --exclude '.turbo/' --exclude '.nx/' --exclude '.cache/' --exclude '.repo/' \
    --exclude 'tsconfig.paths.json' \
    --exclude 'docs/' \
    <上游源>/ platform/nocobase/
  ```

- 规模：约 14,031 文件（`find platform/nocobase -type f | wc -l`）

## exclusions

| 条目 | 理由 |
|---|---|
| `node_modules/` | 可由 `yarn install` 重建（yarn1 lockfile 锚定） |
| `storage/` | 运行残留：aes_key.dat、jwt_secret.dat、gateway.sock、订单 PDF（敏感） |
| `.git/` | 上游 zip 残壳，无历史 |
| `.env`、`.env.test` | 真实凭据（APP_KEY、DB_PASSWORD、INIT_ROOT_PASSWORD）；仅保留 `.env*.example` 模板 |
| `dist/`、`coverage/`、`.turbo/`、`.nx/`、`.cache/`、`.repo/` | 构建产物/缓存，防未来残留混入 |
| `tsconfig.paths.json` | postinstall 生成物，install 后自动重建；保留则与重同步 diff 冲突 |
| `docs/` | 上游文档站（94M/约 1.2 万文件），与运行无关；需要时单独同步 |

## local-modifications

首次同步为空。此后对 NocoBase 源码的任何修改必须在本表登记（Apache-2.0 §4(b)
显著标注修改义务），并建议以独立补丁文件承载以便重同步：

| 日期 | 文件 | 修改摘要 | 补丁 |
|---|---|---|---|

## license 立场

- 现行许可：**Apache-2.0 全文 + NocoBase 补充条款**（v2.0.3 / 2026-02-24 由
  AGPL-3.0 变更，证据：上游 `CHANGELOG.md` 与 `LICENSE.txt` §4.2）。以本快照
  固化的 `LICENSE.txt` 为准（上游协议含单方修约条款 §9，快照固化所取版本）。
- 9,450 个源文件头注释仍为 "dual-licensed under AGPL-3.0 and NocoBase
  Commercial License"——官方未随 v2.0.3 迁移清理，**不可移除**（LICENSE.txt §5.3），
  license 扫描器会因此误报 AGPL，以正式许可文件为准。
- 义务边界：内部部署无网络源码披露义务；对外提供基于 NocoBase 的
  no-code/AI platform SaaS/PaaS 被禁止（§5.4）；界面品牌除左上角主 LOGO 外不可
  移除（§5.2）。
- **NocoBase 代码永不进入 `@deepseek-ai/dsh-*` 发布包**（npm files 白名单 +
  `scripts/publication-payload.ts` 拒绝规则）。
- pro 商业插件不在开源仓，本快照不包含、永不复制。
- 详见 [NOTICE.md](NOTICE.md) 与调研报告
  [research/2026-09-06-nocobase-integration/sections/01-nocobase-source-integration.zh.md](../../research/2026-09-06-nocobase-integration/sections/01-nocobase-source-integration.zh.md) §3。

## 升级路径

升级 = 重新快照：按上方 rsync 命令对齐新版本上游源 → 核对 exclusions →
更新本 MANIFEST 的 upstream/snapshot 节 → 将 local-modifications 补丁重放或
重新裁决。不使用 git submodule（上游 zip 无 git 历史）。
