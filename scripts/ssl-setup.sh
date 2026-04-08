#!/usr/bin/env bash
# SSL Let's Encrypt 발급 스크립트 — 한울영성개발원 홈페이지
# 작성: 아론(dev-2) | 2026-04-08
#
# 사전 조건:
#   1. 도메인 결정 + DNS A 레코드 → 이 서버 IP 설정 완료
#   2. DNS 전파 완료 (nslookup [DOMAIN] 확인)
#   3. 포트 80/443 방화벽/라우터 오픈
#   4. Certbot 설치: winget install certbot (또는 https://certbot.eff.org)
#
# 사용법:
#   DOMAIN=hanwool.or.kr bash ssl-setup.sh
#   또는 직접 변수 수정 후 실행

set -e

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-lucas@lucas-initiative.com}"  # 인증서 만료 알림 이메일

if [ -z "$DOMAIN" ]; then
  echo "[ERROR] DOMAIN 환경변수가 필요합니다."
  echo "  사용법: DOMAIN=hanwool.or.kr bash ssl-setup.sh"
  exit 1
fi

echo "=== Let's Encrypt SSL 발급 ==="
echo "도메인: $DOMAIN"
echo "이메일: $EMAIL"
echo ""

# ── Step 1: 포트 80 일시 해제 (인증용) ─────────────────────────────────
echo "[1/4] 포트 80 인증 서버 점검..."

# certbot이 standalone 모드로 :80 점유 필요 — hanwool-main(:8080) 충돌 없음
# caddy가 80 프록시 중이면 잠시 중단 필요
if pm2 list 2>/dev/null | grep -q "caddy-hanwool.*online"; then
  echo "  caddy-hanwool 감지 — 잠시 중단 (인증 후 재시작)"
  pm2 stop caddy-hanwool
  CADDY_WAS_RUNNING=1
fi

# ── Step 2: Certbot standalone 인증 ────────────────────────────────────
echo "[2/4] Certbot 인증서 발급..."

certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

echo "  ✅ 인증서 발급 완료"
echo "  위치: /etc/letsencrypt/live/$DOMAIN/"

# ── Step 3: Caddy 설정 업데이트 ────────────────────────────────────────
echo "[3/4] Caddy 설정 업데이트..."

CADDY_DIR="G:/WorkSpace/HomePage/Hanwool/caddy"
mkdir -p "$CADDY_DIR"

cat > "$CADDY_DIR/Caddyfile" << EOF
$DOMAIN, www.$DOMAIN {
    reverse_proxy localhost:8080

    # HTTPS 자동 리디렉트 (Caddy 기본)
    encode gzip zstd

    # 정적 파일 직접 서빙 (선택)
    # root * G:/WorkSpace/HomePage/Hanwool/public
    # file_server

    log {
        output file G:/WorkSpace/HomePage/Hanwool/logs/caddy-access.log
        format console
    }
}
EOF

echo "  Caddyfile 생성: $CADDY_DIR/Caddyfile"

# ── Step 4: Caddy/PM2 재시작 ───────────────────────────────────────────
echo "[4/4] 서비스 재시작..."

if [ "${CADDY_WAS_RUNNING:-0}" = "1" ]; then
  pm2 start caddy-hanwool
  echo "  caddy-hanwool 재시작 완료"
fi

echo ""
echo "=== 완료 ==="
echo "  HTTPS: https://$DOMAIN"
echo "  갱신 (90일): certbot renew --quiet"
echo ""
echo "  ⚠️ 자동 갱신 크론 추가 권장:"
echo "  0 3 * * * certbot renew --quiet && pm2 restart caddy-hanwool"
