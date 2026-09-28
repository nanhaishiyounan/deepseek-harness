-- W3-B5 psql 只读对拍（连接参数来自 platform/nocobase/.env；全部 SELECT）
\echo '## 1. 部门树（departments：根 + 8 业务部门，title/"parentId" 对拍种子）'
SELECT id, title, "parentId", "isLeaf" FROM departments WHERE title IS NOT NULL ORDER BY id;
\echo '## 2. 部门成员挂接（departmentsUsers ⋈ users ⋈ departments——对拍 DEPT_MEMBERS）'
SELECT d.title AS dept, u.username, u.nickname, du."isOwner" FROM "departmentsUsers" du
  JOIN departments d ON d.id = du."departmentId"
  JOIN users u ON u.id = du."userId"
  ORDER BY d.id, u.username;
\echo '## 3. 主部门同步（users.mainDepartmentId ↔ 部门）'
SELECT u.username, d.title AS main_dept FROM users u
  LEFT JOIN departments d ON d.id = u."mainDepartmentId"
  WHERE u.username IN ('quality_lead','qc_inspector','b4guard','chenliqun') ORDER BY u.username;
\echo '## 4. approver_map 部门形态（qm_nc_dispositions 流头 + config_note 留痕行数）'
SELECT id, doc_type, approver_map,
  (length(config_note) - length(replace(config_note, chr(10), '')) + 1) AS note_lines
  FROM wfl_flow_configs WHERE doc_type = 'qm_nc_dispositions';
\echo '## 5. 部门路由见证（witness todos = 质检部全员 且任一人 act 后全部 completed）'
SELECT t.doc_id, nc.code, t.user, t.status FROM wfl_approval_todos t
  JOIN qm_nc_dispositions nc ON nc.id = t.doc_id AND t.doc_type = 'qm_nc_dispositions'
  WHERE nc.code LIKE 'NC-W3B5-DEPT%' ORDER BY t.user;
\echo '## 6. 负例零残留（NC-W3B5-NEG* 草稿已清理 / 该单据类型零 open 待办）'
SELECT count(*) AS neg_docs FROM qm_nc_dispositions WHERE code LIKE 'NC-W3B5-NEG%';
SELECT count(*) AS open_orphan_todos FROM wfl_approval_todos WHERE doc_type = 'qm_nc_dispositions' AND status = 'open';
\echo '## 7. member 动作矩阵（rolesResources ⋈ rolesResourcesActions——create/update 面）'
SELECT rr.name AS collection, string_agg(a.name, ',' ORDER BY a.name) AS actions
  FROM "rolesResources" rr JOIN "rolesResourcesActions" a ON a."rolesResourceId" = rr.id
  WHERE rr."roleName" = 'member' AND rr.name IN ('qm_inspections','qm_inspection_readings','pur_orders','wms_counts','wfl_approval_todos')
  GROUP BY rr.name ORDER BY rr.name;
\echo '## 8. 403 翻转零残留（(admin, wms_counts) 特定资源行不存在——策略面）'
SELECT count(*) AS admin_wms_counts_rows FROM "rolesResources" WHERE "roleName" = 'admin' AND name = 'wms_counts';
\echo '## 9. member 旅程终局（QM-W3B5-JOURNEY* 落库；建单人证据 = w3-b5-selftest.txt 的 quality_lead token →HTTP 200 探针行）'
SELECT code, insp_type, status FROM qm_inspections WHERE code LIKE 'QM-W3B5-JOURNEY%';
\echo '## 10. 员工花名册 org_dept 回填（hub_hr_employees ⋈ departments）'
SELECT e.name, d.title AS org_dept FROM hub_hr_employees e
  LEFT JOIN departments d ON d.id = e.org_dept_id ORDER BY e.id;
