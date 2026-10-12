#!/bin/bash
# W24-B7 冷启动演练：照 QUICKSTART 五源手册序列真实执行一遍，落证 b7-final/coldstart-*.txt
# 用法：bash research/2026-10-09-w24-rebuild/b7-final/coldstart-drill.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/coldstart-run.txt"
: > "$OUT"
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$OUT"; }

log "=== 0. 现状盘点（colima / 容器 / 端口）==="
colima status 2>&1 | tee -a "$OUT"
docker ps --format '{{.Names}}\t{{.Status}}' | tee -a "$OUT"

log "=== 1. colima start（幂等）==="
colima start 2>&1 | tail -2 | tee -a "$OUT"

log "=== 2. WeKnora up（幂等 compose up -d）==="
bash workspace/weknora/up.sh up 2>&1 | tee -a "$OUT"
log "--- WeKnora health ---"
curl -s -o /dev/null -w '%{http_code}' http://localhost:18081/health | tee -a "$OUT"; echo | tee -a "$OUT"

log "=== 3. Neo4j start（幂等）==="
docker start dsh-neo4j 2>&1 | tee -a "$OUT"
sleep 3
curl -s -o /dev/null -w '%{http_code}' http://localhost:7474 | tee -a "$OUT"; echo | tee -a "$OUT"

log "=== 4. Gravitino + SeaweedFS compose up（幂等）==="
(cd workspace/governance && docker compose up -d) 2>&1 | tail -3 | tee -a "$OUT"
sleep 3
curl -s -o /dev/null -w 'gravitino:%{http_code}' http://localhost:8090 | tee -a "$OUT"; echo | tee -a "$OUT"
curl -s -o /dev/null -w 'seaweed:%{http_code}' http://localhost:9001 | tee -a "$OUT"; echo | tee -a "$OUT"

log "=== 5. carbon dev 栈（已在跑则幂等确认；未跑需人工 cd /Users/mac/Downloads/carbon-main && pnpm crbn up --no-portless）==="
curl -s -o /dev/null -w 'carbon-erp:%{http_code}' http://127.0.0.1:3000 | tee -a "$OUT"; echo | tee -a "$OUT"
curl -s -o /dev/null -w 'postgrest:%{http_code}' http://127.0.0.1:54321 | tee -a "$OUT"; echo | tee -a "$OUT"

log "=== 6. dsh web 启动（后台）==="
(DSH_HOME=examples/kb-agent/.dsh nohup node --import tsx/esm apps/cli/src/bin.ts web --patch examples/kb-agent/cordis.patch.yml --no-open > "$DIR/coldstart-web.log" 2>&1 &)
for i in $(seq 1 40); do
  sleep 3
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080 2>/dev/null || true)
  if [ "$code" = "200" ]; then log "web :3080 READY (code 200, attempt $i)"; break; fi
done
curl -s -o /dev/null -w 'web:%{http_code}' http://127.0.0.1:3080 | tee -a "$OUT"; echo | tee -a "$OUT"

log "=== 7. 终态端口表 ==="
lsof -iTCP:3080 -iTCP:3000 -iTCP:54321 -iTCP:51538 -iTCP:18080 -iTCP:18081 -iTCP:7474 -iTCP:7687 -iTCP:8090 -iTCP:9000 -iTCP:9001 -sTCP:LISTEN -P 2>/dev/null | awk '{print $1, $9}' | sort -u | tee -a "$OUT"
log "=== COLDSTART DRILL DONE ==="
