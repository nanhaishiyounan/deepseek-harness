# E1 第 0 步探查结论（probe notes）

实施日期：2026-09-13。基线 `14fc2f01d6`。全部结论来自快照源码 + 实机（:13000 / PG nocobase 库）。

## 0-1 flowModel 字段模型形态（m2o / date / boolean）

| kind | 表格列 display 模型 | 弹窗表单 edit 模型 | 证据 |
|---|---|---|---|
| input | `DisplayTextFieldModel` | `InputFieldModel` | N17 既有（8 页先例） |
| select | `DisplayEnumFieldModel` | `SelectFieldModel` | N17 既有（列/表单 props 带 options） |
| number | `DisplayNumberFieldModel` | `NumberFieldModel` | N17 既有 |
| **m2o** | `DisplayTextFieldModel` | **`RecordSelectFieldModel`** | edit：`plugin-flow-engine/src/server/flow-surfaces/service-helpers.ts:338-339`（所有关联接口的默认 editable 模型）；display：`field-type-resolver.ts:213-215`（非 form 容器的 text 型关联回退 DisplayTextFieldModel）。另 `CascadeSelectFieldModel` 仅 filter scope 且 target 是 tree 模板时；`RecordPickerFieldModel` 是 picker 型候选（form fieldType='picker'），表单下拉选人场景用 RecordSelect。 |
| **date** | `DisplayDateTimeFieldModel` | `DateOnlyFieldModel` | `core-field-default-bindings.ts:30`（display date→DisplayDateTimeFieldModel）、`:63`（editable date→DateOnlyFieldModel） |
| **boolean** | `DisplayCheckboxFieldModel` | `CheckboxFieldModel` | 同文件 `:27` / `:55` |

- 形态与 N17 工厂完全同构：`FormItemModel` + `stepParams.fieldSettings.init.fieldPath` + field 子模型；关联/日期字段的 title field 由服务端解析（`getAssociationDefaultTitleFieldName`），save 时无需额外 props。
- **实库无先例**（flowModels 全表统计：RecordSelect/DateOnly/Checkbox 均 0 行），E1 是首个使用者；save 全 200、浏览器渲染验证通过。
- **关联 display 依赖 target collection 的 `titleField` 元数据**：users 自带 `titleField=nickname`（owner/assignee 列因此直接工作），hub_pj_* 三表缺该元数据导致 project 列空白——E1 脚本 `ensurePjTitleFields` 补齐（projects=name / tasks=title / milestones=name）后列显示正常。后续给任何自建 collection 挂 m2o 列都要检查 titleField。

## 0-2 fields 表 `column "target" does not exist` 报错定性

- 实证：`\d fields` 确认表只有 key/name/type/interface/description/collectionName/parentKey/reverseKey/options/sort 列——关联元数据（target/foreignKey）在 `options` JSON 里。
- `GET /api/fields:list?filter={collectionName:...}` 与 `GET /api/collections:get` 均 200 正常；报错只出现在假设 `SELECT target` 的查询（E2 调研旁证的旧版本客户端代码路径）。
- **定性：不阻塞 E1 主线**——flowModels:save 的字段挂载走 fieldSettings.init（读字段注册表），全程未触发该报错；属 admin 配置页个别查询的版本错配残留，归档为已知边界（E4 handoff 记录）。

## 0-3 三 collection 字段清单（spec 真源）

psql `fields` 表（30 行）+ `nocobase-hub-modules.mts:75-98` 定义交叉：

- hub_pj_projects（10）：name/no/customer(input) + owner(m2o→users) + status/priority(select) + progress(number) + planned_end_date/start_date/due_date(date)
- hub_pj_tasks（12 用户可见 8）：title(input) + project(m2o→hub_pj_projects) + assignee(m2o→users) + status/priority(select) + due_at/plan_start/plan_end(date)；内部列（hub_pj_task_project_id/hub_pj_task_assignee_id/assignee_text/sort）不进表单
- hub_pj_milestones（7 用户可见 5）：name(input) + project(m2o→hub_pj_projects) + due_at(date) + status(select) + done(boolean)；内部列（hub_pj_ms_project_id/due_date 冗余）不进表单

## 0-4 destroy v1 路由行后 uiSchemas 行为

- 实证：任务列表页试点 destroy 前后 `SELECT count(*) FROM "uiSchemas"` = 673 → 673（不变）。
- **结论：desktopRoutes:destroy 不级联删除 uiSchemas**——v1 uiSchema 树保留为孤儿（不渲染但可引用），rollback 分支 re-create 路由行引用原 schemaUid 即完整恢复 v1 页（含用户手配弹窗）。rollback-records.json 按页存 `{title,parentId,icon,sort,schemaUid}`；probe 当时仅两行（项目/里程碑）——任务列表的记录在 E1 分批跑时被整文件覆盖丢失，E5 已从本 dump 第 128 行考证补录（脚本同时改为按 title 合并写入、destroy 前逐页落盘，覆盖路径不复存在）。

## 0-5 N22 LLM 服务状态

- `GET :13100/healthz` → `{"ok":true, upstream: minimax, requestsForwarded:59}`。
- `aiEmployees:listByUser`（admin token）返回 9 位员工含 dex；弹窗 AI 头像按钮在 CRM 与 E1 弹窗均渲染（截图 E1-02/E1-08）。
- 注意：a11y 树捕捉不到该圆形头像按钮（无 role），视觉截图才是有效证据——后续验收勿只依赖 snapshot。

## 附加发现

- **FormSubmitActionModel 时序坑**：n17 的 ensureFormSubmits 在 all 链中先于 e1 跑，E1 新建表单会漏提交按钮——e1 脚本已内置同款 ensure（`submit-<formUid>` 确定性 uid）。
- **嵌套 CreateFormModel 的 uid 是服务端生成的**（flat save 的 subModels 无显式 uid），因此 n18 按钮 uid 是 `n18ai-<serverUid>` 而非 `n18ai-n17e1*`——rollback 的按钮清理按 n18 同款孤儿匹配（formUid 不在 CreateFormModel 集合中即销毁）。
- 看板/日历/甘特三页保持 v1（flowModel 体系无对应区块模型），v1 页无悬浮球（ChatButton isV1Page→null）——已知边界，QUICKSTART 声明。
- **F1 复核（2026-09-13）推翻上文前半**：看板/日历在 2.2.6 有完整落地——客户端注册（plugin-kanban/plugin-calendar client-v2 plugin.tsx registerModelLoaders）、server 白名单（flow-engine node-use-sets.ts:14,16）、支持矩阵（support-matrix.ts:71,83 全 true）、官方 fixture（flow-surfaces-fixtures/kanban|calendar-block-live.*）四层证据俱全；两页已由 nocobase-f1-view-v2.mts 升级 v2。甘特仍保留 v1：客户端有注册但 server authoring 体系零支持（不在 use-sets/support-matrix/fixture）——边界依据修正为「甘特插件未进入 flow-engine 官方支持矩阵」。E 轮误判根源：判定止步于 n17d 工厂能力与核心内置模型目录，未查插件侧 client-v2 注册面。
