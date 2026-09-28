# W4-B5 菜单信息架构重整：16 → 12 组、先迁后删、双通道改名

[English](2026-09-28-w4-b5-menu-ia-consolidation.md) | 中文
- 日期：2026-09-28 · 批次：W4-B5（plans/2026-09-28-w4-completeness/05-b5-nav-ia.md）
- 代码：`examples/kb-agent/scripts/w4-heal-b5.mts`（TARGET_IA 表 + 迁移/删除/改名/icon/sort + assert + rollback）；`examples/kb-agent/scripts/w4-heal-b4.mts`（A1/A2 基线翻到 B5 后世界）；`examples/kb-agent/scripts/setup-nocobase.mts`（3 处组名断言适配 + w4b5 门禁挂载 + OK 汇总行）；`examples/kb-agent/scripts/w4-heal-b3.mts`（L2 页清单与卡片规格随维保服务商改名传导）；8 个建页脚本组常量同步（`nocobase-crm-modules/hub-modules/w1-approval/w3-approval-visual/w3-org-acl/w3-views/w5-mfg/w6-mfg-exec`——重放落位到 B5 后组名）；`examples/kb-agent/QUICKSTART.zh.md`（菜单导览段重写为 12 组 IA）
- 证据：`research/2026-09-28-w4-completeness/w4-b5-*`（routes-before/after · menu-tree · role-map · idempotent · rollback-drill · verify · journey-r1..r8 + member-acl + member-matrix-denied + menu-final）

## 决策

1. **目标 IA = 12 组（16 − 4）**：文档 §2 表 0–10 号之外，CRM 客户与资产管理原地保留。四个删除组 = 采购（B4 后空）、销售流程（5 页并入销售管理）、协同办公（拆入组织与系统/项目与协同）、工单中心（2 页并入项目与协同）。组改名：生产制造→生产与计划、人事管理→组织与系统、项目管理→项目与协同。计划三页（主生产计划/MRP 快照/计划工作台）从销售管理迁入生产与计划；文档表漏列的排产甘特按 D6 甘特/明细配对排在排程明细后；文档表未列的三个销售日历/仪表盘页排在所列六页之后。
2. **先迁后删协议（不变式 6）由门禁强制而非约定**：任何写操作前先跑页面宇宙对账（93 页，经 PAGE_RENAMES 规范化）；每次组 destroy 前做 children 计数对账，非零即抛错中止。组行不挂 flowModels 树，但 N14 纪律统一执行。
3. **改名沿 B4 双通道规则**：desktopRoutes.title 与 RootPageModel 的 `props.title` + `stepParams.pageSettings.general.title` 必须同翻（侧栏渲染读 RootPageModel）。组行（schemaUid 为 null）走单通道 title。维保服务商（原供应商页，hub_as_vendors）是本批唯一页改名——N3 三重供应商消歧在此收口（采购联系人已在 B4 退役）。
4. **icon 消重优先于文档示例值**：文档 §3.3 给组织与系统配 ClusterOutlined，但供应链已占用且验收 checkbox 要求 12 组 icon 无重复——组织与系统改用 UsergroupAddOutlined。CRM 客户 → UserOutlined、资产管理 → HddOutlined、付款申请的前导空格 ' DollarOutlined' 修复、顶级 AI 工作台（原无 icon）配 RobotOutlined 且 sort 0。
5. **角色映射而非角色树（N-2'）**：八角色映射到 12 组（角色→组→页见 w4-b5-role-map.md）；不建按角色的菜单树。member 差异由页级 rolesDesktopRoutes 绑定（绑定键 = 页行 id，随 parentId 迁移天然存活）+ W3 的 83 集合数据 ACL 承载。
6. **重放兼容是改名的一部分**：所有按常量引用组名的建页脚本在同批同步（8 脚本 16 处常量 + hub-modules 资产组页名 → 维保服务商）。重放漂移是改名的隐藏消费者——只改断言路径不够。

## 坑（会再踩）

- **`desktopRoutes:update` 在 parentId 变更时把 sort 重算为组尾 append-to-end**——单次 update 同时传 `{ parentId, sort }` 会静默丢弃 sort（目标页落在组末）。迁移与排序必须分两次调用；heal 脚本的步骤 2（move）与步骤 5（order）本就分离。回滚演练现场踩中，drill 文件因此写明两步式复原。
- **页改名向下游断言扇出**：w4-heal-b3 的 L2 白名单与卡片规格以页名为键；不传导改名则 B3 门禁双重失败（旧名页缺卡 + 新名页分级越界）。改名前先全仓 grep 旧页名。
- **member 的「组壳」设计上全开**：qc_inspector 看得到全部 12 个组头（与 B5 前看得到全部 16 组一致——对照 w4b1-pilot-member-filtered.png）。裁剪在下一层：admin-only 页从菜单消失且直达无内容，而 qc token 直调 `desktopRoutes:list` 返回零行。不要把组头可见读作 ACL 回归；断言页绑定（assert A8）才是正解。
- **`/admin` 落地页折叠未展开的组**，body 文本探针会漏组内容（B4 教训重演）：从目标页自身上下文探测，或先导航再判读。

## 验收口径

- `w4-heal-b5.mts --assert`（进 setup verify）：12 组、sort 1–12 唯一、无空组/重复组名/已删组名、顶级恰为 AI 工作台（RobotOutlined、sort 0）、93 页宇宙对账零丢失、各组组内清单与顺序等于 TARGET_IA、12 个组 icon 唯一非空 + 页 icon 全配无空格 + 付款申请 = DollarOutlined、routes = 198 且 type 计数 {group 12, flowPage 90, tabs 93, page 3}、双通道改名、93 页 surface 全 200、member 绑定完好（质检单保留 member、权限矩阵不保留）。
- 证据：八角色 2 击旅程（w4-b5-journey-r1..r8-*.png）、member 取证（菜单 + 质检单可达 + 权限矩阵直达被拒）、终态菜单树（w4-b5-menu-tree.txt / menu-final.png）、幂等重跑零变化（198→198、22 skip）、两步式回滚演练（w4-b5-rollback-drill.txt）。
- 零回归：setup verify 全绿（w4b1–w4b5 门禁）、`.trees.mjs` anomalies=0、`--assert-ledger` 平衡（49 组、203 条流水）、9 步链 s1/s9 绿、audit 探针新基线（198 路由 / 12 组）。

## 遗留

- **无 B6 阻塞项**。文档表漏列项（排产甘特位置、三个销售日历页排序）已记入 TARGET_GROUPS；B6 直接消费角色映射表。
