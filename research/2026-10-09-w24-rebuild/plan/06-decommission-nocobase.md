# 分域计划 06｜NocoBase 退役与数据迁移（B0 保全 + B7 拆除）

- Spec 溯源：主计划 §1.1 指令 1（nocobase 废弃）+ §9 退役策略；R3 §5（退役面全景）+ 附录 B（拆除清单）
- 策略：**先保全、后切换、最后拆除**；三态数据在档（Parquet + pg_dump + workspace/data 真源）是删树的唯一放行条件。

## 退役对象与引用点全景（R3 §5.3/附录 B 底稿）

| 类别 | 位置 | 动作 |
|---|---|---|
| 源码树 | `platform/nocobase`（14,031 文件，上游 2.2.6 快照，[`MANIFEST.md:29`](../../../platform/nocobase/MANIFEST.md:29)）+ `platform/nocobase-portals` | B7 删树 |
| 包依赖 | `connector-nocobase` + `tool-nocobase` 两包；expert-orders（dep）与 kg-build（dep）的传递依赖 | B3 等价面替换 → B7 删包 |
| 网关域 | apiproxy `nocobase.ts` + rpc-map 8 方法（listMeta/list/get/update/alertAct/signIn/mobileWorkSave/mobileWorkDelete，[`rpc-map.ts:102`](../../../packages/host/apiproxy/src/api/rpc-map.ts:102)） | B3 carbon 域替换 → B7 拆除 |
| 反向代理 | webserver `nocobase-proxy.ts` + NOCOBASE_PORTAL_PREFIXES + nocobase-proxy.spec.ts | B3 /carbon 代理并存 → B7 拆除 |
| UI | ui-business（tab+外链）、ui-mobile（signIn/docs/alerts 数据腿） | B3 换轨 / B7 mobile 身份终换 |
| patch | cordis.patch.yml NOCOBASE_* env 链（:246-280）、proxyOrigin（:466）、collectionScopes/wflWriteScopes | B3 carbon 配置段并存 → B7 清段 |
| 脚本 | examples/kb-agent/scripts 约 110 个中 nocobase-*.mts 28 个 + w* 直连系 nocobase 专属者 | B7 删（保留通用资产脚本） |
| 测试 | nocobase-track/nocobase-business/market-track e2e + nocobase-tools.spec + biz-navigator 中 nocobase 断言 | B3 改造 / B7 retire |
| 文档 | QUICKSTART/DEPLOY/WEBSITE + AGENTS.md 布局图 + packages/README 组表 | B7 全量重写 |
| 门禁 | lefthook 排除 platform/（lefthook.yml:24/:43）——删树后排除项一并清理 | B7 |

**保留**：approval-engine（:13110，独立进程——补 carbon 社区版审批空白）；wfl_* 五表与 alert_rules 随引擎续存；`legacy_*` 湖仓表（老业务数据永久可查面）。

## B0｜数据保全（详见 03 分域计划 B0 节）

- 全量导出：泛化 [`w6b1-lakehouse-transfer.mts:24`](../../../examples/kb-agent/scripts/w6b1-lakehouse-transfer.mts:24)——清单 13→全量（49 hub_/crm_ + 5 collections + wfl 五表 + alert_rules/kpi_snapshots/users），REST 分页落 `workspace/lakehouse/legacy/` Parquet + 行数对账表
- `pg_dump -d nocobase`（[`platform/nocobase/.env.example:49`](../../../platform/nocobase/.env.example:49) 连接参数）归档
- 真源复核：workspace/data/{experts,market,overview,export-risk,connector-files} 不依赖 NocoBase，原样保留

## B7｜六步拆除序（顺序不可换）

1. **停服务**：先停 dsh web（:3080）再停 nocobase（:13000）——网关持已删库 inode 教训（[`QUICKSTART.zh.md:159`](../../../examples/kb-agent/QUICKSTART.zh.md:159)）；approval-engine（:13110）保留不停
2. **数据终检**：三态在档复核（对账表 + pg_dump 校验和 + 真源清单）；R3（B3 验证）已通过确认
3. **换运行时引用终检**：connector-nocobase/tool-nocobase 删除；apiproxy nocobase 域拆除；webserver 代理与 NOCOBASE_PORTAL_PREFIXES 拆除；ui-business/ui-mobile 数据腿终检归零；expert-orders/kg-build 依赖改指 carbon；kg-mappings.yml 过渡期双 system 的 nocobase 段移除
4. **删脚本与测试**：nocobase-*.mts 28 个 + nocobase 专属 w* 脚本；e2e 三件 retire（market-track 若已 carbon 化则改造保留）；patch 段清除
5. **删树**：`rm -rf platform/`（nocobase + nocobase-portals）；lefthook 排除项清理；publication-payload 拒绝规则保留（防复活）
6. **清文档**：AGENTS.md 布局图去 platform 行；packages/README 组表；QUICKSTART/DEPLOY/WEBSITE 重写为五源架构版（dsh-doc-standards 规范：教程/参考分离、字预算）；`docs:check`/doc-sync 全绿

## B7 五源联合验收（用户验收物理底稿）

一条会话问题串五源（全程真实实跑 transcript 落盘）：

1. 「查一下 carbon 里最近的采购单」→ cb_list（业务源）
2. 「汇总近一季度采购金额按物料分组」→ lakehouse_execute_readonly（湖仓源）
3. 「引用 HACCP 对收货检验的要求」→ kb_search WeKnora（知识库源）
4. 「这个物料在图谱里关联了哪些实体」→ kg_subgraph（图谱源）
5. 「当前采购本体的 schema 是什么」→ kg_schema / registry 摘要（本体源）

通过判据：五步全部真实工具调用（无 mock）、结果可溯源（chunk/行级/节点级）、服务全在线（carbon+湖仓+WeKnora+Neo4j+dsh web 五进程）。

## 验收标准（R7 验证轮）

1. `ls platform/` 不存在；全仓 `grep -ri nocobase --include='*.ts' --include='*.yml' --include='*.md' packages/ examples/ apps/ docs/` 仅剩历史 research/ 与 git 记录（白名单：本计划目录、research/、AGENTS.md 历史说明段如有）
2. 五源联合验收 transcript 五步全绿
3. `pnpm run test` / typecheck / lint / doc-sync / build 全绿
4. QUICKSTART 新版从零 clone 到五源全启可跟跑（cold-start 演练一次）

## 风险

| 风险 | 缓解 |
|---|---|
| 删树后发现有未导数据 | 三态在档 + 删树前对账终检；git 历史可回滚平台树（大删除独立 commit 便于 revert） |
| 隐藏引用（脚本/文档长尾） | 全仓 grep 清单化验收（上面判据 1）；doc-sync 死链门禁兜底 |
| mobile 八角色账号迁移遗漏 | 账号清单（QUICKSTART:326）在 B3 已 carbon 化；B7 终检登录一次 |
| approval-engine 对 nocobase 的隐性耦合 | 引擎独立进程（R3 证）；B7 前跑一次引擎冒烟（wfl 表随 PG nocobase 库？——确认：引擎若共库则 wfl 表随 pg_dump 已保全，B7 前迁移到独立库或 carbon PG，二选一以实测为准，开放问题 O-8） |

## 开放问题追加

| 编号 | 问题 | 假设 | 错误成本 |
|---|---|---|---|
| O-8 | approval-engine 的 wfl_* 表是否在 nocobase PG 库内 | 是共库（QUICKSTART 线索）→ B7 前把 wfl 五表迁独立 sqlite/PG | 若漏迁：审批引擎 B7 后断数据——联合验收第 5 步外补 wfl 冒烟防漏 |
