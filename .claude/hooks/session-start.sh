#!/bin/bash
# 클라우드 세션 시작 시 의존성을 설치해 바로 `npm run verify`, `npm run e2e`를 돌릴 수 있게 한다.
# Chromium은 컨테이너의 /opt/pw-browsers(PLAYWRIGHT_BROWSERS_PATH)에 미리 설치되어 있다.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund
