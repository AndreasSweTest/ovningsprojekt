#!/usr/bin/env bash
FILE="${CLAUDE_FILE_PATH:-}"
if [[ "$FILE" == *.ts ]]; then
  npx prettier --write "$FILE" 2>/dev/null || true
fi
exit 0
