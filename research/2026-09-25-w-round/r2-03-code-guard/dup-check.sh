#!/bin/zsh
# R2-03: 单据 code 唯一守卫 — live 存量重复检查（只读 SELECT，零写入）
# 六个守卫集合（CODE_UNIQUENESS_COLUMNS）逐一 GROUP BY code HAVING count>1。
set -e
cd "$(dirname "$0")/../../.."
ENV=platform/nocobase/.env
DB_USER=$(grep '^DB_USER=' $ENV | cut -d= -f2)
DB_PW=$(grep '^DB_PASSWORD=' $ENV | cut -d= -f2)
DB_NAME=$(grep '^DB_DATABASE=' $ENV | cut -d= -f2)
export PGPASSWORD=$DB_PW
PSQL=(psql -h localhost -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1)

echo "== R2-03 live duplicate-code check across the six guarded collections =="
echo "== number columns verified live: 5x code + wms_receipts.receipt_no (CODE_UNIQUENESS_COLUMNS) =="
for PAIR in pur_orders:code pur_requests:code so_orders:code mfg_orders:code wms_receipts:receipt_no srm_suppliers:code; do
  T=${PAIR%%:*}; C=${PAIR##*:}
  DUP=$("${PSQL[@]}" -t -A -c "SELECT count(*) FROM (SELECT $C AS n FROM $T WHERE $C IS NOT NULL AND $C <> '' GROUP BY n HAVING count(*) > 1) d")
  TOTAL=$("${PSQL[@]}" -t -A -c "SELECT count(*) FROM $T WHERE $C IS NOT NULL AND $C <> ''")
  echo "$T ($C): rows_with_number=$TOTAL duplicate_numbers=$DUP"
done
echo "== verdict: engine-side guard is safe to enable (no pre-existing duplicates) when all duplicate_numbers=0 =="
