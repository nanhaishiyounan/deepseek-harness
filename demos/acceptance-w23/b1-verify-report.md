# W23-B1 修复批次活体验证记录

- 日期：2026-10-08（晚）
- 网关：http://127.0.0.1:3080/mobile（重启后，bundle `mobile-C37fw91m.js` + `mobile-DR2nDjyQ.css`，lib 经 `build:lib:client` 重建）
- 账号：buyer/Buyer#2026（isolated browser context 干净验证）+ admin/Admin#2026（P0-5 复核）
- 截图：本目录 `b1-01..06`（before 证据沿用审计 `w23-evidence-*.png` / `w23-pages-probe.json`）

## 1. 按钮字号体系（点名① / P1-1）

| 控件 | before（审计实测） | after（本轮 computed style） | 截图 |
|---|---|---|---|
| tokens `--adm-font-size-7/9/10` | 20px / display(30px) / 44px | **14px / 16px / 17px** | — |
| TaskFormModal 取消 | 44px / 高44 | **16px / 高48 / weight500** | b1-05 |
| TaskFormModal 创建任务 | 44px / 高44 | **16px / 高48 / weight600** | b1-05 |
| ProfileView 退出登录 | 44px / 高44 | **16px / 高48 / weight500** | b1-01 |
| 报告卡动作按钮（size=small） | 20px / 高40 | **14px / 高36** | b1-04 |

注：dark 段的同名刻度同步修正（tokens.css 第二处声明），tokens-integrity 单测无字号断言、无需改。

## 2. actions 四类闭环（点名② / P0-1/2/3 + link）

- **服务端**（`tool-present-card` resolve 层新增）：`#/work/business/pur_orders`（审计死路由）现在 violation 带合法候选列表拒绝；`#/docs/pur_orders[/42]`、`#/todos` 等枚举内通过（单测 present-card.spec「view-route shape contract (W23-B1)」4 用例）。
- **客户端镜像**（`actions.ts isProductRoute` 重写为 per-head 参数形状表）：旧会话历史死路由按钮「查看采购订单视图」点击后 **hash 不变、未落「该工作不存在」死页**（拦截生效）。
- **真模型端到端**（新会话 enterprise-data-assistant）：
  - 「查看我最近30天的采购订单」→ 报告卡 title「近30天采购订单简报：27 单 · 合计约 ¥89.3 万」（具体标题，非「本月」模板）→ 按钮「查看采购订单列表」→ **跳转 `#/docs/pur_orders` 出 27 行数据**（b1-04）。
  - 「查看我的待办」→ 卡 title「你的待办：1 条待处理（已逾期）」按钮 view「查看待办列表」→ **跳转 `#/todos`**，无 TaskFormModal（P0-2 修复）。
  - create-task：历史卡「查看待办」（旧 create-task）点开 TaskFormModal 实测字号（见上表）；新纪律下「查看待办」类诉求不再生成 create-task（新会话验证）。
  - send/link：本轮真模型未触发 send 按钮；协议+persona 纪律（send text=简短指令、复制类不做成按钮）由参数描述与 persona 双防线承担，单测覆盖 schema 面。
- 已知残留：新待办卡 metrics 仍出现一条「0 条审批流待办」——persona 0 值纪律模型部分遵守，B2 观察项。

## 3. 报告内容与标题（点名③）

- **title 去模板化**：真模型实测 title 已按「期间+主题+关键结论」起名（见上）；persona 示例已改并明令禁止「本月经营概览」模板与表名。
- **0 值指标**：persona 已加「0 值/无关指标不进 metrics」纪律（本轮模型大部分遵守，残留一条 0 值，B2 观察）。
- **files 重复 demo**：本地/服务端堆积的 17 条同题 demo 报告在 files 页**收敛为每区 1 条**（三区互补视图各 1，b1-02）；服务端 `wfl_mobile_work` buyer 的 100+ 条历史 demo 行经「清除演示数据」+outbox drain 清到 0（api 复查 0 行）；新 seed 幂等（store 已有任何 demo 行只闩 flag）+ seed 移到 backfill 之后，跨设备不再堆叠。
  - 环境注记：桌面遗留的旧版 tab（W12 前后加载）会把其内存里的旧 demo 行回放到服务端；关闭旧 tab 后清一次即净。此为运行环境污染，非本批代码路径。
- **会话标题**：
  - fallback 词安全截断：`今天寒露，这个节气有什么讲究`(45B) → `今天寒露，…`（单测 3 用例锁定）；`查看我最近30天的采购订单`(36B≤40) 完整不截。
  - 标题 LLM 生成器（base bundle `session-title-first-prompt-llm`）**已在线**：新会话 log 出现 `session/title-llm-request` 事件 ×1；最终 title 仍为 fallback（LLM 调用未成功回落），成功率问题（MiniMax 辅助路由超时/失败静默）留 B2 带服务端 verbose 日志追。
  - 旧会话 title 已落 log 不回算（历史显示「…讲」属存量，非回归）。

## 4. P0-4 / P0-5（数据口径）

- **P0-4 预警通知去重**：buyer `#/alerts` recall 通知从 50 条（21 唯一）→ **21 条折叠行**，重复以「×N」计数（NST-2026-A03817 ×5、DW-CL-2025-118 ×3、001FSMS4400 ×6 等，b1-03）。同证照不同天数（72/73 天）是不同扫描日快照，按 title 折叠粒度合理；跨天数按证照聚合归 B2（与 P1-11 远期分区同批）。
- **P0-5 admin 预警空态**：本轮活体 admin `#/alerts` **非空**——87 条 alert-row + 19 条 notice（38 紧急/20 检退/9 CCP/43 质量/1 维保/3 计量/5 效期/3 账期/3 资质，b1-06）。网关 `wflAlertsRowInScope(admin→true)` 行为正确；审计时空态判定为**当时 admin 会话 token 失效/未登录态**下的表现（reader undefined → rows=[]），非数据断链。home hero「N 件事」与四卡口径文案重排（P1-9）留 B2。

## 5. 回归门禁

- `npx vitest run packages/client/ui-mobile packages/interaction/tool-present-card packages/session/session-title`：**66 文件 / 1066 用例全绿**（含新增：action-dispatch per-head 形状、present-card view-route 4 用例、session-title 词安全截断 3 用例、demo-seed 新 title 正则）。
- `pnpm run typecheck`：通过（exit 0）。
- staged lint：commit 前 lefthook 执行（见 commit）。
