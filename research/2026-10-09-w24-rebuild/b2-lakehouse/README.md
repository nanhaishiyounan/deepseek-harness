# W24-B2 湖仓批实跑证据

- 提交：`c883f4ed75`（packages + examples + 本目录），前置 lefthook 七道门禁全绿（third-party notices / whitespace / vendor manifest / v8 budget / translation pairing / lint / archived notes）
- 引擎版本锁定：DuckDB **v1.5.6**（`@duckdb/node-api` 1.5.6-r.1），DuckLake 社区扩展实测加载 OK（R-2 风险关闭）

| # | 文件 | 内容 |
|---|---|---|
| 1 | `01-smoke-extension.txt` | R-2 第一验证项：postgres/ducklake 扩展加载、PG ATTACH 只读往返（orders=76）、READ_ONLY 写入被拒、DuckLake 写读+持久化 |
| 2 | `02-acceptance-run.txt` | 138 表入湖（128 parquet + 10 schema-only）+ 行数对账 **138/138 ALL OK**（9270 行，missing=0 mismatch=0 extra=0）+ so_order_lines/so_orders 真实聚合 + 恶意 SQL 六连拒（INSERT/UPDATE/DELETE/DROP/ATTACH/多语句）+ 表完好 + 同步两轮（1605→1605 无重复，watermark 推进） |
| 3 | `03-increment-proof.txt` | 增量证明：PG 插 1 行 → 第三轮 sync appended=1 → 湖仓 delta=1 → 插入行可见 YES（watermark 1791523967309→1791623275431） |
| 4 | `b2-acceptance.mts` / `b2-increment.mts` | 上述两轮实跑的可复现脚本（repo root tsx 直跑 workspace 源码面） |
| 5 | `05-ui-lakehouse-catalog.png` | 湖仓工作台：sidebar nav 湖仓行（139 徽章）+ 表目录（legacy_nocobase 分组） |
| 6 | `06-ui-lakehouse-schema.png` | schema 卡：so_order_lines 列结构 + 样本行 |
| 7 | `07-ui-lakehouse-query-result.png` | UI 只读查询：`sum(qty)=34670` 真实结果 |
| 8 | `08-ui-hostile-rejected.png` | UI 提交 `DELETE FROM` → 内联拒绝 |
| 9 | `09-chat-model-selected.png` / `10-llm-session-toolchain.png` / `11-llm-session-transcript.txt` | **web 会话真实 LLM 实跑**（DeepSeek v4-flash）：`lakehouse_list_tables` → `lakehouse_schema` → `lakehouse_query` 三工具真实往返，回答表「行数 12 行；qty 合计 34,670」并交叉校验与目录一致 |
| 10 | `b2-llm-shoot-facts.json` / `.b2-llm-shoot.mjs` | LLM 实跑断言与脚本（RPC 预选模型绕开空会话模型 popupSelect 缺陷——已另行记录） |

## 验收对照（任务书 Given/When/Then）

| 验收项 | 结果 |
|---|---|
| list_tables 返回 138 legacy 表且与对账表一致 | ✅ 138 张 + 9270 行，对账 0 偏差 |
| 业务表真实聚合与对账一致 | ✅ so_orders=13 / so_order_lines=12 / sum(qty)=34670 |
| 恶意 SQL（INSERT/UPDATE/DELETE/DROP/ATTACH）全被拒 | ✅ 六连拒 + 表完好（13 行不变），UI 面同样内联拒绝 |
| 同步两轮：watermark 推进且无重复 | ✅ round1 appended=1605 → round2 appended=0（1605=1605），watermark 推进 |
| 增量：仅新增 | ✅ PG 插 1 行 → delta=1 → 可见 |
| web 会话真实 LLM 调用湖仓数据 | ✅ 三工具链 + 12 行/34,670 答案 + 截图/轨迹 |
| typecheck + 定向 test + lefthook | ✅ 全绿（本目录脚本 + lakehouse 184 + apiproxy/connection/runtime/tools 1337+） |
