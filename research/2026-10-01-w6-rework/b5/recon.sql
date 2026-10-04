-- W6-B5 QMS 检验工作台 对账 SQL（终验矩阵腿引用；演练锚 QI-W6B5-01 IQC N=300 / QI-W6B5-F1 OQC N=350）
-- ① 判定快照与抽样参数（向导徽章 ↔ 落库逐项对账）
SELECT code, result, status, submit_key, defect_critical, defect_major, defect_minor,
       aql_target, aql_code, aql_n, aql_ac, aql_re, rigor, inspector, inspected_at,
       (photo_evidence IS NOT NULL AND photo_evidence <> '') AS has_photo
FROM qm_inspections WHERE code LIKE 'QI-W6B5-%';
-- ② 逐项读数（向导录入行数与 pass 落库）
SELECT i.code, count(r.id) AS readings
FROM qm_inspections i LEFT JOIN qm_inspection_readings r ON r.inspection_id = i.id
WHERE i.code LIKE 'QI-W6B5-%' GROUP BY 1;
-- ③ AQL 15 段三方对拍（psql 直查 = W2 种子锚点 = 向导 inspPlan）
SELECT lot_band, aql, rigor, n, ac, re FROM qm_aql_plans
WHERE (lot_band, aql, rigor) IN (('151-280','2.5','normal'), ('281-500','2.5','normal'), ('1201-3200','2.5','tightened'));
-- ④ 拒收 → B2 预警行 + 通知（inspection_fail 第六路）
SELECT rule_type, severity, status, entity_code, detail
FROM wfl_alerts WHERE dedup_key LIKE 'inspection_fail:qm_inspections:%';
-- ⑤ 处置四路后果（rework → RW 工单 + CAPA；nc closed approved）
SELECT d.code, d.action, d.status, d.doc_status, d.ref_no, i.code AS insp
FROM qm_nc_dispositions d JOIN qm_inspections i ON i.id = d.inspection_id
WHERE i.code LIKE 'QI-W6B5-%';
SELECT code, source, doc_status FROM mfg_orders WHERE source = 'rework' AND code LIKE 'RW-2026-%';
-- ⑥ 出厂检验报告九要素留档（一检验一报告 + 报告编号=检验合格证号）
SELECT report_no, inspection_code, insp_type, product_name, qty, lot_no, conclusion, reporter, reviewer, issued_at
FROM qm_factory_reports;
-- ⑦ 演练清理（可识别可清理：QI-W6B5-% 前缀全链撤收）
--   node --import tsx/esm examples/kb-agent/scripts/w6b5-insp.mts --cleanup
