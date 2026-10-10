# W24-B0 b0-poc 证据索引

三份主产出：[`VERDICT.md`](VERDICT.md)（三态结论+B3 指令）、[`inquiry-draft.md`](inquiry-draft.md)（询价草稿，未发送）、[`nb-export-report.md`](nb-export-report.md)（导出报告）。

## carbon dev 栈启动与形态

| 文件 | 内容 |
|---|---|
| [`carbon-stack-up.log`](carbon-stack-up.log) | `crbn up --no-portless --no-apps` 全程：compose 起→迁移→类型/swagger 再生→RLS 同步（66 表）→test@carbon.ms 播种；端口盒（API 54321 / PG 51538 / Mail 51541 / Inngest 51542） |
| [`carbon-seed-satellite.log`](carbon-seed-satellite.log) | 显式 `--dataset satellite` 重灌尝试：撞上游 wipe 代码与 2026-10-06 新 CHECK 约束的不兼容（快照期 bug，`customerContractInvoiceLine_parent_check`）；数据本身已由首次 up 的默认 satellite 播种完整入库（见下行实录与 VERDICT §1） |
| [`exp-seed-verification.txt`](exp-seed-verification.txt) | satellite 入库行数实录（item=39/customer=4/salesOrder=24/purchaseOrder=18/job=21/supplier=11/user=2） |
| [`carbon-erp-dev.log`](carbon-erp-dev.log) | ERP dev server（react-router dev :3000）日志；前段 500 为 tool-metadata.json 生成物缺失（CI=1 跳过 postinstall 生成），`pnpm generate:mcp` 补生成 + 重启 dev server 后恢复——vite 模块图冻结不重扫的又一实证 |
| [`docker-ps.txt`](docker-ps.txt) | 9 容器快照（kong 54321→8000、postgres 51538→5432、inbucket/inngest/redis 端口映射与健康态） |
| [`carbon-status.json`](carbon-status.json) | `crbn status --json` 实录（slug/项目名/slot 端口表/容器状态数组） |
| [`carbon-status.err`](carbon-status.err) | status 命令 stderr（clack 装饰输出） |

## 决定性实验 (a)：PostgREST Data API（经 kong :54321）

| 文件 | 请求 → 状态码 |
|---|---|
| [`exp-login-password.json`](exp-login-password.json) | `POST /auth/v1/token?grant_type=password`（test@carbon.ms/password）→ **200**（JWT 1h + refresh） |
| [`exp-a1-rest-item-read.json`](exp-a1-rest-item-read.json) | GET `/rest/v1/item` → **200**（3 行 satellite 物料） |
| [`exp-a2-rest-customer-read.json`](exp-a2-rest-customer-read.json) | GET `/rest/v1/customer` → **200**（3 客户） |
| [`exp-a3-rest-salesorder-read.json`](exp-a3-rest-salesorder-read.json) | GET `/rest/v1/salesOrder` → **200**（SO000001~3） |
| [`exp-a4-rest-noauth.json`](exp-a4-rest-noauth.json) | GET 无认证 → 200 `[]`（anon 被 RLS 过滤） |
| [`exp-a5-rest-customer-create.json`](exp-a5-rest-customer-create.json) | POST 缺 companyId → **403**（RLS WITH CHECK 42501） |
| [`exp-a5b-rest-customer-create2.json`](exp-a5b-rest-customer-create2.json) | POST 带 companyId → **201**（回显新行） |
| [`exp-a6-rest-customer-update.json`](exp-a6-rest-customer-update.json) | PATCH seed 行写回原值 → **200**（UPDATE policy 放行） |
| [`exp-a7-rest-customer-delete.json`](exp-a7-rest-customer-delete.json) | DELETE PoC 行 → **204**（PG count=0 复核） |
| [`exp-rls-policies-customer.txt`](exp-rls-policies-customer.txt) | customer 表四类 policy（SELECT/INSERT/UPDATE/DELETE）实存 |

## 决定性实验 (b)：/api/v1 oRPC 无 key 行为

| 文件 | 请求 → 状态码 |
|---|---|
| [`exp-b1-orpc-noauth.json`](exp-b1-orpc-noauth.json) | POST `/api/v1/sales/getSalesOrders` 无 auth → **401**（"send your API key as Bearer crbn_…"） |
| [`exp-b2-orpc-session.json`](exp-b2-orpc-session.json) | 同调用 + session JWT → **401**（"accepts API keys only"） |
| [`exp-b3-orpc-openapi-head.json`](exp-b3-orpc-openapi-head.json) | GET `/api/v1` → 405（面存在） |

## 附加探查

| 文件 | 内容 |
|---|---|
| [`exp-login-refresh.json`](exp-login-refresh.json) | refresh_token 换新 → 200（长寿命程序化会话） |
| [`exp-generate-link.json`](exp-generate-link.json) | admin generate_link magic link → 200（无邮件依赖的 session 获取路径） |
| [`exp-realtime-probe.json`](exp-realtime-probe.json) | realtime REST 探针 → 403（面开放需鉴权） |

## UI 截图（chrome-devtools 实拍，中文界面）

| 文件 | 页面 |
|---|---|
| [`ui-01-login-zh.png`](ui-01-login-zh.png) | 登录页（"让我们构建一些东西…"，Turnstile 测试对自动通过） |
| [`ui-02-dashboard-zh.png`](ui-02-dashboard-zh.png) | 登录后仪表盘（"晚上好，Test。"，14 模块全中文导航） |
| [`ui-03-apikeys-ee-gate-zh.png`](ui-03-apikeys-ee-gate-zh.png) | 设置→API密钥：仅"升级到 Enterprise"链接，无创建入口（EE 门控 UI 实证） |
| [`ui-04-sales-orders-zh.png`](ui-04-sales-orders-zh.png) | 销售订单列表：24 行真实数据，中文日期/金额格式，合计 US$11,758,690 |

## 任务二：NocoBase 全量导出（产物在 `workspace/lakehouse/legacy/`）

| 文件 | 内容 |
|---|---|
| [`nb-all-tables.txt`](nb-all-tables.txt) | PG information_schema 实查的 public 全表清单（258 张） |
| [`b0-legacy-export.mts`](b0-legacy-export.mts) | 导出脚本（w6b1 链路泛化 + 两处加固：全列类型扫描防 INT32 溢出、REST 404 表的 PG json_agg 直读兜底） |
| [`b0-export-rowcounts.json`](b0-export-rowcounts.json) | 138 表行数 + pgFallback 清单 + skipped 空表清单（loaded=138 failed=0） |

Parquet/对账表/pg_dump 的落盘产物清单见 [`nb-export-report.md`](nb-export-report.md)。
