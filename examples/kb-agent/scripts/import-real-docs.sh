#!/usr/bin/env bash
# Copy real .md/.txt/.pdf/.docx documents into the kb-agent workspace for ingestion.
# Files land under workspace/data/<kind>/ by argument order:
#   scripts/import-real-docs.sh <file-or-dir>... --kind meetings|profiles|regulations
# The kind value names the corpus directory exactly (whitelisted; anything
# else exits non-zero) and maps to the kb_ingest doc_kind: meetings→meeting,
# profiles→profile, regulations→regulation. The workspace corpus is demo
# material; never copy secrets, and desensitize visit notes before ingestion.
set -euo pipefail

usage="usage: $0 <file-or-dir>... --kind meetings|profiles|regulations"

here="$(cd "$(dirname "$0")/.." && pwd)"
kind=""
paths=()

while [ $# -gt 0 ]; do
  case "$1" in
    --kind)
      [ $# -ge 2 ] || { echo "--kind needs a value" >&2; exit 1; }
      kind="$2"; shift 2 ;;
    *) paths+=("$1"); shift ;;
  esac
done

case "$kind" in
  meetings) doc_kind="meeting" ;;
  profiles) doc_kind="profile" ;;
  regulations) doc_kind="regulation" ;;
  *)
    echo "unknown --kind \"$kind\"; expected meetings, profiles, or regulations" >&2
    echo "$usage" >&2
    exit 1
    ;;
esac

if [ ${#paths[@]} -eq 0 ]; then
  echo "$usage" >&2
  exit 1
fi

dest="$here/workspace/data/$kind"
mkdir -p "$dest"
copied=0
for path in "${paths[@]}"; do
  if [ -d "$path" ]; then
    found=$(find "$path" -type f \( -name '*.md' -o -name '*.txt' -o -name '*.pdf' -o -name '*.docx' \) | wc -l | tr -d ' ')
    [ "$found" -gt 0 ] || { echo "no .md/.txt/.pdf/.docx under $path" >&2; exit 1; }
    find "$path" -type f \( -name '*.md' -o -name '*.txt' -o -name '*.pdf' -o -name '*.docx' \) -exec cp {} "$dest/" \;
    copied=$((copied + found))
  elif [ -f "$path" ]; then
    case "$path" in
      *.md|*.txt|*.pdf|*.docx) cp "$path" "$dest/"; copied=$((copied + 1)) ;;
      *) echo "skipping unsupported file: $path" >&2 ;;
    esac
  else
    echo "not found: $path" >&2
    exit 1
  fi
done

echo "copied $copied document(s) into $dest"
echo "next: DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml \"用 kb_ingest 把 examples/kb-agent/workspace/data/${kind} 下的文档入库（doc_kind 取 ${doc_kind}），然后 kb_stats 报告覆盖情况\""
