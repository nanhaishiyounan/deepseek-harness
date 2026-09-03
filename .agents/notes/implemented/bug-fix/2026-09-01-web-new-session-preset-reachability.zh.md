# Agent Note: web 新建会话——预设可达性与动作失败呈现

Status: implemented

[English](2026-09-01-web-new-session-preset-reachability.md) | 中文

## 问题

在 kb-agent 网页工作台点击"新会话"没有任何可见反应。真实复现暴露了失败的两半：`session.create` 对 `enterprise-data-assistant` 返回 `agent-preset-not-found`（roster 里只有 shipped 预设），而客户端 `WorkspaceRuntime.startSession` 把拒绝吞成 `console.warn`，用户完全看不到错误。启动自动选择同样静默死亡。

## 决策

### 示例的默认预设必须随组合可达，而不是依赖复制步骤

`examples/kb-agent/cordis.patch.yml` 设置了 `agent-presets.default: enterprise-data-assistant`，但该预设只有按 QUICKSTART 手动复制进 `$DSH_HOME/.agent-presets` 后才存在。不带 `DSH_HOME` 前缀启动 `pnpm dsh web --patch examples/kb-agent/cordis.patch.yml`（任务文档给出的命令形态）时 roster 不含它，每次新建会话都在服务端失败。`apps/cli` 的 `composeProfile` 让 patch 无法自救：它把 `roots` 覆盖为仅 shipped root，组合永远带不上自己的预设目录。

`composePresetRoots` 现在把 shipped root 追加在组合 config 显式声明的 roots 之后（earlier-root-wins 优先级），kb patch 把 `examples/kb-agent/agent-presets` 挂为 `user` 信任的 root。示例预设从任何 `DSH_HOME` 都可达，无需复制步骤；可写的 `$DSH_HOME/.agent-presets` root 继续服务本地自建预设。信任面没有扩大：`--patch` overlay 本来就能 insert 任意插件，声明一个预设目录没有带来 patch 原本没有的权限。

### 新建会话失败呈现到 workspace 列表状态上

`WorkspaceListState` 增加 `lastActionError`（seq 键控的 `{ seq, text }`）；`startSession` 的拒绝写入它（console 诊断保留）。启动自动选择刻意保持仅 console：它是自动重试策略，每次重试都弹 toast 只会刷屏。`WorkspaceBrowser`——数据读取方（侧栏 shell 的契约让它不碰全局 hooks）——把该单元渲染成共享的瞬态 `Toast`（`role="alert"`），以 seq 为 key 让重复失败重启 hold-then-fade 周期。这兑现了 `IWorkspaces.startSession` JSDoc 里"failures surface"的旧承诺——此前从没有实现兑现过它。

## 备选方案

- **默认预设缺失时回退 `standard`** —— 违反 fail-loud：一个错误但能跑的 agent 组合比一个指名道姓的错误更糟。
- **在 `SidebarRoot` 里渲染 toast** —— shell 的测试用 `neverHook`（被调用即 throw）钉死它不读全局 hooks；浏览 region 本来就读 `useWorkspaces`，toast 放那里。
- **后续成功时清空 `lastActionError`** —— toast 本来就是瞬态的，seq 键控已经防止陈旧重现；清空只增加状态翻腾，没有可观察收益。

## 后果

- 默认预设无 root 供给的部署仍在服务端 fail-loud，但用户现在看到 `New session failed: … (agent-preset-not-found)`，而不是一个死按钮。
- 组合可以随 patch 附带预设目录；shipped root 排最后，部署无法意外遮蔽 shipped id（显式 roots 赢得重名是有意为之）。
- `WorkspaceListState` 的消费方（各 client 包的测试 fixture）携带新的 `lastActionError: null` 单元。

## 验证

- 真实浏览器（Playwright 驱动 `pnpm dsh web --patch examples/kb-agent/cordis.patch.yml`，不带 `DSH_HOME`）：修复前——`session.create` → `agent-preset-not-found`，仅 console；修复后——200，blank 会话打开，console 干净。
- `pnpm vitest run apps/web/tests/new-session-lifecycle.e2e.ts`：5/5——composer 生长的 turn、侧栏 mint（以 host agent 计数为导航屏障）、切回加载历史、console tripwire、失败 lane 断言 alert toast 从 adoption 流和按钮两条路都点名 `agent-preset-not-found`。
- `pnpm vitest run packages/client/runtime/tests/workspaces-service.client.spec.ts packages/client/ui-workspace/tests/workspace-browser.client.spec.tsx`：68 绿，含新的 action-error 单元与 toast 用例；`apps/cli/tests/profile-boot.spec.ts` 锁定 `composePresetRoots` 顺序。
- fixture 清扫后 `pnpm run typecheck` 与 `pnpm run build` 全绿。
