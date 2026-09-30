#!/bin/zsh
# W5 final-gates matrix (B8 acceptance artifact, not product code).
# Runs every W5-relevant gate against the live services (:13000/:13110) and
# records PASS/FAIL + the proving tail line into w5-final-gates.txt.
# doc-sync runs separately after the Agent Note triplet lands.
set -u
OUT="$(dirname "$0")/w5-final-gates.txt"
: > "$OUT"
run_gate() {
  local name="$1"; shift
  local tmp; tmp=$(mktemp)
  {
    echo "══ $name ══"
    echo "\$ $*"
  } >> "$OUT"
  if ("$@" >"$tmp" 2>&1); then
    echo "PASS" >> "$OUT"
    tail -3 "$tmp" | sed 's/^/  | /' >> "$OUT"
  else
    echo "FAIL" >> "$OUT"
    tail -25 "$tmp" | sed 's/^/  | /' >> "$OUT"
  fi
  echo "" >> "$OUT"
  rm -f "$tmp"
}

# The repo tolerates its known oxlint error baseline (legacy
# tool-nocobase/ui-mobile surfaces); pass = error count ≤ 26.
lint_errors=$(mktemp)
pnpm run lint >"$lint_errors" 2>&1
lint_count=$(grep -cE '^\s+x ' "$lint_errors")
{
  echo "══ lint (≤26 基线) ══"
  echo "\$ pnpm run lint"
  if (( lint_count <= 26 )); then
    echo "PASS — ${lint_count} errors (≤26 baseline)"
  else
    echo "FAIL — ${lint_count} errors (>26 baseline)"
    grep -E '^\s*x ' -A3 "$lint_errors" | tail -30 | sed 's/^/  | /'
  fi
  echo ""
} >> "$OUT"
rm -f "$lint_errors"
run_gate "typecheck" pnpm run typecheck
run_gate "designer tsc" npm run typecheck --prefix examples/kb-agent/designer
run_gate "approval-engine --selftest" node --import tsx/esm examples/kb-agent/scripts/approval-engine.mts --selftest
run_gate "w5b2 --migrate (10 型 round-trip)" node --import tsx/esm examples/kb-agent/scripts/w5b2-advanced.mts --migrate
# w5b3/4/5 ride the NocoBase REST channel that occasionally ECONNRESETs
# after the API-heavy migrate pass (the w4-r2 known flake); one retry.
run_gate_retry() {
  local name="$1"; shift
  local tmp; tmp=$(mktemp)
  echo "══ $name ══" >> "$OUT"
  echo "\$ $*" >> "$OUT"
  local attempt
  for attempt in 1 2; do
    sleep $(( attempt * 3 ))
    if ("$@" >"$tmp" 2>&1); then
      echo "PASS${attempt:+" (attempt $attempt)"}" >> "$OUT"
      tail -3 "$tmp" | sed 's/^/  | /' >> "$OUT"
      echo "" >> "$OUT"
      rm -f "$tmp"
      return
    fi
    if ! grep -q 'fetch failed\|ECONNRESET' "$tmp"; then break; fi
  done
  echo "FAIL" >> "$OUT"
  tail -25 "$tmp" | sed 's/^/  | /' >> "$OUT"
  echo "" >> "$OUT"
  rm -f "$tmp"
}

run_gate_retry "w5b3 --assert" node --import tsx/esm examples/kb-agent/scripts/w5b3-closure.mts --assert
run_gate_retry "w5b4 --assert" node --import tsx/esm examples/kb-agent/scripts/w5b4-autoflow.mts --assert
run_gate_retry "w5b5 --assert" node --import tsx/esm examples/kb-agent/scripts/w5b5-terminals.mts --assert
run_gate "w5b6-theme --assert" node --import tsx/esm examples/kb-agent/scripts/w5b6-theme.mts --assert
run_gate "w5b6-heal --assert" node --import tsx/esm examples/kb-agent/scripts/w5b6-heal.mts --assert
run_gate "w5b7-detail --assert" node --import tsx/esm examples/kb-agent/scripts/w5b7-detail.mts --assert
run_gate "w4-heal-b1 --assert (五缺陷归零保持)" node --import tsx/esm examples/kb-agent/scripts/w4-heal-b1.mts --assert
run_gate "w3-approval-visual --assert (textarea 退役复证)" node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-approval-visual.mts --assert
run_gate "w5r1-concurrent-cas (并发 CAS)" node --import tsx/esm examples/kb-agent/scripts/w5r1-concurrent-cas.mts
run_gate "w5b8-closure --assert (B8 收尾断言)" node --import tsx/esm examples/kb-agent/scripts/w5b8-closure.mts --assert
chain_tmp=$(mktemp)
{
  echo "══ b9-final-chain s1..s9 (九步链) ══"
  echo "\$ for s in s1..s9: node --import tsx/esm research/2026-09-25-w-round/b9-final-chain.mts --stage \$s"
} >> "$OUT"
chain_ok=1
for stage in s1 s2 s3 s4 s5 s6 s7 s8 s9; do
  if node --import tsx/esm research/2026-09-25-w-round/b9-final-chain.mts --stage "$stage" >>"$chain_tmp" 2>&1; then
    echo "  | $stage PASS" >> "$OUT"
  else
    echo "  | $stage FAIL" >> "$OUT"
    tail -15 "$chain_tmp" | sed 's/^/  | /' >> "$OUT"
    chain_ok=0
  fi
done
if (( chain_ok )); then echo "PASS" >> "$OUT"; else echo "FAIL" >> "$OUT"; fi
echo "" >> "$OUT"
rm -f "$chain_tmp"
run_gate "--assert-ledger (库存对账)" node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --assert-ledger
run_gate "kpi-run --selftest" node --import tsx/esm examples/kb-agent/scripts/kpi-run.mts --selftest
run_gate "mfg-schedule --selftest" node --import tsx/esm examples/kb-agent/scripts/mfg-schedule.mts --selftest
run_gate "setup-nocobase verify 全链" node --env-file=.env --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts verify

# Keep the evidence file free of trailing whitespace (the blank tail lines
# sed prefixes would otherwise carry it; pre-commit gates it).
sed -i '' 's/[[:space:]]*$//' "$OUT"
echo "matrix done: $(grep -c '^PASS$' "$OUT") PASS / $(grep -c '^FAIL$' "$OUT") FAIL" >> "$OUT"
