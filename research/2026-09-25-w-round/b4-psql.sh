#!/usr/bin/env zsh
# B4 只读 psql 断言集（05-b4 验收 checkbox：移库流水/两段式预留/ROP/盘点回写/对账/守卫行）
# 连接参数来自 platform/nocobase/.env；全部只读 SELECT。
set -e
cd "$(dirname "$0")"
ENV=../../platform/nocobase/.env
DB_USER=$(grep '^DB_USER=' $ENV | cut -d= -f2)
DB_PW=$(grep '^DB_PASSWORD=' $ENV | cut -d= -f2)
DB_NAME=$(grep '^DB_DATABASE=' $ENV | cut -d= -f2)
export PGPASSWORD=$DB_PW
PSQL=(psql -h localhost -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1)

echo '── 1) 移库：TRF-B4-DEMO-1 的 ±MOVE 流水对（源 −60 / 目标 +60，净 0 不破批次恒等式）'
$PSQL -c "SELECT m.doc_no, m.move_type, bf.code AS from_bin, bt.code AS to_bin, m.qty
FROM wms_movements m
LEFT JOIN wms_bins bf ON bf.id = m.from_bin_id LEFT JOIN wms_bins bt ON bt.id = m.to_bin_id
WHERE m.doc_no = 'TRF-B4-DEMO-1' ORDER BY m.id;"
echo '── 1b) 移库守卫负例单（待检 hold 禁移，状态仍 draft 未过账）'
$PSQL -c "SELECT transfer_no, status, transfer_mode FROM wms_transfers WHERE transfer_no LIKE 'TRF-B4-DEMO-%';"

echo '── 2) 预留两段式：reserved→released / reserved→consumed + released_at 落值'
$PSQL -c "SELECT r.code, r.ref_type, r.ref_id, r.status, r.qty, r.released_at, p.sku
FROM wms_reservations r JOIN hub_inv_products p ON p.id = r.product_id
WHERE r.code LIKE 'RSV-B4-DEMO-%' ORDER BY r.id;"

echo '── 3) ROP：补货建议 open 行（FD-BEV-1000 ATP 70 ≤ ROP 120 → 建议 480）'
$PSQL -c "SELECT s.id, p.sku, p.reorder_point, p.lot_size, s.on_hand_atp, s.min, s.suggest_qty, s.status, s.suggested_at
FROM wms_reorder_suggestions s JOIN hub_inv_products p ON p.id = s.product_id
WHERE s.status = 'open' ORDER BY s.id;"

echo '── 4) 盘点差异回写：CNT-B4-WF-* 的 COUNT_ADJUST 流水（对手 SH-ADJ）+ 状态 done'
$PSQL -c "SELECT m.doc_no, m.move_type, m.qty, bt.code AS to_bin, bf.code AS from_bin
FROM wms_movements m
LEFT JOIN wms_bins bf ON bf.id = m.from_bin_id LEFT JOIN wms_bins bt ON bt.id = m.to_bin_id
WHERE m.move_type = 'COUNT_ADJUST' AND m.doc_no LIKE 'CNT-B4-WF-%' OR m.doc_no LIKE 'CNT-20260926-0010001' ORDER BY m.id;"
$PSQL -c "SELECT count_no, snapshot_qty, counted_qty, difference, status FROM wms_counts
WHERE count_no LIKE 'CNT-B4-WF-%' OR count_no = 'CNT-20260926-0010001' ORDER BY id;"

echo '── 5) 对账恒等式：per (product, lot) stock Σ == movements Σ（0 行漂移 = 绿）'
$PSQL -c "WITH stock_sums AS (
  SELECT product_id, lot_id, SUM(qty_on_hand) AS s FROM wms_stock GROUP BY product_id, lot_id),
mv_sums AS (
  SELECT product_id, lot_id, SUM(qty) AS m FROM wms_movements GROUP BY product_id, lot_id)
SELECT COALESCE(ss.product_id, ms.product_id) AS product_id, COALESCE(ss.lot_id, ms.lot_id) AS lot_id,
       COALESCE(ss.s, 0) AS stock_sum, COALESCE(ms.m, 0) AS movement_sum,
       COALESCE(ss.s, 0) - COALESCE(ms.m, 0) AS drift
FROM stock_sums ss FULL OUTER JOIN mv_sums ms ON ms.product_id = ss.product_id AND ms.lot_id = ss.lot_id
WHERE ABS(COALESCE(ss.s, 0) - COALESCE(ms.m, 0)) > 0.01;"

echo '── 6) 旁路守卫：admin→wms_stock / wms_movements 显式只读授权（rolesResources）'
$PSQL -c "SELECT rr.\"roleName\", rr.name AS collection, rr.\"usingActionsConfig\",
       STRING_AGG(ra.name, ',') AS granted_actions
FROM \"rolesResources\" rr LEFT JOIN \"rolesResourcesActions\" ra ON ra.\"rolesResourceId\" = rr.id
WHERE rr.\"roleName\" = 'admin' AND rr.name IN ('wms_stock', 'wms_movements')
GROUP BY rr.id, rr.\"roleName\", rr.name, rr.\"usingActionsConfig\" ORDER BY rr.name;"

echo '── 7) 虚拟库位：SH-ADJ（差异对手）/ SH-TR（在途）种子在位'
$PSQL -c "SELECT z.code AS zone, b.code AS bin, b.sku_summary FROM wms_zones z JOIN wms_bins b ON b.zone_id = z.id
WHERE z.code IN ('SH-ADJ', 'SH-TR') ORDER BY z.code;"
