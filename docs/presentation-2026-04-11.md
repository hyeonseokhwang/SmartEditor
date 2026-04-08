# 한울사상 홈페이지 기술 현황 발표자료

**발표일**: 2026-04-11 | **작성**: 하루(dev-3) | **업데이트**: 2026-04-08

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 프로젝트명 | 한울사상 홈페이지 |
| 목표 | 한울영성개발원 공식 홈페이지 + 게시판 + 챗봇 + 회원 통합 |
| 스택 | Node.js Express + EJS + PostgreSQL + Ollama |
| 운영 환경 | PM2, 포트 :8080 단일 통합 |

---

## 2. 현재 아키텍처

```
클라이언트 (Browser)
    │
    ▼
[PM2] :8080 — Express + EJS
    ├─ 정적 파일 (public/)
    ├─ 게시판 라우트
    ├─ 회원 인증 (네이버 OAuth 2.0)
    ├─ 스마트에디터2 (이미지 업로드)
    └─ 챗봇 라우트 (통합 완료)
         │
         ├─ PostgreSQL (게시글, 댓글, 회원)
         └─ Ollama :11434 (nomic-embed-text)
              └─ 임베딩 기반 RAG 챗봇
```

---

## 3. 금일 기준 완료 항목 (2026-04-08)

### Step 5 — 챗봇 :8080 통합 완료 (커밋: 3947b10)

- 기존 별도 포트(:8083)로 운영되던 챗봇을 메인 서버(:8080)에 통합
- PM2 프로세스 단일화: `hanwool-main` 하나로 관리
- Ollama nomic-embed-text 임베딩 기반 RAG 챗봇 동작 확인

### 이미지 업로드 병렬화 (커밋: 680a96a)

- 스마트에디터2 `uploadAll` 함수 개선
- 순차 업로드 → `Promise.all` 배치 병렬 처리 (BATCH_SIZE=3)
- MAX_RETRY: 10 → 3 (4xx 즉시 실패, 5xx/네트워크만 재시도)
- 다수 이미지 첨부 시 업로드 속도 대폭 향상

### 네이버 SSO 설계 완료

- OAuth 2.0 코드 완전 구현 (login/callback/logout/me 라우트)
- DB upsert (yeouiseonwon.users) 구현 완료
- **유일한 블로커**: 네이버 개발자센터 앱 등록 (NAVER_CLIENT_ID/SECRET 발급)
- 앱 등록 완료 즉시 SSO 서비스 가능

---

## 4. 기술 스택 상세

| 레이어 | 기술 | 비고 |
|--------|------|------|
| 서버 | Node.js 20 + Express 4 | EJS 템플릿 |
| DB | PostgreSQL | yeouiseonwon 스키마 |
| 인증 | 네이버 OAuth 2.0 | 앱 등록 후 즉시 활성화 |
| 챗봇 | Ollama nomic-embed-text | RAG 방식 |
| 에디터 | 스마트에디터2 (Naver) | 이미지 병렬 업로드 |
| 프로세스 | PM2 | :8080 단일 포트 |
| 세션 | express-session (인메모리) | connect-pg-simple 추후 적용 예정 |

---

## 5. 잔여 작업 및 블로커

| 항목 | 상태 | 비고 |
|------|------|------|
| 네이버 앱 등록 | ⚠️ 블로커 | data.go.kr 등록 필요 (Lucas님 조치) |
| 세션 영속화 (connect-pg-simple) | 🔲 예정 | 발표 후 적용 |
| HTTPS/도메인 설정 | 🔲 예정 | 운영 환경 확정 후 |

---

## 6. 다음 단계

1. **즉시**: 네이버 개발자센터 앱 등록 → SSO 가동
2. **단기**: connect-pg-simple 세션 영속화 적용
3. **중기**: 도메인 연결 + HTTPS 설정 → 운영 오픈

---

*Lucas Initiative 개발팀 하루(Haru) | 2026-04-08*
