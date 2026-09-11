# Agent Note: connector-file 缺失 root —— 加载期建目录、discover 期降级空列表

Status: implemented

[English](2026-09-10-connector-file-missing-root-provisioning.md) | 中文

## Problem

干净检出后打开工作台「数据资产」tab，整个市场报 `ENOENT: scandir .../workspace/data/connector-files`（「市场暂不可用」）而失败。三重缺口叠加：没有任何代码或 setup 步骤创建过该目录；git 无法携带白名单里的空目录（`.gitignore` 已放行 `!workspace/data/connector-files/`，但目录内没有被跟踪文件）；provider 的 fail-loud 约定把一个缺失的投递目录放大成 500，掩盖了 NocoBase 侧其余 174+ 资产。QUICKSTART 的唯一对策是手动 `mkdir -p`，其 FAQ 甚至预告了首启必崩。

## Decision

### 加载期 ENOENT 建 root；其余 errno 仍让组合 fail-loud

`apply()` 对加载期 `readdir` 只捕获 `ENOENT`，用 `mkdir(root, { recursive: true })` 重建 root；`ENOTDIR`（路径被普通文件占据）、`EACCES` 及其余错误仍让组合加载 fail-loud。裁决依据：目录不存在是部署尚未初始化的合法首启状态——「错误配置要 fail loud」从来不意味着「空投递目录是一种配置错误」。

### discover 期 ENOENT 回答空数据集而非错误

组合运行期间 root 被删时，`discover()` 返回 `[]`——同样只吞 `ENOENT`，其余照抛。这刻意把 runtime 的 fail-fast fan-out（任一 provider 抛错即整体 `connector.discover` 失败）与 file provider 对空文件集的诚实回答解耦：投递目录被抹掉应当只让市场少一类资产，而不是打挂整个页面。`available()` 保持恒真。

### 目录随仓库自带内容：三个 git 跟踪的 sample 文件

`.gitignore` 既有的白名单从此有了实际承重：`sample-supplier-prices.csv`、`sample-export-compliance.md`、`sample-shipment-events.json`（食品行业语境，`sample-` 前缀标明演示用途）让 clone 落地即有目录、有可发现的 file 资产。插件级自动建目录仍是运行期兜底，覆盖运行中被删与检出早于这些文件的部署。setup 链的 `ensure` 有意不进本修复——批次 B2 的 `setup-dsh-data` 编排统一持有它。

### 过期的 `src/*.js` 构建产物劫持了 e2e 通道，本包五个产物已删除

commit 57a87db34c 曾在 TypeScript 源码旁提交了 `src/index.js`、`src/provider.js` 及其 map。vitest 的 tsconfig-paths 解析下，vite 对无扩展名 workspace 路径按 `.js` 先于 `.ts` 解析，于是 market e2e 通道悄悄跑着过期的 JavaScript，而单测直接 import `../src/index.ts` 一直通过。源码与产物一旦分叉（即本次修复）陷阱才暴露。该包的五个产物文件已删除；`app-boot`、`cmdline`、`test-support/*`、`launch-environment` 中的同款产物属预先存在问题，当前与源码同步，此处不动。

## Alternatives considered

**ENOENT 仍 fail-loud，只在 setup 链补 mkdir。** 这让 setup 链不拥有的每条路径（示例外的组合、`kg-build.mts`、手写 cordis.yml）继续崩溃，并为示例之外的每个人重新推导出同一个 QUICKSTART 手动步骤。

**把所有 readdir 错误都吞成空列表。** 被占据或不可读的 root 将静默伪装成空市场——正是 AGENTS.md 禁止的静默跳过失败模式；errno 区分本身就是这条决策的全部。

**e2e 用例改为页面加载前删目录而非 reload。** 侧栏入口在页面加载时预载共享 stats/catalog 缓存，`MarketView` 只在 `stats === undefined` 时刷新；不 reload 的话 tab 渲染的是删除前快照，断言测的是缓存而不是被抹掉的 root。

## Consequences

目录缺失的干净 world 起服后市场可用（实测：数据产品 174 · 供方 2，目录 174/174，无错误条，console 零错误）；恢复示例文件后同一页面计数 177 并列出全部三个。单测锁定三条路径——加载期建目录、ENOTDIR fail-loud、discover 期空列表——新增 market e2e 用例经真实 Chromium 通道锁住抹目录降级。QUICKSTART 删去手动 `mkdir` 步骤与崩溃 FAQ；connector-file README（双语）记录建目录/降级契约。换来的代价：把 `root` 指向尚未创建路径的运营者会在加载期得到一个空目录（加载期发生一次写）；读市场的人需要知道 file 类资产合法缺失时其余资产类照常工作。
