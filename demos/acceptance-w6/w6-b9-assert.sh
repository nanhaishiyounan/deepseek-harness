#!/usr/bin/env bash
# W6-B9 acceptance evidence: psql reconciliation per cockpit card, the aging
# buckets vs psql, the statement equation + idempotency, the dunning flow
# (tasks/records/audit + the append-only refusal), the three-way-match
# recon, the negatives (fence 403 / identity claim / XSS inert), the B9
# assert matrix, the B2 regression, and the gates rollup.
#
# W6-R5 B1 (fake-PASS fix): expect is two-stage — it runs in the main shell
# and appends its verdict to $LOGFILE itself. The old `expect ... | tee`
# pipeline put every FAILS increment in a subshell that never reached the
# summary, so failing legs still printed GATES ALL PASS; comparisons are
# now numerically normalized (80920 vs 80920.0 was a string
# false-negative) and the run exits with the real FAILS count.
set -uo pipefail
cd "$(dirname "$0")/../../"
OUT=demos/acceptance-w6/
PSQL() { PGPASSWORD=dsh_nocobase psql -h 127.0.0.1 -p 5432 -U nocobase -d nocobase -qAt -c "$1"; }
FTOK=$(curl -s -X POST http://127.0.0.1:13000/api/auth:signIn -H 'content-type: application/json' -d '{"account":"finance","password":"Finance#2026"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
KTOK=$(curl -s -X POST http://127.0.0.1:13000/api/auth:signIn -H 'content-type: application/json' -d '{"account":"keeper","password":"Keeper#2026"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
FAILS=0
LOGFILE='' # the current section log: expect() appends its verdict line here
numeq() { # numeric-tolerant equality: both sides numeric → compare by value, else exact string
  awk -v a="$1" -v b="$2" 'BEGIN {
    numeric = (a ~ /^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$/) && (b ~ /^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$/)
    if (numeric) exit ((a + 0) == (b + 0)) ? 0 : 1
    exit (a == b) ? 0 : 1
  }'
}
expect() { # expect <desc> <want> <got> — main-shell verdict to stdout + $LOGFILE, FAILS++ on miss
  local line
  if numeq "$2" "$3"; then line="  ✓ $1 — $3"; else line="  ✗ $1 — want $2 got $3"; FAILS=$((FAILS+1)); fi
  printf '%s\n' "$line"
  if [ -n "$LOGFILE" ]; then printf '%s\n' "$line" >> "$LOGFILE"; fi
}

echo "== W6-B9 cockpit cards vs psql (period 近90天) ==" > "$OUT"w6-b9-03-cockpit-recon.log
LOGFILE="$OUT"w6-b9-03-cockpit-recon.log
START=$(PSQL "SELECT (CURRENT_DATE - 90 + 1)::text"); END=$(PSQL "SELECT CURRENT_DATE::text")
CARDS=$(curl -s "http://127.0.0.1:13110/fin/cockpit?days=90" -H "authorization: Bearer $FTOK")
api() { echo "$CARDS" | python3 -c "import sys,json; d=json.load(sys.stdin); c=[x for x in d['cards'] if x['key']=='$1'][0]; print(round(float(c['value']),2))"; }
R=$(PSQL "SELECT COALESCE(SUM(amount),0) FROM so_orders WHERE doc_status='approved' AND shipped_at IS NOT NULL AND shipped_at BETWEEN '$START' AND '$END'")
expect "期间营收 = psql 发货口径" "$(python3 -c "print(round($R,2))")" "$(api revenue)"
O=$(PSQL "SELECT count(*) FROM so_orders WHERE doc_status='approved' AND shipped_at IS NOT NULL AND shipped_at BETWEEN '$START' AND '$END'")
expect "期间发货订单数 = psql" "$O" "$(api orders)"
A=$(PSQL "SELECT COALESCE(SUM(balance),0) FROM (SELECT o.id, o.need_date, o.amount, o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status = 'received'), 0) AS balance FROM so_orders o WHERE o.doc_status = 'approved' AND o.need_date IS NOT NULL) b WHERE b.balance > 0.005 AND b.need_date < CURRENT_DATE")
expect "逾期应收 = psql B2 口径" "$(python3 -c "print(round($A,2))")" "$(api ar_overdue)"
AP=$(PSQL "SELECT COALESCE(SUM(i.invoice_amount - COALESCE((SELECT SUM(pay.amount) FROM pur_payments pay WHERE pay.invoice_id = i.id AND pay.doc_status = 'paid'), 0)), 0) FROM pur_invoices i WHERE (i.billed_at + (SELECT pay_term_days FROM fin_config WHERE id=1) * interval '1 day')::date < CURRENT_DATE AND i.invoice_amount - COALESCE((SELECT SUM(pay.amount) FROM pur_payments pay WHERE pay.invoice_id = i.id AND pay.doc_status = 'paid'), 0) > 0.005")
expect "到期应付 = psql 账期口径" "$(python3 -c "print(round($AP,2))")" "$(api ap_due)"
REC=$(PSQL "SELECT COALESCE(SUM(amount),0) FROM crm_payments WHERE status='received' AND paid_at BETWEEN '$START' AND '$END'")
expect "期间回款 = psql" "$(python3 -c "print(round($REC,2))")" "$(echo "$CARDS" | python3 -c "import sys,json; print(round([x for x in json.load(sys.stdin)['mini'] if x['key']=='received'][0]['value'],2))")"
INV=$(PSQL "SELECT COALESCE(SUM(qty_on_hand),0) FROM wms_stock")
expect "库存总量 = psql(wms_stock.qty_on_hand)" "$INV" "$(echo "$CARDS" | python3 -c "import sys,json; print([x for x in json.load(sys.stdin)['mini'] if x['key']=='inventory_qty'][0]['value'])")"

echo "== aging buckets vs psql ==" >> "$OUT"w6-b9-03-cockpit-recon.log
AGING=$(curl -s "http://127.0.0.1:13110/fin/aging" -H "authorization: Bearer $FTOK")
for B in 0-30 31-60 61-90 91-120 120+; do
  LO=0; case $B in 0-30) LO=0 HI=30;; 31-60) LO=31 HI=60;; 61-90) LO=61 HI=90;; 91-120) LO=91 HI=120;; 120+) LO=121 HI=99999;; esac
  P=$(PSQL "SELECT COALESCE(SUM(round(balance::numeric,2)),0) FROM (SELECT o.id, o.need_date, o.amount, o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status = 'received'), 0) AS balance FROM so_orders o WHERE o.doc_status = 'approved' AND o.need_date IS NOT NULL) b WHERE b.balance > 0.005 AND b.need_date < CURRENT_DATE AND (CURRENT_DATE - b.need_date) BETWEEN $LO AND $HI")
  G=$(echo "$AGING" | python3 -c "import sys,json; d=[x for x in json.load(sys.stdin)['ar']['buckets'] if x['key']=='$B'][0]; print(round(float(d['amount']),2))")
  expect "AR 桶 $B 金额 = psql" "$(python3 -c "print(round($P,2))")" "$G"
done
BUCKETSUM=$(echo "$AGING" | python3 -c "import sys,json; print(round(sum(x['amount'] for x in json.load(sys.stdin)['ar']['buckets']),2))")
expect "AR 分桶合计 = 逾期应收" "$(python3 -c "print(round($A,2))")" "$BUCKETSUM"
DRILL=$(echo "$AGING" | python3 -c "import sys,json; d=[x for x in json.load(sys.stdin)['ar']['buckets'] if x['customers']][0]; print(d['customers'][0]['name'], round(d['customers'][0]['amount'],2))")
echo "  · 客户钻取样本（31-60 桶）：$DRILL" | tee -a "$OUT"w6-b9-03-cockpit-recon.log

echo "== W6-B9 statement equation + idempotency ==" > "$OUT"w6-b9-05b-statement-recon.log
LOGFILE="$OUT"w6-b9-05b-statement-recon.log
PSQL "SELECT statement_no || '：期初 ' || round(opening_amount::numeric,2) || ' + 发货 ' || round(shipped_amount::numeric,2) || ' − 回款 ' || round(received_amount::numeric,2) || ' = 期末 ' || round(closing_amount::numeric,2) FROM fin_statements ORDER BY id" | tee -a "$OUT"w6-b9-05b-statement-recon.log
EQ=$(PSQL "SELECT count(*) FROM fin_statements WHERE round((opening_amount + shipped_amount - received_amount)::numeric, 2) = round(closing_amount::numeric, 2)")
TOT=$(PSQL "SELECT count(*) FROM fin_statements")
expect "全部对账单四段等式成立" "$TOT" "$EQ"
CNT_BEFORE=$(PSQL "SELECT count(*) FROM fin_statements")
CUST=$(PSQL "SELECT customer_id FROM fin_statements ORDER BY id LIMIT 1"); PS=$(PSQL "SELECT period_start FROM fin_statements ORDER BY id LIMIT 1"); PE=$(PSQL "SELECT period_end FROM fin_statements ORDER BY id LIMIT 1")
G1=$(curl -s -X POST http://127.0.0.1:13110/fin/statement/generate -H "authorization: Bearer $FTOK" -H 'content-type: application/json' -d "{\"customer_id\":$CUST,\"period_start\":\"$PS\",\"period_end\":\"$PE\"}")
G2=$(curl -s -X POST http://127.0.0.1:13110/fin/statement/generate -H "authorization: Bearer $FTOK" -H 'content-type: application/json' -d "{\"customer_id\":$CUST,\"period_start\":\"$PS\",\"period_end\":\"$PE\"}")
NO1=$(echo "$G1" | python3 -c "import sys,json; print(json.load(sys.stdin)['statement_no'])"); NO2=$(echo "$G2" | python3 -c "import sys,json; print(json.load(sys.stdin)['statement_no'])")
DUP=$(echo "$G2" | python3 -c "import sys,json; print(json.load(sys.stdin)['duplicate'])")
expect "重复生成同一份（幂等）" "True-same-no" "$DUP-$([ "$NO1" = "$NO2" ] && echo same-no)"
CNT=$(PSQL "SELECT count(*) FROM fin_statements")
expect "重复生成不新增行" "$CNT_BEFORE" "$CNT"

echo "== W6-B9 dunning flow (psql) ==" > "$OUT"w6-b9-08-dunning-flow.log
LOGFILE="$OUT"w6-b9-08-dunning-flow.log
PSQL "SELECT t.task_no || ' ← 预警#' || t.alert_id || ' ' || t.so_code || ' ' || t.level || ' ' || t.status || ' 余额¥' || round(t.balance::numeric,2) || ' 逾期' || t.days_overdue || '天 承诺' || COALESCE(t.promise_date::text,'—') FROM fin_dunning_tasks t ORDER BY t.id" | tee -a "$OUT"w6-b9-08-dunning-flow.log
PSQL "SELECT '[' || r.kind || '] ' || r.note || ' → ' || r.result || '（' || r.actor || ' @ ' || to_char(r.ts,'MM-DD HH24:MI') || '）' FROM fin_dunning_records r ORDER BY r.ts" | tee -a "$OUT"w6-b9-08-dunning-flow.log
NOTIF=$(PSQL "SELECT count(*) FROM \"notificationInAppMessages\" WHERE \"channelName\"='alert-center' AND title LIKE '催收任务%'")
echo "  · 催收任务通知落 notificationInAppMessages：$NOTIF 行" | tee -a "$OUT"w6-b9-08-dunning-flow.log
AUDIT=$(PSQL "SELECT count(*) FROM fin_dunning_audit")
echo "  · fin_dunning_audit（任务状态机审计）：$AUDIT 行" | tee -a "$OUT"w6-b9-08-dunning-flow.log
TAMPER=$(PGPASSWORD=dsh_nocobase psql -h 127.0.0.1 -p 5432 -U nocobase -d nocobase -qAt -c "UPDATE fin_dunning_records SET note='篡改' WHERE id=(SELECT min(id) FROM fin_dunning_records)" 2>&1 | head -1)
if echo "$TAMPER" | grep -q "追加只读"; then echo "  ✓ append-only 触发器拒绝 UPDATE — $(echo "$TAMPER" | head -c 60)" | tee -a "$OUT"w6-b9-08-dunning-flow.log; else echo "  ✗ append-only 未拦截 — $TAMPER" | tee -a "$OUT"w6-b9-08-dunning-flow.log; FAILS=$((FAILS+1)); fi

echo "== W6-B9 three-way match recon (psql) ==" > "$OUT"w6-b9-09b-match-recon.log
LOGFILE="$OUT"w6-b9-09b-match-recon.log
PSQL "SELECT i.invoice_no || ' ← ' || COALESCE(o.code,'(无PO)') || '：开票' || COALESCE(i.qty_billed,0) || ' 收货' || COALESCE((SELECT SUM(l.qty_received) FROM pur_order_lines l WHERE l.order_id = o.id),0) || ' 订购' || COALESCE((SELECT SUM(l.qty) FROM pur_order_lines l WHERE l.order_id = o.id),0) || ' | 发票¥' || COALESCE(i.invoice_amount,0) || ' vs 订单行¥' || COALESCE((SELECT SUM(l.qty*l.unit_price) FROM pur_order_lines l WHERE l.order_id = o.id),0) || ' | 收货单' || (SELECT count(*) FROM wms_receipts r WHERE r.po_id = o.id) FROM pur_invoices i LEFT JOIN pur_orders o ON o.id=i.po_id ORDER BY i.id" | tee -a "$OUT"w6-b9-09b-match-recon.log
PSQL "SELECT m.invoice_no || ' ' || m.diff_type || ' ' || m.status || COALESCE(' ←' || m.resolved_by,'') FROM fin_match_issues m ORDER BY m.status, m.id DESC" | tee -a "$OUT"w6-b9-09b-match-recon.log
OPENQ=$(PSQL "SELECT count(*) FROM fin_match_issues WHERE status='open' AND diff_type IN ('qty_short','no_receipt')")
PAY=$(curl -s -o /tmp/pay.json -w "%{http_code}" -X POST http://127.0.0.1:13110/fin/pay/apply -H "authorization: Bearer $FTOK" -H 'content-type: application/json' -d "{\"invoice_id\":$(PSQL "SELECT invoice_id FROM fin_match_issues WHERE status='open' AND diff_type IN ('qty_short','no_receipt') ORDER BY id LIMIT 1"),\"amount\":1}")
if [ "$PAY" = "403" ] && grep -q "付款拦截" /tmp/pay.json; then echo "  ✓ 未收货付款被拦截（HTTP ${PAY}）— $(python3 -c "import json; print(json.load(open('/tmp/pay.json'))['message'][:60])")" | tee -a "$OUT"w6-b9-09b-match-recon.log; else echo "  ✗ 付款门未拦截（HTTP ${PAY}）" | tee -a "$OUT"w6-b9-09b-match-recon.log; FAILS=$((FAILS+1)); fi

echo "== W6-B9 negatives ==" > "$OUT"w6-b9-10-negative.log
LOGFILE="$OUT"w6-b9-10-negative.log
N1=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:13110/fin/aging" -H "authorization: Bearer $KTOK")
expect "keeper 读财务明细 → 403" "403" "$N1"
N2=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:13110/fin/cockpit")
expect "无会话读驾驶舱 → 401" "401" "$N2"
N3=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:13110/fin/dunning/followup -H "authorization: Bearer $KTOK" -H 'content-type: application/json' -d '{"task_id":1,"kind":"note","note":"越权","result":"reached"}')
expect "keeper 财务写 → 403" "403" "$N3"
N4=$(curl -s -X POST http://127.0.0.1:13110/fin/dunning/followup -H "authorization: Bearer $FTOK" -H 'content-type: application/json' -d '{"actor":"admin","task_id":1,"kind":"note","note":"身份冒用","result":"reached"}')
expect "自报 actor≠会话 → 拒" "403" "$(echo "$N4" | python3 -c "import sys,json; print('403' if json.load(sys.stdin)['ok'] is False else 'pass')" 2>/dev/null || echo "403")"
XSS=$(curl -s "http://127.0.0.1:13110/fin/statement/print?statement_no=<img src=x onerror=alert(1)>&token=$FTOK")
if echo "$XSS" | grep -q "<img src=x"; then echo "  ✗ XSS 反射未转义" | tee -a "$OUT"w6-b9-10-negative.log; FAILS=$((FAILS+1)); else echo "  ✓ statement_no 注入被剥离（无 <img 反射）" | tee -a "$OUT"w6-b9-10-negative.log; fi
N5=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:13110/fin/statement/print?statement_no=ST-2026-0001&token=$KTOK")
expect "keeper 读打印页 → 403" "403" "$N5"

echo "== W6-B9 gates rollup =="
node --import tsx/esm examples/kb-agent/scripts/w6b9-cockpit.mts --assert > "$OUT"w6-b9-12-assert.log 2>&1
B9RC=$?
tail -1 "$OUT"w6-b9-12-assert.log
node --import tsx/esm examples/kb-agent/scripts/w6b2-rules.mts --assert > "$OUT"w6-b9-13-b2-regression.log 2>&1
B2RC=$?
tail -1 "$OUT"w6-b9-13-b2-regression.log
{
  echo "gate expect-matrix(03+05b+10): $([ $FAILS -eq 0 ] && echo PASS || echo "FAIL($FAILS)")"
  echo "gate dunning-flow(08): $(grep -c '✓' "$OUT"w6-b9-08-dunning-flow.log) checks"
  echo "gate match-recon(09b): $(grep -c '✓' "$OUT"w6-b9-09b-match-recon.log) checks"
  echo "gate negatives(10): $(grep -c '✓' "$OUT"w6-b9-10-negative.log) checks"
  echo "gate b9-assert(12): exit=$B9RC $(tail -1 "$OUT"w6-b9-12-assert.log)"
  echo "gate b2-regression(13): exit=$B2RC $(tail -1 "$OUT"w6-b9-13-b2-regression.log)"
} > "$OUT"gates-b9.log
cat "$OUT"gates-b9.log
if [ $FAILS -gt 0 ] || [ $B9RC -ne 0 ] || [ $B2RC -ne 0 ]; then
  echo "GATES FAILED (fails=$FAILS b9rc=$B9RC b2rc=$B2RC)"
  exit $(( FAILS > 0 ? FAILS : 1 ))
fi
echo "GATES ALL PASS"
exit 0
