#!/usr/bin/env bash
# Archived copy of scripts/run_rugscan_now.sh (see archive/README.md)
set -euo pipefail
trap 'echo; echo "💥 Stopped. See: pm2 logs rektrace --lines 200"; exit 1' ERR
# Original content preserved for reference.

