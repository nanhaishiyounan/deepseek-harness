# Agent Note: M1/M2/M3 触面覆盖收口批次

Status: implemented

[English](2026-09-19-coverage-closeout-m1-m2-m3.md) | 中文

## 问题

M1（UI/UX 重设计）、M2（本体 + KG + AI 重建）与 M3（移动端）三个批次落地时未做单元覆盖收口：per-file 100% 的 CI 门禁会拒绝这些被触面包。用仓库自带的分区覆盖工具实测的基线（每文件语句覆盖）：tool-kb 65.71%（kg-edit 0.43）、ui-mobile client 约 0%、kg-build 91.23%、kb-graph 93.53%、kb-graph-sqlite store 96.41%，另有 ui-kg、ui-kb、ui-business、apiproxy fetch 的尾部缺口。

## 决策

- **tool-kb → 100/100/100/100**：新增 `tests/kg-edit.spec.ts`（planning 解析拒绝矩阵、基于真实 SQLite store 与假 LLM 的 propose→apply→rollback→episodes 往返、SHACL 预检重试、矛盾退役、presentation）与 `tests/kg-query-fill.spec.ts`（基于假 LLM 的 L1 补参层、PPR 两跳走查、未解析种子提示、presentation 包装、共享 `completeViaLlm` 辅助）。三个不可达分支带理由地标注 `v8 ignore`（JSON.parse 不会抛非 Error；已应用的 op 关系必然已注册；重试的约束对在构造上即合法）。
- **ui-mobile → 100/100/100/100**：新增 `tests/services.client.spec.ts`（rpc wire 失败形态、sessions-service 包装与投影、useAsync/usePoll 状态机含卸载后迟到的应答）、`tests/views.client.spec.tsx`（带倒计时的登录门、应用壳路由、四个标签页、带任务卡与推送回执的聊天视图、KG 证据卡、数据页走查、入口挂载）与 `tests/fold-branches.client.spec.ts`（fold wire 形态守卫、form-draft 拒绝形态）。
- **该批次发现并修复的产品缺陷**：`WorkbenchView` 向 `useAsync` 传入内联 fetcher，其"标识变更即重取"契约让每次渲染都重取——jsdom 下无限取数循环（maximum update depth）、真机上耗电。fetcher 改为模块级常量。
- **kg-build 91.23 → 96.95**：新增 `tests/close-out.spec.ts`（mappings/corpus-manifest/OLS 拒绝分支、cross-source v2 判决层、latestRun/runIncremental、run() 内的 FoodOn 腿、禁用 align 的报告、全组装上的 instruct-kgc 协议）。
- **kb-graph 93.53 → 96.77**：新增 `tests/gaps-close.spec.ts`（validateOntology 引用抛错、louvain/PPR 边界图、SHACL 可选属性形态与未注册关系、KGCL 预览、运行时本体编辑拒绝矩阵、xref/reject 往返、PPR 邻域）。kg-nl/ppr/louvain 的纯防御分支带理由标注 `v8 ignore`（强制正则分组；预 sized 邻接数组）。
- kg-build 的 align 报告字段分支：`v8 ignore`（runCrossSourceAlign 两条路径都有答案）。

## 备选方案

把触面包直接登记进 vitest.config.ts 的覆盖排除而不写测试——被否：这些缺口是本迭代真实的行为面，不是需要浏览器级测试装置的债。只以单包口径交付——被否：CI 判定的是合并分区清单，per-file 收口必须对准那根线。
## 后果

本批次之后，分区 per-file 门禁（4 分区、超时 180s）仍在约 25 个包上报约 200 条 threshold error。本批次把 **tool-kb 与 ui-mobile 关到了门禁标准**（两者 0 threshold error）。kg-build（91→约 97% 语句；index/extract/mappings/validate/cross-source/corpus-manifest 尾部）、kb-graph（93.5→约 98%；index/kg-nl/shacl 尾部）与 kb-graph-sqlite（store/schema 尾部）收敛但仍留双位数错误数——由后续批次（2026-09-19-coverage-closeout-final.zh.md）关闭。未被触达的面保留完整缺口直至该后续批次：ui-kg `client/index.ts`（34%）、ui-view-context、ui-kb hero 带、ui-business、ui-assets、ui-agent-preset、ui-mobile-preview、connector/tool-nocobase、tool-connector、connector-nocobase、expert-orders、apiproxy `fetch/*` 等。M1 期的 kb-agent kg-tools 快照按本体 1.2.0 刷新（packaging 分类）。三个负载敏感测试（hmr-config、tools-catalog 往返、gen-client-catalog slots）在 4 路分区竞争下抖动但串行通过；apiproxy 的 SQLite 变量数上限搜索用例加了显式 30s 超时。

## 验证

逐包 `CI=1 vitest run --coverage --coverage.thresholds=false` 配 uncovered-locations 报告器；每批转绿后才继续。最终门禁证据：`pnpm run test:gui` 4552 通过（自 4483 上升——本批新增约 136 用例）、`pnpm run typecheck` 绿、触面包 oxlint 0 错误（tool-kb、ui-mobile、kg-build、kb-graph、kb-graph-sqlite、ui-kg、ui-kb、ui-business、apiproxy）。
