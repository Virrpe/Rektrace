#!/usr/bin/env bash
# Archived copy of scripts/make_live_now.sh (see archive/README.md)
set -euo pipefail
trap 'echo; echo "💥 Stopped. Check: pm2 logs rektrace --lines 200 | tail -n +120"; exit 1' ERR
# Original content preserved for reference.

