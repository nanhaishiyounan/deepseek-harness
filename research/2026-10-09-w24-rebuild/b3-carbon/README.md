# W24-B3 carbon 业务批：验收对照表与证据索引

- 日期：2026-10-10 ｜ 批次：W24-B3（五源②：业务系统 carbon）
- 前置：B0 GO 结论（PostgREST session 通路）全量实施；B2 lakehouse-sync Config 化数据源就绪

## 包清单（新增 2）

| 包 | 职责 | 测试 |
|---|---|---|
| `packages/connector/connector-carbon` | `ctx.carbon` 能力服务：GoTrue password/refresh 双 grant 会话（1h JWT + refresh 回退）、双头（apikey+Bearer）、kong :54321 PostgREST 面、INSERT 租户注入（employee 表 id=GoTrue sub 解析 + Config pin 兜底）、RLS 42501→`CARBON_RLS_VIOLATION` 结构化 | 12/12 绿 |
| `packages/connector/tool-carbon` | cb_collections/cb_list/cb_get（safe 读）+ cb_create/cb_update（cautious 写，write-tier 门控 + companyId 拒收）| 13/13 绿 |

## 改造面

| 面 | 内容 |
|---|---|
| webserver | `carbon-proxy.ts`（/carbon 前缀 + HTML 资产重写 + ws upgrade + Location 重根）+ `carbonProxyOrigin` Config |
| apiproxy | carbon 域 5 方法（listMeta/list/get/create/update）+ rpc-map/schema/client 契约 + `carbonEnabled`/`carbonWriteEnabled` 门（5 个结构化错误码） |
| ui-business | 数据面 nocobase→carbon（模块化导航：主数据/销售/采购/库存/生产/质量），座位 footer.action→sidebar.nav（B1 座位补齐：`sidebar.nav.host` 声明 + `NavState` 导出 + slot `hidden` 选项） |
| lakehouse-engine | ENUM 列投影 CAST AS VARCHAR（carbon PG 大量 ENUM 列，DuckLake 无 ENUM 存储） |
| lakehouse-sync | 全 NULL 游标列回退 replace 模式（carbon updatedAt 仅应用层维护，PostgREST 写入的行游标全 NULL） |
| cordis.patch.yml | persona cb_* 换轨（nb_* 退役）+ connector-carbon/tool-carbon 挂载 + expert-orders 下单链退役 + nocobase 读路径全部摘除（carbonEnabled 替代 nocobaseEnabled；webserver carbonProxyOrigin 替代 nocobaseProxyOrigin） |

## 验收证据

| 验收条 | 证据 |
|---|---|
| 登录 + list item/customer 200 真实行 | `01-seed-run.txt`（before 计数 = satellite 数据 39/4/11/24/18/21） |
| 灌数（食品成链：4 物料+2 客户+2 供应商+2 SO+2 PO+1 工单） | `01-seed-run.txt` reconcile 全 ✓（43/6/13/26/20/22） |
| RLS 负向（伪造 companyId） | `01-seed-run.txt`：`CARBON_RLS_VIOLATION HTTP 403 body.code=42501` |
| LLM 实跑查询 | `03-llm-cb-list-customers.png`（cb_collections→cb_list，6 客户，NovaSat/Apex 名单） |
| LLM 实跑创建 | `04/05-llm-cb-create-*.png`（草稿确认→cb_create→item_3Jy2WSbQg9W7jbV3m3Hrxd，companyId 自动注入 `db4lv4dd40h042piovug`） |
| 湖仓同步两轮+增量 | `02-lakehouse-sync.txt`（round2 零重复 + round3 delta=1 精确 + legacy_nocobase 138 表完好） |
| ui-business 数据来自 carbon | `06-ui-business-carbon.png` + `03-acceptance-run.txt` j3（carbon.list 200 + nocobase 请求 0） |
| /carbon 代理可达 | `10-carbon-proxy-login.png` + `10-carbon-proxy-check.txt`（200 + 资产重写 + Carbon|Login 标题） |
| carbon ERP UI 在线 | `07/08-carbon-erp-*.png`（:3000 直连登录页/首页） |
| 门禁 | typecheck/build 全绿 + 定向测试（69+454+12+13）+ verify-cordis-config 181 文件过 |

## 边界注记

- **库存表写入**：itemStockQuantities 直接 INSERT 被 RLS 拒（403，`01-seed-run.txt`）——库存数量由 carbon 过账 server-functions 独占（B0 VERDICT 指令③的另一半），B3 工具行按 manifest 三分不收复合过账。
- **carbon ERP 深度截图**（parts 列表中看到 LLM 行）：dev 栈 magic-link 的 SPA hash 会话在 headless 下未完成建链（07-erp-double-sided.txt 记录）；行级双端证明走 PG 实查（`item_3Jy2WSbQg9W7jbV3m3Hrxd` + companyId）+ API 201 JSON 回执截图。B0 的 ui-01~04 已证明人工 UI 登录路径可用。
- **dev-stack HMR/数据通道**：/carbon 代理支持整页导航（SSR）；vite HMR socket 与 /_data 客户端路由在代理前缀下不可达（生产构建的 asset base 可闭合，见 carbon-proxy.ts 头注）。
