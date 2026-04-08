# 한울사상 홈페이지 네이버 SSO 설계서

**작성**: dev-2 | **일자**: 2026-04-08 | **대상**: CTO 맥스

---

## 1. 현황 요약

네이버 OAuth 2.0 코드는 **이미 완전 구현**되어 있습니다.
`G:/WorkSpace/HomePage/Hanwool/app/server.js` L511–578 참조.

| 항목 | 상태 |
|------|------|
| `/auth/naver/login` 라우트 | ✅ 구현 완료 |
| `/auth/naver/callback` 라우트 | ✅ 구현 완료 |
| `/auth/logout` | ✅ 구현 완료 |
| `/api/auth/me` | ✅ 구현 완료 |
| DB upsert (yeouiseonwon.users) | ✅ 구현 완료 |
| express-session 미들웨어 | ✅ 구현 완료 (인메모리) |
| connect-pg-simple (세션 영속화) | ❌ 미적용 |
| NAVER_CLIENT_ID / SECRET | ❌ 빈값 (.env) |

---

## 2. OAuth 2.0 플로우

```
사용자
  │  GET /auth/naver/login
  ▼
[Express] CSRF state 생성 → session.oauthState 저장
  │  302 redirect
  ▼
[Naver 인증서버] nid.naver.com/oauth2.0/authorize
  │  사용자 동의 후 code + state 반환
  ▼
[Express] GET /auth/naver/callback
  │  1. state 검증 (CSRF)
  │  2. POST nid.naver.com/oauth2.0/token → access_token 획득
  │  3. GET openapi.naver.com/v1/nid/me → 프로필 (id/name/email/nickname/profile_image)
  │  4. req.session.user 저장
  │  5. yeouiseonwon.users DB upsert
  │  302 redirect → /
  ▼
[사용자] 로그인 완료
```

---

## 3. DB 스키마

현재 `yeouiseonwon.users` 테이블 사용 (hanul_thought DB).

```sql
-- 현재 사용 중인 스키마 (기존)
INSERT INTO yeouiseonwon.users
  (naver_id, name, email, nickname, profile_image, access_token, refresh_token, last_login)
VALUES (...)
ON CONFLICT (naver_id) DO UPDATE SET ...
```

> **메모**: CTO 지시에서 `users` 테이블 + `naver_id, nickname, email, profile_image` 컬럼 명시 → 기존 `yeouiseonwon.users`가 이를 포함하므로 그대로 사용 가능. 스키마명 `yeouiseonwon` 유지.

---

## 4. 세션 관리

### 현재: 인메모리 (개발용)
```js
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 3600 * 1000 }, // 7일
}));
```

### 권장: connect-pg-simple 추가 (프로덕션)
```js
import connectPg from 'connect-pg-simple';
const PgSession = connectPg(session);

app.use(session({
  store: new PgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, maxAge: 7 * 24 * 3600 * 1000 },
}));
```
→ PM2 재시작 시 세션 유지, 다중 인스턴스 대응.

---

## 5. 환경변수 (.env 필요)

```env
NAVER_CLIENT_ID=<네이버 개발자센터 앱 ID>
NAVER_CLIENT_SECRET=<네이버 개발자센터 앱 시크릿>
NAVER_CALLBACK_URL=http://localhost:8080/auth/naver/callback
SESSION_SECRET=<충분히 긴 랜덤 문자열>
```

---

## 6. 블로커 및 조치사항

| 블로커 | 조치 | 담당 |
|--------|------|------|
| NAVER_CLIENT_ID/SECRET 미등록 | 네이버 개발자센터(https://developers.naver.com) 앱 등록 → 로그인 API 추가 → Callback URL 등록 | Lucas님 또는 지정 담당자 |
| connect-pg-simple 미설치 | `npm install connect-pg-simple` + 코드 수정 | dev-2 (승인 후) |
| `session` 테이블 생성 | connect-pg-simple의 `createTableIfMissing: true` 옵션으로 자동 생성 가능 | dev-2 (승인 후) |

---

## 7. 4/11 발표 프로토타입 가능성 판단

**가능합니다.** 코드 로직은 완료 상태이며, 유일한 블로커는 Naver 앱 등록(CLIENT_ID/SECRET 발급).

- 앱 등록 완료 즉시: 인메모리 세션으로 로컬 동작 가능
- connect-pg-simple은 발표 후 프로덕션 배포 시 적용해도 무방

**예상 소요**: 앱 등록(30분) + .env 입력(5분) → 즉시 동작

---

## 8. 코딩 작업 목록 (설계 승인 후)

1. `connect-pg-simple` 설치 및 세션 스토어 교체
2. `session` 테이블 자동 생성 옵션 설정
3. 로그인 버튼 UI (views/*.ejs에 네이버 로그인 버튼 추가)
4. 로그인 상태에 따른 nav 분기 처리
