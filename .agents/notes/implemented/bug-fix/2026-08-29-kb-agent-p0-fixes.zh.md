# Agent Note：kb-agent P0 验证修复 —— 入口 overlay、doc-sync 回退、密封测试

Status: implemented

[English](2026-08-29-kb-agent-p0-fixes.md) | 中文

## 问题

kb-agent 栈统一验证 70/100，失败项全部是最后一公里：README 的四条 `pnpm dsh --profile headless` 入口命令都无法装载 kb 组合（headless profile 没有 kb 工具、`examples/` 内不是 workspace 脚本、`--patch` 叠加根格式 `cordis.yml` 是空操作）；`doc-sync` 红，因为 `apps/cli/composition.md` 声称了 base bundle 从未有过的 `llm-minimax` 行；四个新包在真实错误路径上低于逐文件 100% 覆盖门；导入脚本信任 `--kind` 参数；keyless spec 泄漏宿主 `MINIMAX_API_KEY`；README 的降级演示描述了不可能的步骤（拔掉共用 key 连 chat 一起死）。

## 决策

### README 入口：在内置 headless profile 上叠加 `--patch` insert overlay

`examples/kb-agent/cordis.patch.yml` 是 loader patch 列表 —— 配置覆盖加一组 insert —— 用 `dsh --profile headless --patch` 叠加。两个事实决定了它的形态：

- **overlay 必须禁用 `llm-pi-ai`。** base bundle 挂载的 `llm-pi-ai` 从挂载起就把内置 pi-ai 目录中的 `minimax`、`minimax-cn` 声明为可配置 provider；`llm-minimax` 自己注册 `minimax`，`registerConfigurableProviders` 在冲突时抛 `DUPLICATE_DIRECTORY`。这也是 `llm-minimax` 永远进不了 base bundle 的原因：专用适配器整体替换那一半，而非共存。
- **`DSH_HOME` 钉在示例内**（`DSH_HOME=examples/kb-agent/.dsh`）。自动初始化的 profile 位于 `$DSH_HOME/profiles/headless`，其插件解析沿父目录走到 `examples/node_modules`——kb 包的 workspace 链接在那里；默认 `~/.dsh` 会让 overlay 的裸说明符够不到 examples workspace。钉住还让会话、凭据状态与 SQLite 存储全部留在示例的 gitignored 树内。

`agent-default-model` 与 `system-prompt` 的 config 行被覆盖，把 headless runner 的 agent 路由到 MiniMax-M3 与 kb 人设。第二个 overlay `cordis.text-only.patch.yml` 禁用 `kb-embed-minimax` 用于降级演示：检索可观测地降级为 `mode: 'text'`，而 chat 用同一把 key 应答 —— 真实的"拔 embed、chat 存活"，替换掉不可能的拔 key 话术。

### composition.md 重新生成，声称回退

`apps/cli/composition.md` 由 `gen-doc-graphs` 从 `packages/bundle/base/cordis.patch.yml` 生成；修掉 patch 文件尾部双换行后重新生成，即去掉手编辑加进的 `llm-minimax` 行。生成器的 `SERVICE_ROLES` 同时补上缺失的 implementations（`kb-embed-minimax`、`kb-embed-dashscope`、`llm-minimax`）与 `tool-kb` 消费者，`capability-seams.md`、中文孪生与配对记录一并更新。

### 凭据解析维持分裂，依据是契约

把 kb-embed 的凭据解析与 llm-minimax 统一（托管凭据库优先）被两份已发布契约挡住，而非依赖风险：`EmbedProvider.available()` 是缝的同步降级探测，而 `CredentialProvider.resolve` 是异步且明确禁止跨操作缓存。把 `available()` 改异步是能力缝变更；缓存违反凭据契约。差异因此作为 Known Limitation 写进两个 embed 包与示例 README：仅经托管库存入的 key 服务 chat 不服务向量，正确配置是导出变量或 `.env` 文件。

### 用既有 fixture 开关密封 keyless spec

spec 的 `beforeEach` 把 `KB_TEST_EMBED_ENV` 钉到无人提供的名字，fixture 的 embed provider 无论宿主环境都解析到缺失引用 —— 上一份笔记描述的机制成为承重机制，宿主 `MINIMAX_API_KEY` 既翻不动快照也花不了钱。

### 导入脚本：白名单目录 kind

`--kind` 只接受 `meetings|profiles|regulations`（语料目录名）并映射到单数 `doc_kind`；其余一律非零退出，封死 agent 驱动下的路径穿越。所有插值用花括号 `"${kind}"` 形式，macOS bash 3.2 能解析紧邻 CJK 的提示行。

### 覆盖：真实错误路径，一处有据 ignore

缺失路径在两个 embed provider 间对称（退避中 abort、请求飞行中调用方 abort、200 非 JSON 体、无消息错误信封、解码形状违规、apply 层凭据接线），外加 llm-minimax 的凭据服务臂、retry-policy 注册换血、TRANSPORT 包装与切分器尾部。dashscope 的"缺 index"解码分支不可达 —— `data.length === expectedCount` 配唯一且在界内的整数下标是双射 —— 带 `v8 ignore` 与该论证。TRANSPORT 包装需要 mock server 在响应头送达后复位套接字；在头之前销毁只走到请求侧包装。

## 考虑过的替代方案

- **经 `dsh plugin add` 把 kb 包装进 profile** —— pnpm 会复制 workspace 包且无法从 `$DSH_HOME` 解析其 `workspace:^` 依赖；`DSH_HOME` 钉住以零安装步骤达成解析。
- **把 kb 包加进 `apps/cli` 依赖让默认 home 可解析** —— 为一个示例扩大产品 CLI 的依赖闭包，并改变发布包。
- **用事件失效缓存统一凭据解析** —— 违反凭据缝 no-cache 契约的字面；评审会正确拒绝。
- **现在就把示例 keyless 快照迁移到仓库 `*.snapshot.ts` 约定** —— 组装应用回放 harness 驱动的进程模型与进程内 Loader 组合不同；记为 P1 债务而非拿闭环冒险。

## 后果

- README 入口命令一行，无需 profile 安装，示例状态全部留在 gitignored 的 `examples/kb-agent/.dsh` 与 `workspace/` 树内。
- `llm-minimax` 保持仅由示例组合；未来若要进 base bundle 必须先解决 pi-ai 目录冲突。
- embed/chat 凭据差异是文档化的配置要求，不再是静默失败。
- 两个 embed provider（`packages/kb/kb-embed-minimax/src/index.ts` 与对称的 `packages/kb/kb-embed-dashscope/src/index.ts`）的重试退避带抖动（指数槽的均匀 50–100%），每次重试命中打 debug 日志，接到插件 logger。

## 验证

- `pnpm vitest run packages/kb packages/llm/llm-minimax --coverage.enabled …`：321 测试全绿，每个 `src` 文件语句+分支 100%；全量 `pnpm run test:coverage` 无覆盖阈值错误。
- `pnpm run doc-sync`：28/28 门全绿，含重新生成的图文档与 1013 对一致的双语配对。
- `/bin/bash`（3.2）实跑导入脚本：穿越与单数 kind 以退出码 1 拒绝，`--kind meetings` 落入 `workspace/data/meetings/` 退出码 0。
- `MINIMAX_API_KEY=<假> pnpm vitest run examples/kb-agent/tests/kb-closed-loop.spec.ts` 通过且零网络调用。
- README 命令的 keyless 引导在整树装载后恰好失败于 `MISSING_CREDENTIAL`，证明插件解析；带 key 闭环实跑记录在示例 README 的验证记录中。
