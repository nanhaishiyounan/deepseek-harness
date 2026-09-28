#!/bin/zsh
# W3-B7 journey row-level psql assertions (read-only SELECTs). PG creds from
# platform/nocobase/.env (DB_HOST localhost:5432 nocobase/nocobase).
export PGPASSWORD=nocobase
PSQL=(psql -h localhost -p 5432 -U nocobase -d nocobase)

echo "=== W3-B7 旅程 psql 行级证明（$(date '+%F %T')）==="
echo
echo "--- J1 采购员：PO-B7J1 状态轨迹（wfl 留痕锚点序列）+ 行金额对拍 ---"
"${PSQL[@]}" -c "SELECT r.id, r.doc_type, r.action, r.from_state, r.to_state, r.approver, r.node_seq FROM wfl_approval_records r JOIN pur_orders p ON p.id = r.doc_id WHERE r.doc_type='pur_orders' AND p.code='PO-B7J1' ORDER BY r.id"
"${PSQL[@]}" -c "SELECT p.code, p.doc_status, p.amount, (SELECT sum(l.qty*l.unit_price) FROM pur_order_lines l WHERE l.order_id=p.id) AS line_total FROM pur_orders p WHERE p.code='PO-B7J1'"
echo "--- J1 交期日历数据源：pur_orders.need_date 事件在位 ---"
"${PSQL[@]}" -tAc "SELECT code, need_date, receiving_status FROM pur_orders WHERE code='PO-B7J1'"
echo
echo "--- J5 仓管：收货单 + movements（Σqty == receipt qty，待检 hold）---"
"${PSQL[@]}" -c "SELECT r.receipt_no, r.lot_no, r.qty, r.status, r.iqc_status, s.sku FROM wms_receipts r LEFT JOIN hub_inv_products s ON s.id=r.product_id WHERE r.note LIKE '%PO-B7J1%' ORDER BY r.id"
"${PSQL[@]}" -tAc "SELECT m.doc_no, m.move_type, m.qty FROM wms_movements m WHERE m.doc_no IN (SELECT receipt_no FROM wms_receipts WHERE note LIKE '%PO-B7J1%') ORDER BY m.id"
echo "--- J5 月度台账（wms_monthly_balances 近月行）---"
"${PSQL[@]}" -tAc "SELECT period, count(*) FROM wms_monthly_balances GROUP BY period ORDER BY period DESC LIMIT 3"
echo
echo "--- J4 质检员：A/B/C/D/E 五张判定单的读数与总判 ---"
"${PSQL[@]}" -c "SELECT i.code, i.insp_type, i.result, i.aql_n, i.aql_ac, i.aql_re, i.defect_major, (SELECT count(*) FROM qm_inspection_readings rd WHERE rd.inspection_id=i.id) AS readings, (SELECT count(*) FROM qm_inspection_readings rd WHERE rd.inspection_id=i.id AND rd.pass=false) AS failed_rows FROM qm_inspections i WHERE i.code IN ('QI-B7J4-A','QI-B7J4-B','QI-B7J4-C','QI-B7J4-D','QI-B7J4-E') ORDER BY i.code"
echo "--- J4 感官翻转缺陷取证（C 单感官行 pass=true 为缺陷现场；D 单修复后 pass=false）---"
"${PSQL[@]}" -c "SELECT i.code, rd.parameter, rd.spec_min, rd.spec_max, rd.actual, rd.pass FROM qm_inspection_readings rd JOIN qm_inspections i ON i.id=rd.inspection_id WHERE i.code IN ('QI-B7J4-C','QI-B7J4-D') AND rd.parameter='感官·外观'"
echo "--- J4 处置链（return → RETURN_VENDOR 过账 → closed）---"
"${PSQL[@]}" -c "SELECT n.code, n.action, n.status, n.doc_status, i.code AS inspection FROM qm_nc_dispositions n JOIN qm_inspections i ON i.id=n.inspection_id WHERE i.code IN ('QI-B7J4-E') ORDER BY n.id DESC LIMIT 2"
"${PSQL[@]}" -tAc "SELECT doc_no, move_type, qty FROM wms_movements WHERE doc_no LIKE 'QM-NC-2026-0006%' ORDER BY id"
echo "--- J4 AQL 严格度状态机（E 单拒收后供应商转入 normal 档——rigor 落检验单行）---"
"${PSQL[@]}" -tAc "SELECT code, rigor, result FROM qm_inspections WHERE code IN ('QI-B7J4-A','QI-B7J4-E') ORDER BY code"
echo
echo "--- J2 计划员：MRP 建议确认的 MO（生命周期 + 工序）---"
"${PSQL[@]}" -c "SELECT m.code, m.doc_status, m.qty, m.reservation_state, m.bom_id, (SELECT count(*) FROM mfg_order_operations o WHERE o.order_id=m.id) AS ops FROM mfg_orders m WHERE m.code IN ('MO-2026-0013','MO-2026-0014') ORDER BY m.code"
"${PSQL[@]}" -tAc "SELECT run_id, count(*) FROM mrp_snapshots WHERE run_id LIKE 'MRP-20260928%' GROUP BY run_id ORDER BY run_id DESC LIMIT 4"
echo "--- J2 甘特工序条 = FCS 排产结果 ---"
"${PSQL[@]}" -c "SELECT o.seq, o.name, o.planned_date, o.status FROM mfg_order_operations o JOIN mfg_orders m ON m.id=o.order_id WHERE m.code='MO-2026-0014' ORDER BY o.seq"
echo
echo "--- J3 车间主任：三数等式（posted 报工 合格+损失 == MO qty，逐工序）---"
"${PSQL[@]}" -c "SELECT o.seq, o.name, m.qty AS mo_qty, coalesce(sum(j.qty_good+j.qty_scrap),0) AS reported, (coalesce(sum(j.qty_good+j.qty_scrap),0) = m.qty) AS equation_ok FROM mfg_order_operations o JOIN mfg_orders m ON m.id=o.order_id LEFT JOIN mfg_job_reports j ON j.mo_id=m.id AND j.op_seq=o.seq AND j.status='posted' WHERE m.code='MO-2026-0014' GROUP BY o.seq, o.name, m.qty ORDER BY o.seq"
echo "--- J3 领料（4 组件 reserved→consumed）与 MO 状态轨迹 ---"
"${PSQL[@]}" -tAc "SELECT i.code, i.qty, i.status FROM mfg_material_issues i JOIN mfg_orders m ON m.id=i.mo_id WHERE m.code='MO-2026-0014' ORDER BY i.code"
"${PSQL[@]}" -tAc "SELECT ref_id, status, count(*) FROM wms_reservations WHERE ref_id='MO-2026-0014' GROUP BY ref_id, status"
"${PSQL[@]}" -tAc "SELECT code, doc_status FROM mfg_orders WHERE code='MO-2026-0014'"
echo "--- J3 完工链（MC → OQC passed → 放行）---"
"${PSQL[@]}" -tAc "SELECT c.code, c.qty, c.oqc_status, c.status FROM mfg_completions c JOIN mfg_orders m ON m.id=c.mo_id WHERE m.code='MO-2026-0014'"
echo
echo "--- J6 管理员：config_note 双向留痕 + 阈值复原 ---"
"${PSQL[@]}" -tAc "SELECT doc_type, extras::jsonb->>'amount_threshold' AS threshold FROM wfl_flow_configs WHERE doc_type='pur_orders'"
"${PSQL[@]}" -tAc "SELECT config_note FROM wfl_flow_configs WHERE doc_type='pur_orders'" | grep 'w3b7-j6' | head -4
echo
echo "--- J7 member：授权面（83 集合 view）+ 写路径实测 403（REST 探针为准）---"
"${PSQL[@]}" -tAc "SELECT count(*) FROM \"rolesResources\" WHERE \"roleName\"='member'"
"${PSQL[@]}" -tAc "SELECT r.name, a.name FROM \"rolesResourcesActions\" a JOIN \"rolesResources\" r ON r.id=a.\"rolesResourceId\" WHERE r.\"roleName\"='member' AND a.name IN ('update','destroy','create') AND r.name LIKE 'wfl%'"
echo
echo "=== W3-B7 psql 断言集结束 ==="
