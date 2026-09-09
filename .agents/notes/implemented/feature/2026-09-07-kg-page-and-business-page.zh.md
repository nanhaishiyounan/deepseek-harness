# Agent Note: 图谱页与业务管理页——V6 页面第二波落地

Status: implemented

[English](2026-09-07-kg-page-and-business-page.md) | 中文

## Problem

用户收口要求"这些都要有对应页面的、内置是内置，页面 uiux 不能缺失"的最后两页：知识图谱可视化（sigma.js 子图浏览）与业务管理（NocoBase collections 的对话优先管理面），加上 embed 低频管理辅助（[plans/nocobase-native-integration/02-design.md](../../../../plans/nocobase-native-integration/02-design.md) §3.3/§3.4 是规格权威；PLAN 盲区 B/C 是决策输入）。

## Decision

- kg 读面是新 apiproxy 域（`kg.schema/search/subgraph/expand/stats`），照 V5 assets/connectors 惯例落全六触点（契约 + zod + ApiProxy 字段 + rpc-map + fetch 双端 + api-proxy 实现）并接线双 fake 面与 connection fixture；`kgEnabled`/`kgTenant` 显式 opt-in，`kg-tenant-unbound` 拒绝独立于 kbTenant。searchNodes/subgraph 无取消契约（FTS 探针 + 有界 CTE）；`relation_types` 在投影层过滤，与 kg_subgraph 工具一致。
- sigma 栈不引 @react-sigma/core（设计写"三件套"；封装面不足五十行，V-R12 备选切换依旧轻易）；FA2 在 ≤500 节点窗口内同步跑 60 次迭代，不持续模拟。三包一次动态加载；无 WebGL 宿主降级为同语义关系清单（jsdom 测试真实走降级路径）。
- 节点颜色骑十档 `--dsw-graph-node-*` 主题刻度（浅/深两块）加类型 id 稳定哈希——页面零私有色。
- 业务页零表单：卡片流与 hasNext 表格骑 V2 的 `nocobase.listMeta/list` 域（无新 BFF 域）；一切写入交给会话的 nb_* 确认流。
- embed 辅助是 webserver 新增 opt-in `/nocobase` prefix 反代上的同源 iframe（流式转发、剥 framing 头、Host 重铸、上游不可达 502）。实测 NocoBase 2.2.6 不下发 framing 头——B 报告遗留 #12 的修正——剥头是纵深防御；plugin-embed 代签保持后置（其 server 端是空插件、无公开 embed 页可指）。

## Consequences

- 图谱页在任何宿主（WebGL 或清单降级）都能渲染真实游走，渲染栈不进主包；主题十色刻度成为后续一切图着色的共享落点。
- 业务管理页的写路径永不长出 UI 状态——记录变更始终是可审计的对话；反代 origin 未配置时嵌入入口降级为指引文案。
- 启用 kg 域的部署必须同时配置 `kgEnabled` 与 `kgTenant`；缺绑定让每个 kg 方法大声失败而非落到默认租户。

## Alternatives considered

- @react-sigma/core 作画布封装：否决——维护低频（风险 V-R12）对不上五十行以内的自持封装。
- FA2 持续模拟 + 拖拽钉扎：游走规模常规超过 ~500 节点窗口前不做（彼时布局也不是瓶颈）。
- `nocobase.embedToken` 代签进 `/embed/<pageId>`：部署发布 plugin-embed 公开页前保持后置；当前反代渲染 admin 根路径。

## Evidence

- `pnpm vitest run packages/client/ui-kg packages/client/ui-business packages/host/webserver`：59+3 测试绿（含 jsdom 降级路径、反代真回环、路由注册开关）
- `pnpm run typecheck` 全绿；kg 域六触点在 fetch 双端编译器锁下接线完整
