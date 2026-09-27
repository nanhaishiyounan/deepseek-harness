#!/usr/bin/env zsh
# W2-B6 只读 psql 断言集（06-b6 验收 checkbox：部分投料三段/超领比例手算/缺省零漂移/拆单建议数值/状态门禁）
# 连接参数来自 platform/nocobase/.env；全部只读 SELECT。
set -e
cd "$(dirname "$0")"
ENV=../../platform/nocobase/.env
DB_USER=$(grep '^DB_USER=' $ENV | cut -d= -f2)
DB_PW=$(grep '^DB_PASSWORD=' $ENV | cut -d= -f2)
DB_NAME=$(grep '^DB_DATABASE=' $ENV | cut -d= -f2)
export PGPASSWORD=$DB_PW
PSQL=(psql -h localhost -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1)

echo '── 1) MO 策略列全景（演示 MO 的 kit_policy/overissue_ratio + 既有 MO 缺省 full_lock/0）'
$PSQL -c "SELECT code, doc_status, kit_policy, overissue_ratio, reservation_state FROM mfg_orders WHERE code LIKE 'MO-W2B6-%' OR code LIKE 'MO-2026-%' ORDER BY code;"

echo '── 2) 部分投料三段之一：MO-W2B6-01 落 partial_allowed（非阻断新态）+ kit_data 阶梯（state+policy+缺料行 shortfall=100）'
$PSQL -c "SELECT code, reservation_state, jsonb_extract_path_text(kit_data::jsonb,'state') kit_state, jsonb_extract_path_text(kit_data::jsonb,'policy') kit_policy FROM mfg_orders WHERE code='MO-W2B6-01';"
$PSQL -c "SELECT jsonb_path_query(kit_data::jsonb, '$.rows[*] ? (@.shortfall > 0)') AS shortage_ladder FROM mfg_orders WHERE code='MO-W2B6-01';"

echo '── 3) 部分投料三段之二：领已齐组件 posted（±ISSUE_WIP 对）+ 预留 consumed'
$PSQL -c "SELECT i.code, i.status, p.sku, i.qty, i.note FROM mfg_material_issues i JOIN hub_inv_products p ON p.id=i.product_id WHERE i.code IN ('MI-W2B6-007','MI-W2B6-008') ORDER BY i.code;"
$PSQL -c "SELECT m.doc_no, m.move_type, m.qty FROM wms_movements m WHERE m.doc_no='MI-W2B6-007' ORDER BY m.id;"
$PSQL -c "SELECT code, ref_id, status, qty FROM wms_reservations WHERE ref_type='MO' AND ref_id='MO-W2B6-01' ORDER BY code;"

echo '── 4) 超领比例手算：预留 100 × (1+0.05)=105 —— 105 过（note 记超领 5）、106 无 posted 残留'
$PSQL -c "SELECT i.code, i.status, i.qty, i.note FROM mfg_material_issues i WHERE i.code IN ('MI-W2B6-004','MI-W2B6-005') ORDER BY i.code;"
$PSQL -c "SELECT count(*) FILTER (WHERE i.code='MI-W2B6-005' AND i.status='posted') AS refused_row_must_be_zero FROM mfg_material_issues i;"

echo '── 5) 缺省零漂移：full_lock partial 领料被拒（00A 行仍 draft）；ratio=0 超 1 即拒（00B2 行仍 draft）'
$PSQL -c "SELECT i.code, i.status, i.qty, left(i.note, 44) note FROM mfg_material_issues i WHERE i.code IN ('MI-W2B6-001','MI-W2B6-010') ORDER BY i.code;"

echo '── 6) 状态门禁：MO-W2B6-03（partial_allowed 但 approved 未 released）—— 无预留无领料'
$PSQL -c "SELECT code, doc_status, kit_policy, reservation_state FROM mfg_orders WHERE code='MO-W2B6-03';"
$PSQL -c "SELECT count(*) AS mo03_posted_must_be_zero FROM mfg_material_issues WHERE code='MI-W2B6-009' AND status='posted';"

echo '── 7) 拆单建议卡：MO-W2B6-05 preview_data 结构化对象（3 份 × 432 分）+ 排产看板口径'
$PSQL -c "SELECT jsonb_path_query(preview_data::jsonb, '$.operations[0].suggestion') AS split_card FROM mfg_orders WHERE code='MO-W2B6-05';"
$PSQL -c "SELECT code, working_hours FROM mfg_work_centers WHERE code='WC-W2B6';"

echo '── 8) 对账门禁基线（配合 --assert-ledger）：每 (product,lot) stock == Σmovements'
$PSQL -c "SELECT s.product_id, s.lot_id, SUM(s.qty_on_hand) stock_sum, mv.move_sum FROM wms_stock s
JOIN (SELECT product_id, lot_id, SUM(qty) move_sum FROM wms_movements GROUP BY product_id, lot_id) mv ON mv.product_id=s.product_id AND mv.lot_id=s.lot_id
GROUP BY s.product_id, s.lot_id, mv.move_sum HAVING ABS(SUM(s.qty_on_hand) - mv.move_sum) > 0.01;"
echo '(空结果 = 对账平衡)'
