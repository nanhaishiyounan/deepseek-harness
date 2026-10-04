#!/usr/bin/env bash
# W6-R5 B1 counter-proof (fake-PASS): proves the fixed comparator catches an
# injected wrong value where the old pipeline lost every FAILS increment.
# Three probes, all against the units lifted verbatim from the fixed
# w6-b9-assert.sh: (1) the OLD shape `expect ... | tee` runs in a pipeline
# subshell so FAILS never reaches the parent — reproduced and shown; (2) the
# NEW expect counts in the main shell — an injected wrong value yields
# FAILS=1; (3) numeq normalizes 80920 vs 80920.0 and 12 vs 12.0 (the old
# string false-negatives) while still rejecting a real mismatch.
set -uo pipefail
OUT="$(cd "$(dirname "$0")" && pwd)/"
FAILS=0
LOGFILE=''

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

{
  echo "== probe 1: the OLD pipeline shape loses FAILS (the fake-PASS root cause reproduced) =="
  FAILS=0
  expect_old() { if [ "$2" = "$3" ]; then echo "  ✓ $1"; else echo "  ✗ $1 — want $2 got $3"; FAILS=$((FAILS+1)); fi; }
  expect_old "旧比较器·故意错值" "1" "2" | cat > /dev/null   # pipeline → subshell → increment lost
  echo "  → 管道内调用后主 shell FAILS=${FAILS}（增量丢失——旧门禁因此恒报 PASS）"

  echo "== probe 2: the NEW main-shell expect catches the injected wrong value =="
  FAILS=0
  LOGFILE="$OUT"w6-r5-01b-inject-unit.log
  expect "新比较器·故意注入错值" "99999999" "80920.0"
  echo "  → 主 shell FAILS=${FAILS}（增量被捕获）"
  rc=0; numeq "99999999" "80920.0" || rc=$?
  echo "  → numeq exit=${rc}（非 0 = 判不等，正确拒绝）"

  echo "== probe 3: numeric normalization kills the old string false-negatives =="
  for pair in "80920 80920.0" "12 12.0" "18800.00 18800.0" "80920 80921"; do
    set -- $pair
    if numeq "$1" "$2"; then echo "  ✓ numeq $1 == $2（数值等价）"; else echo "  ✓ numeq $1 != $2（真实差异被拒绝）"; fi
  done
  FAILS=0
} | tee "$OUT"w6-r5-01b-inject-probe.log
echo "probe done — see w6-r5-01b-inject-probe.log + w6-r5-01b-inject-unit.log"
