# Agent Note: 批次二质量面收口——快照失同步、幽灵 fixture 包、lint 900 红与超时定性的处置方法

Status: implemented

[English](2026-09-08-batch2-quality-face-closure.md) | 中文

## Problem

启动链路诊断（[plans/diagnosis-2026-09-08.zh.md](../../../../plans/diagnosis-2026-09-08.zh.md)）批次一修掉 F1–F3 后，质量面仍有五组红：F7 工具目录 spec 期望 79 实收 81、F8 THIRD_PARTY_NOTICES.md 失同步、F5 verify-cordis-config 报 `examples/package.json` 缺 `@deepseek-ai/dsh-fake-llm` 依赖、F6 lint 约 900 errors（交接文档的 stash 验证撤掉 N/V 线后仍复现，但那不是空基线）、F9 全量 test 22 个超时红。每一组都需要先定性（真缺陷、失同步还是环境）再处置，且工作区 343 项未提交改动是待交付成果，禁止 stash/reset。

## Decision

### 失同步红先问"哪一半没跟上"，不盲目改期望

F7 的 `verify-tool-catalog` 本来就绿——V4 当时重新生成了 `docs/tool-catalog.md`，漏改的是 [`gen-tool-catalog.spec.ts`](../../../../packages/core/tools/tests/gen-tool-catalog.spec.ts) 的硬编码期望列表；工具真实注册且模型可见，行为正确，补期望即修。F8 是生成物没重跑：`pnpm run gen-third-party-notices` 一次补齐 7 条（graphology 三件来自图谱页、pdf-lib/exceljs/duckdb 来自交付线）。两者的判定依据都是"权威生成器/registry 的现状 vs 落盘快照"谁新谁旧。

### 幽灵包名不进 manifest：fixture 行只写可解析的 bare name

F5 的 `@deepseek-ai/dsh-fake-llm` 在 workspace 无对应包——实现由 [`kg-tools.spec.ts`](../../../../examples/kb-agent/tests/kg-tools.spec.ts) 的 `loader.internal.import` stub map 注入，fixture 行只为了让 Loader 图挂上 llm provider。`verify-cordis-config` 要求 examples 下 cordis.yml 的 bare 插件名可从 `examples/package.json` 解析，而向 manifest 补 `workspace:*` 声明会让 pnpm install 解析失败。修法：fixture 删行，spec 在 loader 装配前直接 `context.plugin(FakeLlmModule)`——同进程同 ctx，服务注册等价，快照不变。

### lint 900 的主体是产物，不是代码：先归类再动手

903 = 847 + 56。847 个错误落在 14 个 `src/*.d.ts`（带 sourceMappingURL 的 emit 产物）：全部 untracked、mtime 统一为同一次事故、当日 `build:lib:host` 不再生——删除而非修复（给产物修分号是倒置）。残留的 19 个 tracked `src/*.d.ts.map` 证明该事故历史上还发生过错提交（`.gitignore` 的 `.map` 规则挡不住已跟踪文件）。56 个真源码错误全部属于本轮工作线文件（无基线红）：`--fix` 自动修 25，手工修 31——non-null 断言改窄化/可选链、四类确需例外的场景（WebGL 枚举 stub 的构造函数形态、测试非 Error 拒因本身、方法表 async 的 Promise 返回适配、oxlint 轻量类型与 tsc 不一致的断言回补）用行级 `oxlint-disable-next-line … -- 理由`，遵守 .oxlintrc.json 不改规则。

### 超时红用"波动集合 + 逐文件单独重跑"定性

两轮全量跑（一轮与 lint 并行、一轮独占）失败 30→23 且各有新面孔——失败集合漂移本身即排除真缺陷。24 个出现过失败的文件逐一单独重跑全部有 PASS 证据（多数一次过；oxlint-contract 首跑 1 红再跑全绿，属 spawn 子进程冷启动 flaky）。vitest 12 线程全仓库并发下 spawn 子进程类测试的 5s 默认超时是本机结构性瓶颈，登记为环境型红，不在本机追求全量 EXIT=0。

## Alternatives considered

**F5 补 manifest 声明或改引用 `dsh-llm-replay`。** 前者 pnpm install 必炸（解析不到包）；后者让 fixture 声称挂 replay 实际 stub 换成 fake，语义错位。直接挂载最诚实：provider 注册不经过 Loader，也就不需要任何可解析的名字。

**F6 修复 847 个 `.d.ts` 的分号。** 否决：这些文件是构建事故残留，正确的状态是不存在；逐条修 lint 会把垃圾固定进工作区。

**F9 调大 vitest 默认超时让全量转绿。** 否决：那是改测试基建迁就本机负载，且 CI 用自己的矩阵；本地证据链（单独重跑 PASS）已经足够登记。

## Consequences

- 终态：`pnpm run typecheck` 0；`pnpm run lint` 0 warnings 0 errors；`pnpm run verify-cordis-config` 178 files passed；`pnpm run doc-sync` 28/28；全量 test 15884 过 / 23 环境型红（全部有单独重跑 PASS 证据）。
- 今后 examples 下 fixture 的 bare 插件名必须对应真实 workspace 包；测试内注入的假 provider 改走 `context.plugin()` 直接挂载。
- `--fix` 的 `no-unnecessary-type-assertion` 会基于轻量类型信息误删 testing-library `getByRole` 重载所需的按钮断言——修复后必须 typecheck 裁决，误删处回补断言并加行级 disable。
- 遗留（后续 PR）：19 个 tracked `src/*.d.ts.map` 待 `git rm`；NocoBase iframe 内 `{{t("Roles")}}` 等翻译键属 platform/nocobase 快照内部，按隔离约定不动。
