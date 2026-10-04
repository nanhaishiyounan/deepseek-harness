#!/bin/bash
# W6-R6 light-closure gates: the changed faces of this batch only — the b2
# assert leg (the rules-page rendering layer changed), the cockpit fence
# symmetry assertion (w6-r6-02), the ui-mobile views suite (LoginView
# changed), full-repo typecheck, staged-config oxlint on the changed source
# faces, and the translation pairing (the B10 note was rewritten bilingually).
# Needs: three services up + PG + built lib (typecheck needs build:lib:host).
set -u
OUT="$(cd "$(dirname "$0")" && pwd)/"
LOG="$OUT"gates-r6.log
TSX="node --import tsx/esm"
LEGS=0; FAILS=0
: > "$LOG"
printf 'W6-R6 gates（轻量收尾——只覆盖本批变更面）\n' | tee -a "$LOG"

# ── 1. b2 assert（预警页渲染层动了——enabled 列是/否枚举） ──
LEGS=$((LEGS + 1))
$TSX examples/kb-agent/scripts/w6b2-rules.mts --assert > "$OUT"w6-r6-gate-b2-rules.log 2>&1
RC=$?
printf 'gate b2-rules assert: %s — %s\n' "$([ $RC -eq 0 ] && echo PASS || echo "FAIL exit=$RC")" "$(tail -2 "$OUT"w6-r6-gate-b2-rules.log | tr '\n' ' ' | head -c 120)" | tee -a "$LOG"
if [ "$RC" -ne 0 ]; then FAILS=$((FAILS + 1)); fi

# ── 2. cockpit 围栏对称断言（planner masked vs finance 全量 vs aging 403） ──
LEGS=$((LEGS + 1))
node "$OUT".cockpit-assert-w6r6.mjs > "$OUT"w6-r6-02-cockpit-mask.log 2>&1
RC=$?
printf 'gate cockpit-mask: %s — %s\n' "$([ $RC -eq 0 ] && echo PASS || echo "FAIL exit=$RC")" "$(tail -1 "$OUT"w6-r6-02-cockpit-mask.log)" | tee -a "$LOG"
if [ "$RC" -ne 0 ]; then FAILS=$((FAILS + 1)); fi

# ── 3. ui-mobile views suite（LoginView 空提交 toast 改了交互） ──
LEGS=$((LEGS + 1))
pnpm exec vitest run packages/client/ui-mobile/tests/views.client.spec.tsx > "$OUT"w6-r6-gate-ui-mobile.log 2>&1
RC=$?
printf 'gate ui-mobile views: %s — %s\n' "$([ $RC -eq 0 ] && echo PASS || echo "FAIL exit=$RC")" "$(grep -E "Tests  " "$OUT"w6-r6-gate-ui-mobile.log | tail -1 | head -c 100)" | tee -a "$LOG"
if [ "$RC" -ne 0 ]; then FAILS=$((FAILS + 1)); fi

# ── 4. typecheck（全仓；按 lint 契约需 build:lib:host 在位） ──
LEGS=$((LEGS + 1))
pnpm run build:lib:host > "$OUT"w6-r6-gate-build-host.log 2>&1
BRC=$?
pnpm run typecheck > "$OUT"w6-r6-gate-typecheck.log 2>&1
RC=$?
printf 'gate typecheck: %s（build:lib:host exit=%s）— tail: %s\n' "$([ $RC -eq 0 ] && echo PASS || echo FAIL)" "$BRC" "$(tail -1 "$OUT"w6-r6-gate-typecheck.log | head -c 100)" | tee -a "$LOG"
if [ "$RC" -ne 0 ]; then FAILS=$((FAILS + 1)); fi

# ── 5. oxlint staged config on this batch's changed source faces ──
# （.mts 脚本在 staged ts pattern 外、demos/*.mjs 在 default ignore——
#   本批落进 staged 面的是 ui-mobile 源/测试；examples 脚本一并如实跑）
LEGS=$((LEGS + 1))
pnpm exec oxlint --config .oxlintrc.staged.json \
  packages/client/ui-mobile/src/client/login/LoginView.tsx \
  packages/client/ui-mobile/tests/views.client.spec.tsx \
  examples/kb-agent/scripts/w6b2-rules.mts > "$OUT"w6-r6-gate-oxlint.log 2>&1
RC=$?
printf 'gate oxlint-staged（本批变更面）: %s — %s\n' "$([ $RC -eq 0 ] && echo PASS || echo "FAIL exit=$RC")" "$(tail -2 "$OUT"w6-r6-gate-oxlint.log | tr '\n' ' ' | head -c 120)" | tee -a "$LOG"
if [ "$RC" -ne 0 ]; then FAILS=$((FAILS + 1)); fi

# ── 6. translation pairing（B10 Note 双语改写后需全对绿） ──
LEGS=$((LEGS + 1))
pnpm exec tsx scripts/translation-pairing.ts --verify > "$OUT"w6-r6-gate-pairing.log 2>&1
RC=$?
printf 'gate pairing: %s — %s\n' "$([ $RC -eq 0 ] && echo PASS || echo "FAIL exit=$RC")" "$(tail -1 "$OUT"w6-r6-gate-pairing.log | head -c 100)" | tee -a "$LOG"
if [ "$RC" -ne 0 ]; then FAILS=$((FAILS + 1)); fi

printf 'R6 GATES: %s legs, %s failed — %s\n' "$LEGS" "$FAILS" "$([ "$FAILS" -eq 0 ] && echo 'ALL PASS' || echo 'FAILURES PRESENT')" | tee -a "$LOG"
exit "$FAILS"
