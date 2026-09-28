# W4-B5 menu IA consolidation: 16 → 12 groups, migrate-first destroys, dual-channel rename

English | [中文](2026-09-28-w4-b5-menu-ia-consolidation.zh.md)
- Date: 2026-09-28 · Batch: W4-B5 (plans/2026-09-28-w4-completeness/05-b5-nav-ia.md)
- Code: `examples/kb-agent/scripts/w4-heal-b5.mts` (TARGET_IA + migrate/destroy/rename/icon/sort + assert + rollback); `examples/kb-agent/scripts/w4-heal-b4.mts` (A1/A2 re-baselined to the post-B5 tree); `examples/kb-agent/scripts/setup-nocobase.mts` (3 group-title assertions adapted + w4b5 gate mounted + OK digest); `examples/kb-agent/scripts/w4-heal-b3.mts` (L2 page-list + card spec follow the 维保服务商 rename); 8 replay scripts re-pointed (`nocobase-crm-modules/hub-modules/w1-approval/w3-approval-visual/w3-org-acl/w3-views/w5-mfg/w6-mfg-exec` — group constants now target the post-B5 titles so replays land in the right groups); `examples/kb-agent/QUICKSTART.zh.md` (menu tour paragraph rewritten to the 12-group IA)
- Evidence: `research/2026-09-28-w4-completeness/w4-b5-*` (routes-before/after · menu-tree · role-map · idempotent · rollback-drill · verify · journey-r1..r8 + member-acl + member-matrix-denied + menu-final)

## Decisions

1. **Target IA = 12 groups (16 − 4), the doc table's 0–10 listing plus CRM 客户 and 资产管理 kept in place.** The four destroys are 采购 (empty since B4), 销售流程 (5 pages merged into 销售管理), 协同办公 (split across 组织与系统/项目与协同), 工单中心 (2 pages into 项目与协同). Group renames: 生产制造→生产与计划, 人事管理→组织与系统, 项目管理→项目与协同. The planning trio (主生产计划/MRP 快照/计划工作台) moves from 销售管理 into 生产与计划; 排产甘特 (absent from the doc table) sits right after 排程明细 per the D6 gantt/明细 pairing; the three sale-calendar/dashboard pages the doc table omits trail the six listed ones.
2. **Migrate-first protocol (invariant 6) enforced by gates, not convention**: a pre-flight page-universe reconciliation (93 pages, canonicalized through PAGE_RENAMES) runs before anything mutates; every group destroy is preceded by a children-count check that throws on non-zero. Group rows carry no flowModels tree, but the N14 discipline is applied uniformly.
3. **Renames ride the B4 dual-channel rule**: desktopRoutes.title AND the RootPageModel `props.title` + `stepParams.pageSettings.general.title` flip together (the sidebar renders the RootPageModel). Group rows (schemaUid null) are single-channel title updates. 维保服务商 (was 供应商 on hub_as_vendors) is the only page rename — the N3 triple-supplier disambiguation completes here (采购联系人 was retired in B4).
4. **Icon dedup beats the doc's example icon**: the doc §3.3 assigns ClusterOutlined to 组织与系统, but 供应链 already owns it and the acceptance checkbox demands 12 unique group icons — 组织与系统 takes UsergroupAddOutlined instead. CRM 客户 → UserOutlined, 资产管理 → HddOutlined, 付款申请's leading-space ' DollarOutlined' fixed, AI 工作台 (top-level, previously iconless) gets RobotOutlined and sort 0.
5. **Role mapping over role trees (N-2')**: eight roles map onto the 12 groups (role→group→page in w4-b5-role-map.md); no per-role menu trees. Member differences ride page-level rolesDesktopRoutes bindings (which key on the page row id and therefore survive any parentId move) plus W3's 83-collection data ACL.
6. **Replay compatibility is part of the rename**: every build script that references a group title by constant was re-pointed in the same batch (16 constants across 8 scripts + hub-modules' 资产组 page title → 维保服务商). Replay drift is a rename's hidden consumer — assert paths alone are not enough.

## Traps (will bite again)

- **`desktopRoutes:update` recomputes sort as append-to-end whenever parentId changes** — a single update carrying `{ parentId, sort }` silently drops the sort (target page lands last in the group). Move and order must ride separate calls; the heal script's step-2 move and step-5 ordering phases already do. The rollback drill caught this live and is the reason the drill file prescribes two-step restores.
- **Page-title renames fan out into downstream assertions**: w4-heal-b3's L2 whitelist and card spec key on the page title; a rename without that follow-up fails the B3 gate twice (missing card on the old name, level violation on the new one). Grep every script for the old title before renaming.
- **The member "group shell" is all-open by design**: qc_inspector sees all 12 group headers (as it saw all 16 before B5 — w4b1-pilot-member-filtered.png is the control). Trimming lives one level down: admin-only pages vanish from the menu and their direct URLs render nothing for member, while plain `desktopRoutes:list` under the qc token returns zero rows. Do not read group-header visibility as an ACL regression; assert the page bindings instead (assert A8).
- **`/admin` landing folds unopened groups**, so body-text probes miss group content (the B4 lesson repeated here): probe from the target page's own context or navigate first.

## Acceptance

- `w4-heal-b5.mts --assert` (mounted in setup verify): 12 groups, sort 1–12 unique, no empty/duplicate/retired group names, top-level exactly AI 工作台 (RobotOutlined, sort 0), 93-page universe reconciliation zero-loss, per-group membership and ordering equal to TARGET_IA, 12 unique non-empty group icons + every page iconed + no leading spaces + 付款申请 = DollarOutlined, routes = 198 with type counts {group 12, flowPage 90, tabs 93, page 3}, dual-channel rename, all 93 surfaces resolve 200, member bindings intact (质检单 keeps member, 权限矩阵 does not).
- Evidence: 8-role 2-click journeys (w4-b5-journey-r1..r8-*.png), member forensics (menu + 质检单 reachable + 权限矩阵 denied), terminal menu tree (w4-b5-menu-tree.txt / menu-final.png), idempotent rerun zero-diff (198→198, 22 skips), rollback drill with the two-step protocol (w4-b5-rollback-drill.txt).
- Zero regression: setup verify green end-to-end (w4b1–w4b5 gates), `.trees.mjs` anomalies=0, `--assert-ledger` balanced (49 groups, 203 movements), 9-step chain s1/s9 green, audit probe re-baselined (198 routes / 12 groups).

## Loose ends

- **None for B6.** The doc-table omissions resolved here (排产甘特 position, three sale pages trailing) are recorded in TARGET_GROUPS; B6 consumes the role map as-is.
