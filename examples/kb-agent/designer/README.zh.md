# kb-agent-approval-designer

[English](README.md) | 中文

W5-B0 审批流可视化设计器 SPA（React18 + antd5 + @xyflow/react 12，esbuild 单 bundle）。由
`examples/kb-agent/scripts/approval-engine.mts --serve` 在同源 `/designer` 提供；`dist/` 为提交产物，
新 clone 无需构建即可服务。

## 构建、类型检查与 lint

```sh
npm run build      # node esbuild.mjs → dist/designer.js + dist/designer.css
npm run typecheck  # 对 src/ 跑 tsc --noEmit（0 错误为门禁）
pnpm run lint      # 仓库根目录；designer/src 纳入同等 oxlint 规范
```

## 发布链路（W5-B1）

顶栏「发布」= `POST /flow-graph/publish`（携带 `base_version`，与保共同一 CAS 计数器——
并发保存/发布同刻恰好一胜一败）。服务端先跑 round-trip 等价门禁（当前行表 → 逆向导入
graph → 重编译 → 与现库逐行比对，不等价即 400 拒发布），再跑发布门禁（孤立/缺端点/环/
不可达/条件 DSL/词表/引擎可消费特性矩阵），全部通过后以一条 data-modifying CTE 原子改写
派生行（CAS 败则整条 no-op）。成功弹「N 状态 M 转移」派生统计，失败逐条列出可读错误；
顶栏 Tag 展示已发布版本与时间（`published_graph_version`/`published_at` 列）。发布前旧行
快照进 `config_note`（回滚锚）。B1 可发布特性：审批人=指定成员/角色（发布期快照）、或签、
空策略=自动拒绝/转交管理员；supervisorChain/formField/deptLeader/依次审批/会签/其余空
策略/多行条件与其余操作符为 B2（发布期 400 可读拒因）。证据脚本：
`examples/kb-agent/scripts/w5b1-publish.mts --selftest|--round-trip|--run`。

## token 来源（strict 档）

serve 端 `/designer`、`/designer/*`、`/designer/meta`、`/flow-graph` 复用 W3 终端的
`W3_TERMINAL_TOKEN` 门禁（`checkTerminalToken`）。设计器与 W3 终端页（`scripts/w3-terminals/`）
共用同一 bootstrap 模式（[`src/lib/auth.ts`](src/lib/auth.ts)）：

1. **URL**：`/designer?token=<W3_TERMINAL_TOKEN>` —— 首次进入即记住；
2. **localStorage**：`w3-terminal-token`（与 W3 终端页同 key，一次注入全端共用；隐私模式下每次带 URL 参数即可）；
3. **设置**：无独立设置入口 —— 换 token 用新 URL 参数覆盖即可。

SPA 每个 fetch 自动带 `x-terminal-token` header；`designer.js` 与 `designer.css` 同受门禁——
`dist/index.html` 的内联 bootstrap 按已记住的 token 动态注入 bundle 的 `src`，bundle 加载后
（[`src/lib/auth.ts`](src/lib/auth.ts)）再为 `<link>` 补 `?token=`。未设置 `W3_TERMINAL_TOKEN`
时为宽松本机演示档（响应头 `x-terminal-auth: lenient-demo` 标注；生产必须设置该 env）。缺 token 的请求
返回 401 并附引导文案：header `x-terminal-token`、query `?token=`，或首次经 URL `?token=` 注入后由
localStorage 复用。

## 编辑态持久化契约

- `GET /flow-graph?doc_type=` → `{ graph, graph_version }`；
- `POST /flow-graph` body `{ doc_type, graph, base_version }`：`base_version` 是本次编辑所基于的
  `graph_version`。保存经 psql 单条原子条件 UPDATE（`WHERE id AND doc_type AND graph_version =
  base_version`；NocoBase REST 的 filter update 是 find→update 两步，不能充当 CAS 原语）落库；
  过期基线 0 行命中即 **409**（他端已保存；点「重新加载」后重做）——两路同刻并发保存恰好一胜（200）
  一败（409）。切流/重载会取消 SPA 在途保存，画布已换流后归来的保存响应不再回写状态。serve 对成功
  （`v→v+1`）、冲突（双方版本号）、意外异常（含 stack）三路径均有结构化日志；
- `validateFlowGraph` 编辑态校验：负坐标与 Infinity/NaN 坐标、trim 后空白的名称、超 64 字符、含 `<`/`>`、
  审批节点空 assignees 均 400 拒绝；存库标题一律 trim；
- `GET /designer/meta` 的每个 label 经 `resolveI18nTitle` 解析——NocoBase `{{t("...")}}` 模板标题不会
  泄漏进下拉（显示内部字符串；空 title 部门行直接丢弃）。
