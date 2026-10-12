# W24-B7 退役收尾批：证据索引（建设中）

- 日期：2026-10-11 ｜ 批次：W24-B7（nocobase 物理退役 + 存量债清偿 + 全仓回归 + 五源联合验收 + QUICKSTART）
- 六步序执行记录：①停服务（dsh web :3080 先停 → nocobase 进程群 :13000）②数据终检（138 表对账全 OK + pg_dump nocobase-full-20261010.sql.gz + ducklake legacy_nocobase/synced_carbon/synced_nocobase 三 schema）③运行时引用拆除（见下）④脚本/测试/fixtures 清理 ⑤platform/ 删树（7.1G、15,341 tracked 文件）⑥文档清理（AGENTS.md/README×2/QUICKSTART）

## 拆除清单（三路并行子任务 + 收尾）

| 面 | 内容 |
|---|---|
| apiproxy | nocobase 域 8 方法 + orders 域 5 方法 + signIn session 体系 + kg.mappings + kg.stats quality 腿 + alertsBaseUrl 等 Config 字段；3 个 nocobase spec + orders-domain spec 删 |
| webserver | nocobase-proxy.ts（298 行）+ spec（428 行）+ Config nocobaseProxyOrigin + 挂载 |
| 包删除 | connector-nocobase、tool-nocobase、expert-orders、kg-build 四包整删 |
| tool-connector | order.ts（422 行）+ order 工具注册/导出/Config + spec order 用例 |
| ui-mobile | 免身份直进（本地昵称）；登录门/台账/待办/预警/文档/表单同步/关系标签退役 |
| ui-assets | 订单确认卡/我的订单段退役（market 资产面保留） |
| ui-conversation | SourceTrail 的 NocoBase 源类型删除 |
| ui-kg | mappings 面板/kgStore mappings 腿退役 |
| examples/kb-agent | scripts 117 删 + tests 32 删 + demos/nocobase-full-features 83 删 + crm/insp/labels/designer 45 删 + presets/scenarios carbon 换轨 + kg-mappings.yml 删 + cordis.patch.yml 残段清 |
| 配置 | lefthook platform 排除、.gitignore、.gitattributes、.oxlintrc×2、v8-ignore-budget platform 规则、tsconfig.host include/references、vitest coverage 排除、AGENTS.md 布局、根 README×2 五源版 |
| 生成面 | api-catalog/slot-catalog/docs 目录（gen-cordis-api/gen-client-catalog/doc-sync 重生成） |

## 决策记录（以现状为准）

1. **mobile 身份不换轨 carbon**：carbon 侧无八角色账号（仅 test@carbon.ms dev 账号），GoTrue admin 造号超出 B7「纯代码删除」定性 → mobile 免身份直进（本地昵称），业务数据腿随 NocoBase 退役（后端已死）
2. **orders 域整链退役**：apiproxy orders → expert-orders → connector-nocobase 全链无后端；ui-assets 订单面同步退役
3. **kg-build 整包退役**：结构化腿（NocoBase REST）已死；湖仓→图 ETL 由 graph-neo4j 承担（B5）、本体生成由 ontology-induction 承担（B5）、kg.mappings RPC 同步退役（ui-kg 已容错）
4. **数据语义枚举保留**：kg asserted_by 'nocobase' / source 'nocobase-derived'（历史三元组断言者）、湖仓 legacy_nocobase/synced_nocobase schema 名、图谱 nocobase: 节点 id 前缀、governance legacy 分类
5. **防复活闸门保留**：scripts/publication-payload.ts 的 nocobase/ 拒绝规则
6. **历史证据保留**：examples/kb-agent/demos/**（验收记录）、.agents/notes/、plans/、research/

## 验收 grep 豁免清单（全仓 grep -rli nocobase 排除 research/plans/.agents/demos/.roo 后剩余逐条）

- docs/*.md（capability-seams/config-catalog/subsystems/tool-catalog）：生成文档，doc-sync 重生成后消失
- packages/extensions/tool-cordis/src/api-catalog.ts：生成文件（gen-cordis-api），重生成后消失（KgMappingsFile/orders service 条目随类型删除自动消失）
- packages/host/apiproxy/src/api/kg.ts + kg.schema.ts + ui-kg 镜像类型：kg 历史数据断言者枚举值（决策 4）
- packages/kb/kb-graph*、packages/lakehouse/*、packages/governance/*：数据层命名（决策 4）
- packages/client/ui-mobile/*、ui-assets/index.ts、apps/web/tests 两处：退役说明文案（历史叙述）
- examples/kb-agent/scripts/b5-etl-run.mts、b6-governance-run.mts：湖仓 legacy_nocobase schema 数据面引用
- scripts/publication-payload.ts/.spec.ts：防复活闸门（决策 5）
- scripts/translation-pairing.manifest.json：翻译配对 blob 记录（生成产物）
- tsconfig.*.tsbuildinfo：构建缓存
- .env：本地凭据（gitignored）
- QUICKSTART.zh.md：本批重写

## 五源联合验收（r1→r6 迭代记录，全部真实 LLM 实跑 MiniMax-M3）

| 轮 | 问题/环境 | 结果 | 记录 |
|---|---|---|---|
| r1 | 泛化五源问题 | kb✓ 湖仓✓ 本体✓；carbon/图谱 miss | five-source-01~03.png、facts.json |
| r2 | 问题点名五工具族 | 判定五源全中，但**视觉审查揭穿**：carbon/图谱为错误回执假阳性（carbon dev 栈 41h 前退出、Neo4j 凭据缺失） | five-source-r2-*.png、facts.json |
| r3 | 同 r2（carbon 恢复中） | 中止（凭据仍未配） | — |
| r4 | r2 问题 + .env 补 CARBON_* | kb✓（[1]-[5] 真实 chunk 溯源）湖仓✓（7 单真实数据+终答综合报告优秀）；carbon 仍报无凭据——**发现 app-boot 禁 DSH_\* 入 .env 且 CARBON_\* 直读 process.env 不走 layered env** | five-source-r4-*.png、facts.json、transcript.txt |
| r5 | env 前缀重启 web（URL/EMAIL/PASSWORD+NEO4J 三键） | 五源判定全中，但 transcript 显示 carbon 仍无凭据——**发现 usable 四凭据 every() 非空：还缺 CARBON_ANON_KEY** | five-source-r5-*、transcript.txt |
| r6 | 四凭据齐全（ANON_KEY 取自 B3 seed 脚本默认值）+ env 重启 | **终验**（见下） | five-source-r6-* |

迭代修入产品面的坑：
1. `DSH_*` 键禁入 `.env`（app-boot launching-env 治理，写即启动崩）——QUICKSTART/README 凭据说明全部改为 launching env 形态
2. `CARBON_*` 四凭据（URL/ANON_KEY/EMAIL/PASSWORD）**全部**非空才建 client（connector-carbon usable 判定）
3. carbon dev 栈 41h 前整体退出（kong/gotrue/realtime/storage）——冷启动需 `bash packages/dev/bin/crbn up --no-portless`（`pnpm crbn` 不是 bin）

## 冷启动演练

- coldstart-drill.sh + coldstart-run.txt + coldstart-web.log：colima → WeKnora(health 200) → Neo4j → Gravitino+SeaweedFS → carbon（crbn up）→ dsh web :3080 200
- 已知探测假阴性：脚本 curl 等待窗 3s 对 gravitino/seaweed/carbon 偏短（实际就绪需 10-60s），端口表为准

## 文件索引（本目录）

- five-source-{r2,r4,r5,r6}-*.png/facts.json/transcript.txt：五源联合验收各轮证据
- .b7-five-source-shoot.mjs：验收脚本（问题文本+五源工具判定集）
- coldstart-drill.sh / coldstart-run.txt / coldstart-web.log：冷启动演练
- lint-baseline.txt：全仓 oxlint 190 错基线（子任务 E 清偿对象）
- 回归结果：typecheck✓ build✓ test✓ lint✓ hygiene✓ doc-sync✓（详见 99-w24-deliverables.md §3.3）
