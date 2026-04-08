#!/bin/bash
# Step 5 — hanul-chatbot (pm2 id=33, port :8083) 제거 스크립트
# 실행: Lucas님 배포 승인 후에만 실행할 것
#
# SOP (OP-034 준수):
#   1. pm2 delete id
#   2. orphan kill (PID 잔존 시)
#   3. pm2 save

set -e

echo "[Step 5] hanul-chatbot 제거 시작"

# 1. PM2에서 삭제
echo "  → pm2 delete 33"
pm2 delete 33

# 2. orphan PID 확인 및 kill (잔존 시)
ORPHAN=$(ps aux 2>/dev/null | grep "hanul-chatbot\|8083" | grep -v grep | awk '{print $1}' | head -1)
if [ -n "$ORPHAN" ]; then
  echo "  → orphan PID $ORPHAN kill"
  kill "$ORPHAN" 2>/dev/null || true
fi

# 3. pm2 save
echo "  → pm2 save"
pm2 save

echo "[Step 5] 완료 — hanul-chatbot 제거됨"
echo "  검증: pm2 list (id=33 없어야 함)"
pm2 list --no-color | grep -E "id|hanul"
