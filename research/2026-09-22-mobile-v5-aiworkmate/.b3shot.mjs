#!/bin/zsh
# B3 walkthrough window capture: shoots the frontmost Chrome window by its
# AppleScript bounds (the chrome-devtools MCP screenshot path is sandboxed to
# another workspace root, so the OS-level capture stands in).
# Usage: .b3shot.mjs <output-name>   (writes research/2026-09-22-mobile-v5-aiworkmate/<name>.png)
set -e
NAME="${1:?usage: .b3shot.mjs <name>}"
OUT="research/2026-09-22-mobile-v5-aiworkmate/${NAME}.png"
TMP="$(mktemp -t b3shot).png"
osascript -e 'tell application "Google Chrome" to activate' >/dev/null
sleep 1
B=$(osascript -e 'tell application "Google Chrome" to get bounds of front window')
X=$(echo $B | cut -d, -f1 | tr -d ' ')
Y=$(echo $B | cut -d, -f2 | tr -d ' ')
W=$(echo $B | cut -d, -f3 | tr -d ' ')
H=$(echo $B | cut -d, -f4 | tr -d ' ')
W=$((W - X)); H=$((H - Y))
screencapture -x "$TMP"
# screencapture outputs are 2x on retina; crop by the window's pixel bounds.
sips -c $((H * 2)) $((W * 2)) --cropOffset $((Y * 2)) $((X * 2)) "$TMP" --out "$OUT" >/dev/null
rm -f "$TMP"
echo "saved $OUT (${W}x${H} logical)"
