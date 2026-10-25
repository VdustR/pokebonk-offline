#!/usr/bin/env bash
set -euo pipefail

# Xvfb supplies pixels; a window manager supplies fullscreen/minimize semantics.
if [[ -z "${DISPLAY:-}" ]]; then
  exec xvfb-run -a bash "$0" "$@"
fi
command -v openbox >/dev/null
command -v xprop >/dev/null
openbox --sm-disable >/dev/null 2>&1 &
windowManagerPid=$!
trap 'kill "$windowManagerPid" 2>/dev/null || true; wait "$windowManagerPid" 2>/dev/null || true' EXIT
for ((attempt=0; attempt<50; attempt++)); do
  if [[ "$(xprop -root _NET_SUPPORTING_WM_CHECK)" == *"window id # 0x"* ]]; then
    "$@"
    exit
  fi
  sleep 0.1
done
printf '%s\n' 'Window manager did not become ready' >&2
exit 1
