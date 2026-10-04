-- W6-B1 recon.sql — 对账 SQL 固化（证据 demos/acceptance-w6/w6-b1-*；psql -t -A 执行）
-- 环境：PG localhost:5432/nocobase（platform/nocobase/.env 凭据）

-- ① G2 待办读对账（w6-b1-01；引擎 /todos?user= 与 mobile #/todos 同源）
SELECT count(*) FROM wfl_approval_todos WHERE "user"='qc_inspector' AND status='open';
-- 演示时=1（QM-NC-W6B1-20261001115245）；审批后=0（w6-b1-03 回流关闭）

-- ② G2 闭环状态（w6-b1-02/03；mobile 待办页「同意」→ AI 会话 nb_approve）
SELECT doc_status FROM qm_nc_dispositions WHERE code LIKE 'QM-NC-W6B1-%' ORDER BY id DESC LIMIT 1;
-- 期望：approved
SELECT action, approver FROM wfl_approval_records WHERE doc_type='qm_nc_dispositions' AND action='approve' ORDER BY id DESC LIMIT 1;
-- 期望：approve | qc_inspector（B0 越权闸门盖章的审计人；非 admin）

-- ③ G6 单据浏览（w6-b1-04；#/docs 列表与详情的行源）
SELECT id, code, doc_status FROM qm_nc_dispositions ORDER BY id DESC LIMIT 5;
SELECT action, approver, from_state, to_state, acted_at FROM wfl_approval_records
  WHERE doc_type='qm_nc_dispositions' ORDER BY id;   -- 详情页审批轨迹数据源（时间戳列为 acted_at；表内无 created_at）

-- ④ G5 服务端发号（w6-b1-06 + 断言腿；空号由写路径分配，客户端预号仅展示）
SELECT max(substring(code from '(\d{4})$')) FROM pur_orders WHERE code LIKE 'PO-2026-%';
-- 断言腿执行时 max=1052；服务端 max+1 可解析续号
SELECT count(*) FROM (
  SELECT collection || ':' || col_name || ':' || code AS dup FROM (
    SELECT 'pur_orders' AS collection, code, 'code' AS col_name FROM pur_orders UNION ALL
    SELECT 'pur_requests', code, 'code' FROM pur_requests UNION ALL
    SELECT 'so_orders', code, 'code' FROM so_orders UNION ALL
    SELECT 'mfg_orders', code, 'code' FROM mfg_orders UNION ALL
    SELECT 'wms_receipts', receipt_no, 'receipt_no' FROM wms_receipts UNION ALL
    SELECT 'srm_suppliers', code, 'code' FROM srm_suppliers) s
  WHERE code <> '' GROUP BY collection, col_name, code HAVING count(*) > 1) d;
-- 期望：0（六个守卫集合零撞号）

-- ⑤ G8 补偿队列（断言腿 leg5；wfl_effect_backlog 自动重放）
SELECT status, count(*) FROM wfl_effect_backlog GROUP BY status;
-- 期望：done=N（重放成功）或无行（断言清理后）；pending=0
SELECT status FROM wfl_effect_backlog WHERE doc_type='so_orders' ORDER BY id DESC LIMIT 1;
-- 断言腿执行时=done（so_orders#25 幂等重放）

-- ⑥ G7 湖仓快照（断言腿 leg4；nightly lakehouse-transfer 落 nb_* 表）
-- sqlite3 examples/kb-agent/workspace/lakehouse-catalog.sqlite \
--   "SELECT table_name, row_count FROM lakehouse_tables WHERE table_name LIKE 'nb\_%' ORDER BY table_name;"
-- 期望：13 张 nb_* 表；nb_pur_orders.row_count = 下面对账
SELECT count(*) FROM pur_orders;
