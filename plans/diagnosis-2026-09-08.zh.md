# 启动链路全面诊断报告（2026-09-08）

针对交接文档 [plans/handoff-2026-09-08.zh.md](handoff-2026-09-08.zh.md) "启动与运行"一节宣称可启动、用户实测"整个都跑不起来"的矛盾，逐条真实执行启动链路并归因。**只诊断、不修复**；全部结论基于本机实际命令输出，跑通项明确标注 PASS。

## 执行环境快照

- macOS Sequoia；zsh；仓库根 `/Users/mac/Documents/github/deepseek-harness`；Node v22.19.0（符合 QUICKSTART 要求）；pnpm 11.7.0；yarn 1.22.22。
- 工作区状态：`git status` 343 项（148 M + 194 ??，与交接文档一致，最后一次提交 `84c60f5a8e`）；诊断全程未 stash/reset/丢弃任何改动。
- 根 `.env` 存在（含 `MINIMAX_API_KEY`、`NOCOBASE_BASE_URL`、`NOCOBASE_API_KEY`）。
- 诊断开始时 PG17 **未运行**（`pg_isready` no response；brew services 状态 none），3080/13000 均无监听。
- 诊断结束时：PG17 运行中、NocoBase 运行中（:13000）、诊断用的 `dsh web` 进程已清理（3080 释放）。

## 逐条命令实录

### 1. 依赖与构建状态 —— 全 PASS

| 命令 | 退出码 | 结果 |
|---|---|---|
| `pnpm install` | 0 | PASS。Already up to date，743ms（仅 2 条 linux 平台包 WARNING，属正常） |
| `pnpm run typecheck` | 0 | PASS。全部 workspace 项目编译通过，无错误 |
| `pnpm run build` | 0 | PASS。tsc + tsdown 全部产物生成，client 侧记录 210 artifacts |

源码面完整可编译，构建不构成"跑不起来"的原因。

### 2. PG17 —— 环境断点（B）+ 启动后全 PASS

- `pg_isready`（诊断开始时）：`/tmp:5432 - no response`，EXIT=2；`brew services list` 显示 `postgresql@17 none`。**PG17 未运行**。
- `pg_ctl -D /usr/local/var/postgresql@17 start` → 成功；`pg_isready` → `accepting connections`。
- setup 脚本数据库配置（[setup-nocobase.mts:187-194](../examples/kb-agent/scripts/setup-nocobase.mts:187)）：`DB_DATABASE=nocobase / DB_USER=nocobase / DB_PASSWORD=nocobase / localhost:5432`，并幂等创建 role/database（[L179-184](../examples/kb-agent/scripts/setup-nocobase.mts:179)）。
- `psql` 验证：role 存在 ✓、database 存在 ✓、`postgresql://nocobase:nocobase@localhost:5432/nocobase` 连接返回 `conn-ok` ✓。

说明：`setup-nocobase.mts` 的 `ensurePostgres()`（[L153-172](../examples/kb-agent/scripts/setup-nocobase.mts:153)）会在数据目录存在时自动 `pg_ctl start`，因此"先跑 setup"路径下 PG 不构成硬阻断；但"直接跑 `dsh web`"路径下 NocoBase 不可达（业务功能全挂）。PG 未运行是用户实测时的第一个环境事实。

### 3. NocoBase setup 全链 —— 服务面 PASS，脚本退出码必 FAIL（失败点 F2）

命令：`node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts`（README"本地启动"第一步原样）。

执行过程（node_modules 已存在，无首次 15 分钟 yarn install）：

- install：PASS（`yarn nocobase install`，33s，幂等跳过建表）。
- start：PASS（`server healthy at http://127.0.0.1:13000`）。
- init：PASS（五 collections kept、API key "dsh-harness" 签发、张红喜种子在、workflow "专家服务订单审批交付" kept、凭据写入 `.env`）。
- **verify：FAILED，进程 EXIT=1**：

```
setup-nocobase verify: FAILED
  - NOCOBASE_API_KEY not in the ambient environment (.env not loaded by this process is fine; check DSH launch)
```

复核：`node --env-file=.env --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts verify` → `verify: OK — collections + attachment field + seed + workflow chain + API key all verified`，EXIT=0。

根因：默认 `all` 链（[setup-nocobase.mts:460-463](../examples/kb-agent/scripts/setup-nocobase.mts:460)）在 `init` 刚把凭据写入 `.env`（[L284-285](../examples/kb-agent/scripts/setup-nocobase.mts:284)）后立即调 `stepVerify()`，而 verify 在 [L404-410](../examples/kb-agent/scripts/setup-nocobase.mts:404) 要求 `process.env.NOCOBASE_API_KEY` 已在进程环境——写 `.env` 与读 `.env` 在同一进程内不闭环。**按 README/QUICKSTART 首条命令执行必然以 EXIT=1 结束**，用户第一感即"NocoBase 没起来"（实际服务已 healthy）。

### 4. DSH Web 启动 —— 服务面 PASS，浏览器面崩溃（失败点 F1，核心阻断）

- 文档原命令 `DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml`：**服务启动 PASS**（输出 `dsh web: http://127.0.0.1:3080`，端口监听，`curl /` HTTP 200）。
- 变体 `pnpm dsh web --no-open --patch examples/kb-agent/cordis.patch.yml`：**EXIT=1，`error: unknown option '--patch'`**（失败点 F3，详见失败点清单）。
- 反代验证：`curl http://127.0.0.1:3080/nocobase/api/app:getInfo` → 正常返回 NocoBase v2.2.6 数据（`/nocobase` 裸前缀 404 属预期，带路径即通）。
- API 面：`/api/*` 为 Typert JSON-RPC 信封，裸 POST 报信封校验错属预期，非故障。
- **浏览器实测（Chrome）**：页面初始帧渲染出门户，随后（约 1-2 秒内）整个前端崩溃为全屏错误页；reload 后**稳定复现**：

```
Failed to load plugins
failed to import loader entry df4552e3 (@deepseek-ai/dsh-client-ui-kg):
client-modules: require("./rolldown-runtime-BTnCrThz.cjs") missed the module table —
not a platform seed word, not a materialized module, and no registered package factory
(a build-time externals drift, or a dynamic dependency that did not arrive)
```

Console 仅有这一条 error；a11y 快照确认页面终态只有错误页三行文本。**所有页面（会话/知识库/数据资产/连接器/图谱/业务管理）在浏览器端全部不可用。**

根因取证（全部实测）：

1. `packages/client/ui-kg/lib/client.js` 的 factory **第一行**即同步 `require("./rolldown-runtime-BTnCrThz.cjs")`；另有 `require("./sigma.esm-SUBaC9pG.cjs")`、`require("./graphology-C5OyrOss.cjs")`、`require("./graphology-layout-forceatlas2-CbYx33Y9.cjs")` 三个画布栈 chunk。ui-kg 是**唯一**带多 chunk 的 dsh.client 包（ui-assets/ui-connectors/ui-business 均为单文件 client.js）。
2. 这些 chunk 文件磁盘上存在（今日 build 产物），但 `/plugins/` 路由（[packages/client/modules/src/index.ts:529-548](../packages/client/modules/src/index.ts:529)）**只服务 `/plugins/<id>/client.js` 与 `/client.js.map`**；浏览器内实测 `GET /plugins/@deepseek-ai/dsh-client-ui-kg/rolldown-runtime-BTnCrThz.cjs` → **404**，`sigma.esm-SUBaC9pG.cjs` → **404**。
3. 浏览器端模块表解析顺序（[packages/client/modules/src/client/system.ts](../packages/client/modules/src/client/system.ts) 与 [README](../packages/client/modules/README.md)：platform seed word → memoized → graph row（`__DSH_BOOT__`，每包仅主入口一个 row）→ registered factory）对该相对路径 chunk 全部落空 → [system.ts:182-184](../packages/client/modules/src/client/system.ts:182) 抛出——报错措辞"a dynamic dependency that did not arrive"即为此设计。
4. ui-kg 是 web-app bundle 的**常驻行**（[packages/bundle/web-app/cordis.patch.yml:232-233](../packages/bundle/web-app/cordis.patch.yml:232)），与 kb-agent patch 无关——**任何 `dsh web`（含裸启动）打开浏览器都是同一全屏错误页**。
5. 交接文档宣称五场景"真实跑通"成立但只覆盖 CLI seam（demo 走 apiproxy/工具调用，不开浏览器图谱页）；浏览器端这条路径没有被五场景与 kb-agent 分区测试覆盖，属于"宣称可启动但浏览器面从未真正可用"的文档失实叠加代码缺陷。

### 5. 图谱数据 kg-build —— PASS

`node --env-file=.env --import tsx/esm examples/kb-agent/scripts/kg-build.mts` → EXIT=0，`ALL CHECKS PASSED`：全量 18 项断言全过，图 560 节点 / 520 边，幂等跳过与增量（新行入图、tombstone 对账）均验证通过。

### 6. 五场景演示 demo-full-journey —— 全 PASS（总检验通过）

`node --import tsx/esm examples/kb-agent/scripts/demo-full-journey.mts` → EXIT=0，五场景真实轨道（with-key + with-NocoBase）全部 PASS：

1. 专家发现与咨询（出海风险问答 + 张会长专家卡）PASS
2. 上传自动路由（csv→湖仓、md→KB，双路问答）PASS
3. 会话内下单拿 PDF（真实 workflow 审批 → `orders.fulfill` 回调 → PDF 落盘下载）PASS
4. 业务管理 nb_*（发现→建→改→回读）PASS
5. 图谱问答（kg_schema + kg_subgraph + MiniMax 组织答案）PASS

实录落盘 `examples/kb-agent/demos/full-journey-20260908-023756.md`。**CLI 服务端全链路是通的**；"跑不起来"集中在浏览器端（F1）与脚本退出码/环境（F2/F4）。

### 7. 测试面与预存红项

- kb-agent 分区：`pnpm vitest run examples/kb-agent/tests/` → **13 文件 / 19 测试全绿**，EXIT=0。（注：`--reporter=basic` 附加参数在 vitest 4 不存在会报 ERR_LOAD_URL，属命令变体问题，非项目缺陷。）
- 全量 `pnpm run test` → **EXIT=1：10 文件 / 24 测试失败**（15880 过 / 979 文件过）。失败分布：
  - `packages/core/tools/tests/gen-tool-catalog.spec.ts`（1）：期望 79 个工具、实收 81——`kg_schema`/`kg_subgraph`（V4 新增）未同步进快照。**本轮改动引入**。
  - `scripts/gen-third-party-notices.spec.ts`（1）：`THIRD_PARTY_NOTICES.md` 缺 `graphology` / `graphology-layout-forceatlas2` 条目（V6 图谱页新增依赖未重新生成）。**本轮改动引入**。
  - `packages/hooks/hooks-claude-code`（约 12）+ `hooks-codex`（约 9）+ `packages/test-support/acp-snapshot`（1）：全部 `Test timed out in 5000ms` 超时型失败，与 kb-agent/NocoBase 两工作线无代码关联，疑本机负载敏感（诊断时 PG/NocoBase/Web 并行在跑）或既有环境红；交接文档已声明"本机红项经 stash 基线证明为既有环境失败"。
- 预存红 #1：`pnpm run verify-cordis-config` → **EXIT=1 复现**：`examples/kb-agent/tests/fixtures/kg-tools.cordis.yml: @deepseek-ai/dsh-fake-llm must be declared in examples/package.json dependencies`（与交接文档登记一致）。
- 预存红 #2：`pnpm run lint` → **EXIT=1 复现**：`Found 0 warnings and 900 errors`（与交接文档"约 900 errors"精确一致）。

## 失败点清单

类别：A=代码缺陷；B=环境/凭据；C=状态残留；D=文档失实；E=预存基线红。

| # | 位置 | 类别 | 根因 | 修复建议 |
|---|---|---|---|---|
| F1 | [packages/client/ui-kg/lib/client.js](../packages/client/ui-kg/lib/client.js) 顶层 require + [packages/client/modules/src/index.ts:529](../packages/client/modules/src/index.ts:529) serveBundle + [packages/client/modules/src/client/system.ts:182](../packages/client/modules/src/client/system.ts:182) | **A（核心阻断）** | ui-kg 的 client bundle 引用 4 个相对路径 chunk（rolldown-runtime 为顶层同步 require），但 `/plugins/<id>/` 路由只服务 `client.js`(+map)，chunk 无法到达浏览器，模块表解析落空 → ui-kg 插件激活失败 → **任何 `dsh web` 浏览器端全屏 "Failed to load plugins"** | 三选一：(a) 构建面禁止 dsh.client 包拆 chunk（sigma 栈整体内联或按平台种子词外部化）；(b) serveBundle 扩展为服务包内任意 chunk 并让模块表登记 chunk row；(c) ui-kg 把画布栈改为运行时 `import()` 经服务端代理的独立入口。需补浏览器端集成快照防回归 |
| F2 | [setup-nocobase.mts:404-410](../examples/kb-agent/scripts/setup-nocobase.mts:404) verify × [L460-463](../examples/kb-agent/scripts/setup-nocobase.mts:460) all 链 | A + D | 默认 `all` 链刚写完 `.env` 就 verify ambient 环境，同进程不回读 → 按 README 首条命令必 EXIT=1，"一条命令从零到可用"的宣称不实 | all 链末尾以子进程 `--env-file=.env` 跑 verify，或 verify 对"刚由本次 init 写入的 key"直接复用内存值；README 同步修正 |
| F3 | [apps/cli/src/args.ts](../apps/cli/src/args.ts) web 别名 `enablePositionalOptions` | A（脆弱）+ D | `dsh web --no-open --patch x`（内层 flag 在 launcher flag 之前）时 `--no-open` 作为第一个透传 token 停止 launcher 选项解析，`--patch` 被透传给内层 web app → `unknown option '--patch'` EXIT=1；顺序契约（launcher flags 必须在前）未写入 QUICKSTART/README | 至少在 QUICKSTART"常见问题"标注顺序契约；理想方案是 launcher 对已知 launcher 选项在任何位置都自解析 |
| F4 | 本机 PG17 服务 | B | 诊断开始时 PG17 未运行（pg_isready 无响应）；`ensurePostgres` 仅在 setup 路径自动拉起，直接跑 `dsh web` 时 NocoBase 面不可达 | 启动手册第一步增加 `pg_isready` 探测提示；或 QUICKSTART 说明"业务功能需先跑 setup" |
| F5 | [examples/kb-agent/tests/fixtures/kg-tools.cordis.yml](../examples/kb-agent/tests/fixtures/kg-tools.cordis.yml) × `examples/package.json` | E | verify-cordis-config 报 fixture 缺 `@deepseek-ai/dsh-fake-llm` 依赖声明（交接已登记，本轮确认仍在） | 在 `examples/package.json` dependencies 补声明或调整 fixture 引用 |
| F6 | 工作区脏 TS 文件（约 2971 文件面） | E | lint 900 errors（交接已登记，本轮确认仍在，数量精确一致） | 随提交切分逐组清零；非启动阻断 |
| F7 | [packages/core/tools/tests/gen-tool-catalog.spec.ts](../packages/core/tools/tests/gen-tool-catalog.spec.ts) | A | V4 新增 `kg_schema`/`kg_subgraph` 未同步工具目录快照（79→81） | 重新生成目录快照（更新期望清单） |
| F8 | [scripts/gen-third-party-notices.spec.ts](../scripts/gen-third-party-notices.spec.ts) | A | V6 新增 `graphology`/`graphology-layout-forceatlas2` 依赖未重新生成 THIRD_PARTY_NOTICES.md | `pnpm run gen-third-party-notices` 后提交 |
| F9 | hooks-claude-code/hooks-codex/acp-snapshot 22 个超时 | E（疑 B 负载敏感） | 全部 5000ms 超时型失败，与本轮两工作线无代码关联；诊断时多服务并行可能加剧 | 空载复跑一次定性；若仍红按既有环境失败登记 |

**汇总：A=5（F1/F2/F3/F7/F8），B=1（F4），C=0，D=2（叠加在 F2/F3），E=3（F5/F6/F9）。**

## 跑不起来的最短因果链

`dsh web` 服务端正常起在 :3080（HTTP 200）→ 浏览器 boot：web-app bundle 常驻行 ui-kg 的 `/plugins/<id>/client.js` 正常到达（200）→ factory 第一行 `require("./rolldown-runtime-BTnCrThz.cjs")` 在浏览器模块表（platform seed word / memoized / graph row / registered factory）全部落空——该 chunk 磁盘存在但 `/plugins/` 路由只服务 `client.js`，HTTP 404、无人登记 → ui-kg 插件激活抛错 → boot 页渲染全屏 **"Failed to load plugins"** → 会话/知识库/数据资产/连接器/图谱/业务管理全部页面不可用。**这一条就足以构成"整个都跑不起来"**，且与是否带 kb-agent patch、是否有 key、NocoBase 是否在跑完全无关（裸 `dsh web` 同样复现）。

两条辅链强化该体感：(1) README"本地启动"第一步 setup 命令以 EXIT=1 + `verify: FAILED` 结束（F2），令用户认为 NocoBase 失败（实际 healthy）；(2) PG17 未运行时（F4）业务面全部不可达。而服务端真实能力（五场景真实轨道、kg-build、kb-agent 分区测试、NocoBase 全链）在本机实测全部 PASS——**系统不是"全坏"，而是浏览器端单点（ui-kg chunk 递送）把整个 GUI 面按死了**。

## 复现与验证备忘

- F1 复现：`DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml`，浏览器开 `http://127.0.0.1:3080`，1-2 秒内转全屏错误页；`curl -I http://127.0.0.1:3080/plugins/@deepseek-ai/dsh-client-ui-kg/rolldown-runtime-BTnCrThz.cjs` → 404。
- F2 复现：`node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts`（观察退出码 1）；`node --env-file=.env --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts verify` → EXIT=0。
- F3 复现：`pnpm dsh web --no-open --patch examples/kb-agent/cordis.patch.yml` → `error: unknown option '--patch'`。
- 诊断结束时运行态：PG17（5432）与 NocoBase（13000）保留运行；3080 已释放。

## 修复记录（批次一，2026-09-08）

F1/F2/F3 已修复并真实验收（Agent Note：[.agents/notes/implemented/bug-fix/2026-09-08-ui-kg-single-artifact-bundle.zh.md](../.agents/notes/implemented/bug-fix/2026-09-08-ui-kg-single-artifact-bundle.zh.md)）；F7/F8/E 类留给下一批次。

### F1 已修复（方向 B：构建侧单文件 + 门禁防复发）

- 根因修正：唯一运行时动态 `import()` 在 `packages/client/ui-kg/src/client/KgGraphCanvas.tsx`（sigma/graphology/FA2），rolldown 必然拆 chunk；浏览器模块表（`makeRequire`，同步包粒度注册表）没有相对路径 chunk 通道——所以**不是路由缺文件，是递送协议不存在**。方向 A（服务 chunk）需要重造文件粒度模块加载协议，超出最小正确修复；单文件才是 `entryFileNames` pin、`files` 发布清单与其余全部 ui-\* 包的既成契约。
- 落地：`KgGraphCanvas.tsx` 静态 import + try/catch 保留降级路径；`packages/client/tsdown.client.ts` 新增 `dsh-client-single-artifact` 门禁（任何 client bundle 产出额外 chunk 即构建失败）与 `dsh-npm-package-over-builtin` 解析（sigma 的 npm 依赖 `events` 与 Node 内置同名，内联 polyfill 而非漏出裸 `require("events")`——第二层阻断，浏览器实测发现）；jsdom 测试经 `vi.hoisted` stub WebGL 枚举全局；`packages/client/modules/tests/node-half.client.spec.ts` 新增路由面测试（chunk 拒答、dot-segment 与百分号编码穿越拒答）。
- 证据：重建后 `packages/client/ui-kg/lib/` 仅 `client.js`（426.7KB / gzip 76.3KB，含渲染栈内联）+ map；`curl /plugins/@deepseek-ai/dsh-client-ui-kg/client.js` → **200**，旧 chunk URL → 404（产物已无 chunk 依赖，属预期）；浏览器（chrome-devtools MCP）打开 :3080 后 **console 零错误、零 4xx**，"Failed to load plugins" 消失，六页面（会话/知识库/数据资产/连接器/图谱/业务管理）逐页导航实测渲染（图谱页 seed 搜索"宏发食品"→子图查询→节点列表端到端通；headless 无 WebGL 环境按设计走降级列表）。
- 回归：`pnpm run build:lib:client` 全绿；ui-kg+modules+purity+kb-agent 分区 21 文件 / 128 测试全绿。

### F2 已修复

- `examples/kb-agent/scripts/setup-nocobase.mts` 的 `stepVerify` 改经共享 `resolve-env.ts` 的 `resolveEnv`（ambient 优先、回退仓库根 `.env`）读 `NOCOBASE_API_KEY`，all 链写读闭环；单独 `verify --env-file=.env` 行为不变。
- 证据：NocoBase 已安装 + PG17 运行现状下，`node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts`（默认 all，幂等重跑）→ `verify: OK — collections + attachment field + seed + workflow chain + API key all verified`，**EXIT=0**。

### F3 已修复（文档如实化）

- launcher 参数透传语义（第一个启动器不认识的 token 起全部归内层 app）是 commander `passThroughOptions` 的设计行为，保持不动；契约写入文档：根 README.md / README.zh.md "本地启动"节 + `examples/kb-agent/QUICKSTART.zh.md`（网页版工作台节与常见问题各一条）。
- 证据：文档最终形态命令 `DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml --no-open` 真实启动成功（输出 `dsh web: http://127.0.0.1:3080`，无 unknown option）；README 中 `dsh web --patch examples/kb-agent/cordis.patch.yml` 原命令保持可用。

### 批次一回归汇总

`pnpm run typecheck` EXIT=0；`pnpm vitest run packages/client/ui-kg/tests/ packages/client/modules/tests/ scripts/client-bundle-purity.spec.ts examples/kb-agent/tests/` → 21 文件 / 128 测试全绿；`node --import tsx/esm examples/kb-agent/scripts/demo-full-journey.mts` → 五场景真实轨道全 PASS，EXIT=0（实录 `examples/kb-agent/demos/full-journey-20260908-073110.md`）。

遗留（本批次不动）：F7/F8/F5（预存红）、F6（lint）、F9（超时定性）；业务管理页 NocoBase 内嵌视图存在 `{{t("Roles")}} {{t("Users")}}` 未翻译键（预存问题，非本批次引入，建议随下一批次处理）。

## 修复记录（批次二，2026-09-08）

F5–F9 与顺手项已处置并验收（Agent Note：[.agents/notes/implemented/process/2026-09-08-batch2-quality-face-closure.zh.md](../.agents/notes/implemented/process/2026-09-08-batch2-quality-face-closure.zh.md)）。

### F7 已修复

V4 当时重新生成了 `docs/tool-catalog.md` 但漏改 spec 期望列表（`verify-tool-catalog` 本来就绿）。[`gen-tool-catalog.spec.ts`](../packages/core/tools/tests/gen-tool-catalog.spec.ts) 期望清单补 `kg_schema`/`kg_subgraph`（kg 工具真实注册、模型可见，行为正确）。证据：3 文件 /37 测试绿；`pnpm run verify-tool-catalog` → up to date，EXIT=0。

### F8 已修复

`pnpm run gen-third-party-notices` 重生成，`THIRD_PARTY_NOTICES.md` 补 7 条缺失条目：`graphology`、`graphology-layout-forceatlas2`、`sigma`（V6 图谱页）、`pdf-lib`、`@pdf-lib/fontkit`、`exceljs`（专家 PDF/表格线）、`@duckdb/node-api`（湖仓线）。证据：`gen-third-party-notices.spec.ts` 绿。

### F5 已修复

根因：fixture 引用的 `@deepseek-ai/dsh-fake-llm` 是幽灵包名——workspace 无此包，实现由 [`kg-tools.spec.ts`](../examples/kb-agent/tests/kg-tools.spec.ts) 的 `loader.internal.import` stub map 注入。补 `examples/package.json` 声明不可行（`workspace:*` 解析不到包，pnpm install 必炸）。修法：fixture 删 fake-llm 行，spec 在 loader 装配前直接 `context.plugin(FakeLlmModule)`（同进程同 ctx，等价且不经 Loader）。证据：`pnpm run verify-cordis-config` → 178 config files passed，EXIT=0；kg-tools 快照不变（挂载方式改动行为等价），测试绿。

### F9 已定性：全部环境负载型，无真实缺陷

两轮全量 `pnpm run test`（第一轮与 lint 并行：30 红 /14 文件；第二轮独占：23 红 /15 文件）失败集合呈波动子集特征——两轮交集外各有新面孔，真实缺陷不会漂移。全部 24 个出现过失败的文件逐一单独重跑均有 PASS 证据（ui-primitives 15/15、ui-trajectory 3/3、code-runtime 58/58、hooks-claude-code 四文件 15+9+9+9、hooks-codex 三文件 16+14+9、sdk/server 25/25、typert tools-catalog 1/1、publint-all 5/5、install-lefthook 38/38、list-children 59/59、subagent-acp 47/47、session differential 3/3、api-proxy-search 24/24、py-types 53/53、hmr-config 6/6；oxlint-contract 单独跑一次 1 红（5000ms 超时）再次重跑 13/13 全绿——spawn oxlint 子进程冷启动的 flaky 超时）。失败形态 20/23 为 `timed out`，其余 3 个（publint-all/sdk-server）为子进程退出码断言在负载下的同源表现。结论：vitest 12 线程全仓库并发下 spawn 子进程类测试的 5s 默认超时是本机结构性瓶颈，属有据可查的环境型红；CI 拥有平台矩阵，不在本机复现 EXIT=0。

### F6 已修复：lint 903 → 0

真实归属（交接文档"stash 验证"的盲区：stash 掉 N/V 线后 P0–P2 线与工作区残留仍在，非空基线）：

- **847 个 = 14 个 `src/*.d.ts` 构建残留**（acp-snapshot 5、loader-smoke 2、llm-replay 1、app-boot 2、cmdline 1、launch-environment 1、connector-file 2）：全部 untracked、mtime 统一为 00:23:34（一次性事故产物，今日 `build:lib:host` 不再生）。处置：删除（修产物的 lint 是倒置）。残留证据：19 个 tracked `src/*.d.ts.map` 历史上被误提交（`.gitignore` 只挡 `.map` 不影响已跟踪文件），不产生 lint 红，留待后续 PR `git rm`。
- **56 个 = 本轮 N/V 线与 P0–P2 线源码**（17 文件：ui-kg、ui-business、ui-assets、ui-connectors、host/webserver、host/apiproxy、examples/kb-agent tests），无一条与工作区改动无关的基线红。处置：`--fix` 自动修 25（arrow-parens 17、member-delimiter-style 5、unnecessary-assertion 3）；手工修 31（non-null-assertion 12 改窄化/可选链、extraneous-class 4 与 promise-reject 2 行级窄 disable 附理由、max-len 6 折行、require-await 2 行级 disable——async 承担方法表 Promise 返回类型适配、unnecessary-assertion 回补 3——`--fix` 在 branches.client.spec.tsx 误删 testing-library 重载所需的按钮断言，oxlint 轻量类型信息与 tsc 不一致所致）。
- 验收：`pnpm run lint` → **0 warnings 0 errors**，EXIT=0；lint 修复涉及的 10 个测试文件 66/66 绿；typecheck 全绿。

### 顺手项已定性：记录不动

业务管理页内嵌是 `<iframe src="/nocobase/">`（[BizView.tsx:215](../packages/client/ui-business/src/client/BizView.tsx:215)）；`{{t("Roles")}} {{t("Users")}}` 未翻译键来自 iframe 内 NocoBase 应用自身（platform/nocobase 隔离快照内部 locale 面），ui-business 侧无可配入口，按约定不修改 platform 快照。

### 批次二回归汇总

`pnpm run typecheck` EXIT=0；`pnpm run lint` 0 errors EXIT=0；`pnpm run verify-cordis-config` 178 files passed EXIT=0；`pnpm run doc-sync` 28 passed /0 failed /0 skipped；全量 `pnpm run test` 15884 过 /23 红（全部为上表有 PASS 证据的环境型超时，波动集合）。客户端产物面未改动（lint 修复仅源码与测试，BizView/presentation 改动随全量 test 覆盖回归），无需 `build:lib:client` 重启验证。

---

## 终验记录（2026-09-08）

面向用户的最终验收：按根 [README.zh.md](../README.zh.md)「本地启动」节与 [QUICKSTART.zh.md](../examples/kb-agent/QUICKSTART.zh.md) 的最终形态命令完整冷启动，跑通五场景真轨道，浏览器面逐页核验。本批次零代码改动（纯验证批次），文档命令与实现全部相符。

### 逐命令结果

| 步骤 | 文档命令 | 结果 |
|---|---|---|
| PG17 | `pg_isready -h localhost -p 5432` | accepting connections，READY=0 |
| NocoBase setup all | `node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts` | EXIT=0；幂等（collections/种子/workflow 全 kept）；`verify: OK`；`/api/app:getInfo` HTTP 200 |
| DSH Web 冷启动 | 停旧进程（`kill` 批次一遗留的 :3080 PID 72033）后 `DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml --no-open` | HTTP 200，首轮 5 秒内就绪 |
| 图谱数据 | `node --import tsx/esm examples/kb-agent/scripts/kg-build.mts` | EXIT=0，ALL CHECKS PASSED（含幂等断言：二次运行全 scope 跳过，nodes 567→567 / edges 522→522） |
| 五场景真轨道 | `node --import tsx/esm examples/kb-agent/scripts/demo-full-journey.mts` | EXIT=0，五场景全 PASS；实录 [full-journey-20260908-092737.md](../examples/kb-agent/demos/full-journey-20260908-092737.md) |

### 浏览器面（chrome-devtools 打开 http://127.0.0.1:3080）

冷加载 84 个请求全部 200（零 4xx/5xx）；50+ 插件 `client.js` 全部加载成功，无 "Failed to load plugins"；console 零 JS 错误（仅 Chrome 自身的表单无 id/name 可访问性提示 1 条）。六页面交互期新增 39 个 API 调用（`kb.search`、`kg.search`、`kg.subgraph`、`nocobase.list` 等）全部 200。

| 页面 | 结果 |
|---|---|
| 会话工作台 | 食研通门户 + 30 张场景卡（八类分组）+ 输入框（模型 MiniMax-M3） |
| KB 工作台 | 25 份文档、累计检索 115 次；实测检索「山梨酸」命中 6 条（3 份文档，score/高亮/「引用并提问」齐全，计数 115→116） |
| 数据资产市场 | 门户计数（数据产品 20 · 供方 2 · 本月成交 28）+ 目录 20/20 卡（含张红喜专家卡与三项可下单服务） |
| 连接器 | 数据源目录 2 项（文件投递目录 / NocoBase 业务后台）状态均「正常」+ 交付跟踪 + 接入向导 |
| 知识图谱 | 类型图例 38 类；实测搜「张红喜」返回子图 8 节点 · 9 关系（offers→三项专家服务等；headless 无 WebGL，按文档降级为同语义关系清单） |
| 业务管理 | 对象切换器（专家/专家服务/知识资产登记/海关出口台账/专家服务订单）；专家对象 14 张实体卡（张红喜 name/org/domains 齐全），「问此记录」「编辑（对话）」「新建（对话）」全在 |

代表性交互 2 项真实操作：图谱页实体搜索返回真实子图；市场页打开「中亚货运动线方案」详情卡（¥8,800/份 · 交付物 PDF 方案 · 来源 NocoBase 业务后台 · 问数/引用并提问/下单）。

### 原定业务目标复核（四条全达成）

1. 上传路由：场景 2 实录——DataRouter 判定 csv→数据湖（customs_export 落 6 行）、md→知识库（embo-01 真实嵌入）；数值问题湖仓答（合计 873.75，注明来源表），文档问题 KB 答（[n] 引用）。
2. 俄罗斯仓库应急问答 + 张会长专家卡：场景 1 实录——11 篇语料真实嵌入、hybrid 检索命中带 [1] 引用、`connector_discover` 返回张红喜专家卡（含可下单服务）；回答含转移/备仓与保险理赔要点，按专家卡推荐张会长。
3. 会话内下单拿 PDF：场景 3 实录——订单 ORD-20260908-f52edded 落库 → 真实审批（manual 任务 RESOLVED）→ delivered → 本地 PDF 落盘且与 NocoBase 附件字节一致，`deliverable` 附件字段挂载。
4. NocoBase 融入 + 图谱 + 市场/连接器/图谱/业务四页面进 DSH 端：四页面数据全部来自真实 NocoBase collections（上表）+ kg-build 真实图谱（567 节点 / 522 边）。

### 截屏留证

- [examples/kb-agent/demos/final-acceptance/01-home-session.png](../examples/kb-agent/demos/final-acceptance/01-home-session.png)（首页/会话工作台）
- [examples/kb-agent/demos/final-acceptance/02-kg-subgraph.png](../examples/kb-agent/demos/final-acceptance/02-kg-subgraph.png)（图谱页张红喜子图）
- [examples/kb-agent/demos/final-acceptance/03-market.png](../examples/kb-agent/demos/final-acceptance/03-market.png)（数据资产市场目录）
- [examples/kb-agent/demos/final-acceptance/03b-market-detail.png](../examples/kb-agent/demos/final-acceptance/03b-market-detail.png)（资产详情卡）

原始份同存 `/tmp/dsh-final-acceptance/`。

### 访问入口清单

| 入口 | 地址 | 说明 |
|---|---|---|
| DSH Web 工作台 | http://127.0.0.1:3080 | 首屏知识库门户；页签环：对话 / 知识库 / 轨迹 / 数据资产 / 连接器 / 图谱 / 业务管理（侧栏同款入口常驻） |
| NocoBase 业务后台 | http://127.0.0.1:13000 | `yarn dev-server` 形态只伺服 API（NocoBase 2.x 前后端分离），`/api/app:getInfo` 200；业务操作走 DSH 端四页面 |
| PostgreSQL 17 | localhost:5432 | 库 `nocobase`，由 setup 脚本幂等拉起 |
| 业务后台高级配置 | 工作台「业务管理」页签 →「高级配置」→「在业务后台中打开」 | `/nocobase` 反代；API 转发实测 200，Web UI 路径见已知项 |

### 已知非阻断项

- headless 浏览器无 WebGL：图谱画布按文档降级为同语义关系清单（桌面浏览器为 sigma.js 画布）。
- 业务管理「高级配置」iframe：`/nocobase` 反代 API 转发实测 200；`/`、`/admin` 404 源自 upstream `dev-server` 为 API-only（NocoBase 2.x 不伺服 Web UI），iframe 内 `{{t("Roles")}}`/`{{t("Users")}}` 未翻译键同源。日常读写走对话（页面设计立场），不阻断。
- 全量 `pnpm run test` 在本机 12 线程并发下的 spawn 超时红为环境型（见上文 F9 定性，全部有单跑 PASS 证据）；CI 拥有平台矩阵。
- 本批次零代码改动，无新增 Agent Note（纯验证批次；文档命令与实现全部相符，无需修文档）。

---

## 批次四记录（2026-09-08）：NocoBase 成为完整系统入口（:13000 完整 UI）

用户反馈"`:13000` API-only、点击无效果——NocoBase 本身也要能用"。Agent Note：[.agents/notes/implemented/architecture/2026-09-08-nocobase-full-ui-dual-entry.zh.md](../.agents/notes/implemented/architecture/2026-09-08-nocobase-full-ui-dual-entry.zh.md)。

### 根因与形态选型

- **API-only 的直接机制**：dev-server 的 gateway（`packages/core/server/src/gateway/index.ts`）本来就会把非 `/api/*` 请求伺服到 `packages/core/app/dist/client`（SPA rewrite 到 index.html）——只是该产物**从未构建过**（`no dist (never built)`），`GET /` 落 serve-handler 404 页。完整 UI 不需要换启动命令，需要的是客户端构建产物。
- **选定：构建产物模式**（`yarn build` 一次性 + 保留 `yarn dev-server` 启动）。理由：:13000 单端口同时伺服 UI 与 `/api/*`，REST 轨道（connector、订单域、demo 场景 2/3）零改动零代理层；start 秒级就绪；行为与官方 docker 生产形态一致。**不选 dev 全量模式**（`yarn dev`，client rsbuild :13000 + server :13001 + client-v2 :13002）：REST 全部经 rsbuild 代理层（SSE/上传边缘风险）、首次浏览器打开等编译（分钟级）、三进程 + 双 watch 常驻、重启慢；用户场景是使用系统而非开发 NocoBase 插件，不需要 HMR。
- 实测构建：`yarn build` 全程约 23 分钟（逐包 dts + tsup server + legacy/modern 两套 rsbuild；client 阶段 1290s），产物 `dist/client/index.html` + `dist/client/v/index.html`，BUILD_EXIT=0。

### 改动清单

| 位置 | 内容 |
|---|---|
| [setup-nocobase.mts](../examples/kb-agent/scripts/setup-nocobase.mts) | 新增 `build` 步骤（幂等标记两个 index.html，`NOCOBASE_FORCE_BUILD=1` 强制重建；与 DB 无关所以 reset 保留产物）；`all` 链变 install → build → start → init → verify；`verify` 新增完整 UI 断言（`GET /` 200 html 且含 `__nocobase_public_path__`，非 404 空壳）；`start` 在产物缺失时输出 warning |
| [nocobase-proxy.ts](../packages/host/webserver/src/nocobase-proxy.ts) | iframe 真正可用的三件修复：(a) HTML 入口重写 `rewriteNocobaseHtml`——asset `href/src="/x"` 加 `/nocobase` 前缀 + `__webpack_public_path__`/`__nocobase_public_path__`/`__nocobase_api_base_url__`/`__nocobase_ws_path__` 重定根；(b) 插件清单重写 `rewriteNocobasePluginManifest`——`/api/pm:listEnabled` 响应的 `url`/`clientV2Url` 加前缀（requirejs 按清单加载插件，否则 `Script error for "@nocobase/plugin-acl"`）；(c) 转发携带 `x-forwarded-host`/`x-forwarded-proto`——NocoBase 登录 origin 校验（`isTrustedOrigin`）据此判 same-origin，否则 signIn 403 "Invalid sign-in origin"；请求侧剥离 accept-encoding（重写需明文） |
| [connector-nocobase/src/client.ts](../packages/connector/connector-nocobase/src/client.ts) | 导出 `unwrapNbTitle`：系统 collection 的 title 是 `{{t("Roles")}}` i18n 模板，无翻译器的消费面显示内部键 |
| [api-proxy.ts](../packages/host/apiproxy/src/api-proxy.ts) × [read.ts](../packages/connector/tool-nocobase/src/read.ts) | listMeta 投影与 nb_collections 卡片的 title 解包（对象切换器/nb_collections 不再显示 `{{t("Roles")}}`） |
| [BizView locales](../packages/client/ui-business/src/client/locales.ts) | embed 提示文案加入登录说明（初始账号指向 QUICKSTART） |
| README.md / README.zh.md / QUICKSTART.zh.md | NocoBase 入口改为完整业务系统（含 UI）：地址、初始账号 admin@nocobase.com/admin123、首次构建约 20 分钟、双入口关系、`NOCOBASE_FORCE_BUILD` |

### 验收证据（全部真实执行）

1. **脚本生命周期**：`yarn build` BUILD_EXIT=0（23 min）；`setup-nocobase.mts stop` → `start` 退出码 0，重启后 `GET /` 200 text/html；`verify` 输出 `OK — full UI + collections + attachment field + seed + workflow chain + API key all verified`，EXIT=0。
2. **:13000 完整 UI（chrome-devtools，截图 [demos/nocobase-ui/](../examples/kb-agent/demos/nocobase-ui/)）**：01 登录页 → admin@nocobase.com/admin123 登录成功（02 /admin 管理界面，顶部 workflow 待办徽标）→ 03 workflow 管理页（「专家服务订单审批交付」行、Collection event 触发、Enabled 开关已启用）→ 04 workflow 待办（真实订单审批任务数据行）→ 05 experts 表格（14 行，Total 14 items；`experts:list` 响应首行张红喜含完整 bio）→ 06 Users 数据行（Super Admin / nocobase / admin@nocobase.com / Member,Root,Admin）→ 07 collections 管理（专家/专家服务/知识资产登记/海关出口台账/专家服务订单五行 + Configure fields 抽屉 + 设置菜单 20 项）；UI Editor 实测建页面（Classic page → Table block → experts）成功。
3. **iframe（3081 验证实例，新反代代码）**：iframe 内 NocoBase 完整启动（requirejs 插件全载）→ 登录页 → 登录成功 →「专家数据」页渲染 14 行数据（截图 08）；`/nocobase/api/pm:listEnabled` 重写生效；signIn 探针 403 → 200。
4. **REST 轨道回归**：`demo-full-journey.mts` 五场景全 PASS，EXIT=0（实录 [full-journey-20260908-114434.md](../examples/kb-agent/demos/full-journey-20260908-114434.md)）。
5. **测试**：分区 13 文件 / 128 测试全绿（webserver + connector-nocobase + tool-nocobase + apiproxy nocobase-domain + ui-business，含新增 HTML/manifest 重写与 title 解包用例）；`pnpm run typecheck` EXIT=0。
6. `pnpm run doc-sync` 见下（本段写入后执行）。

### 遗留

- UI Editor 自建页面的表格列值渲染（experts 表 name 列配好后单元格里未见值；现成 schema 页面如 Users 数据行渲染正常）——NocoBase 快照内部前端行为，不阻断任何验收项，留待 NocoBase 快照升级时复核。
- DSH Web :3080（终端 2 常驻实例）需重启一次才带上反代重写与 title 解包（本轮在 3081 实例验证；3081 验证实例已清理）。
- iframe 深度操作（如 UI Editor 建页）在低频管理场景可用即可；日常读写仍按设计走对话。

---

## 批次五记录（2026-09-08）：数据充实 + UI 乱象定向治理

用户反馈"整个 dsh ui ux 很乱，还缺乏数据"。Agent Note：[.agents/notes/implemented/architecture/2026-09-08-batch5-data-truth-sources-and-ui-governance.zh.md](../.agents/notes/implemented/architecture/2026-09-08-batch5-data-truth-sources-and-ui-governance.zh.md)。

### 第一部分：数据充实（真源 → 正规机制 → 幂等播种）

| 域 | 扩充前 | 扩充后 | 真源与机制 |
|---|---|---|---|
| 专家 | 1 位真实画像（张红喜）+ 14 条 e2e/demo 残留 | **33 位**（张红喜 + 32 位领域专家：食品安全/出口合规/冷链/跨境物流/品牌出海/供应链金融/电商运营/包装材料/清真认证/犹太认证/中亚/东南亚/俄语区市场等） | `workspace/data/experts/roster-batch5.json` → `seed-experts-roster.mts`（幂等 by name；顺带清残留 14 条） |
| 专家服务 | 3 项 | **52 项**（含定价/交付物/摘要） | 同上（幂等 by name，expertId 重映射服务器 id） |
| 知识资产（datasets collection） | 3 条 | **23 条**（体系手册/操作指引/合规要点） | 同上（幂等 by title） |
| 数据资产市场目录 | 20 条卡（大半为残留垃圾） | **63 条八域资产 + 23 知识资产 + 33 专家卡 + 52 服务卡 = 174 项**（门户计数"数据产品 174 · 供方 2 · 本月成交 38"） | `workspace/data/market/assets-batch5.json` → `seed-market.mts`；`datasets` collection 幂等扩展 domain/source/pricing/summary 四字段；provider 的 datasets 卡面带 summary 摘要 |
| 历史订单 | 66 行集中近 4 天、pending/failed 噪声多 | **+24 条近 30 天跨度**（delivered 18 / pending 3 / generating 1 / failed 2），关联真实专家与服务 | `seed-orders.mts`（幂等 by `ORD-B5-` 前缀；播种后清理 collection trigger 排队的 pending executions——toggle 暂停挡不住 trigger，见 Agent Note 决策二） |
| 湖仓 | 1 表 6 行 | **+3 张业务表**：原辅料价格月度 240 行 / 进出口月度统计 120 行 / 冷链运价 108 行 | `seed-lakehouse.mts`（`lakehouse.load` 写 Parquet+登记 catalog；recordTransfer 落 3 条交付跟踪记录——连接器页空态随之消除） |
| KB 语料 | 25 篇 | **46 篇**（+21 篇：产融 5 / 出口合规 5 / 质量管控 5 / 电商出海 3 / 冷链 3，五个新目录避开 demo 计数依赖的 export-risk 与 regulations force-majeure） | 文件落 `workspace/data/<新目录>/` + `seed-kb.mts`（kb.ingest 真实 embo-01 嵌入，同 sourcePath 替换幂等） |
| 图谱 | 567 节点 / 520 边 | **1280 节点 / 858 边**（NocoBase 行节点 + 46 篇语料实体提取，kg-build corpus maxDocuments 20→50） | `kg-build.mts` 全量重建 |

全部播种脚本幂等验证：roster 重跑 created 0/skipped 全量、orders 重跑 created 0/skipped 24、kb 重跑替换式入库、lakehouse 同表 replaced。NocoBase 行数 API 复核：experts 33 / expert_services 52 / datasets 89 / orders 92。

### 第二部分：UI 乱象审计清单与逐项处置

审计方法：chrome-devtools 对 :3080 七页面（对话/知识库/数据资产/连接器/图谱/业务管理 + 侧栏页签环）逐页 a11y 快照 + 截图走查（审计截图 `demos/batch5-final/audit/`，治理后截图 `demos/batch5-final/`），对照 `plans/nocobase-native-integration/02-design.md` 四页四态矩阵。

| # | 乱源 | 类别 | 处置 | 落点 |
|---|---|---|---|---|
| A1 | 市场 21 卡中 14 张为 `nb-e2e-*`/`演示专家-*` 测试残留 | 数据 | **治理**：seed-experts-roster 幂等清理（residueRemoved 14） | seed 脚本 |
| A2 | 数据表/文档资产卡无摘要（卡面只有标题） | 数据 | **治理**：datasets 加 summary 字段 + provider descriptionFields 投影；白砂糖卡验证显示"白砂糖（一级）日度现货均价…" | seed-market + provider.ts |
| A3 | 服务卡 summary 全文糊卡面 | 数据 | **不动**：market.module.css 已有 2 行 line-clamp（复查确认） | — |
| A4 | 专家卡 domains 英文逗号原样显示 | 数据 | **治理**：provider description 组装时 domains 拆分转 ` · `；三份快照期望同步 | provider.ts + 快照 |
| A5 | 连接器页"交付跟踪"空态裸露 | 数据 | **治理**：seed-lakehouse recordTransfer 3 条——页面现显示"batch5-seed 3 次交付 · 468 行"+运行记录 | seed-lakehouse |
| A6 | 业务对象下拉混入 Roles/Users 系统表与 `{{t("Roles")}}` 未翻译键 | 结构 | **治理**：ui-business 过滤管理面 collection（ADMIN_COLLECTIONS）；`{{t}}` 解包由批次四 unwrapNbTitle 兜底，重启 :3080 后消失 | BizView.tsx |
| A7 | 业务对象下拉首项为"业务对象"占位 option | 结构 | **治理**：页面打开自动选中首个业务对象（experts），占位 option 消失且首屏即见数据 | BizView.tsx |
| A8 | 订单历史集中近 4 天、大量 pending/failed 噪声 | 数据 | **治理**：+24 条 30 天跨度 delivered 为主的真实运营态 | seed-orders |
| A9 | KB 25 篇 / 图谱 567 节点密度不足 | 数据 | **治理**：46 篇 / 1280 节点（见对比表） | seed-kb + kg-build |
| B1 | 侧栏入口可访问名与页签命名不一致（"知识库文档数/数据源数量/业务对象数量"） | 命名 | **治理**：KbEntry aria-label 改用 entry.label，与其它四个入口模式一致 | KbEntry.tsx |
| B2 | 页签环顺序违背设计基线（轨迹插在知识库与数据资产之间） | 命名 | **治理**：trajectory order 10→15，页签环现为 对话/知识库/数据资产/连接器/图谱/业务管理/轨迹 | ui-trajectory |
| B3 | banner "Session log" 英文按钮 | 命名 | **不动**：共享插件 session-log-export 的通用产品面单按钮，不属于 kb-agent 五页治理范围，改动影响面大于收益 | 登记 |
| C1 | KG 类型图例 37 项平铺、"专家/专家服务"重复出现无语境 | 结构 | **治理**：按 source 分"通用类型/业务数据类型"两组；同名类型分属本体与 NocoBase 派生两组、语境清晰 | KgView + locales + css |
| C2 | KB"累计用量"三数字口径（检索 116/入库 56/文档 25）并列 | 结构 | **不动**：数字口径本身正确（累计动作数 vs 当前文档数），有文案区分；为它改版面超出定向治理范围 | 登记 |
| — | 市场 174 项全量渲染无分页 | 结构 | **治理**：24/页"展开更多"分页（02-design：列表头轻量翻页）；筛选变化回首页 | MarketView + locales |
| — | 图谱/KB/对话/连接器四态（loading/error/empty/success） | 结构 | **复核不动**：四态矩阵在 02-design 落地时已实现（骨架卡/错误条重试/空态指引文案齐全，走查确认） | — |

### 验收证据（全部真实执行）

1. **静态门禁**：`pnpm run typecheck` EXIT=0；`pnpm run lint` 0 warnings 0 errors；`pnpm run doc-sync` 28 passed / 0 failed；分区测试（connector-nocobase + ui-assets + ui-business + ui-kg + ui-trajectory + kb-agent 全部测试）**39 文件 / 288 测试全绿**（行为变更同步：provider.spec 期望与三份 kb-agent 快照的 domains 分隔符更新）。
2. **构建与重启（BUG-4）**：`pnpm run build:lib:client && pnpm run build:web` + `pnpm run build:lib:host`（provider 属 host 面，第二轮补齐）EXIT=0；:3080 kill 旧进程（PID 7315）→ nohup 拉起（现进程 HTTP 200）。
3. **浏览器终检**：七页面走查 console **零错误**；市场页门户计数"数据产品 174 · 供方 2 · 本月成交 38"、目录"共 174/174 项"+分页"展开更多（还有 150 项）"、专家筛选 33 卡（domains 分隔点显示、零残留）、资产卡摘要显示；业务管理页对象切换器仅五个业务对象且自动选中 experts；KG 图例分组标签渲染；连接器页交付跟踪 3 条记录。
4. **demo 五场景回归**：首轮场景 3 FAIL（种子订单 trigger 残留涌向 demo 临时回调端口，根因与修复见 Agent Note 决策二）→ 清理 + seed-orders 固化清理逻辑后重跑，`demo-full-journey.mts` **五场景全 PASS，EXIT=0**（实录 [full-journey-20260908-153636.md](../examples/kb-agent/demos/full-journey-20260908-153636.md)）。
5. **NocoBase :13000 一致性**：REST 行数 experts 33 / expert_services 52 / datasets 89 / orders 92；完整 UI"专家数据"页渲染 33 行（20/页+翻页，截图 06-nocobase-experts.png）。
6. **图谱抽查**：kg.search "张红喜" 命中双节点（本体 + NocoBase canonical）；kg.subgraph seeds=[nocobase:experts:1] hops=2 返回 **72 节点 / 71 边**——含三项可下单服务与大量 ORD-* 订单，查询准确。
7. 截图留档：治理前 `examples/kb-agent/demos/batch5-final/audit/`（6 张）、治理后 `examples/kb-agent/demos/batch5-final/`（6 张含 NocoBase 抽查）。

### kg-build 重跑补录（终验）

`node --import tsx/esm examples/kb-agent/scripts/kg-build.mts` → **ALL CHECKS PASSED**（18 项断言全绿）：graph stats **nodes=1282 / edges=853**；五 collections 全量摄入（orders 92 行 92 节点）；张红喜 reaches 三项服务（hop 1）、2-hop orders 70 条；幂等断言（二次 run 全 scope skipped，1282→1282 不变）；增量场景（新建订单入图+连服务+删除 tombstone）全过；corpus 覆盖 46 篇语料。

### 遗留

- 历史 pending 订单 executions（2026-09-05~07 批次的 ORD-2026 非 B5 前缀）按既有环境状态保留未动。
- B3/C2 两个"不动+理由"项如需升级，属共享插件/版面重设计范畴，另开批次。

---

## 终验记录（迭代二 2026-09-08）

回应两条用户反馈的最终验收：(1) "整个 dsh ui ux 很乱，还缺乏数据" → 七页面整洁一致 + 六域数据密度核验；(2) "NocoBase 本身这个系统也要可以用！！！不能仅 dsh 一个入口" → :13000 完整系统真实可用。本批次纯终验：零代码改动，双入口复验 + 留证 + 回归。

### 逐项结果（全部真实执行）

| 项 | 命令/操作 | 结果 | 证据 |
|---|---|---|---|
| A1 PG17 | `pg_isready -h localhost -p 5432` | EXIT=0 accepting connections | 终端实录 |
| A2 NocoBase | `node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts verify --env-file=.env` | EXIT=0；full UI + collections + attachment field + seed + workflow chain + API key all verified | 终端实录 |
| A3 DSH Web | `curl http://localhost:3080/` | HTTP 200 | 终端实录 |
| B 登录 | chrome-devtools 退出遗留会话 → 重走 /signin | 登录成功进 /admin 专家数据页 | [01-signin.png](../examples/kb-agent/demos/final-acceptance-iter2/nocobase/01-signin.png) |
| B experts 33 | UI 首页 20 行 + 翻页第 2 页 13 行 | 合计 33 行 | [02](../examples/kb-agent/demos/final-acceptance-iter2/nocobase/02-after-login-experts-p1.png) / [03](../examples/kb-agent/demos/final-acceptance-iter2/nocobase/03-experts-p2.png) |
| B orders B5 | 页面会话 fetch `orders:list` | 总 92 行；B5 24 条（delivered 18 / pending 3 / generating 1 / failed 2），generatedAt 2026-08-13 ~ 2026-09-09（30 天跨度） | API 响应实录 |
| B workflow | /admin/settings/workflow | 「专家服务订单审批交付」Collection event / Asynchronously，Enabled 开关 checked | [04-workflow-admin.png](../examples/kb-agent/demos/final-acceptance-iter2/nocobase/04-workflow-admin.png) |
| B 真实业务操作 | workflow 待办 2 条 Pending 打开审批对话框；Settings → Data sources → orders → Configure fields（附件字段 deliverable 可见）；UI Editor 可点击激活 | 全部真实操作成功 | [05](../examples/kb-agent/demos/final-acceptance-iter2/nocobase/05-workflow-tasks.png) / [06](../examples/kb-agent/demos/final-acceptance-iter2/nocobase/06-datasources.png) |
| C 七页面 | chrome-devtools 逐页走查 + playwright headless 自动扫描 | DSH 自身面 console 零错误、零 4xx/5xx（全部错误位于 iframe 内嵌 NocoBase 已知边界，见遗留） | dsh/01 ~ 08 |
| C 数据密度 | 市场 174/174 + 分页、专家卡 33、KG hops=2 子图、连接器交付、KB 计数 | 市场"数据产品 174 · 供方 2 · 本月成交 38" + "共 174/174 项" + "展开更多（还有 150 项）"；张红喜 hops=2 子图 **74 节点/73 边**（72 + kg-build 增量验证订单 2，来源可解释）；batch5-seed 3 次交付 · 468 行 + 运行记录；"共 46 份文档" | [01](../examples/kb-agent/demos/final-acceptance-iter2/dsh/01-market-174.png) / [03](../examples/kb-agent/demos/final-acceptance-iter2/dsh/03-kg-search-hits.png) / [04](../examples/kb-agent/demos/final-acceptance-iter2/dsh/04-connector-transfers.png) / [06](../examples/kb-agent/demos/final-acceptance-iter2/dsh/06-kb-46.png) |
| C iframe 复验 | 业务管理页「在业务后台中打开」→ iframe 内登录 | :3080/nocobase/ 同源反代加载 NocoBase UI，登录后专家表 en-US "Total 33 items" / zh-CN "共 33 条" 双 locale 验证 | [09-iframe-nocobase-total33.png](../examples/kb-agent/demos/final-acceptance-iter2/dsh/09-iframe-nocobase-total33.png) |
| C 检索问答 | 对话台真实提问「中亚方向食品出海有哪些风险」（MiniMax-M3 真实 API） | 用时 18 秒 / 215 tok/s；九大风险维度结构化输出；**[1]~[6] 编号语料引用**，参考依据列 6 篇真实 KB 文档路径；覆盖缺口诚实标注 | [08-chat-retrieval.png](../examples/kb-agent/demos/final-acceptance-iter2/dsh/08-chat-retrieval.png) |
| D demo 五场景 | `node --import tsx/esm examples/kb-agent/scripts/demo-full-journey.mts` | 五场景全 PASS，EXIT=0 | [full-journey-20260908-162533.md](../examples/kb-agent/demos/full-journey-20260908-162533.md) |
| D typecheck | `pnpm run typecheck` | EXIT=0 | 终端实录 |

截图全目录：[nocobase/](../examples/kb-agent/demos/final-acceptance-iter2/nocobase/)（6 张）、[dsh/](../examples/kb-agent/demos/final-acceptance-iter2/dsh/)（9 张）。

### 双入口访问清单

| 入口 | 地址 | 凭据/说明 |
|---|---|---|
| DSH Web 工作台 | http://127.0.0.1:3080 | 七页签环：对话/知识库/数据资产/连接器/图谱/业务管理/轨迹 |
| NocoBase 完整系统 | http://127.0.0.1:13000 | `admin@nocobase.com` / `admin123`（QUICKSTART 已写明）；登录、数据管理、workflow、设置/UI Editor 均可点击操作 |
| iframe 反代入口 | 工作台「业务管理」→「高级配置」→「在业务后台中打开」 | :3080/nocobase/ 同源反代，登录后可见专家数据 |
| PostgreSQL 17 | localhost:5432 | 库 `nocobase` |

### 数据规模终态

| 域 | 终值 | 说明 |
|---|---|---|
| 市场目录 | 174 项 | 63 八域资产 + 23 知识资产 + 33 专家卡 + 52 服务卡 + 3 初始 datasets |
| 专家 / 专家服务 | 33 位 / 52 项 | demo 回归后 experts 34（场景 4 nb_create +1，预期增量） |
| 订单 | B5 24 条 / 总 92 行 | demo 回归后 93（场景 3 下单 +1） |
| 湖仓 | 4 张表 | verify_upload_sales + ingredient_prices_monthly（240 行）+ import_export_monthly（120 行）+ cold_chain_rates（108 行） |
| KB 语料 | 46 篇 | UI "共 46 份文档" |
| 图谱 | 1282 节点 / 853 边 | 张红喜 hops=2 子图 74/73（≥72 级） |

### 本轮全部批次总览

| 批次 | 一句话 |
|---|---|
| 批次一 | 修复 F1~F3：ui-kg 单文件产物 + 构建门禁、setup-nocobase env 解析、launcher 文档如实化 |
| 批次二 | F5~F9 质量面收口：幽灵包、工具目录、三方声明、lint 903→0、全量测试环境型红定性 |
| 批次三（迭代一终验） | 冷启动 + 五场景真轨道 + 六页面浏览器面首轮验收，四条业务目标全达成 |
| 批次四 | NocoBase 完整 UI 双入口：yarn build 产物 + :13000 完整系统 + iframe 反代三件修复 |
| 批次五 | 数据充实（真源 → 幂等播种六域）+ UI 乱象审计 17 项定向治理 |

### 遗留（本轮新记）

- iframe 反代 WS：`ws://127.0.0.1:3080/nocobase/ws` upgrade 未转发（HTML 已重写 `__nocobase_ws_path__` 但 webserver 无 upgrade handler），NocoBase 前端降级轮询，业务功能无损；定位 [nocobase-proxy.ts](../packages/host/webserver/src/nocobase-proxy.ts)。
- iframe 根绝对路径资源：NocoBase systemSettings logo 以 `/files/...` 请求落 :3080 根 404（1 张 png 不显示，不影响功能）。
- :13000 signin 页 `logo-yylewu.png` 404 ×4：上传文件缺失的环境数据缺口，:13000 直开即有、非反代引入。
- workflow manual 待办对话框 body 空白：custom 表单未配置 UI schema（`forms.f1` 无界面定义，console 零错误、API 数据完整），审批动作历来走 API resolve（demo 场景 3 即此轨）；如需 UI 审批按钮，须为 manual 节点配置表单界面。
- 既有遗留维持：历史 pending executions、批次五 B3/C2"不动 + 登记"项。

## 批次六记录（2026-09-08）：终验 FAIL 项闭环——design token 系统性缺陷 + WS 反代 + 同批 Important 项

终验 80/100 唯一 FAIL 维度 design-system-consistency(70) 的根因是批次五 UI 治理自身引入的幻觉 token；本批次逐项闭环并加静态门禁防复发。

### 逐项闭环表

| 项 | 修法 | 证据 |
|---|---|---|
| [Critical] 25 个幻觉 token / 约 77 处声明静默失效 | 逐 token 决策：21 个改引用既有语义等价 token（`--dsw-font-s-13`→`--dsw-font-xs-13`、`--dsw-font-s-14-strong`→`--dsw-font-s-strong-14`、`--dsw-alias-border`→`--dsw-alias-border-l1`、`--dsw-alias-bg-sink`→`--dsw-alias-bg-module-platform`、`--dsw-alias-state-danger`→`--dsw-alias-state-error-primary` 等）；2 个确无等价补定义（`--dsw-alias-state-error-tertiary` 补齐 error 与 success/warn/business 对称的 tertiary 层，亮 red-100/暗 red-900；`--ds-skeleton-pulse/shimmer` 动画 token 补进 base.css 的 upstream `--ds-*` 职责区，`prefers-reduced-motion: no-preference` 下才定义、keyframes 相位相反）；`--dsw-alias-gap-sm/md` 主题无间距体系，内联 4px/8px 字面量 | 四包 327 处 var() 引用：未定义 104→**0**（修复前后实测）；浏览器四页亮/暗截图 token 全生效 |
| [Critical] 9 处硬编码 hex fallback | 所需语义色全部有既有 token，逐处映射后删 fallback | 四包 fallback 14→**0**（含 5 处动画 fallback 一并消除） |
| [Critical] HEAD 既有 8 个幻觉 token（顺带发现） | 全 client 面扫描发现 ui-agent-preset/ui-conversation/ui-jobs/ui-settings-plugins/ui-tool 从 HEAD 起就有 8 个未定义 token（`--dsw-font-mono`、`--dsw-alias-label-error`、`--dsw-alias-label-quaternary` 等），一并映射修复 | 全 client 主题命名空间未定义 33→**0** |
| [Critical] 静态门禁缺失 | 新增 [`css-tokens.client.spec.ts`](../packages/client/ui-theme/tests/css-tokens.client.spec.ts)（ui-theme vitest client 面，随 `pnpm test` 跑）：扫描 packages/client 全部 CSS 的 `var(--dsw-*/--ds-*)` 引用对照定义集合，未定义即 FAIL；`var()` fallback 含 `#hex/rgb()/hsl()` 即 FAIL | 4/4 通过；豁免两处有注释：`web/src/base.css`（boot 顺序——主题样式注入前 fallback 保证首屏可读）、非主题命名空间组件契约变量（`--dsh-*`/`--trajectory-*` 等 React 运行时注入，静态不可见是设计） |
| [Important] iframe WS 反代缺失 | **选择 upgrade 转发方案**（否决禁用 ws 客户端：靠砍功能消音且把客户端行为假设固化进服务端重写；约 50 行落在 webserver 既有 upgrade 注册表上）：`createNocobaseWsUpgradeHandler` 透传握手头（除 host）+ `x-forwarded-host`，原样转发上游 101/拒绝响应，双向 pipe + **任一侧 close 即销毁对端**（半开 pipe 会让对端永久挂起——集成测试以 teardown 挂死暴露） | 集成测试 8/8（真实 WebServer 组合 + 手搓 RFC6455 echo 上游，101 状态行 + accept 头 + masked 帧往返 + key 透传断言）；浏览器实测 `new WebSocket('ws://127.0.0.1:3080/nocobase/ws')` open→close(1000)；业务页 console 零错误零重连 |
| [Important] demo 残留污染 | 场景 4 捕获 expertId，try/finally 直连 `experts:destroy?filterByTk=`（query 形式——NocoBase 不读 body 里的 filterByTk，body 形式实测 500）销毁；开头记 experts 基准，finally 断言回到基准（每次运行自校验幂等） | 双跑两轮五场景全 PASS，基准 35→35（id=56/57 各自销毁）；销毁不走模型工具面（删除按设计不在 nb_* 面） |
| [Important] webserver README 矛盾 | 双语 README + package.json description 更新：config 面 `{host, port, nocobaseProxyOrigin?}`、所有权枚举一条业务 route、反代默认关闭；放置决策写 ADR 三件套 [`2026-09-08-webserver-nocobase-proxy`](../.agents/notes/implemented/architecture/2026-09-08-webserver-nocobase-proxy.md)（含禁用 ws/独立插件/前置反代三方案否决理由） | doc-sync 28/28（translation pairing 重登记） |
| [Important] 根 gitignore 压制 | `workspace/`→`/workspace/` 锚定；kb-agent 否定清单补 6 个批次五语料目录（cold-chain/connector-files/ecommerce/export-compliance/quality/trade-finance）+ `workspace/lakehouse/` 运行时数据规则 | `git check-ignore -v` 复核：roster-batch5.json/assets-batch5.json/新语料不再被忽略；lakehouse 与根 workspace/ 仍忽略；untracked 增量 42 全为 kb-agent 真源、零误伤（`packages/workspace/workspace/` 经查为已跟踪的标准双段包目录，未加错误规则） |
| [Important] 空 turn 200 accepted | `sessionPromptRequestSchema.content` 加 `.min(1)` + text part `z.string().min(1)`；既有把空 turn 当合法的测试断言随行为更新 | rpc-schemas 32/32；handler safeParse 失败→`bad-request`→wire 400 为既有机制 |
| 顺手刷新 | 终态数字见下表 | 实测 |

### 实测终态表（2026-09-08 18:15 CST）

| 域 | 终值 | 变化 |
|---|---|---|
| 市场目录 | 176 项（datasets 89 + experts 35 + services 52） | +2（批次五后 demo/验证轮订单衍生 datasets） |
| 专家 / 专家服务 | 35 位 / 52 项 | demo 双跑零残留（35→35） |
| 订单 | 97 行 | demo 场景 3 每轮 +1（预期增量） |
| 图谱 | 1292 节点 / 858 边 | kg-build 幂等 1292→1292；张红喜 2-hop orders 75 |
| 湖仓 / KB 语料 | 4 表 / 46 篇 | 不变 |

### 回归终态

typecheck ✅ · lint 0 警告 0 错误 ✅ · 分区测试（ui-theme/webserver/apiproxy/rpc-schemas/ui-agent-preset/ui-conversation/ui-jobs/ui-settings-plugins/ui-tool/ui-assets/ui-business/ui-connectors/ui-kg）90 文件 1230 测试全过 ✅ · doc-sync 28 gates 全过 ✅ · `build:lib:client`+`build:web`+重启 :3080 ✅ · 浏览器四页亮/暗主题 token 复验 + console 零错误 ✅ · demo 双跑幂等 ✅。回归中新增修复：scrollbar elevated-surface 门禁要求 business/kg 滚动容器重绑 l2 滚动条 token（`--dsh-scrollbar-thumb[-hover]`→l2 对）；translation pairing 要求 zh README 语言切换链接指 `.zh.md`、`examples/kb-agent/demos/`（运行产物证据目录，同 research/ 性质）入 pairing manifest 排除。

### 遗留（批次六后更新）

- 批次五遗留的「iframe 反代 WS」已闭环（本批次）；其余既有遗留维持：iframe 根绝对路径 logo 404（1 张）、:13000 signin logo 404 ×4、workflow manual 待办 UI schema 未配置、历史 pending executions、批次五 B3/C2「不动 + 登记」项。
- 市场页"共 176/176"含 demo 订单衍生的 datasets 行，若要回到演示基线可重跑播种脚本的对账段（不阻断验收）。

## 批次七记录（2026-09-08）：复验 PASS 后收尾加固——4 项确定性小改动闭环

### 闭环表

| 项 | 改动 | 证据 |
|---|---|---|
| 门禁亮/暗分段对照 | [css-tokens.client.spec.ts](../packages/client/ui-theme/tests/css-tokens.client.spec.ts) 新增 `themeSegments()`：按选择器是否含 `[data-ds-dark-theme]` 把 design-platform.css 切成亮/暗两段分别建集合，任一单侧定义的主题 token 即 FAIL（实测亮/暗各 173、完全对称，与验证器口径一致）。豁免机制选"改自述对齐实际"：头注释明确唯一豁免=硬编码 `FALLBACK_EXEMPTIONS` 文件清单、无行内豁免语法——实现行内注释豁免需同时改扫描器、豁免解析与卫生测试三处，当前零需求，代价不对等 | css-tokens 5/5 过（含新对称用例） |
| image turn 空数据防校验 | [sessions.schema.ts](../packages/host/apiproxy/src/api/sessions.schema.ts) image 分支 `data: z.string().min(1)`（与 text 分支对称；空 image data 原样放行会触发空图模型调用） | rpc-schemas 32/32 过；新增空 data 拒绝用例 + 合法 image 解析用例（[rpc-schemas.spec.ts](../packages/host/apiproxy/tests/rpc-schemas.spec.ts)） |
| sqlite 运行时产物忽略 | [kb-agent/.gitignore](../examples/kb-agent/.gitignore) 补 `workspace/kg-graph.sqlite*`、`workspace/lakehouse-catalog.sqlite*`（`*` glob 覆盖 -shm/-wal 共 6 文件） | `git check-ignore -v` 6/6 命中新规则（.gitignore:7-8）；`git ls-files` 零跟踪文件被匹配；eval/questions.json 与 workspace/data 语料真源不受影响 |
| 批次六 CSS token 修复 Agent Note | 三件套 [2026-09-08-hallucinated-theme-tokens-static-gate](../.agents/notes/implemented/bug-fix/2026-09-08-hallucinated-theme-tokens-static-gate.md)（bug-fix/）：幻觉 token 计算值阶段静默失效机理、映射优先于补定义（21 处改引用）、3 个真缺失补定义（error-tertiary 补齐 tertiary 层对称、skeleton 动画进 base.css upstream `--ds-*` 区且仅限 no-preference）、gap 对内联 4px/8px、三条门禁规则与三个备选否决 | verify-agent-note-format 643/643 过；supersession 审计无既有 note 被取代（pre-plugin-theme-bootstrap 为豁免理由近邻，交叉链接保留） |

### 回归

ui-theme + apiproxy 两目录 vitest 36 文件 503 测试全过 ✅ · typecheck EXIT=0 ✅ · lint 0 警告 0 错误 ✅ · doc-sync 28/28 全过（新 Note 在面内；zh 侧外链 locale 修正后 translation pairing 过）✅。无客户端产物/服务端行为变更（门禁在测试文件、schema 为校验收紧），未重启 :3080。

### 遗留（明确列为遗留、维持不修）

- draftMaxTokens 偶发截断：Run1 复现、Run2 通过；已有 failed 优雅降级与 QUICKSTART FAQ，维持 16384 不再调大。
- workflow manual 待办对话框 body 空白：custom 表单未配置 UI schema（`forms.f1` 无界面定义），审批动作历来走 API resolve。
- iframe logo 404（NocoBase systemSettings `/files/...` 1 张）与 :13000 signin logo 404 ×4：环境数据缺口，非反代引入。
- 其余预存项维持：iframe 反代 WS 已闭环、历史 pending executions、批次五 B3/C2"不动 + 登记"项；市场页含 demo 衍生 datasets 行（可重播种对账段回基线，不阻断验收）。

---

## 最终冒烟（收口，2026-09-08 晚）

三服务探测（均已在运行、无需拉起）：`pg_isready -h localhost -p 5432` → accepting connections，EXIT=0；`curl http://127.0.0.1:13000/` → HTTP 200（完整 UI）；`curl http://127.0.0.1:3080/` → HTTP 200（DSH Web）。
`node --import tsx/esm examples/kb-agent/scripts/demo-full-journey.mts` → 五场景全 PASS，EXIT=0，实录 [full-journey-20260908-190221.md](../examples/kb-agent/demos/full-journey-20260908-190221.md)。
交接文档 [handoff-2026-09-08.zh.md](handoff-2026-09-08.zh.md) 顶部已插入「2026-09-08 晚间终态更新」节：修复摘要（批次一~七每批一行）、双入口与访问信息、旧文失效陈述逐条标注、当前遗留清单、质量门终态；本任务纯文档+验证，零产品代码改动。

---

## N9 批次记录（2026-09-09）：NocoBase 官方 demo 级完整功能（B1–B6）

计划 [plans/nocobase-full-features/PLAN.md](nocobase-full-features/PLAN.md)，操作级实录与偏差清单在 [01-batches.md](nocobase-full-features/01-batches.md)，每批快照点 `/tmp/nocobase-batch-<N>-backup.sql`。

| 批 | 一句话 | 结果 |
|---|---|---|
| B1 插件全景 | stepPlugins 启用 13 个快照内置插件（map/comments/echarts/charts/public-forms/notification-email/departments/localization/graph/backup-restore/china-region/fdw/audit-logs），verify 加插件断言 | ✅ 全 enabled；v2 客户端按需加载 chunk，无需 20 分钟重建 |
| B2 CRM | crm_* 10 collections + 112 行种子 + 双菜单组 10 页；看板/表格区块全程序化 | ✅ Leads 看板 7 列、报价单 12 行；仪表盘 echarts 交互降级记录 |
| B3 Hub | hub_* 16 collections + 工作台 + 5 组 16 页；任务四视图（看板/表格/日历/甘特）程序化 | ✅ 四视图各自渲染；"四页代四 tab"偏差记录 |
| B4 AI 雇员 | ensureLlmService 接 MiniMax（MiniMax-M3），ai 命令 + verify 断言 | ✅ atlas 两轮真实对话（aiMessages 4 行，<think> 标记实证） |
| B5 Portal | vendored 构建部署 /dist/crm|hub/ + ensurePortalFields 字段对齐回填 | ✅ 双 Portal dashboard/overview 真实聚合；X-Portal 风险未触发 |
| B6 收口 | `setup-nocobase.mts all` 双跑幂等 + 全量回归 | ✅ 双跑 EXIT=0（106 kept）；五场景 5/5 PASS；:3080 七页面 console 零错误 + iframe 200；nocobase-proxy 8/8、nocobase-domain+connector 30/30、typecheck EXIT=0 |

决策与偏差详见 [Agent Note 2026-09-09](../.agents/notes/implemented/feature/2026-09-09-nocobase-demo-grade-modules-and-portals.md)；截图 12 张存 `examples/kb-agent/demos/nocobase-full-features/`。

---

## N10 终验记录（2026-09-09）：面向用户最终验收，全 PASS

纯验证批次（零产品改动；新增演示目录内的截图脚本 `n10-capture.mjs` / `n10-portal-capture.mjs`，因 chrome-devtools MCP 的 workspace roots 不含本仓库，落盘留证改走仓内 Playwright，交互验证仍在 MCP 浏览器完成）。总判 **PASS**：A/B/C/D 四组验收项全部通过，E 文档收口同步完成。

| 组 | 验收项 | 结果 | 证据 |
|---|---|---|---|
| A 服务幂等 | pg_isready / verify EXIT=0（含 13 插件、llmService enabled、双 portal 探测断言）/ :3080 与 :13000 均 200 | ✅ | verify 输出 "full UI + collections + ... all verified" |
| B1 插件功能面 | 专家页 UI Editor → 添加区块菜单含 Charts / Gantt / Map / Comment / Kanban / Calendar | ✅ | `N10-02-add-block-menu.png` |
| B2 CRM 链路 | Leads 看板 7 列种子卡（12 活跃线索）→ 客户 12 行 → 报价单 8 行（QT-2026-001~008）→ 订单（SO-2026-001 ¥500,000 待审批） | ✅ | `N10-03/04/05/06` |
| B3 Hub | 任务四视图逐页（看板 7 状态列 / 列表 19 行 / 日历月历事件 / 甘特 9-12 月条形）+ 工作台统计卡与我的任务 | ✅ | `N10-07~11` |
| B5 AI 雇员（核心） | Portal → Open AI chat → Atlas（MiniMax-M3）新一轮真实中文提问；回复查询 crm_leads 后给出三条含金额/阶段/负责人的行动建议；服务端 aiMessages 落库（atlas + tool 轮次） | ✅ | `N10-14-atlas-chat.png` + aiMessages API |
| B6 Portal 双前端 | /dist/crm/（漏斗 $859K + Top accounts）与 /dist/hub/（统计卡 + 今日待办 + 知识文章）均登录直通 | ✅ | `N10-12/13` |
| B7 既有业务 | experts 35 行（meta.count）、「专家服务订单审批交付」workflow enabled=true、业务管理菜单组九组仍在 | ✅ | API 实证 |
| C DSH 回归 | 七页签逐个打开全渲染、console 零 error（仅 a11y 建议）；业务对象下拉 33 项含全部 crm_*/hub_*；/nocobase 200 登录态直通 | ✅ | MCP 走查 |
| D 五场景 demo | demo-full-journey 五场景全 PASS EXIT=0 | ✅ | `demos/full-journey-20260909-034739.md` |

N10 新登记偏差（不改码，如实上报）：admin v2 页面 Open AI chat / 悬浮球入口不可复现（flowModels 布局 204，AI 对话可靠入口为 Portal）；Portal 深链无 SPA fallback（须从入口页进）；dev-server 冷加载慢（schema 页首访约 90~180 秒，chunk 缓存后正常）；每页 1 条 404 为 favicon/占位 logo（无害静态资源）。
