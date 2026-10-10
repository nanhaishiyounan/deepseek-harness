#!/usr/bin/env bash
# 抓取助手：.fetch.sh <url> <raw-相对文件名>
# 固定 curl 形态（-sSL --max-time 30 -H 'User-Agent: research-curl'），
# 把 filename/url/http_code/bytes 追加到同目录 manifest.tsv；失败/超时/非200 照记，不中断。
set -u
base="$(cd "$(dirname "$0")" && pwd)"
url="${1:?url required}"
file="${2:?filename required}"
code=$(curl -sSL --max-time 30 -H 'User-Agent: research-curl' -o "$base/raw/$file" -w '%{http_code}' "$url")
bytes=$(wc -c < "$base/raw/$file" | tr -d ' ')
printf '%s\t%s\t%s\t%s\n' "$file" "$url" "$code" "$bytes" >> "$base/manifest.tsv"
echo "== $file http=$code bytes=$bytes"
