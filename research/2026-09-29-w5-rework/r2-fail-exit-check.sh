#!/bin/zsh
# CR-1 acceptance: the FAIL→exit-code propagation path in isolation. Mirrors
# w5-final-gates.sh's run_gate FAIL branch + the exact counting/exit tail;
# one gate is forced to fail (false), so the run must exit 1 and count 0/1.
set -u
OUT="$(mktemp)"
run_gate() {
  local name="$1"; shift
  local tmp; tmp=$(mktemp)
  if ("$@" >"$tmp" 2>&1); then
    echo "PASS" >> "$OUT"
  else
    echo "FAIL" >> "$OUT"
  fi
  rm -f "$tmp"
}
run_gate "always-true gate" true
run_gate "forced failing gate" false
sed -i '' 's/[[:space:]]*$//' "$OUT"
pass_count=$(grep -c '^PASS' "$OUT")
fail_count=$(grep -c '^FAIL' "$OUT")
echo "matrix done: ${pass_count} PASS / ${fail_count} FAIL" >> "$OUT"
cat "$OUT"
if (( fail_count > 0 )); then echo "EXITING 1 (FAIL propagates)"; exit 1; fi
if (( pass_count != 20 )); then echo "gate-count anomaly: expected 20 PASS legs, found ${pass_count}" >&2; exit 1; fi
echo "EXITING 0"
