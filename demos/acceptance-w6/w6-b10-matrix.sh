#!/usr/bin/env bash
# W6-B10 reconciliation matrix — the W5 20-gate final matrix extended to the
# whole W6 round (B0~B9 + R1~R5 fix batches). Every gate reconciles a live
# surface (engine endpoint / sqlite snapshot / DB invariant) against psql,
# prints PASS/FAIL with the measured count, and the run exits non-zero when
# any gate fails. Output lands in demos/acceptance-w6/w6-b10-matrix.log.
#
# Usage: bash demos/acceptance-w6/w6-b10-matrix.sh
# Needs: NocoBase :13000, approval-engine :13110, PG :5432, sqlite3.
set -uo pipefail
cd "$(dirname "$0")/../../"
OUT=demos/acceptance-w6/
LOG="$OUT"w6-b10-matrix.log
PSQL() { PGPASSWORD=dsh_nocobase psql -h 127.0.0.1 -p 5432 -U nocobase -d nocobase -qAt -c "$1"; }
FAILS=0
GATES=0
numeq() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    numeric = (a ~ /^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$/) && (b ~ /^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$/)
    if (numeric) exit ((a + 0) == (b + 0)) ? 0 : 1
    exit (a == b) ? 0 : 1
  }'
}
# gate <id> <desc> <want> <got> — one verdict line, FAILS++ on miss
gate() {
  GATES=$((GATES + 1))
  if numeq "$3" "$4"; then
    printf 'gate %s %s: PASS — %s\n' "$1" "$2" "$4" | tee -a "$LOG"
  else
    printf 'gate %s %s: FAIL — want %s got %s\n' "$1" "$2" "$3" "$4" | tee -a "$LOG"
    FAILS=$((FAILS + 1))
  fi
}
section() { printf '\n== %s ==\n' "$1" | tee -a "$LOG"; }

printf 'W6-B10 reconciliation matrix — %s\n' "$(date '+%F %T %Z')" > "$LOG"

# ── A. B0/B1 identity + sync closure ──
section "A. B0/B1 身份与同步闭环"
DUP=$(PSQL "SELECT count(*) FROM (SELECT collection||':'||code AS k FROM (SELECT 'pur_orders' collection, code FROM pur_orders UNION ALL SELECT 'pur_requests', code FROM pur_requests UNION ALL SELECT 'so_orders', code FROM so_orders UNION ALL SELECT 'mfg_orders', code FROM mfg_orders UNION ALL SELECT 'wms_receipts', receipt_no FROM wms_receipts UNION ALL SELECT 'srm_suppliers', code FROM srm_suppliers) s WHERE code <> '' GROUP BY 1 HAVING count(*) > 1) d")
gate 01 "发号唯一：六守卫集合零撞号" 0 "$DUP"
REAL=$(PSQL "SELECT count(*) FROM wfl_approval_records WHERE approver <> 'admin' AND approver <> 'nocobase' AND acted_at >= '2026-10-01'")
if [ "$REAL" -ge 1 ]; then printf 'gate 02 审批人真实化（B0 非admin审批≥1）: PASS — %s\n' "$REAL" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 02 审计人真实化: FAIL — %s\n' "$REAL" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi
ETODOS=$(curl -s 'http://127.0.0.1:13110/todos?user=qc_inspector' | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('todos',[])))" 2>/dev/null || echo ERR)
PTODOS=$(PSQL "SELECT count(*) FROM wfl_approval_todos WHERE \"user\"='qc_inspector' AND status='open'")
gate 03 "G2 待办对账：engine /todos = psql open（qc_inspector）" "$PTODOS" "$ETODOS"
PEND=$(PSQL "SELECT count(*) FROM wfl_effect_backlog WHERE status='pending'")
gate 04 "G8 补偿队列 pending=0" 0 "$PEND"
NBT=$(sqlite3 examples/kb-agent/workspace/lakehouse-catalog.sqlite "SELECT count(*) FROM lakehouse_tables WHERE table_name GLOB 'nb_*';")
gate 05 "G5 湖仓快照 nb_* 表 =13" 13 "$NBT"
NBPO=$(sqlite3 examples/kb-agent/workspace/lakehouse-catalog.sqlite "SELECT row_count FROM lakehouse_tables WHERE table_name='nb_pur_orders';")
PGPO=$(PSQL "SELECT count(*) FROM pur_orders")
gate 06 "G5 湖仓 nb_pur_orders 行数 = psql" "$PGPO" "$NBPO"

# ── B. B2 alert engine ──
section "B. B2 规则引擎与预警中心"
RULES=$(PSQL "SELECT count(*) FROM alert_rules WHERE enabled")
gate 07 "预警规则启用 =8（B2四路+B4CCP+B5检验+B8校准/维保）" 8 "$RULES"
EXPD=$(PSQL "WITH rule AS (SELECT params FROM alert_rules WHERE rule_type = 'expiry') SELECT (SELECT count(*) FROM wfl_alerts WHERE rule_type='expiry' AND last_seen_at = CURRENT_DATE) - (SELECT count(*) FROM wms_lots l, rule r WHERE l.expiry_date IS NOT NULL AND (l.expiry_date <= CURRENT_DATE + LEAST((r.params->>'warn_days')::int, CASE WHEN (r.params->>'regulatory')::boolean IS NOT FALSE THEN CASE WHEN l.production_date IS NULL OR l.expiry_date - l.production_date >= 365 THEN 45 WHEN l.expiry_date - l.production_date >= 180 THEN 20 WHEN l.expiry_date - l.production_date >= 90 THEN 15 WHEN l.expiry_date - l.production_date >= 30 THEN 10 ELSE 3 END ELSE 999999 END) OR (l.alert_date IS NOT NULL AND l.alert_date <= CURRENT_DATE AND l.expiry_date >= CURRENT_DATE)))")
gate 08 "效期预警：引擎行数 = 手写双轨 SQL（diff=0）" 0 "$EXPD"
IDEM=$(PSQL "SELECT count(*) - count(DISTINCT dedup_key) FROM wfl_alerts")
gate 09 "预警幂等：总行数 = 去重键数" 0 "$IDEM"
NOTI=$(PSQL "SELECT count(*) FROM \"notificationInAppMessages\" WHERE \"channelName\" = 'alert-center'")
if [ "$NOTI" -ge 1 ]; then printf 'gate 10 in-app 通知送达 ≥1: PASS — %s\n' "$NOTI" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 10 in-app 通知送达 ≥1: FAIL — %s\n' "$NOTI" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi
KEEPER=$(PSQL "SELECT count(*) FROM wfl_alerts WHERE rule_type='expiry' AND notify_users::text LIKE '%keeper%'")
if [ "$KEEPER" -ge 1 ]; then printf 'gate 11 路由覆盖：效期 notify 含 keeper: PASS — %s\n' "$KEEPER" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 11 路由覆盖：效期 notify 含 keeper: FAIL — %s\n' "$KEEPER" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi

# ── C. B3 trace/recall/labels ──
section "C. B3 追溯/召回/条码"
TN=$(PSQL "SELECT count(*) FROM v_trace_nodes")
TE=$(PSQL "SELECT count(*) FROM v_trace_edges")
TRACEOK=0
if [ "$TN" -ge 1 ] && [ "$TE" -ge 1 ]; then TRACEOK=2; fi
gate 12 "追溯视图在位：v_trace_nodes(${TN})≥1 与 v_trace_edges(${TE})≥1" "2" "$TRACEOK"
RC=$(PSQL "SELECT count(*) - count(DISTINCT code) FROM recall_orders")
gate 13 "召回任务单号唯一（diff=0）" 0 "$RC"
FRZ=$(PSQL "SELECT coalesce(sum(abs(fg_count - jsonb_array_length(scope::jsonb->'affected_fg_lots'))),0) FROM recall_orders WHERE scope IS NOT NULL AND scope::text <> 'null'")
gate 14 "召回冻结快照 fg_count = 数组长度（Σdiff=0）" 0 "$FRZ"
RNOTI=$(PSQL "SELECT count(*) FROM \"notificationInAppMessages\" WHERE title LIKE '%%召回任务%%'")
if [ "$RNOTI" -ge 1 ]; then printf 'gate 15 召回通知送达 ≥1: PASS — %s\n' "$RNOTI" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 15 召回通知送达 ≥1: FAIL — %s\n' "$RNOTI" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi
ORPH=$(PSQL "SELECT count(*) FROM wms_receipts r LEFT JOIN wms_lots l ON r.lot_id = l.id WHERE r.lot_id IS NOT NULL AND l.id IS NULL")
gate 16 "receipts 外键回填孤儿 =0" 0 "$ORPH"
CWOL=$(PSQL "SELECT count(*) FROM mfg_completions c LEFT JOIN wms_lots l ON c.lot_no = l.lot_no WHERE c.lot_no IS NOT NULL AND c.lot_no <> '' AND l.lot_no IS NULL")
gate 17 "完工效期继承：无批次完工 =0" 0 "$CWOL"
LLOTS=$(curl -s http://127.0.0.1:13110/label/lots.json | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('lots',[])))" 2>/dev/null || echo ERR)
PLLOTS=$(PSQL "SELECT count(*) FROM wms_lots WHERE lot_no IS NOT NULL AND lot_no <> ''")
gate 18 "条码中心批次源 = wms_lots" "$PLLOTS" "$LLOTS"

# ── D. B4 MES/CCP/BOM/ECO ──
section "D. B4 执行面/CCP/配方版本"
CCP=$(PSQL "SELECT count(*) FROM mfg_ccp_records")
if [ "$CCP" -ge 1 ]; then printf 'gate 19 CCP 监控记录 ≥1: PASS — %s\n' "$CCP" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 19 CCP 监控记录 ≥1: FAIL — %s\n' "$CCP" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi
CCPA=$(PSQL "SELECT count(*) FROM wfl_alerts WHERE rule_type='ccp_deviation'")
if [ "$CCPA" -ge 1 ]; then printf 'gate 20 CCP 越限→预警行 ≥1: PASS — %s\n' "$CCPA" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 20 CCP 越限→预警行 ≥1: FAIL — %s\n' "$CCPA" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi
BVER=$(PSQL "SELECT count(DISTINCT version) FROM mfg_boms")
if [ "$BVER" -ge 2 ]; then printf 'gate 21 配方 BOM 版本 ≥2: PASS — %s\n' "$BVER" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 21 配方 BOM 版本 ≥2: FAIL — %s\n' "$BVER" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi
ECOA=$(PSQL "SELECT count(*) FROM mfg_ecos WHERE approved_by IS NOT NULL AND approved_by <> ''")
if [ "$ECOA" -ge 1 ]; then printf 'gate 22 ECO 审批通过 ≥1（approved_by 回填）: PASS — %s\n' "$ECOA" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 22 ECO 审批通过 ≥1: FAIL — %s\n' "$ECOA" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi

# ── E. B5 QMS ──
section "E. B5 检验工作台/出厂报告"
BANDS=$(PSQL "SELECT count(DISTINCT lot_band) FROM qm_aql_plans")
gate 23 "AQL 抽样 15 段表在库" 15 "$BANDS"
NULL9=$(PSQL "SELECT count(*) FROM qm_factory_reports WHERE COALESCE(report_no,'')='' OR COALESCE(inspection_code,'')='' OR COALESCE(product_name,'')='' OR qty IS NULL OR COALESCE(lot_no,'')='' OR COALESCE(conclusion,'')='' OR COALESCE(reporter,'')='' OR COALESCE(reviewer,'')='' OR issued_at IS NULL")
gate 24 "出厂报告九要素非空违例 =0" 0 "$NULL9"
IDX=$(PSQL "SELECT count(*) FROM pg_indexes WHERE indexname IN ('ux_qm_factory_reports_no','ux_qm_factory_reports_insp')")
gate 25 "报告编号唯一+一检验一报告索引 =2" 2 "$IDX"
INFA=$(PSQL "SELECT count(*) FROM wfl_alerts WHERE rule_type='inspection_fail'")
if [ "$INFA" -ge 1 ]; then printf 'gate 26 拒收→inspection_fail 预警 ≥1: PASS — %s\n' "$INFA" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 26 拒收→inspection_fail 预警 ≥1: FAIL — %s\n' "$INFA" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi

# ── F. B6 CRM ──
section "F. B6 商机管道/客户360"
PROB=$(PSQL "SELECT count(*) FROM crm_deals WHERE (stage IN ('won','赢单','成交') AND COALESCE(probability,0) <> 100) OR (stage IN ('lost','输单','丢单') AND COALESCE(probability,0) <> 0)")
gate 27 "概率状态一致（won=100/lost=0）违例 =0" 0 "$PROB"
DEALS=$(PSQL "SELECT count(*) FROM crm_deals")
if [ "$DEALS" -ge 1 ]; then printf 'gate 28 商机在库 ≥1（管道有源）: PASS — %s\n' "$DEALS" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 28 商机在库 ≥1: FAIL — %s\n' "$DEALS" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi
QTSO=$(PSQL "SELECT count(*) FROM crm_quotes WHERE COALESCE(converted_so_code,'') <> '' AND converted_so_code IN (SELECT code FROM so_orders)")
if [ "$QTSO" -ge 1 ]; then printf 'gate 29 报价转单留痕（converted_so_code 回链 so_orders）≥1: PASS — %s\n' "$QTSO" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 29 报价转单留痕 ≥1: FAIL — %s\n' "$QTSO" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi

# ── G. B7 SCM ──
section "G. B7 比价矩阵/定标"
WONGRP=$(PSQL "SELECT count(*) FROM (SELECT rfq_id FROM pur_quotes WHERE is_won GROUP BY 1 HAVING count(*) > 1) t")
gate 30 "定标唯一：每组至多一个 is_won" 0 "$WONGRP"
WON=$(PSQL "SELECT count(*) FROM pur_quotes WHERE is_won")
if [ "$WON" -ge 1 ]; then printf 'gate 31 定标行 ≥1: PASS — %s\n' "$WON" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 31 定标行 ≥1: FAIL — %s\n' "$WON" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi
AWRD=$(PSQL "SELECT count(*) FROM pur_rfqs WHERE awarded_at IS NOT NULL")
if [ "$AWRD" -ge 1 ]; then printf 'gate 32 RFQ 定标闭环（awarded_at 回填）≥1: PASS — %s\n' "$AWRD" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 32 RFQ 定标闭环 ≥1: FAIL — %s\n' "$AWRD" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi

# ── H. B8 EAM/APS ──
section "H. B8 设备计量/排产"
BADST=$(PSQL "SELECT count(*) FROM eam_maint_orders WHERE status NOT IN ('new','processing','pending','solved','closed')")
gate 33 "维保状态机合法闭集违例 =0" 0 "$BADST"
PLANW=$(PSQL "SELECT count(*) FROM eam_maint_orders WHERE source='plan'")
if [ "$PLANW" -ge 1 ]; then printf 'gate 34 预防性引擎工单 ≥1（source=plan）: PASS — %s\n' "$PLANW" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 34 预防性引擎工单 ≥1: FAIL — %s\n' "$PLANW" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi
CALA=$(PSQL "SELECT count(*) FROM wfl_alerts WHERE rule_type='calibration_due'")
if [ "$CALA" -ge 1 ]; then printf 'gate 35 计量校准到期预警 ≥1: PASS — %s\n' "$CALA" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 35 计量校准到期预警 ≥1: FAIL — %s\n' "$CALA" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi
WIR=$(PSQL "SELECT count(*) FROM aps_whatif_runs WHERE delta IS NOT NULL AND applied IS NOT NULL")
if [ "$WIR" -ge 1 ]; then printf 'gate 36 APS what-if 运行留痕 ≥1（delta/applied 完整）: PASS — %s\n' "$WIR" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 36 APS what-if 运行留痕 ≥1: FAIL — %s\n' "$WIR" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi

# ── I. B9 finance cockpit ──
section "I. B9 驾驶舱/财务 P1"
FTOK=$(curl -s -X POST http://127.0.0.1:13000/api/auth:signIn -H 'content-type: application/json' -d '{"account":"finance","password":"Finance#2026"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
START=$(PSQL "SELECT (CURRENT_DATE - 90 + 1)::text"); END=$(PSQL "SELECT CURRENT_DATE::text")
APIREV=$(curl -s "http://127.0.0.1:13110/fin/cockpit?days=90" -H "authorization: Bearer $FTOK" | python3 -c "import sys,json; d=json.load(sys.stdin); print(round(float([c for c in d['cards'] if c['key']=='revenue'][0]['value']),2))")
PGREV=$(PSQL "SELECT round(COALESCE(SUM(amount),0)::numeric,2) FROM so_orders WHERE doc_status='approved' AND shipped_at IS NOT NULL AND shipped_at BETWEEN '$START' AND '$END'")
gate 37 "驾驶舱期间营收卡 = psql 发货口径" "$PGREV" "$APIREV"
AGING=$(PSQL "WITH b AS (SELECT o.need_date, round((o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status='received'),0))::numeric, 2) AS bal FROM so_orders o WHERE o.doc_status='approved' AND o.need_date IS NOT NULL AND o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status='received'),0) > 0.005 AND o.need_date < CURRENT_DATE) SELECT (SELECT COALESCE(SUM(bal),0) FROM b) - (SELECT COALESCE(SUM(bucket),0) FROM (SELECT COALESCE(SUM(bal) FILTER (WHERE CURRENT_DATE - need_date <= 30),0) bucket FROM b UNION ALL SELECT COALESCE(SUM(bal) FILTER (WHERE CURRENT_DATE - need_date > 30 AND CURRENT_DATE - need_date <= 60),0) FROM b UNION ALL SELECT COALESCE(SUM(bal) FILTER (WHERE CURRENT_DATE - need_date > 60 AND CURRENT_DATE - need_date <= 90),0) FROM b UNION ALL SELECT COALESCE(SUM(bal) FILTER (WHERE CURRENT_DATE - need_date > 90 AND CURRENT_DATE - need_date <= 120),0) FROM b UNION ALL SELECT COALESCE(SUM(bal) FILTER (WHERE CURRENT_DATE - need_date > 120),0) FROM b) x)")
gate 38 "账龄五桶合计 = 逾期 AR 总额" 0 "$AGING"
STEQ=$(PSQL "SELECT coalesce(sum(abs(round((opening_amount + shipped_amount - received_amount - closing_amount)::numeric,2))),0) FROM fin_statements")
gate 39 "对账单四段等式 Σ|期初+发货−回款−期末| =0" 0 "$STEQ"
PAYGATE=$(curl -s -o /tmp/w6b10-pay.json -w "%{http_code}" -X POST http://127.0.0.1:13110/fin/pay/apply -H "authorization: Bearer $FTOK" -H 'content-type: application/json' -d "{\"invoice_id\":$(PSQL "SELECT invoice_id FROM fin_match_issues WHERE status='open' AND diff_type IN ('qty_short','no_receipt') ORDER BY id LIMIT 1"),\"amount\":1}")
if [ "$PAYGATE" = "403" ]; then printf 'gate 40 付款门：未收货付款被拦（403）: PASS\n' | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 40 付款门：未收货付款被拦: FAIL — HTTP %s\n' "$PAYGATE" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi
TAMPER=$(PGPASSWORD=dsh_nocobase psql -h 127.0.0.1 -p 5432 -U nocobase -d nocobase -qAt -c "UPDATE fin_dunning_records SET note='w6b10-matrix-tamper' WHERE id=(SELECT min(id) FROM fin_dunning_records)" 2>&1 | head -1)
if echo "$TAMPER" | grep -q "追加只读"; then printf 'gate 41 催收台账 append-only 拦截 UPDATE: PASS\n' | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 41 催收台账 append-only 拦截: FAIL — %s\n' "$(echo "$TAMPER" | head -c 60)" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi

# ── J. wfl engine cross-cutting ──
section "J. 审批引擎横切"
BADACT=$(PSQL "SELECT count(*) FROM wfl_approval_records WHERE action NOT IN ('submit','resubmit','approve','reject','promote','demote','settle','void')")
gate 42 "审批动作闭集违例 =0" 0 "$BADACT"
BADTODO=$(PSQL "SELECT count(*) FROM wfl_approval_todos WHERE status NOT IN ('open','completed')")
gate 43 "待办状态闭集违例 =0" 0 "$BADTODO"
FLOWCFG=$(PSQL "SELECT count(*) FROM wfl_flow_configs")
if [ "$FLOWCFG" -ge 1 ]; then printf 'gate 44 审批流配置在库（设计器事实源）≥1: PASS — %s\n' "$FLOWCFG" | tee -a "$LOG"; GATES=$((GATES+1)); else printf 'gate 44 审批流配置在库 ≥1: FAIL — %s\n' "$FLOWCFG" | tee -a "$LOG"; FAILS=$((FAILS+1)); GATES=$((GATES+1)); fi

printf '\n== W6-B10 matrix: %s gates, %s failed ==\n' "$GATES" "$FAILS" | tee -a "$LOG"
if [ "$FAILS" -gt 0 ]; then printf 'MATRIX FAILED\n' | tee -a "$LOG"; exit 1; fi
printf 'MATRIX ALL PASS\n' | tee -a "$LOG"
exit 0
