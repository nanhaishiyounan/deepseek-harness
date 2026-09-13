# 批次 F3：Hub/人事/基础数据剩余 7 页 v2 升级——含三个复合页（双块/四块/手配弹窗承接）

> 隶属 [PLAN.md](PLAN.md)。前置：F1/F2（工厂骨架与铺量模式就绪）。改动面：新种子脚本 1 个 + all 链挂载。本批含 F 轮仅有的三个「非单表格」复合页——多块页树形态探查与手配弹窗字段合同是本批两个关键点。

## 范围与页型

| 页面 | collection(s) | 行数 | 页型 | 关键点 |
|---|---|---|---|---|
| 知识文章（`qn9j7laut2c`） | hub_kb_articles | 6 | 纯表格 | 工厂直配 |
| 维保记录（`fiyoi38ke5c`） | hub_as_maintenance | 4 | 纯表格 | 可能含 m2o（资产/供应商关联）——fields 表实查 |
| 部门（`kdud3tb3iq6`） | hub_hr_departments | 5 | 纯表格 | 种子表已有主键声明（E5 ensurePrimaryKeyFields）；v1 页非树形渲染（存档亲证：无 expand/parentId 配置），spec 阶段仍需 psql 确认 collection template 是否 `tree`——若是，v2 TableBlock 的树形参数（isTreeTableEnabled）一并带上 |
| 请假审批（`i7lcu24opl5`） | hub_hr_leave_requests | 5 | 纯表格 | 可能含 date/boolean kind |
| 供应商（`8bjc6gykw7e`） | hub_as_vendors | 5 | 表格 + **用户手配 Add-new drawer** | 38KB 手配树——字段合同（E1 项目页同款验收） |
| 工作台（`b4k6wf2zu6k`） | hub_pj_tasks + hub_tk_tickets | 19+40 | **双 collection 双表格**（顶级页） | v2 多 TableBlock 形态探查 |
| 分类维护（`xpcbg0tntto`） | hub_md_×4 | 3-4/表 | **四 collection 多 tab**（29KB） | tabs 形态 vs 单页四块裁决 |

## 改动面

### 0. 第 0 步探查（复合页专用）

| # | 探查项 | 方法 | 产出 |
|---|---|---|---|
| 0-1 | v2 单 flowPage 内多 TableBlock：BlockGridModel 下并列两个 TableBlockModel（不同 collection）有无渲染先例 | 官方 fixtures（grid/table 组合无先例时）：读 [`BlockGridModel`](../../../platform/nocobase/packages/core/client-v2/src/flow/models/blocks/index.ts) 源码子模型槽位 + AI 工作台页（单块）+ e1 树结构外推；单页试点实证 | 双块树 spec（保底路径） |
| 0-2 | RootPageModel tabs 容器（v2 的页内多 tab）：ChildPageTabModel 顶层用法与路由级 tabs（desktopRoutes `tabs` 行）关系 | [`PageModel.tsx`](../../../platform/nocobase/packages/core/client-v2/src/flow/models/base/PageModel/PageModel.tsx:1) tabs 槽位源码 + e1 的 ChildPageTabModel 弹窗用法对照 | 分类维护两形态成本对比：A) 沿用 desktopRoutes tabs 行（v1 现状，每 tab 一 flowPage）B) 单页四块 |
| 0-3 | 供应商手配 drawer 字段全集 | 解析 [`v1-pages/供应商.json`](../../../research/f-round-inventory/v1-pages/供应商.json)（38KB）全树 `x-collection-field` + psql fields 表 | formFields 合同清单（逐项勾对） |
| 0-4 | 维保/请假/供应商的关联与日期字段清单 | psql fields 表（collectionName in 四表 + hub_md_×4） | 各页 spec 真源 |

### 1. 新种子脚本 `examples/kb-agent/scripts/nocobase-f3-hub-v2.mts`

1. **`HUB_PAGES`**：5 个单表格页 spec（同 F2 模式；供应商 formFields 按 0-3 合同）。
2. **`ensureV2MultiBlockPage`**（工作台）：单 flowPage + RootPageModel → BlockGridModel → TableBlockModel(hub_pj_tasks 列集) + TableBlockModel(hub_tk_tickets 列集) 各带 AddNew 弹窗链（两个顶层 CreateFormModel → n18 挂两个按钮）；脊柱校验=两 collection 各满足 e1 三件套。工作台为顶级路由（parentId=null, sort=7），rollback 记录含 parentId=null。
3. **分类维护裁决（保底已定）**：v1 现状是 desktopRoutes 带 4 个 `tabs` 子行（多 tab 页）。**保底路径 = 每 tab 一 flowPage**（沿用现有 tabs 路由结构，逐 tab 升级对应 collection 的表格页——与 v1 信息架构完全等价，风险最低）；仅当 0-2 探查显示单页四块成本更低时改单页。tabs 行的升级 = 对每个 tab 的 schemaUid 树做同款 destroy+flowPage 替换（desktopRoutes 行 type 从 `page` 改 `flowPage`，parentId 保持指向分类维护页）。
4. uid 前缀 `n17f3*` 族；rollback 并入 `demos/acceptance-f/rollback-records.json`。

### 2. all 链挂载 + verify 扩展

`f2-crm-v2` 之后插入 `f3-hub-v2`；verify：v2 flowPage 期望 18→25（工作台 1 + 分类维护按 tab 数 +4 或单页 +1，以实施形态为准同步校准）、`n18ai-` 同步。

### 3. QUICKSTART 更新

菜单节 v2 清单扩至全量；工作台/分类维护新形态说明。

## 实施步骤

1. 0-1~0-4 探查 → 定稿 spec 与两个复合页形态；
2. 写脚本 + all 链 + verify；
3. 现有库先跑 4 个纯表格页 → 供应商（合同验收）→ 工作台单页试点 → 分类维护；跑 n18；
4. psql 断言 + 浏览器逐页验收；截图 `demos/acceptance-f3/`；
5. 幂等二跑全 kept。

## 验收断言（真实浏览器）

1. 4 个纯表格页：v2 渲染 + 悬浮球 + Add new AI 按钮 + 列集 ⊇ v1 可见列；维保记录的关联列（若有）显示关联记录名（titleField 检查——hub_as_* 若缺 titleField 元数据则补，E1 ensurePjTitleFields 同款）；
2. 供应商：v2 Add new 弹窗字段 ⊇ 手配 drawer 字段集（0-3 合同逐项）；弹窗 AI 按钮（dex）可生成草稿；m2o 字段（若有）为选择器；
3. 工作台：单页两表并列（任务 19 行 + 工单 40 行）、两表各自 Add new 弹窗独立可用（AI 按钮 ×2）、悬浮球 1 个；
4. 分类维护：四类目表全部可达且可编辑（tab 或四块，按裁决形态）；悬浮球 + 各表单 AI 按钮；
5. 每页提交一条测试记录后删除（不留脏数据）；
6. 回归：Hub 组既有 v2 页（工单/资产台账/员工）+ 项目管理 6 页 + 甘特 v1 正常；
7. 幂等二跑全 kept + 孤儿 0；截图 ≥8 张（7 页各 1 + 工作台双表特写）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| 双 TableBlock 并列无官方 fixture 先例（0-1 空手） | 中 | 单页试点（工作台）迭代；仍败则降级=工作台保持 v1 + QUICKSTART 声明（不阻塞其余 6 页） |
| tabs 行 destroy/replace 的 desktopRoutes 行为差异（type 改写 vs 删建） | 中 | 分类维护每 tab 先试点一个；rollback 记录含 tabs 行原值（type/parentId/schemaUid） |
| 供应商手配树字段遗漏（38KB 大树解析疏漏） | 低 | 0-3 全树解析 + 合同逐项勾对后才跑库；验收 2 显式对照 |
| hub_as_*/hub_hr_* 缺 titleField 元数据导致 m2o 列空白（E1 同款坑） | 低 | spec 阶段 psql 查 titleField；缺则脚本补（ensurePjTitleFields 复制） |
| 分类维护四 tab 升级后孤儿 tabs 遮蔽（E3 陷阱） | 中 | destroy 前记录全部同父 tabs 行；验收 4 全 tab 可达；rollback 清孤儿 |

**回滚**：`--rollback` 毁 `n17f3*` 树 + 按记录重建 v1 行（含 tabs 行原值）；业务数据零触碰。工作台若走了降级路径则无本批产物可回滚（页未动）。
