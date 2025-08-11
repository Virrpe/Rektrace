#!/usr/bin/env bash
set -euo pipefail

deny=$(grep -v '^[#[:space:]]*$' ops/denylist.txt 2>/dev/null | head -n1 || true)
allow=$(grep -v '^[#[:space:]]*$' ops/allowlist.txt 2>/dev/null | head -n1 || true)

if [[ -z "$deny" && -z "$allow" ]]; then
  echo "[rules] No entries in ops/denylist.txt or ops/allowlist.txt"
  exit 0
fi

echo "[rules] Detected rules entries. Recommend enabling RULES_ENABLED=true"
read -r -p "Patch local .env.prod to set RULES_ENABLED=true? [y/N] " ans
if [[ "${ans:-}" == "y" || "${ans:-}" == "Y" ]]; then
  if [[ -f .env.prod ]]; then
    if grep -q '^RULES_ENABLED=' .env.prod; then
      sed -i.bak 's/^RULES_ENABLED=.*/RULES_ENABLED=true/' .env.prod
    else
      echo 'RULES_ENABLED=true' >> .env.prod
    fi
    echo "[rules] Updated .env.prod (backup .env.prod.bak)"
  else
    echo "[rules] .env.prod not found; run PRESET=live pnpm run env:gen first"
  fi
fi


