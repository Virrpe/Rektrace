#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.prod"
ts=$(date +%Y%m%d_%H%M%S)
bak="${ENV_FILE}.bak.${ts}"

if [[ ! -f "$ENV_FILE" ]];nthen
  echo "${ENV_FILE} not found. Generate it first (e.g., PRESET=live pnpm run env:gen)." >&2
  exit 1
fi

cp -p "$ENV_FILE" "$bak"

apply_kv() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    # replace existing
    sed -i.bak.tmp "s/^${key}=.*/${key}=${val}/" "$ENV_FILE" && rm -f "${ENV_FILE}.bak.tmp"
  else
    # append
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

apply_kv STRICT_CONTENT_TYPE true
apply_kv RL_ENABLED true
apply_kv RL_MAX 5
apply_kv INVARIANTS_STRICT true
apply_kv IDEMP_ENABLED true
apply_kv JSON_LOGS true

echo "Safe-mode applied to ${ENV_FILE}. Backup: ${bak}"
echo "Restore with: cp ${bak} ${ENV_FILE} && echo 'Restored ${ENV_FILE} from backup'"
echo
echo "Diff summary:" && (command -v diff >/dev/null && diff -u "$bak" "$ENV_FILE" | sed -e '1,2d' || echo "diff not available on this system")


