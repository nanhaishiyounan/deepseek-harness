# Agent Note: B5 收口回归——测试基线三根因修复与 setup 链补全

Status: implemented

[English](2026-09-11-b5-closeout-regression.md) | 中文

## Problem

B1-B4 四批验证累积了六项债务，且全量 `pnpm run test:web` 有约 45 个用例失败，混杂了四类不同根因：jsdom assembled 快照面整体崩溃、本地构建 profile 与官方产物不一致、e2e golden 未随侧栏四入口重录、上传通道配置缺 opt-in。setup 链上，专家名册与历史订单不在 `all` 链内——重置 NocoBase 后单跑 `all` 恢复不了完整市场目录，且 kg-build 的「全集合非空」断言在 orders 空集合上直接失败。

## Decision

- **assembled jsdom 的 WebGL 常量 stub 归测试基建**（`apps/web/tests/assembled-boot.ts`）：内联进 client bundle 的 sigma 渲染栈在模块顶层读取 `WebGL2RenderingContext` 静态枚举，jsdom 无此全局导致 ui-kg 包 factory 首次 require 即抛错、整包加载失败。stub 只提供枚举数字（与 ui-kg 包内测试的 `vi.hoisted` 同形），降级关系清单路径不会触碰真实 GL 上下文。
- **本地跑 test:web 必须先出 official 产物**：`pnpm run build`（无 profile）产出的 bundle 里 `DSH_CLIENT_BUILD_PROFILE` 被 define 成空对象读取，ui-brand-official 的 official 守卫自我关闭，built-boot 断言的品牌 wordmark 落在 fallback。CI 设了 `DSH_BUILD_CLIENT_PROFILE=official`；本地等价命令是 `DSH_BUILD_CLIENT_PROFILE=official pnpm run build`。
- **golden 重录以 diff 审核为准**：B4 侧栏四入口（Data assets/Connectors/Graph/Business 按钮与 tab）引发的 aria golden 漂移经 `DSH_SNAPSHOT=refresh` 重录，逐文件 diff 审核真实口径为 45 文件 +536/-54——删除行仅 lifecycle-chrome 的 hero/plan-active 两文件，属 B3 场景 IA 的合法语义替换（精选 + 分类收纳 + 检索取代旧平铺 hero）。任何内容丢失或控件消失都必须先查根因。
- **测试选择器跟随合法的重复文本收窄**：steering 的 `getByText('Standard mode')` 因 hero 预设 label 与 composer 预设 seat 两处同名而 strict violation（57a87db34c 引入的产品形态），断言收窄为 seat 按钮角色。
- **上传通道的 opt-in 跟随通道迁移**：浏览器上传走统一 `data.upload` 路由后，kb-workbench e2e overlay 需要同时 opt-in `dataUploadEnabled`（与 `kbWriteEnabled` 并列），一行配置缺失会让上传行永远停在失败态。
- **专家名册与历史订单并入 `all` 链**（`setup-dsh-data.mts`）：名册水位按 roster 32 位专家名全在判定，订单水位按 `ORD-B5-` 前缀 24 条全在判定，缺则重放各自播种脚本（两者自身均幂等）；verify 断言组相应加 experts/expert_services/datasets/orders 行数下限。这是「重置后单跑 all 即完整系统」的最后一环。

## Verification

- `kb-workbench.e2e.ts` uploads×3 连跑两次 14/14 全绿（上传耗时恢复正常量级）。
- 28 个漂移文件 replay 复验 104 passed；`built-boot`/`command-image-envelope` 等 jsdom 快照在 official 产物 + WebGL stub 下全绿。
- reset → 删三份 sqlite → 首跑 all 中名册 replay（32 专家/49 服务/23 资产）暴露 orders 空集合断言失败，补编排后 all EXIT=0（orders replay 24 条），再跑 all 全步 kept、verify OK。
- 五场景 demo 5/5 PASS（实录 `demos/full-journey-20260911-160059.md`；首轮失败是 :3080 未起——fulfill 回调无服务，属环境前置而非产品缺陷）。
- `pnpm run typecheck`、`pnpm run lint`（0/0）、`pnpm run doc-sync`（28/28）、`examples/kb-agent/tests/` 分区 46 测试全绿。

## Consequences

- **hmr-live×1 豁免**：`pnpm run dev:web` 在本机确定性崩溃——tsx@4.22.4（异步 `module.register` hooks）与 tsdown@0.22.2 经 import-without-cache@0.4.0（同步 `registerHooks`）在同进程内的 load-hook 互操作缺陷（Node 22.19.0，`ERR_INVALID_RETURN_PROPERTY_VALUE`）。最小复现：`tsx` 下 in-process 调 `tsdown build({ workspace })` 即崩；tsdown CLI 子进程与 `scripts/build.ts` 的全子进程路径均正常。该链路本流代零改动、HEAD 同崩，非负载抖动也非产品回归；修复需上游（tsdown/tsx/Node hooks 协议）演进，仓库侧重构 dev-web 架构超出本轮范围。CI 的 Linux 矩阵持有该信号。
- **remote-welcome×1、smoke-real×1 判定为环境项**：串行单跑复绿（前者在 28 文件复验批、后者 4 passed/8 skipped EXIT=0）；run2 的 smoke-real 失败横跨一次系统休眠（单文件跑了 100 分钟）。
- **n22-think-filter.spec.ts 的 +2/-1 归属**（B1 连带修复）：`filterNonStreamBody` 用例把链式 any 访问 `JSON.parse(...).choices[0].message.content` 收窄为 typed cast + optional chaining（`{ choices: { message: { content: string } }[] }`），属 B1 批次修 think 过滤时的类型收紧，随本批收口统一说明。

## Alternatives considered

- **专家名册改文档删声称**（债务 1 的方案 b）：被否——重装 NocoBase 后单跑 all 恢复 32 位专家是「重置即完整系统」语义的一部分，文档降级会把缺口固化。
- **KgGraphCanvas 改动态 import sigma**：被否——单文件 bundle 是已裁决的设计（ModuleLoader 无相对路径 chunk），jsdom 缺口应在测试环境补 stub。
