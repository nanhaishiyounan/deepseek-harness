# Agent Note: NocoBase 2.2.6 源码快照落位 platform/nocobase

Status: implemented

[English](2026-09-06-nocobase-snapshot-in-repo.md) | 中文

## Problem

架构 v2 要求 NocoBase 作为企业业务系统（订单、审批、业务 collections）进入本仓库，取代 v1 的"对外部目录的 REST 对接"立场（research/2026-09-03-connector-lakehouse-nocobase/nocobase.md）。待决问题是：159 包的 yarn-1 monorepo 以什么仓内形态落地，才能不破坏根 pnpm workspace、门禁、覆盖率与 `@deepseek-ai/dsh-*` 发布面；以及 2.2.6 快照的 license 立场。

## Decision

### 隔离快照 `platform/nocobase/`，不走 vendoring

NocoBase 以顶级隔离快照子树落地（仿 `native/landlock-run` 的"独立子树自带 gates"先例），保留其 yarn-1 workspace 自洽与 `packages/*/*` 相对布局（genTsConfigPaths 依赖目录深度）。根 `pnpm-workspace.yaml` 零改动：现有 glob 均不匹配 `platform/`，`pnpm install` 与 `pnpm ls -r` 永远看不见这 159 个上游包。快照为 NocoBase 2.2.6（lerna.json `"version": "2.2.6"`）的 14,031 文件 / 112 MB，排除 `node_modules/`、`storage/`、`.git/`、`.env`、`.env.test`、`dist/`、`coverage/`、`.turbo/`、`.nx/`、`.cache/`、`.repo/`、`tsconfig.paths.json` 与 `docs/`（上游 94M 文档站，首期不入）。来源、排除清单、本地修改台账与 license 立场固化在 `platform/nocobase/MANIFEST.md` 与 `platform/nocobase/NOTICE.md`。

### 四处门禁免疫（完整清单）

- `.oxlintrc.json` + `.oxlintrc.staged.json`：`ignorePatterns` 增加 `"platform/**"`（CI 全仓 lint 与 lefthook staged lint 两处触达一并消除），另加 `"research/**"` 覆盖 research/*/sources 下的上游证据副本。
- `.gitignore`：`platform/nocobase/**/dist/`、`platform/nocobase/**/storage/`、`platform/nocobase/.repo/`（node_modules/lib/coverage/.env 已被非锚定规则覆盖）。
- `.gitattributes`：`platform/nocobase/** -text`——上游字节原样保留，重同步时与上游 tag 干净 diff。
- `lefthook.yml` whitespace job 排除 `platform/nocobase/**`（上游尾随空白不是本仓库的风格债）。

其余门禁全部白名单锚定、天然免疫：typecheck（solution `files: []`，references 未动）、vitest/coverage（`packages/*/*/src/**` glob）、knip（按 workspace 成员推导）、publint、constraints、node-next-types、doc-sync（全部 verify-* PATTERNS）、third-party notices（从 pnpm-workspace 成员推导，空跑无 diff）。

### 发布防护

`scripts/publication-payload.ts` 拒绝一切 `nocobase/` 目录下的 payload 路径（manifest `files` 条目与 tarball 成员两个消费面），NocoBase 代码因此不可能泄入 `@deepseek-ai/dsh-*` 发布物。`dsh-connector-nocobase` 的 payload（`lib/*`）不受影响——规则匹配路径段，不匹配包名。

### License 立场

NocoBase 2.2.6 现行许可为 Apache-2.0 全文 + NocoBase 补充条款（v2.0.3 / 2026-02-24 前为 AGPL-3.0；上游 CHANGELOG #8682 与 LICENSE.txt 快照为权威——9,450 个文件头仍带旧 AGPL dual-license 字样，须按 LICENSE.txt §5.3 原样保留）。内部部署无网络源码披露义务；对外提供 no-code/AI 平台 SaaS 被禁止（§5.4），需商业授权。pro 插件不在开源仓，永不复制。完整分析见调研盲区 A 报告 §3。

### 轨道仓内化

`examples/kb-agent/scripts/setup-nocobase.mts` 的 `NOCOBASE_HOME` 默认值从仓库同级 `../nocobase-main` 改为仓内 `platform/nocobase`；六命令（install/start/init/verify/stop/reset）、ensurePostgres、writeEnv 原样保留，QUICKSTART.zh.md 表述同步。`NOCOBASE_BASE_URL` / `NOCOBASE_API_KEY` 仍指向 `:13000`，connector-nocobase、expert-orders 与 nocobase-track e2e 零改动。

## Consequences

- 升级 = 重新快照：按 MANIFEST 的 rsync 命令对齐新上游 release、更新 MANIFEST、重放或重新裁决 local-modifications。上游源是 zip、无 git 历史可合并。
- 对 NocoBase 源文件的一切修改必须登记 MANIFEST local-modifications 台账（Apache-2.0 §4(b) 修改标注义务），建议以补丁文件承载便于重同步。
- NocoBase 永不进 dsh 发布物（发布防护），永不加入 pnpm workspace；其 yarn-1 lockfile 是唯一安装锚点（`cd platform/nocobase && yarn install`，禁用 `pnpm --dir`）。
- 根仓库 lint/typecheck/test/doc-sync 矩阵在上述免疫下保持全绿；`git status` 承受约 1.4 万快照文件是一次性成本。

## Alternatives considered

### Why not `vendor/nocobase`？

`vendor/*` workspace glob 一接触即吸为成员：`allowBuilds` 把其大量 postinstall 依赖树变成硬 install 错误；constraints 要求 `"private": true` 与 `workspace:` 协议；third-party notices 会把全依赖树拉进披露清单；vendoring 合同的 rescope 到 `@deepseek-ai` 会破坏 `PLUGIN_PACKAGE_PREFIX='@nocobase/plugin-'` 的运行时插件名解析。

### Why not pnpm workspace 吸收？

上游 157/159 包是 CJS，与本仓库 ESM-only 规则冲突；React 18 + antd 5 + formily 会与 DSH web 客户端共装一棵 node_modules 树；yarn-1 lockfile 无法并入 pnpm；per-file 100% 覆盖率门会被 159 个新成员淹没。

### Why not git submodule？

上游源是 zip 附 4K 空壳 `.git`（无历史），且嵌套 git 仓会腐蚀 Roo-Code checkpoints（vendoring 政策）。快照 + MANIFEST 是唯一同时支持重同步与就地修改留痕的形态。
