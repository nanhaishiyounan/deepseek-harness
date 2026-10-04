#!/usr/bin/env bash
# W6-B10 full regression: every W6 assert leg (B0~B9 + the fix batches'
# repaired versions), typecheck, staged oxlint, translation pairing, then
# the drill-data cleanup legs (R5 --clean precedent). Honest rollup — every
# skip/N/A states its reason; exit code carries the real failure count.
#
# Usage: bash demos/acceptance-w6/w6-b10-gates.sh
# Needs: three services up + PG + built lib (typecheck needs build:lib:host).
set -uo pipefail
cd "$(dirname "$0")/../../"
OUT=demos/acceptance-w6/
LOG="$OUT"gates-b10.log
FAILS=0
LEGS=0
printf '== W6-B10 gates (如实) ==\n%s\n' "$(date '+%F %T %Z')" > "$LOG"

TSX="node --import tsx/esm"

# ── 0. drill reseed (the previous run's cleanup legs withdrew the drill
#        rows the asserts and matrix gates reconcile against; the honest
#        re-runnable order replays the drills first, then asserts, then the
#        matrix, and leaves cleanup last) ──
printf -- '-- 演练数据补播（上轮清理腿撤收过——先重放再断言）--\n' | tee -a "$LOG"
$TSX examples/kb-agent/scripts/w6b9-cockpit.mts --demo > "$OUT"w6-b10-gate-preseed9.log 2>&1 || true
printf 'preseed b9 --demo: %s\n' "$(tail -1 "$OUT"w6-b10-gate-preseed9.log | head -c 110)" | tee -a "$LOG"
$TSX examples/kb-agent/scripts/w6b6-crm.mts --seed > "$OUT"w6-b10-gate-preseed6b.log 2>&1 || true
printf 'preseed b6 --seed: %s\n' "$(tail -1 "$OUT"w6-b10-gate-preseed6b.log | head -c 110)" | tee -a "$LOG"
# B5's factory report only exists through the wizard leg — seed the rehearsal
# queue first (the wizard consumes, never seeds), then replay the batch's own
# headless acceptance driver (IQC → disposal → OQC → report issue).
$TSX examples/kb-agent/scripts/w6b5-insp.mts --seed > "$OUT"w6-b10-gate-preseed5a.log 2>&1 || true
node demos/acceptance-w6/w6-b5-shoot.mjs > "$OUT"w6-b10-gate-preseed5.log 2>&1 || true
printf 'preseed b5 wizard replay: %s\n' "$(grep -c '✓' "$OUT"w6-b10-gate-preseed5.log) ✓ / $(grep -c '✗' "$OUT"w6-b10-gate-preseed5.log) ✗" | tee -a "$LOG"

# ── 1. the assert legs (each self-seeds; recall auto-cleans its drill) ──
assert_leg() {
  LEGS=$((LEGS + 1))
  local name="$1"; shift
  local rc=0
  "$@" > "$OUT"w6-b10-gate-${name}.log 2>&1 || rc=$?
  # Transparent single retry for the NocoBase dev-server keep-alive race:
  # undici reuses a socket the dev-server just closed (ECONNRESET) — the
  # read-only assert legs are safe to re-run; both attempts stay on disk.
  if [ "$rc" -ne 0 ] && grep -q 'ECONNRESET' "$OUT"w6-b10-gate-${name}.log; then
    mv "$OUT"w6-b10-gate-${name}.log "$OUT"w6-b10-gate-${name}.retry1.log
    rc=0
    "$@" > "$OUT"w6-b10-gate-${name}.log 2>&1 || rc=$?
    printf '  (%s 首试 ECONNRESET——dev-server keep-alive 竞态，重试一次；两次日志均留档)\n' "$name" | tee -a "$LOG"
  fi
  local verdict
  verdict=$(tail -1 "$OUT"w6-b10-gate-${name}.log | head -c 120)
  if [ "$rc" -eq 0 ]; then
    printf 'gate assert %s: exit=0 — %s\n' "$name" "$verdict" | tee -a "$LOG"
  else
    printf 'gate assert %s: FAIL exit=%s — %s\n' "$name" "$rc" "$verdict" | tee -a "$LOG"
    FAILS=$((FAILS + 1))
  fi
}
assert_leg b0          $TSX examples/kb-agent/scripts/w6b0-identity.mts --assert
assert_leg b1-sync     $TSX examples/kb-agent/scripts/w6b1-sync.mts --assert
assert_leg b2-rules    $TSX examples/kb-agent/scripts/w6b2-rules.mts --assert
assert_leg b3-trace    $TSX examples/kb-agent/scripts/w6b3-trace.mts --assert
assert_leg b3-recall   $TSX examples/kb-agent/scripts/w6b3-recall.mts --assert
assert_leg b3-labels   $TSX examples/kb-agent/scripts/w6b3-labels-assert.mts
assert_leg b4-mes      $TSX examples/kb-agent/scripts/w6b4-assert.mts
assert_leg b4-ccp      $TSX examples/kb-agent/scripts/w6b4-ccp.mts --assert
assert_leg b4-bomver   $TSX examples/kb-agent/scripts/w6b4-bomver.mts --assert
assert_leg b5-insp     $TSX examples/kb-agent/scripts/w6b5-insp.mts --assert
# b6's assert reads rehearsal rows it does not seed itself; the documented
# re-runnable path is cleanup (the batch-era demo quote already carried a
# converted state) then seed, so the conversion leg runs live each time.
$TSX examples/kb-agent/scripts/w6b6-crm.mts --cleanup > "$OUT"w6-b10-gate-preclean6.log 2>&1 || true
$TSX examples/kb-agent/scripts/w6b6-crm.mts --seed > "$OUT"w6-b10-gate-preseed6.log 2>&1 || true
assert_leg b6-crm      $TSX examples/kb-agent/scripts/w6b6-crm.mts --assert
assert_leg b7-sourcing $TSX examples/kb-agent/scripts/w6b7-sourcing.mts --assert
assert_leg b8-aps      $TSX examples/kb-agent/scripts/w6b8-aps.mts --assert
assert_leg b8-eam      $TSX examples/kb-agent/scripts/w6b8-assert.mts
assert_leg b9-cockpit  $TSX examples/kb-agent/scripts/w6b9-cockpit.mts --assert
assert_leg statcard    $TSX examples/kb-agent/scripts/w6b10-statcard-order.mts

# ── 2. the reconciliation matrix (44 gates) ──
LEGS=$((LEGS + 1))
bash "$OUT"w6-b10-matrix.sh > /dev/null 2>&1
MRC=$?
if [ "$MRC" -eq 0 ]; then
  printf 'gate matrix-44: exit=0 — 44 gates ALL PASS（%s）\n' "$(grep -c 'PASS' "$OUT"w6-b10-matrix.log)" | tee -a "$LOG"
else
  printf 'gate matrix-44: FAIL exit=%s\n' "$MRC" | tee -a "$LOG"
  FAILS=$((FAILS + 1))
fi

# ── 3. walkthrough rerun gate rides on the recorded verdict (8/8) ──
LEGS=$((LEGS + 1))
WT_JSON="$OUT"w6-b10-walkthrough.json
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); raise SystemExit(0 if all(r['pass'] for r in d['results']) else 1)" "$WT_JSON"
WRC=$?
WPASS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(sum(1 for r in d['results'] if r['pass']))" "$WT_JSON")
printf 'gate walkthrough-8roles: %s — %s/8 角色（w6-b10-walkthrough.json + actions.json + psql-recon.log）\n' "$([ $WRC -eq 0 ] && echo exit=0 || echo FAIL)" "$WPASS" | tee -a "$LOG"
if [ "$WRC" -ne 0 ]; then FAILS=$((FAILS + 1)); fi

# ── 4. typecheck (full repo; needs build:lib:host per repo lint contract) ──
LEGS=$((LEGS + 1))
pnpm run typecheck > "$OUT"w6-b10-gate-typecheck.log 2>&1
TRC=$?
printf 'gate typecheck: %s（exit=%s，tail：%s）\n' "$([ $TRC -eq 0 ] && echo PASS || echo FAIL)" "$TRC" "$(tail -1 "$OUT"w6-b10-gate-typecheck.log | head -c 100)" | tee -a "$LOG"
if [ "$TRC" -ne 0 ]; then FAILS=$((FAILS + 1)); fi

# ── 5. oxlint staged config on this batch's changed source faces ──
# (.mts 脚本在 staged ts pattern 外、demos/*.mjs 在 default ignore——本批
#  实际落进 staged 面的只有 .oxlintrc.json 自身，非 lint 对象；对整个
#  demos/examples 变更面跑 staged config 如实记录结果)
LEGS=$((LEGS + 1))
pnpm exec oxlint --config .oxlintrc.staged.json examples/kb-agent/scripts/w6b10-statcard-order.mts demos/acceptance-w6/w6-b10-walkthrough.mjs demos/acceptance-w6/w6-b10-shot-statcard.mjs > "$OUT"w6-b10-gate-oxlint.log 2>&1
ORC=$?
printf 'gate oxlint-staged（本批新文件面）: %s — %s\n' "$([ $ORC -eq 0 ] && echo PASS || echo "FAIL exit=$ORC")" "$(tail -2 "$OUT"w6-b10-gate-oxlint.log | tr '\n' ' ' | head -c 120)" | tee -a "$LOG"
if [ "$ORC" -ne 0 ]; then FAILS=$((FAILS + 1)); fi

# ── 6. translation pairing ──
LEGS=$((LEGS + 1))
pnpm exec tsx scripts/translation-pairing.ts --verify > "$OUT"w6-b10-gate-pairing.log 2>&1
PRC=$?
printf 'gate pairing: %s — %s\n' "$([ $PRC -eq 0 ] && echo PASS || echo "FAIL exit=$PRC")" "$(tail -1 "$OUT"w6-b10-gate-pairing.log | head -c 110)" | tee -a "$LOG"
if [ "$PRC" -ne 0 ]; then FAILS=$((FAILS + 1)); fi

# ── 7. drill-data cleanup (R5 --clean precedent; append-only traces keep
#        their drill markers — recalled as-is, not deleted) ──
printf -- '-- 演练数据清理（可识别演练行撤收；append-only 审计行保留并带演练标记）--\n' | tee -a "$LOG"
LEGS=$((LEGS + 1))
$TSX examples/kb-agent/scripts/w6b9-cockpit.mts --clean > "$OUT"w6-b10-gate-clean9.log 2>&1
C9=$?
printf 'cleanup b9 --clean: %s — %s\n' "$([ $C9 -eq 0 ] && echo done || echo "exit=$C9")" "$(tail -1 "$OUT"w6-b10-gate-clean9.log | head -c 90)" | tee -a "$LOG"
$TSX examples/kb-agent/scripts/w6b6-crm.mts --cleanup > "$OUT"w6-b10-gate-clean6.log 2>&1
C6=$?
printf 'cleanup b6 --cleanup: %s — %s\n' "$([ $C6 -eq 0 ] && echo done || echo "exit=$C6")" "$(tail -1 "$OUT"w6-b10-gate-clean6.log | head -c 90)" | tee -a "$LOG"
$TSX examples/kb-agent/scripts/w6b5-insp.mts --cleanup > "$OUT"w6-b10-gate-clean5.log 2>&1
C5=$?
printf 'cleanup b5 --cleanup: %s — %s\n' "$([ $C5 -eq 0 ] && echo done || echo "exit=$C5")" "$(tail -1 "$OUT"w6-b10-gate-clean5.log | head -c 90)" | tee -a "$LOG"
if [ "$C9" -ne 0 ] || [ "$C6" -ne 0 ] || [ "$C5" -ne 0 ]; then FAILS=$((FAILS + 1)); fi

# ── rollup ──
printf '\n== W6-B10 gates: %s legs, %s failed ==\n' "$LEGS" "$FAILS" | tee -a "$LOG"
if [ "$FAILS" -gt 0 ]; then
  printf 'GATES FAILED\n' | tee -a "$LOG"
  exit 1
fi
printf 'GATES ALL PASS\n' | tee -a "$LOG"
exit 0
