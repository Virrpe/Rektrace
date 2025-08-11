#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR=.git/hooks
mkdir -p "$HOOK_DIR"

cat > "$HOOK_DIR/pre-commit" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

files=$(git diff --cached --name-only)
fail=false
for f in $files; do
  case "$f" in
    .env*|ops/secrets.local.json) continue;;
  esac
  if grep -E -I -n "(TELEGRAM_BOT_TOKEN=|API_KEY=|PRIVATE_KEY=|quicknode|goldrush)" "$f" >/dev/null 2>&1; then
    echo "[pre-commit] Possible secret detected in $f. Move to .env or redact before commit." >&2
    fail=true
  fi
done

if [ "$fail" = true ]; then
  echo "[pre-commit] Commit blocked due to possible secrets."
  exit 1
fi
exit 0
EOF

chmod +x "$HOOK_DIR/pre-commit"
echo "[git:hooks] Installed pre-commit secret scan hook."


