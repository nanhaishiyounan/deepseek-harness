# 分域计划 03｜carbon 业务系统接入（B0 PoC + B3）

- Spec 溯源：主计划 §1.1 指令 1/2/4 + §3 选型表 + §9；[`r1-carbon-anatomy/REPORT.md`](../../r1-carbon-anatomy/REPORT.md:1)（§7 部署/§8 API 面/§11 三路径/§13 建议/§14 许可证结论）
- 架构决策：**路径 (b)——carbon 独立 sidecar（官方形态、零修改）+ `@deepseek-ai/dsh-carbon` 插件群（HTTP 驱动）**。否决 (a) 整树并入（EE 剔除工程不可控+高频追赶）、(c) 重写（AGPL ports 传染条款封死）。

## 许可证红线（B0/B3 全程有效）

1. 禁止引入/运行/修改 `packages/ee/` 与一切 `.ee.` 文件（商业许可「running, testing, developing with」均需协议）
2. 禁止代码级移植 carbon 社区代码（文件头「including ports, remain AGPLv3」）
3. 允许：无修改整体部署 + 内部使用；借鉴数据模型概念 clean-room 自研（保留设计过程记录）
4. 商标：不使用 Carbon 名称/Logo 做我方品牌

## B0｜PoC 决定性实验（闸门）

### PoC 协议

| 步骤 | 动作 | 证据 |
|---|---|---|
| 1 | carbon dev 栈起：carbon-main 目录内按 README + `packages/dev/docker/docker-compose.dev.yml`（Docker + Node22 + pnpm10）；`pnpm dev` 一键（迁移+类型+种子 test@carbon.ms）；ERP :3000 / MES :3001 / kong API :54321 | docker compose ps + 首页截图 |
| 2 | 灌 `--dataset satellite` 种子（12 层 tier 机制，`packages/database/src/datasets/`） | 列表页有数据截图 |
| 3 | **决定性实验 A**：session 登录（dev 免链接直登 test@carbon.ms）→ PostgREST Data API（经 kong）机器 CRUD 往返 | curl 全记录（登录→bearer→GET/POST 表→RLS 生效验证） |
| 4 | **决定性实验 B**：`/api/v1/{module}/{operation}` oRPC 面无 API key 行为实测（FEATURE_PLANS 门控边界） | curl 往返 + 403/门控响应体 |
| 5 | 中文可用性抽查：UI 语言切换能力 + Lingui zh 词条现状 | 截图 + 词条缺失清单 |
| 6 | 资源实测：dev 栈内存/CPU 峰值 | docker stats 采样 |
| 7 | 三态结论 VERDICT.md：**GO**（通路可用且条款可接受）/ **DEGRADE**（只读直连 PG 线，见下）/ **PIVOT**（询价等待，停 B3） | 证据链落盘 |

### DEGRADE 线预定义（B3 降级形态）

- connector-carbon 降级为 PG 只读（ATTACH READ_ONLY，走 lakehouse-engine）；carbon UI 人工使用（webserver /carbon 外链代理保留）；LLM 业务查询面由湖仓 legacy+carbon 表承担；写操作仅人工 UI。功能不缺失、实时性降级。
- 询价邮件草稿（B0 产出，不发送）：self-hosted 商业许可（API/MCP/审批规则）报价。

## B3 范围（GO 路径全量）

### 新增包

| 包 | 职责 | Interfaces |
|---|---|---|
| `packages/connector/connector-carbon` | carbon 能力 Service Definition + HTTP Provider | Consumes：B0 验证通路（session+PostgREST / oRPC）；Produces：`ctx.carbon` 能力面（listMeta/list/get/create/post 操作），凭据 CARBON_URL/CARBON_API_KEY 走 dsh-credentials env 链，全部 Config 字段化 |
| `packages/connector/tool-carbon` | cb_* 工具行 | Produces：cb_list/cb_get/cb_create/cb_update/cb_post_receipt/cb_post_shipment 等；工具 risk 标注按 carbon manifest classification（READ/WRITE/DESTRUCTIVE——[`packages/api/src/manifest-types.ts:48`](file:///Users/mac/Downloads/carbon-main/packages/api/src/manifest-types.ts) 范式）；写操作接审批面板确认；输入输出全落 SessionEventMap |

### 运行时接线

- apiproxy：carbon 域（对标 nocobase 域 8 方法：listMeta/list/get/update/signIn→carbon 化方法集，[`rpc-map.ts:102`](../../../packages/host/apiproxy/src/api/rpc-map.ts:102) 模式）
- webserver：复刻 [`nocobase-proxy.ts:20`](../../../packages/host/webserver/src/nocobase-proxy.ts:20) 为 /carbon 前缀代理（前缀剥离 + HTML/manifest 重写 + ws upgrade + fallback）；`carbonProxyOrigin` Config 门（未设不注册，同 nocobaseProxyOrigin 语义）
- ui-business：数据面 nocobase.listMeta/list → ctx.carbon；外链入口 → /carbon
- persona（cordis.patch.yml:84 五源路由总纲）：nb_* 术语段换轨 cb_*；下单链 connector_discover→order_create 重定向到 carbon 销售单

### 数据初始化（「都要有初始化数据」落点）

- workspace/data 真源（experts 32 人 / market 63 资产 / 订单 24 条）→ carbon 对应表播种（经 B0 验证的应用层通路，批量通道优先 seed 脚本模式）
- 八角色账号（[`QUICKSTART.zh.md:326`](../../../examples/kb-agent/QUICKSTART.zh.md:326) 清单）→ carbon 用户创建（社区版 everyone-is-admin 形态）
- 老业务数据：**不追求 1:1 迁移**——全量已在湖仓（B0/B2），carbon 持新周期数据 + 演示子集

### carbon→湖仓自动同步

- lakehouse-sync 的 syncTables 加 carbon 段：carbon PG（dev 栈 postgres :5432）ATTACH READ_ONLY → watermark（carbon 表有 createdAt/updatedAt）→ DuckLake `carbon_*` 命名空间
- 同步表清单 Config：采购/库存/生产/质量/销售核心表（对照 R1 §5.2 实体族）

### 实施步骤

- [ ] 前置：读 b0-poc/VERDICT.md，PIVOT 则停；DEGRADE 则按降级线裁剪本批范围并首行声明
- [ ] connector-carbon（4 步 5 验证）+ 单测（HTTP 往返 mock 仅限单测层，验收必须真实服务）
- [ ] tool-carbon 工具行 + 审批面板接线 + 事件落日志
- [ ] apiproxy carbon 域 + webserver /carbon 代理 + ui-business 换轨
- [ ] 数据初始化脚本（真源→carbon）+ 八角色账号
- [ ] lakehouse-sync carbon 段 + 调度实测
- [ ] 中文本地化可用性记录（缺失词条清单 → 后续 i18n 批次输入）
- [ ] persona 换轨 + Agent Note + doc-sync + lefthook

### B3 验收（R3 验证轮）

1. 会话经 cb_list/cb_get 真实查询 carbon 单据（工具调用 transcript）
2. 会话发起 cb_create（经审批确认）→ carbon UI 中可见新单据（端到端截图对证）
3. carbon PG 手工插行 → sync → 湖仓 `carbon_*` 表查询可见
4. /carbon 代理路径可达 carbon UI（SSR 页面加载正常）
5. 初始化数据对账（专家/资产/订单计数 vs 真源）

## 风险

| 风险 | 缓解 |
|---|---|
| R-1 API 许可（条件 BLOCKER） | B0 三态闸门 + 询价并行 + DEGRADE 线 |
| R-7 上游高频演进 | 锁定快照基线 2026-10-06；BACKWARD_COMPATIBILITY STABLE 契约为依赖面判据；月度 rebase 评估 |
| 中文缺失 | 可用性记录 + i18n 词条批次排 W25；核心路径英文 UI 可用性先行验证 |
| 食品行业层缺失（配方/HACCP） | 湖仓 legacy 表 + KB 语料承载查询；行业层自建插件走 W25（clean-room 纪律） |
| approval 引擎断层 | approval-engine 保留补位（社区版无审批规则）；wfl 资产随引擎续存 |
