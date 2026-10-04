#!/usr/bin/env zsh
# W6-B3 综合验收断言腿（demos/acceptance-w6/gates 之前的批次腿）：
#   1. w6b3-trace --assert     追溯底座六断言（视图/孤儿/三级链/kpi-run 同口径/混料去重/召回三元组）
#   2. w6b3-recall --assert    召回全链（范围冻结对账/通知/状态机/越权拒绝）
#   3. 条码回读断言            引擎 /label/lot.svg 渲染产物 → bar 宽度 → 解码 → GS1 四 AI 与 wms_lots 对账
#                              （扫码枪视角的 round-trip：生成-再解码，正是扫描器做的事）
# 证据：demos/acceptance-w6/w6-b3-10-assert.log（stdout 由调用方重定向）
set -o pipefail
cd "$(dirname "$0")/../.." || exit 1

node --import tsx/esm examples/kb-agent/scripts/w6b3-trace.mts --assert || exit 1
node --import tsx/esm examples/kb-agent/scripts/w6b3-recall.mts --assert || exit 1
node --import tsx/esm examples/kb-agent/scripts/w6b3-labels-assert.mts || exit 1

echo "w6-b3-assert: ALL PASS"
