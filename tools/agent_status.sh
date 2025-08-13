#!/usr/bin/env sh
set -eu
STATE1="${HOME}/.cache/rektrace-agent/state.json"
STATE2="$(pwd)/.cache/rektrace-agent/state.json"
if [ -f "$STATE1" ]; then STATE="$STATE1"; elif [ -f "$STATE2" ]; then STATE="$STATE2"; else echo "🚀"; exit 0; fi

now=$(date +%s)

# Extract ts as an integer regardless of quoting
ts=$(awk -F: '
  /"ts"[[:space:]]*:/ {
    v=$2; gsub(/[^0-9]/, "", v); if (v!="") { print v; exit }
  }
' "$STATE" 2>/dev/null)
[ -n "$ts" ] || ts=0

# Extract running as a boolean regardless of quoting
running=$(awk -F: '
  /"running"[[:space:]]*:/ {
    v=$2; if (v ~ /true/) { print "true" } else { print "false" }; exit
  }
' "$STATE" 2>/dev/null)
[ -n "$running" ] || running=false

age=$(( now - ts ))
if [ "$running" = "true" ] && [ "$age" -lt 12 ]; then
  echo "🌀 ${age}s"
else
  echo "🚀"
fi

