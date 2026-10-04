#!/usr/bin/env bash
# W7-B6 final aesthetic matrix — the one-shot rollup every W7 batch fed into:
#   1. theme row assert (w7b0-theme --assert: w7-forge default + token globalStyle)
#   2. heal asserts across the rework batches (w7b1 / w7b23 / w7b4 --assert)
#   3. the 114-page banned-color sweep + B5-domain structural probes + engine
#      iframe pages (.w7b6-probe.mjs — includes the B5 assertions verbatim)
#   4. the mobile dark-track DOM probe gates, run live (contrast/elevation/
#      border/tab + the R1 doing-stamp contrast gate ≥3.0)
# Every leg prints PASS/FAIL into demos/acceptance-w7/w7-b6-matrix.log; the
# exit code carries the real failure count. The W6 zero-regression legs ride
# their own scripts (w6-b10-matrix.sh / w6-b10-gates.sh) and are archived as
# w7-b6-w6matrix.log / w7-b6-w6gates.log — see the deliverables index.
#
# Usage (repo root): bash demos/acceptance-w7/w7-b6-matrix.sh
# Needs: NocoBase :13000, engine :13110, gateway :3080.
set -uo pipefail
cd "$(dirname "$0")/../../"
OUT=demos/acceptance-w7/
LOG="$OUT"w7-b6-matrix.log
TSX="node --import tsx/esm"
FAILS=0
LEGS=0

printf 'W7-B6 美学断言终验矩阵 — %s\n' "$(date '+%F %T %Z')" > "$LOG"

leg() {
  LEGS=$((LEGS + 1))
  local name="$1"; shift
  local rc=0
  "$@" >> "$LOG" 2>&1 || rc=$?
  if [ "$rc" -eq 0 ]; then
    printf 'leg %s %s: PASS\n' "$name" "$1" | tee -a "$LOG"
  else
    printf 'leg %s %s: FAIL (exit %s) — 见 log 上文\n' "$name" "$1" "$rc" | tee -a "$LOG"
    FAILS=$((FAILS + 1))
  fi
}

printf -- '-- 1. 主题行断言 --\n' | tee -a "$LOG"
leg theme  $TSX examples/kb-agent/scripts/w7b0-theme.mts --assert

printf -- '-- 2. heal 断言（B1/B2+B3/B4）--\n' | tee -a "$LOG"
leg b1    $TSX examples/kb-agent/scripts/w7b1-heal.mts --assert
leg b23   $TSX examples/kb-agent/scripts/w7b23-heal.mts --assert
leg b4    $TSX examples/kb-agent/scripts/w7b4-heal.mts --assert

printf -- '-- 3. 114 页禁色终查 + B5 域结构断言 + 引擎侧 iframe 面 --\n' | tee -a "$LOG"
leg probe node research/2026-10-03-w7-rework/b6/.w7b6-probe.mjs

printf -- '-- 4. mobile 暗轨 DOM 断言（M0/M1 口径门槛 + R1 印章第七门槛，探针现场实跑）--\n' | tee -a "$LOG"
LEGS=$((LEGS + 1))
PROBE_JSON="./$OUT"w7-b6-dark-probe-live.json
if node research/2026-10-03-w7-rework/m3/.w7m3-probe.mjs > "$PROBE_JSON" 2>> "$LOG" \
  && node -e '
  const p = require("'"$PROBE_JSON"'")
  const c = p.checks
  const ok = p.theme === "dark"
    && c.cardVsBgElevationStep >= 20      // ≥8% RGB step on the 0-255 ramp
    && c.textVsCardContrast >= 4.5        // WCAG AA body text
    && c.mutedVsCardContrast >= 4.5       // WCAG AA secondary text
    && c.borderVsCardStep >= 8            // visible 1px border on dark
    && c.tabTitlePx >= 12                 // M0 readability floor
    && c.tabActiveVsTabbarContrast >= 3   // WCAG 1.4.11 state indicator
    && c.stampDoingVsCardContrast >= 3    // R1: the hollow 进行中 seal (WCAG 1.4.11 text floor)
  console.log(`mobile dark probe: theme=${p.theme} elev=${c.cardVsBgElevationStep} text=${c.textVsCardContrast} muted=${c.mutedVsCardContrast} border=${c.borderVsCardStep} tab=${c.tabTitlePx}px tabActive=${c.tabActiveVsTabbarContrast} stamp=${c.stampDoingVsCardContrast} (token ${p.values.stampDoingToken})`)
  process.exit(ok ? 0 : 1)
' >> "$LOG" 2>&1; then
  printf 'leg mobile-dark-probe: PASS\n' | tee -a "$LOG"
else
  printf 'leg mobile-dark-probe: FAIL — 门槛见 log 上文\n' | tee -a "$LOG"
  FAILS=$((FAILS + 1))
fi

printf '\n== W7-B6 matrix: %s legs, %s failed ==\n' "$LEGS" "$FAILS" | tee -a "$LOG"
if [ "$FAILS" -eq 0 ]; then printf 'MATRIX ALL PASS\n' | tee -a "$LOG"; else exit 1; fi
